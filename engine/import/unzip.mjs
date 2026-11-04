// A forgiving zip reader for project import (0.16.3, fix 0163). engine/zip.mjs refuses a whole archive for one odd entry; an owner's
// zip, made by Windows, 7-Zip or another tool, must come in as far as it can with a named reason for each file that cannot.
//   unzipTo(zipFile, dir, limits?) → {files: [{name, file, size}], problems: [{name, reason}]}
// Reads: the central directory, zip64 (end record, locator, extra fields), UTF-8 names (flag 0x800 or the 0x7075 extra field), names
// without the flag (UTF-8 when valid, else the legacy code page that reads as Arabic: Windows-1256 or OEM 720, or OEM 437), data descriptors (sizes come from the central directory), stored and deflated entries.
// Refuses per entry: encrypted, other methods, symbolic links, names that leave the folder. Hard guards stay whole-archive: entries and declared size.
// Files are written through lp() so a long Arabic path works on Windows.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { lp } from './safe.mjs';

export const LIMITS = { entries: 5000, bytes: 2 * 1024 * 1024 * 1024 };

function nameOf(buf, flags, extra) {
  for (let p = 0; p + 4 <= extra.length;) { // Info-ZIP Unicode Path: 0x7075 {ver 1, crc 4, utf8}
    const id = extra.readUInt16LE(p), sz = extra.readUInt16LE(p + 2);
    if (id === 0x7075 && sz > 5 && extra[p + 4] === 1) return extra.subarray(p + 9, p + 4 + sz).toString('utf8');
    p += 4 + sz;
  }
  const u = buf.toString('utf8');
  if (flags & 0x800 || !u.includes('�')) return u;
  return legacyName(buf);
}

// The second half (0x80..0xFF) of the two OEM code pages Windows' built-in zip writes when the name has no UTF-8 flag (generated from the code
// pages themselves): 720 on an Arabic system, 437 on a Western one. Windows-1256 is what WinRAR and older tools write.
const CP720 = 'éâàçêëèïîّْô¤ـûùءآأؤ£إئابةتثجحخدذرزسشص«»░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀ضطظعغفµقكلمنهوىي≡ًٌٍَُِ≈°∙·√ⁿ²■ ';
const CP437 = 'ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒáíóúñÑªº¿⌐¬½¼¡«»░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■ ';
const viaTable = (buf, table) => { let o = ''; for (const b of buf) o += b < 0x80 ? String.fromCharCode(b) : table[b - 0x80]; return o; };

/** A name with no UTF-8 flag and not valid UTF-8: the code page under which most of its high bytes read as Arabic letters wins (1256, then 720);
 *  a name with no such majority (a Western name: é ü ñ) is OEM 437. */
export function legacyName(buf) {
  let w = '';
  try { w = new TextDecoder('windows-1256').decode(buf); } catch { w = buf.toString('latin1'); }
  const o = viaTable(buf, CP720);
  const high = [...buf].filter((b) => b >= 0x80).length || 1;
  const share = (txt) => { let a = 0; for (const c of txt) if (c >= 'ء' && c <= 'ي') a += 1; return a / high; };
  const sw = share(w), so = share(o);
  if (sw < 0.6 && so < 0.6) return viaTable(buf, CP437);
  return so > sw ? o : w;
}

