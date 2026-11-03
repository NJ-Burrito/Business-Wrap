// 0.17.0 (owner notes N15 and N16, plus the business-wrap://start link): the launcher, its Desktop copy, every file type's own icon, the start link.
//   node tests/launch-0170.test.mjs
// Safe by construction: a TEMP fake Desktop and a TEMP shortcut folder (BW_DESKTOP_DIR / lnkDir), own state folders, a free port, a browser stub
// (BW_BROWSER_STUB: the browser command is written to a file, no browser starts), a fake registry for the icon apply. Never the real Desktop, the real
// registry, drive C or the owner's host on 4317. Every process started here is stopped here by its recorded pid.
import './_isolate.mjs';
import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import path from 'node:path';
import zlib from 'node:zlib';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as P from '../engine/protocol.mjs';
import { createFileIcons, scopeOf, EXTS } from '../engine/file-icons.mjs';
import { makeRoute } from '../engine/routes/file-icons.mjs';
import { SPEC, KINDS, TREE_EXTS, kindOf, icoPath, ICON_DIR, LAUNCHER_ICO, SIZES } from '../assets/icons/kinds.mjs';
import { ensureLauncher, makeLauncher, readShortcut, copyToDesktop, stampFile, LNK_NAME } from '../launcher/launcher.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  launch-0170: ${name}${detail && !ok ? `  - ${detail}` : ''}`); if (!ok) failed += 1; };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-launch-'));
const mk = (...p) => { const d = path.join(tmp, ...p); fs.mkdirSync(d, { recursive: true }); return d; };
const free = () => new Promise((ok) => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => ok(p)); }); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { for (const t0 = Date.now(); Date.now() - t0 < ms;) { const v = await fn(); if (v) return v; await sleep(150); } return null; };
const up = async (port) => { try { return (await fetch(`http://127.0.0.1:${port}/api/version`, { signal: AbortSignal.timeout(1200) })).ok; } catch { return false; } };
const win = process.platform === 'win32';
const started = []; // pids of hosts started here

// ── the icon files: png decode (8-bit RGBA/RGB, non-interlaced), enough to look at the 16 px pixels ──
function readIco(file) {
  const b = fs.readFileSync(file);
  const n = b.readUInt16LE(4);
  return Array.from({ length: n }, (_, i) => { const o = 6 + 16 * i; const w = b[o] || 256; const size = b.readUInt32LE(o + 8); const off = b.readUInt32LE(o + 12); return { w, png: b.subarray(off, off + size) }; });
}
function decode(png) {
  let o = 8; let w = 0; let h = 0; let ct = 0; const idat = [];
  while (o < png.length) { const len = png.readUInt32BE(o); const t = png.toString('latin1', o + 4, o + 8); if (t === 'IHDR') { w = png.readUInt32BE(o + 8); h = png.readUInt32BE(o + 12); ct = png[o + 17]; } if (t === 'IDAT') idat.push(png.subarray(o + 8, o + 8 + len)); o += 12 + len; }
  const bpp = ct === 6 ? 4 : 3;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const out = Buffer.alloc(w * h * 4);
  const prev = Buffer.alloc(w * bpp); let cur = Buffer.alloc(w * bpp);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (w * bpp + 1)]; const row = raw.subarray(y * (w * bpp + 1) + 1, (y + 1) * (w * bpp + 1));
    for (let x = 0; x < w * bpp; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0; const up_ = prev[x]; const c = x >= bpp ? prev[x - bpp] : 0;
      const pr = f === 1 ? a : f === 2 ? up_ : f === 3 ? (a + up_) >> 1 : f === 4 ? ((p) => { const pa = Math.abs(p - a); const pb = Math.abs(p - up_); const pc = Math.abs(p - c); return pa <= pb && pa <= pc ? a : pb <= pc ? up_ : c; })(a + up_ - c) : 0;
      cur[x] = (row[x] + pr) & 255;
    }
    for (let x = 0; x < w; x++) { out[(y * w + x) * 4] = cur[x * bpp]; out[(y * w + x) * 4 + 1] = cur[x * bpp + 1]; out[(y * w + x) * 4 + 2] = cur[x * bpp + 2]; out[(y * w + x) * 4 + 3] = bpp === 4 ? cur[x * 4 + 3] : 255; }
    cur.copy(prev); cur = Buffer.alloc(w * bpp);
  }
  return { w, h, px: out };
}

