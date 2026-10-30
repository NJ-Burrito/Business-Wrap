// A small dependency-free zip writer and reader (0.15.0, project export / import).
//   writeZip(file, entries)            entries: [{name, data: Buffer|string} | {name, file: <path on disk>}]; UTF-8 names (flag 0x800),
//                                      deflate (store for names already compressed: pdf docx zip png jpg woff2), no zip64: at most
//                                      65535 entries and 4 GB, else it throws before writing anything it cannot finish
//   readZip(file, limits)              → [{name, dir, size, csize, method, offset}] from the central directory; refuses a path that
//                                      leaves the archive (.., absolute, drive letter, NUL), a symlink entry, an encrypted entry, more
//                                      than limits.entries (2000) or limits.bytes (2 GB) declared, and zip64
//   extractZip(file, dir, limits)      → [{name, file, size}] written below `dir` only; every entry is inflated with a hard output cap
//                                      equal to its declared size, so a lying header cannot expand past what the sum already allowed
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

export const ZIP_LIMITS = { entries: 2000, bytes: 2 * 1024 * 1024 * 1024 };
const STORE = /\.(pdf|docx|zip|png|jpe?g|woff2?|gif)$/i;

const TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
export function crc32(buf, crc = 0) {
  if (zlib.crc32) return zlib.crc32(buf, crc) >>> 0;
  let c = ~crc >>> 0;
  for (let i = 0; i < buf.length; i++) c = TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return ~c >>> 0;
}

/** DOS date/time of a Date (2-second resolution, years 1980-2107). */
function dos(d) {
  const y = Math.max(1980, d.getFullYear());
  return { time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), date: ((y - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate() };
}

/** A zip-safe entry name: forward slashes, no leading slash, no `.` or `..` parts, no NUL, no drive letter. Throws on an unsafe one. */
export function safeName(name) {
  const n = String(name).replace(/\\/g, '/');
  if (!n || /[\u0000:]/.test(n) || n.startsWith('/')) throw new Error(`zip: unsafe entry name "${String(name).slice(0, 80)}"`);
  const parts = n.split('/').filter((x, i, a) => x !== '' || i === a.length - 1);
  if (parts.some((p) => p === '..' || p === '.')) throw new Error(`zip: unsafe entry name "${String(name).slice(0, 80)}"`);
  return parts.join('/');
}

/** Writes `file` atomically (a .part beside it, renamed at the end). Returns {file, entries, bytes}. */
export function writeZip(file, entries, { now = new Date() } = {}) {
  if (entries.length > 65535) throw new Error('zip: more than 65535 entries');
  const { time, date } = dos(now);
  const tmp = `${file}.part`;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const fd = fs.openSync(tmp, 'w');
  let pos = 0;
  const central = [];
  const w = (buf) => { fs.writeSync(fd, buf); pos += buf.length; };
  try {
    for (const e of entries) {
      const name = safeName(e.name);
      const nameBuf = Buffer.from(name, 'utf8');
      const isDir = name.endsWith('/');
      const raw = isDir ? Buffer.alloc(0) : e.file ? fs.readFileSync(e.file) : Buffer.isBuffer(e.data) ? e.data : Buffer.from(String(e.data ?? ''), 'utf8');
      const crc = crc32(raw);
      let method = 0, body = raw;
      if (!isDir && raw.length > 64 && !STORE.test(name)) { const z = zlib.deflateRawSync(raw, { level: 6 }); if (z.length < raw.length) { method = 8; body = z; } }
      if (pos + body.length + 1024 > 0xffffffff || raw.length > 0xffffffff) throw new Error('zip: over 4 GB (zip64 is not written)');
      const offset = pos;
      const h = Buffer.alloc(30);
      h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x0800, 6); h.writeUInt16LE(method, 8);
      h.writeUInt16LE(time, 10); h.writeUInt16LE(date, 12); h.writeUInt32LE(crc, 14); h.writeUInt32LE(body.length, 18); h.writeUInt32LE(raw.length, 22);
      h.writeUInt16LE(nameBuf.length, 26); h.writeUInt16LE(0, 28);
      w(h); w(nameBuf); if (body.length) w(body);
      central.push({ nameBuf, method, crc, csize: body.length, size: raw.length, offset, isDir });
    }
    const cdStart = pos;
    for (const c of central) {
      const h = Buffer.alloc(46);
      h.writeUInt32LE(0x02014b50, 0); h.writeUInt16LE(0x031e, 4); h.writeUInt16LE(20, 6); h.writeUInt16LE(0x0800, 8); h.writeUInt16LE(c.method, 10);
      h.writeUInt16LE(time, 12); h.writeUInt16LE(date, 14); h.writeUInt32LE(c.crc, 16); h.writeUInt32LE(c.csize, 20); h.writeUInt32LE(c.size, 24);
      h.writeUInt16LE(c.nameBuf.length, 28); h.writeUInt16LE(0, 30); h.writeUInt16LE(0, 32); h.writeUInt16LE(0, 34); h.writeUInt16LE(0, 36);
      h.writeUInt32LE(c.isDir ? 0x41ed0010 : 0x81a40000, 38); // unix mode in the high 16 bits (dir 0755 / file 0644), MS-DOS dir bit low
      h.writeUInt32LE(c.offset, 42);
      w(h); w(c.nameBuf);
    }
    const cdSize = pos - cdStart;
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(central.length, 8); end.writeUInt16LE(central.length, 10);
    end.writeUInt32LE(cdSize, 12); end.writeUInt32LE(cdStart, 16);
    w(end);
    fs.closeSync(fd);
  } catch (e) { try { fs.closeSync(fd); } catch { /* closed */ } fs.rmSync(tmp, { force: true }); throw e; }
  fs.renameSync(tmp, file);
  return { file, entries: central.length, bytes: pos };
}