export function listZip(buf, limits = {}) {
  const L = { ...LIMITS, ...limits };
  let e = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--) if (buf.readUInt32LE(i) === 0x06054b50) { e = i; break; }
  if (e < 0) throw new Error('not a zip file (the end record is missing: the file may be cut short or is not a zip)');
  let count = buf.readUInt16LE(e + 10), cdSize = buf.readUInt32LE(e + 12), cdOff = buf.readUInt32LE(e + 16);
  if ((count === 0xffff || cdOff === 0xffffffff || cdSize === 0xffffffff) && e >= 20 && buf.readUInt32LE(e - 20) === 0x07064b50) { // zip64
    const z = Number(buf.readBigUInt64LE(e - 20 + 8));
    if (buf.readUInt32LE(z) !== 0x06064b50) throw new Error('zip64 end record not found');
    count = Number(buf.readBigUInt64LE(z + 32)); cdSize = Number(buf.readBigUInt64LE(z + 40)); cdOff = Number(buf.readBigUInt64LE(z + 48));
  }
  if (count > L.entries) throw new Error(`${count} entries, the limit is ${L.entries}`);
  if (cdOff + cdSize > buf.length) throw new Error('the central directory is out of range (the file may be cut short)');
  const out = [];
  let p = cdOff, total = 0;
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('bad central directory');
    const made = buf.readUInt16LE(p + 4), flags = buf.readUInt16LE(p + 8), method = buf.readUInt16LE(p + 10);
    let csize = buf.readUInt32LE(p + 20), size = buf.readUInt32LE(p + 24);
    const nl = buf.readUInt16LE(p + 28), xl = buf.readUInt16LE(p + 30), cl = buf.readUInt16LE(p + 32), attr = buf.readUInt32LE(p + 38);
    let offset = buf.readUInt32LE(p + 42);
    const extra = buf.subarray(p + 46 + nl, p + 46 + nl + xl);
    const name = nameOf(buf.subarray(p + 46, p + 46 + nl), flags, extra).replace(/\\/g, '/');
    for (let q = 0; q + 4 <= extra.length;) { // zip64 extra: only the fields whose 32-bit value is 0xffffffff, in this order
      const id = extra.readUInt16LE(q), sz = extra.readUInt16LE(q + 2);
      if (id === 1) { let r = q + 4; if (size === 0xffffffff) { size = Number(extra.readBigUInt64LE(r)); r += 8; } if (csize === 0xffffffff) { csize = Number(extra.readBigUInt64LE(r)); r += 8; } if (offset === 0xffffffff) offset = Number(extra.readBigUInt64LE(r)); }
      q += 4 + sz;
    }
    p += 46 + nl + xl + cl;
    total += size;
    if (total > L.bytes) throw new Error(`declares more than ${Math.round(L.bytes / 1048576)} MB uncompressed`);
    out.push({ name, flags, method, csize, size, offset, dir: name.endsWith('/'), link: (made >> 8) === 3 && ((attr >>> 16) & 0xf000) === 0xa000 });
  }
  return out;
}

export function unzipTo(zipFile, dir, limits = {}) {
  const buf = fs.readFileSync(lp(path.resolve(zipFile)));
  const entries = listZip(buf, limits);
  const root = path.resolve(dir);
  fs.mkdirSync(lp(root), { recursive: true });
  const files = [], problems = [];
  const partsOf = (e) => e.name.split('/').filter((x, i, a) => x !== '' || i === a.length - 1);
  for (const e of entries) { // a hostile name refuses the whole archive (zip-slip): nothing is written
    const t = path.resolve(root, ...partsOf(e));
    if (!e.name || e.name.startsWith('/') || /[\u0000:]/.test(e.name) || partsOf(e).some((x) => x === '..' || x === '.') || (t !== root && !t.startsWith(root + path.sep))) throw new Error(`zip: unsafe entry name "${e.name.slice(0, 80)}"`);
  }
  for (const e of entries) {
    try {
      const parts = partsOf(e);
      const target = path.resolve(root, ...parts);
      if (e.dir) { fs.mkdirSync(lp(target), { recursive: true }); continue; }
      if (e.flags & 1) throw new Error('it is password protected');
      if (e.link) throw new Error('it is a symbolic link');
      if (![0, 8].includes(e.method)) throw new Error(`it uses compression method ${e.method}, which is not supported`);
      if (buf.readUInt32LE(e.offset) !== 0x04034b50) throw new Error('its local header is damaged');
      const start = e.offset + 30 + buf.readUInt16LE(e.offset + 26) + buf.readUInt16LE(e.offset + 28);
      const body = buf.subarray(start, start + e.csize);
      let data = body;
      if (e.method === 8) data = zlib.inflateRawSync(body, { maxOutputLength: Math.max(1, e.size) });
      if (data.length !== e.size) throw new Error(`it is ${data.length} bytes, the archive says ${e.size}`);
      fs.mkdirSync(lp(path.dirname(target)), { recursive: true });
      fs.writeFileSync(lp(target), data);
      files.push({ name: parts.join('/'), file: lp(target), size: data.length }); // lp: every reader downstream opens it however long the path
    } catch (x) { problems.push({ name: e.name, reason: `cannot be read from the zip: ${String(x.message || x).replace(/\s+/g, ' ').slice(0, 160)}` }); }
  }
  return { files, problems };
}