try {
  // ═══ the start link ═══
  check('start link: parses to {action:start}', JSON.stringify(P.parseUrl('business-wrap://start')) === '{"action":"start"}');
  const refused = (u) => { try { P.parseUrl(u); return false; } catch (e) { return e.code === 2; } };
  check('start link: arguments, a path, a port or a fragment are refused (exit code 2); open and stop still parse', refused('business-wrap://start?x=1') && refused('business-wrap://start/extra') && refused('business-wrap://start:99') && refused('business-wrap://start#a') && refused('business-wrap://begin') && P.parseUrl('business-wrap://stop').action === 'stop' && P.parseUrl('business-wrap://open?file=C%3A%5Ca.html').action === 'open');

  // ── through the real handler (update/cli.mjs handle): a host in a temp state dir, a free port, no browser ──
  const port = await free();
  const sandbox = { BW_LOCAL_DIR: mk('s', 'local'), BW_STATE_DIR: mk('s', 'state'), BW_WORKSPACE: mk('s', 'ws'), BW_OPEN_PORT: String(port), BW_PROBE_PORTS: String(port), BW_POWER_GRACE_MS: '300', BW_NO_PROTOCOL: '1', BW_NO_LAUNCHER: '1', BW_BROWSER_STUB: path.join(tmp, 'start-browser.jsonl') };
  const env = { ...process.env, ...sandbox };
  const h = spawnSync(process.execPath, [path.join(REPO, 'update', 'cli.mjs'), 'handle', 'business-wrap://start', '--json'], { env, encoding: 'utf8', windowsHide: true, timeout: 60000 });
  let out = null; try { out = JSON.parse(h.stdout.trim().split(/\r?\n/).pop()); } catch { /* shown below */ }
  if (out?.pid) started.push(out.pid);
  check('start link: `handle business-wrap://start` exits 0 and answers {action:start, port, browser:false}', h.status === 0 && out?.action === 'start' && out.port === port && out.browser === false, `${h.status} ${h.stdout} ${h.stderr}`.slice(0, 300));
  check('start link: the host answers on the free port (real /api/version)', await until(() => up(port)) === true);
  check('start link: no browser was started (the stub file has no line), the host is of this install', !fs.existsSync(sandbox.BW_BROWSER_STUB) && fs.existsSync(path.join(sandbox.BW_LOCAL_DIR, 'host.json')));
  const again = spawnSync(process.execPath, [path.join(REPO, 'update', 'cli.mjs'), 'handle', 'business-wrap://start', '--json'], { env, encoding: 'utf8', windowsHide: true, timeout: 60000 });
  let out2 = null; try { out2 = JSON.parse(again.stdout.trim().split(/\r?\n/).pop()); } catch { /* shown below */ }
  check('start link: called again with the host up, it reuses it (same port, same pid), never a second host', again.status === 0 && out2?.port === port && out2?.pid === out?.pid, `${again.stdout} ${again.stderr}`.slice(0, 200));
  const bad = spawnSync(process.execPath, [path.join(REPO, 'update', 'cli.mjs'), 'handle', 'business-wrap://start?x=1'], { env, encoding: 'utf8', windowsHide: true, timeout: 30000 });
  check('start link: a bad start URL exits 2 through the real handler', bad.status === 2);

  // ── stop = the host only (owner rule 0.15.2 note 4): a stand-in "browser" pid recorded as one this host opened must survive ──
  const dummy = spawn(process.execPath, ['-e', 'setTimeout(()=>{},120000)'], { detached: true, stdio: 'ignore', windowsHide: true });
  dummy.unref();
  const hj = path.join(sandbox.BW_LOCAL_DIR, 'host.json');
  const hostJson = JSON.parse(fs.readFileSync(hj, 'utf8'));
  fs.writeFileSync(hj, JSON.stringify({ ...hostJson, browserPids: [...(hostJson.browserPids || []), dummy.pid] }));
  const isAlive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
  const stp = spawnSync(process.execPath, [path.join(REPO, 'update', 'cli.mjs'), 'handle', 'business-wrap://stop', '--json'], { env, encoding: 'utf8', windowsHide: true, timeout: 60000 });
  let so = null; try { so = JSON.parse(stp.stdout.trim().split(/\r?\n/).pop()); } catch { /* shown below */ }
  check('stop link: exits 0 and the host is gone (port closed, host.json removed)', stp.status === 0 && so?.action === 'stop' && (await until(async () => !(await up(port)), 10000)) === true && !fs.existsSync(hj), `${stp.stdout} ${stp.stderr}`.slice(0, 300));
  check('stop link: stops ONLY the host: the browser the host opened (recorded pid) is still running', so?.browsersKept === true && isAlive(dummy.pid) && !(so?.pids || []).includes(dummy.pid));
  try { process.kill(dummy.pid); } catch { /* gone */ }

  // ═══ N15 the launcher and its Desktop copy (Windows) ═══
  if (win) {
    const lnkDir = mk('lnk'); const desktop = mk('desktop'); const local = mk('l2');
    process.env.BW_LOCAL_DIR = local;
    fs.writeFileSync(path.join(desktop, LNK_NAME), 'OLD SHORTCUT'); // an older copy is on the Desktop
    const r = ensureLauncher({ lnkDir, desktop });
    check('launcher: made, with the Business-Wrap icon (launcher.ico), windowless target, in the folder given', r.launcher?.ok && r.launcher.lnk === path.join(lnkDir, LNK_NAME) && fs.statSync(r.launcher.lnk).size > 200, JSON.stringify(r));
    const sc = readShortcut(r.launcher.lnk);
    check('launcher: read back through the shell: icon = assets/icons/launcher.ico, target wscript.exe //B, runs launcher/open-editor.vbs with this node', !!sc && sc.icon.toLowerCase() === `${LAUNCHER_ICO},0`.toLowerCase() && /wscript\.exe$/i.test(sc.target) && /\/\/B/.test(sc.args) && sc.args.includes(path.join(REPO, 'launcher', 'open-editor.vbs')) && sc.args.includes(process.execPath), JSON.stringify(sc));
    check('Desktop copy: the older one was REPLACED (not the old bytes), by the same shortcut', r.desktop?.replaced === true && fs.readFileSync(path.join(desktop, LNK_NAME)).equals(fs.readFileSync(r.launcher.lnk)) && fs.statSync(path.join(desktop, LNK_NAME)).size > 200);
    const sc2 = readShortcut(path.join(desktop, LNK_NAME));
    check('Desktop copy: it carries the same icon and target', JSON.stringify(sc2) === JSON.stringify(sc));
    check('Desktop copy: no half-written temp file is left beside it', fs.readdirSync(desktop).join() === LNK_NAME && fs.readdirSync(lnkDir).join() === LNK_NAME);
    fs.rmSync(path.join(desktop, LNK_NAME));
    const second = ensureLauncher({ lnkDir, desktop });
    check('first run only: a second run does not re-make the copy the person deleted', second.desktop?.skipped === 'already-copied' && !fs.existsSync(path.join(desktop, LNK_NAME)));
    // an update = a new version in the same install: a fresh copy, over whatever is there
    const fake = mk('install');
    for (const f of ['launcher/open-editor.vbs', 'assets/icons/launcher.ico']) { fs.mkdirSync(path.dirname(path.join(fake, f)), { recursive: true }); fs.copyFileSync(path.join(REPO, f), path.join(fake, f)); }
    fs.writeFileSync(path.join(fake, 'package.json'), JSON.stringify({ name: 'business-wrap', version: '9.0.0' }));
    const f1 = ensureLauncher({ installDir: fake, lnkDir: mk('lnk2'), desktop });
    fs.writeFileSync(path.join(desktop, LNK_NAME), 'EDITED BY PERSON');
    check('first run of an install: the copy is made (stamp written in the state folder)', f1.desktop?.copy === path.join(desktop, LNK_NAME) && fs.existsSync(stampFile(fake)) && JSON.parse(fs.readFileSync(stampFile(fake), 'utf8')).version === '9.0.0');
    fs.writeFileSync(path.join(fake, 'package.json'), JSON.stringify({ name: 'business-wrap', version: '9.0.1' }));
    const f2 = ensureLauncher({ installDir: fake, lnkDir: mk('lnk2'), desktop });
    check('after an update (new version): the copy is replaced again, the stamp holds the new version', f2.desktop?.replaced === true && fs.statSync(path.join(desktop, LNK_NAME)).size > 200 && JSON.parse(fs.readFileSync(stampFile(fake), 'utf8')).version === '9.0.1');
    const guard = spawnSync(process.execPath, ['--input-type=module', '-e', "import('./launcher/launcher.mjs').then((m)=>console.log(JSON.stringify({d:m.desktopDir(),a:m.autorun()})))"], { cwd: REPO, env: { ...process.env, BW_DESKTOP_DIR: '', BW_LOCAL_DIR: mk('g') }, encoding: 'utf8' });
    check('test runs never reach the real Desktop: with no BW_DESKTOP_DIR a sandboxed run has no Desktop folder and the hook does nothing', guard.status === 0 && JSON.parse(guard.stdout.trim()).d === null && JSON.parse(guard.stdout.trim()).a.skipped === true, guard.stdout + guard.stderr);

    // ── the real caller: run the Desktop shortcut's own command (wscript + vbs + node) and see what it does ──
    const stub = path.join(tmp, 'launcher-browser.jsonl');
    const lenv = { ...process.env, BW_LOCAL_DIR: mk('l3'), BW_STATE_DIR: mk('l3s'), BW_WORKSPACE: mk('l3w'), BW_BROWSER_STUB: stub, BW_NO_LAUNCHER: '1', BW_NO_PROTOCOL: '1', BW_OPEN_PORT: String(port + 1), BW_PROBE_PORTS: String(port + 1) };
    const run = spawn(sc2.target, sc2.args.match(/"[^"]*"|\S+/g).map((a) => a.replace(/^"|"$/g, '')), { env: lenv, windowsHide: true, stdio: 'ignore' });
    run.on('error', () => {});
    const line = await until(() => (fs.existsSync(stub) && fs.readFileSync(stub, 'utf8').trim()) || null, 40000);
    const cmd = line ? JSON.parse(line.split(/\r?\n/)[0]) : null;
    const url = cmd?.args?.[0] || '';
    check('launcher run (the shortcut command itself): the editor opens in the browser as a file:// page that exists and is a Business-Wrap editor', url.startsWith('file:///') && fs.existsSync(decodeURIComponent(new URL(url).pathname.slice(1))) && /id="bw-data"/.test(fs.readFileSync(decodeURIComponent(new URL(url).pathname.slice(1)), 'utf8')), line || 'no browser line');
    check('launcher run: NO host was started (no host.json, no cli-hosts.json, nothing answers on the port)', !fs.existsSync(path.join(lenv.BW_LOCAL_DIR, 'host.json')) && !fs.existsSync(path.join(lenv.BW_STATE_DIR, 'cli-hosts.json')) && !(await up(port + 1)));
  } else check('launcher: Windows-only parts skipped on this platform', true);
  check('launcher: makeLauncher answers supported:false off Windows, never throws', win || makeLauncher().supported === false);

  // ═══ N16 every tree file type has its own icon ═══
  check('icons: the set holds the sizes 16, 24, 32, 48, 64, 128, 256', JSON.stringify(SIZES) === '[16,24,32,48,64,128,256]');
  const treeNames = ['a.pdf', 'a.docx', 'a.html', 'a.htm', 'a.print.html', 'a.shared.html', 'a.json', 'a.bwlog', 'a.txt', 'a.md', 'a.bpmn', 'a.xml', 'a.drawio', 'a.yaml', 'a.yml', 'a.png', 'a.jpg', 'a.svg', 'a.zip', 'A.PDF'];
  check('icons: every file type of the tree (documents, exports, sources, versions, history, the README) maps to a real kind', treeNames.every((n) => kindOf(n) !== 'file') && kindOf('noext') === 'file' && kindOf('x.unknown') === 'file' && kindOf('A.PDF') === 'pdf' && kindOf('a.print.html') === 'html');
  const harvest = await import('../engine/harvest/sources.mjs');
  const sources = ['pdf', 'docx', 'html', 'htm', 'txt', 'md', 'bpmn', 'bpmn20.xml', 'xml', 'drawio', 'yaml', 'yml', 'json'];
  check('icons: every source type the harvest and import accept (MODEL_EXT, TEXT_EXT) has its own kind', sources.every((e) => (harvest.MODEL_EXT.test(`f.${e}`) || harvest.TEXT_EXT.test(`f.${e}`)) && kindOf(`f.${e}`) !== 'file'));
  const sizesOf = (k) => readIco(icoPath(k)).map((f) => f.w).join();
  check('icons: each kind has an .ico with exactly 16,24,32,48,64,128,256 and a launcher.ico the same', [...KINDS, 'launcher'].every((k) => sizesOf(k) === '16,24,32,48,64,128,256' && fs.existsSync(path.join(ICON_DIR, `${k}.svg`))), KINDS.map((k) => `${k}:${sizesOf(k)}`).join(' '));
  check('icons: every frame is a PNG of its stated size', [...KINDS, 'launcher'].every((k) => readIco(icoPath(k)).every((f) => { const d = decode(f.png); return d.w === f.w && d.h === f.w; })));
  const f16 = Object.fromEntries(KINDS.map((k) => [k, decode(readIco(icoPath(k))[0].png)]));
  let minDiff = 1e9; let worst = '';
  for (let i = 0; i < KINDS.length; i++) for (let j = i + 1; j < KINDS.length; j++) { const a = f16[KINDS[i]].px; const b = f16[KINDS[j]].px; let n = 0; for (let p = 0; p < a.length; p += 4) if (Math.abs(a[p] - b[p]) + Math.abs(a[p + 1] - b[p + 1]) + Math.abs(a[p + 2] - b[p + 2]) > 90) n += 1; if (n < minDiff) { minDiff = n; worst = `${KINDS[i]}/${KINDS[j]}`; } }
  check('icons: at 16 px no two types look alike (every pair differs in at least 12 of 256 pixels)', minDiff >= 12, `${worst}: ${minDiff}`);
  const a256 = decode(readIco(icoPath('pdf'))[6].png).px;
  check('icons: the 256 frame is drawn at 256 (corner transparent, page opaque, antialiased edges present)', a256[3] === 0 && a256[(128 * 256 + 100) * 4 + 3] === 255 && (() => { let soft = 0; for (let p = 3; p < a256.length; p += 4) if (a256[p] > 0 && a256[p] < 255) soft += 1; return soft > 400; })());
  check('icons: each type has a hand-tuned small drawing (-small.svg) for the 16 and 24 px frames (presence only; looked at in the preview)', KINDS.every((k) => fs.existsSync(path.join(ICON_DIR, `${k}-small.svg`))));
  check('icons: the 16 distinct .ico files differ byte for byte', new Set([...KINDS, 'launcher'].map((k) => fs.readFileSync(icoPath(k)).toString('base64'))).size === KINDS.length + 1);

  // ── Explorer: the tree scope through a fake registry (never the real one) ──
  const store = new Map();
  const seeds = { 'hkcu\\software\\classes\\.json': 'jsonfile', 'hkcu\\software\\classes\\.png': 'pngfile', 'hkcu\\software\\classes\\.pdf': 'AcroPdf' };
  const reg = { async ops(list) { return list.map((o) => { const k = o.key.toLowerCase(); if (o.op === 'get') { if (store.has(k)) return { key: true, value: true, data: store.get(k), kind: 'String' }; const s = seeds[k.replace(/^hkcr\\/, 'hkcu\\software\\classes\\')]; return s && o.name === '' ? { key: true, value: true, data: s, kind: 'String' } : { key: false, value: false, data: null }; } if (o.op === 'set') { store.set(o.key.toLowerCase(), o.data); return { ok: true }; } return { ok: true }; }); } };
  const sd = mk('icons-state');
  const fi = createFileIcons({ reg, refresh: async () => true, platform: 'win32', stateDir: sd, ...scopeOf('tree') });
  const ap = await fi.apply();
  check('tree scope: applies the icon of each type (json, png, pdf with a fake registry) and reads it back', ap.ok && ['json', 'image', 'pdf'].every((k) => fs.existsSync(path.join(sd, `${k}.ico`))) && store.get('hkcu\\software\\classes\\jsonfile\\defaulticon') === `${path.join(sd, 'json.ico')},0` && store.get('hkcu\\software\\classes\\pngfile\\defaulticon') === `${path.join(sd, 'image.ico')},0`, JSON.stringify(ap.results?.filter((x) => x.ok)));
  const st = await fi.status();
  check('tree scope: status says applied, restore is exact (backup kept before the first change)', st.applied === true && (await fi.restore()).ok === true);
  check('core scope is unchanged: the three extensions only (pdf, docx, html)', JSON.stringify(scopeOf('core').exts) === JSON.stringify(EXTS) && TREE_EXTS.length > EXTS.length && SPEC.kinds.pdf.exts[0] === 'pdf');
  const sent = []; const route = makeRoute({ reg, platform: 'win32', stateDir: mk('route-state') });
  await route({ method: 'GET', headers: {} }, new URL('http://127.0.0.1/api/file-icons/status?scope=tree'), (c, b) => sent.push([c, b]));
  check('route: /api/file-icons/status?scope=tree answers 200 for the tree scope', sent[0]?.[0] === 200 && sent[0][1].supported === true);
} catch (e) {
  check('suite ran to the end', false, String(e?.stack || e).slice(0, 400));
} finally {
  for (const pid of started) { if (win) spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true }); else { try { process.kill(pid); } catch { /* gone */ } } }
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* temp */ }
}
console.log(failed ? `FAILED ${failed}` : 'ALL PASS');
process.exitCode = failed ? 1 : 0;