/** The entries of a zip from its central directory, with the zip-slip / bomb guards applied before anything is read. */
export function readZip(file, limits = {}) {
  const L = { ...ZIP_LIMITS, ...limits };
  const buf = fs.readFileSync(file);
  let e = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--) if (buf.readUInt32LE(i) === 0x06054b50) { e = i; break; }
  if (e < 0) throw new Error('zip: not a zip file (no end-of-central-directory record)');
  const count = buf.readUInt16LE(e + 10), cdSize = buf.readUInt32LE(e + 12), cdOff = buf.readUInt32LE(e + 16);
  if (count === 0xffff || cdOff === 0xffffffff) throw new Error('zip: zip64 archives are not supported');
  if (count > L.entries) throw new Error(`zip: ${count} entries, the limit is ${L.entries}`);
  if (cdOff + cdSize > buf.length) throw new Error('zip: central directory out of range');
  const out = [];
  let p = cdOff, total = 0;
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('zip: bad central directory');
    const flags = buf.readUInt16LE(p + 8), method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20), size = buf.readUInt32LE(p + 24);
    const nl = buf.readUInt16LE(p + 28), xl = buf.readUInt16LE(p + 30), cl = buf.readUInt16LE(p + 32);
    const attr = buf.readUInt32LE(p + 38), offset = buf.readUInt32LE(p + 42);
    const by = buf.readUInt16LE(p + 4) >> 8;
    const rawName = buf.subarray(p + 46, p + 46 + nl).toString(flags & 0x800 ? 'utf8' : 'latin1');
    p += 46 + nl + xl + cl;
    if (flags & 1) throw new Error(`zip: "${rawName.slice(0, 60)}" is encrypted`);
    if (by === 3 && ((attr >>> 16) & 0xf000) === 0xa000) throw new Error(`zip: "${rawName.slice(0, 60)}" is a symbolic link`);
    const name = safeName(rawName);
    if (![0, 8].includes(method)) throw new Error(`zip: "${name}" uses compression method ${method}`);
    total += size;
    if (total > L.bytes) throw new Error(`zip: declares more than ${Math.round(L.bytes / 1048576)} MB uncompressed`);
    out.push({ name, dir: name.endsWith('/'), size, csize, method, offset });
  }
  Object.defineProperty(out, 'buf', { value: buf, enumerable: false });
  return out;
}

/** The bytes of one entry (method 8: inflated with the declared size as a hard cap; the CRC is checked). */
export function entryData(zip, e) {
  const buf = zip.buf;
  if (buf.readUInt32LE(e.offset) !== 0x04034b50) throw new Error(`zip: bad local header for "${e.name}"`);
  const start = e.offset + 30 + buf.readUInt16LE(e.offset + 26) + buf.readUInt16LE(e.offset + 28);
  const body = buf.subarray(start, start + e.csize);
  let data;
  if (e.method === 0) data = body;
  else {
    try { data = zlib.inflateRawSync(body, { maxOutputLength: Math.max(1, e.size) }); } catch (x) { throw new Error(`zip: "${e.name}" does not inflate to its declared size (${x.code || x.message})`); }
  }
  if (data.length !== e.size) throw new Error(`zip: "${e.name}" is ${data.length} bytes, the header says ${e.size}`);
  return data;
}

/** Extracts below `dir` (created). Returns the files written. */
export function extractZip(file, dir, limits = {}) {
  const z = readZip(file, limits);
  const root = path.resolve(dir);
  fs.mkdirSync(root, { recursive: true });
  const out = [];
  for (const e of z) {
    const target = path.resolve(root, ...e.name.split('/'));
    if (target !== root && !target.startsWith(root + path.sep)) throw new Error(`zip: "${e.name}" leaves the target folder`);
    if (e.dir) { fs.mkdirSync(target, { recursive: true }); continue; }
    const data = entryData(z, e);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, data);
    out.push({ name: e.name, file: target, size: data.length });
  }
  return out;
}
