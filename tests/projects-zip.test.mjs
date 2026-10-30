// engine/zip.mjs (0.15.0): the dependency-free zip writer and reader. The archive opens with independent readers (Python's zipfile and
// PowerShell Expand-Archive), Arabic names survive, and the reader refuses zip-slip, symlink, bomb and header-lie archives without
// writing outside its target folder.
//
//   node tests/projects-zip.test.mjs
import './_isolate.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { writeZip, readZip, extractZip, entryData, crc32 } from '../engine/zip.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-zip-'));
let failed = 0;
const out = [];
const check = (n, ok, d = '') => { out.push(`${ok ? 'PASS' : 'FAIL'}  projects-zip: ${n}${d && !ok ? '  — ' + String(d).slice(0, 300) : ''}`); if (!ok) failed += 1; };
const throws = (f) => { try { f(); return null; } catch (e) { return String(e.message); } };

try {
  const big = Buffer.from('Business-Wrap '.repeat(20000));
  const pdf = Buffer.from([0x25, 0x50, 0x44, 0x46, ...Array.from({ length: 300 }, (_, i) => i % 251)]);
  const entries = [
    { name: 'مشروع - Project/00 فهرس - Index.html', data: '<!doctype html><p>مرحبا</p>' },
    { name: 'مشروع - Project/01 مستند/مستند.ar.pdf', data: pdf },
    { name: 'مشروع - Project/01 مستند/big.txt', data: big },
    { name: 'مشروع - Project/empty.json', data: '' },
  ];
  const z = path.join(tmp, 'a.zip');
  const w = writeZip(z, entries);
  check('writer: entry count and a final file with no .part left', w.entries === 4 && fs.existsSync(z) && !fs.existsSync(`${z}.part`));
  const r = readZip(z);
  check('reader: names (Arabic, UTF-8) and sizes come back; the big text is deflated, the PDF stored', r.length === 4 && r[0].name === entries[0].name && r[2].size === big.length && r[2].csize < big.length / 10 && r[1].method === 0 && r[2].method === 8, JSON.stringify(r.map((x) => [x.name, x.method, x.size, x.csize])));
  check('reader: every entry reads back byte for byte (CRC checked)', entryData(r, r[1]).equals(pdf) && entryData(r, r[2]).equals(big) && entryData(r, r[3]).length === 0);
  check('crc32 is the standard one', crc32(Buffer.from('123456789')) === 0xcbf43926);

  // independent readers
  const py = spawnSync('python', ['-X', 'utf8', '-c', 'import zipfile,sys,hashlib\nz=zipfile.ZipFile(sys.argv[1])\nassert z.testzip() is None\nprint("|".join(f"{i.filename}:{i.file_size}" for i in z.infolist()))', z], { encoding: 'utf8', env: { ...process.env, PYTHONUTF8: '1' } });
  check('python zipfile opens it, testzip is clean, names and sizes agree', py.status === 0 && py.stdout.trim() === r.map((x) => `${x.name}:${x.size}`).join('|'), py.stderr + py.stdout);
  if (process.platform === 'win32') {
    const dest = path.join(tmp, 'ps');
    const ps = spawnSync('powershell', ['-NoProfile', '-Command', `Expand-Archive -LiteralPath '${z}' -DestinationPath '${dest}' -Force`], { encoding: 'utf8' });
    const f = path.join(dest, 'مشروع - Project', '01 مستند', 'مستند.ar.pdf');
    check('PowerShell Expand-Archive extracts the same tree (Arabic folder and file names intact)', ps.status === 0 && fs.existsSync(f) && fs.readFileSync(f).equals(pdf), ps.stderr);
  }
  const ex = extractZip(z, path.join(tmp, 'ex'));
  check('extractZip writes the tree below the target only', ex.length === 4 && ex.every((x) => x.file.startsWith(path.join(tmp, 'ex') + path.sep)));

  // names the writer refuses
  check('writer refuses .., an absolute path, a drive letter and NUL', ['../x', 'a/../../x', '/abs', 'C:/x', 'a\u0000b'].every((n) => throws(() => writeZip(path.join(tmp, 'bad.zip'), [{ name: n, data: 'x' }]))) && !fs.existsSync(path.join(tmp, 'bad.zip')));

  // hostile archives, built by hand
  const raw = (name, data, { method = 8, size = data.length, attr = 0x81a40000, by = 3, flags = 0x800 } = {}) => {
    const body = method === 8 ? zlib.deflateRawSync(data) : data;
    const nb = Buffer.from(name), h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(flags, 6); h.writeUInt16LE(method, 8); h.writeUInt32LE(crc32(data), 14); h.writeUInt32LE(body.length, 18); h.writeUInt32LE(size, 22); h.writeUInt16LE(nb.length, 26);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE((by << 8) | 20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(flags, 8); c.writeUInt16LE(method, 10); c.writeUInt32LE(crc32(data), 16); c.writeUInt32LE(body.length, 20); c.writeUInt32LE(size, 24); c.writeUInt16LE(nb.length, 28); c.writeUInt32LE(attr, 38); c.writeUInt32LE(0, 42);
    const cd = Buffer.concat([c, nb]), e = Buffer.alloc(22);
    e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(1, 8); e.writeUInt16LE(1, 10); e.writeUInt32LE(cd.length, 12); e.writeUInt32LE(h.length + nb.length + body.length, 16);
    return Buffer.concat([h, nb, body, cd, e]);
  };
  const evil = path.join(tmp, 'evil.zip');
  const outside = path.join(tmp, 'evil.txt');
  fs.writeFileSync(evil, raw('..\\evil.txt', Buffer.from('pwned')));
  const t1 = path.join(tmp, 'slip', 'inner');
  check('zip-slip (..\\evil.txt) is refused and nothing is written outside the target', /unsafe entry name/.test(throws(() => extractZip(evil, t1)) || '') && !fs.existsSync(outside) && !fs.existsSync(path.join(tmp, 'slip', 'evil.txt')));
  fs.writeFileSync(evil, raw('ok/../../evil.txt', Buffer.from('pwned')));
  check('zip-slip (nested ..) is refused', /unsafe/.test(throws(() => extractZip(evil, t1)) || ''));
  fs.writeFileSync(evil, raw('C:/Windows/evil.txt', Buffer.from('x')));
  check('an absolute Windows path is refused', /unsafe/.test(throws(() => readZip(evil)) || ''));
  fs.writeFileSync(evil, raw('link', Buffer.from('../../etc/passwd'), { attr: 0xa1ff0000 }));
  check('a symbolic-link entry is refused', /symbolic link/.test(throws(() => readZip(evil)) || ''));
  fs.writeFileSync(evil, raw('enc.bin', Buffer.from('x'), { flags: 0x801 }));
  check('an encrypted entry is refused', /encrypted/.test(throws(() => readZip(evil)) || ''));
  // a bomb: 50 MB of zeros deflates to ~50 KB; the declared total is over the limit
  const zeros = Buffer.alloc(50 * 1024 * 1024);
  fs.writeFileSync(evil, raw('zeros.bin', zeros));
  check('a bomb that declares more than the limit is refused before inflating', /declares more than/.test(throws(() => readZip(evil, { bytes: 10 * 1024 * 1024 })) || ''));
  check('the same archive within the limit extracts and is exact', extractZip(evil, path.join(tmp, 'zeros'), { bytes: 100 * 1024 * 1024 })[0].size === zeros.length);
  // a header that lies: declares 100 bytes, holds 50 MB
  fs.writeFileSync(evil, raw('lie.bin', zeros, { size: 100 }));
  const lie = path.join(tmp, 'lie');
  check('a header that lies about the size cannot expand past the declared size', /does not inflate to its declared size/.test(throws(() => extractZip(evil, lie)) || '') && (!fs.existsSync(path.join(lie, 'lie.bin'))));
  check('too many entries is refused', /entries, the limit is/.test(throws(() => { writeZip(path.join(tmp, 'many.zip'), Array.from({ length: 30 }, (_, i) => ({ name: `f${i}.txt`, data: String(i) }))); readZip(path.join(tmp, 'many.zip'), { entries: 20 }); }) || ''));
  check('a file that is not a zip is named as such', /not a zip file/.test(throws(() => readZip(path.join(tmp, 'ex', 'مشروع - Project', 'empty.json'))) || ''));
} catch (e) { check('suite ran without an exception', false, e.stack); } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
console.log(out.join('\n'));
console.log(failed ? `FAILED: ${failed}` : `ALL OK: ${out.length} checks`);
process.exit(failed ? 1 : 0);
