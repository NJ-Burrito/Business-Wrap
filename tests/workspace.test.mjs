// A11 save folder (design.md §3 A11): with a temp parent, the server's export writes
// <parent>\Business-Wrap\PDF\<title>-<date>-AR.pdf / -ENG.pdf and DOCX\…; a second export the same day gets -2;
// Save HTML lands in HTML\; HISTORY\ exists and holds no plain .json outside sessions\; names with : / are sanitised;
// the default parent is never inside the repository; the folder dialog (stubbed) stores the choice.
//
//   node tests/workspace.test.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { REPO } from '../engine/export.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-ws-'));
process.env.BW_LOCAL_DIR = path.join(tmp, '.local');
delete process.env.BW_WORKSPACE;
const W = await import('../engine/workspace.mjs');
const { serve } = await import('../engine/serve.mjs');
const { buildEditor } = await import('../engine/build-editor.mjs');

let failed = 0;
const out = [];
const check = (n, ok, d = '') => { out.push(`${ok ? 'PASS' : 'FAIL'}  workspace: ${n}${d && !ok ? '  — ' + d : ''}`); if (!ok) failed += 1; };
const inside = (p, dir) => !path.relative(dir, p).startsWith('..');

// the default and the guard against the repository
const d0 = W.workspace();
check('default parent is never inside the repository', !inside(d0.root, REPO) && d0.chosen === false, d0.root);
let refused = '';
try { W.setParent(path.join(REPO, 'exports')); } catch (e) { refused = e.message; }
check('a parent inside the repository is refused', !!refused);
check('outName: "<title>-<YYYY-MM-DD>-<AR|ENG>.<ext>", : and / sanitised, Arabic kept',
  W.outName('تصريح: فعالية/عامة', new Date(2026, 9, 28), 'ar', 'pdf') === 'تصريح-فعالية-عامة-2026-10-28-AR.pdf' && W.outName('A:B', '2026-01-05T10:00:00', 'en', 'docx') === 'A-B-2026-01-05-ENG.docx',
  W.outName('تصريح: فعالية/عامة', new Date(2026, 9, 28), 'ar', 'pdf'));

const parent = path.join(tmp, 'parent');
fs.mkdirSync(parent);
process.env.BW_PICK_STUB = parent;
const picked = await W.pickParent();
check('pickParent stores the chosen folder in .local/workspace.json', picked === parent && W.workspace().chosen && JSON.parse(fs.readFileSync(path.join(tmp, '.local', 'workspace.json'), 'utf8')).parent === parent);
process.env.BW_PICK_STUB = '';
check('pickParent cancelled → null, the old choice kept', (await W.pickParent()) === null && W.workspace().parent === parent);

const editor = path.join(tmp, 'ws.editor.html');
buildEditor({ inputs: [path.join(REPO, 'samples', 'event-permit')], out: editor, set: 'ws', watermarkDir: null });
const server = await serve(editor, 0, { workspace: true });
const base = `http://127.0.0.1:${server.address().port}`;
const post = async (p, b) => { const r = await fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }); return { s: r.status, j: await r.json() }; };
try {
  const docs = { ar: JSON.parse(fs.readFileSync(path.join(REPO, 'samples', 'event-permit', 'document.ar.json'), 'utf8')), en: JSON.parse(fs.readFileSync(path.join(REPO, 'samples', 'event-permit', 'document.en.json'), 'utf8')) };
  const today = W.outName('x', new Date(), 'ar', 'pdf').slice(2, 12);
  const titles = { ar: W.docTitle(docs.ar), en: W.docTitle(docs.en) };
  const r1 = await post('/api/export', { service: 'event-permit', locale: 'ar', doc: docs.ar });
  const r2 = await post('/api/export', { service: 'event-permit', locale: 'en', doc: docs.en });
  const ws = W.workspace();
  const want = (dir, t, loc, ext, n = '') => path.join(dir, `${W.outName(t, new Date(), loc, ext).replace(/\.\w+$/, '')}${n}.${ext}`);
  check('export AR: PDF\\<t>-<d>-AR.pdf and DOCX\\<t>-<d>-AR.docx', r1.s === 200 && r1.j.pdf === want(ws.dirs.pdf, titles.ar, 'ar', 'pdf') && fs.existsSync(r1.j.pdf) && r1.j.docx === want(ws.dirs.docx, titles.ar, 'ar', 'docx') && fs.existsSync(r1.j.docx), JSON.stringify(r1.j).slice(0, 300));
  check('export EN: PDF\\<t>-<d>-ENG.pdf', r2.s === 200 && r2.j.pdf === want(ws.dirs.pdf, titles.en, 'en', 'pdf') && fs.existsSync(r2.j.pdf) && r2.j.pdf.includes(today), JSON.stringify(r2.j).slice(0, 300));
  const r3 = await post('/api/export', { service: 'event-permit', locale: 'ar', doc: docs.ar });
  check('a second export the same day gets -2 (never an overwrite)', r3.j.pdf === want(ws.dirs.pdf, titles.ar, 'ar', 'pdf', '-2') && fs.existsSync(r1.j.pdf), r3.j.pdf);
  const served = await fetch(base + r1.j.pdfUrl);
  check('the exported PDF is served under /files/', served.status === 200 && (await served.arrayBuffer()).byteLength > 1000, r1.j.pdfUrl);
  const h = await post('/api/workspace/html', { title: 'طلب: تصريح', locale: 'en', html: '<!doctype html><html><body>x</body></html>' });
  check('Save HTML lands in HTML\\ as <title>-<d>-ENG.html', h.s === 200 && path.dirname(h.j.file) === ws.dirs.html && path.basename(h.j.file) === W.outName('طلب: تصريح', new Date(), 'en', 'html'), JSON.stringify(h.j));
  const bad = await post('/api/workspace/html', { title: 'x', html: 'not html' });
  check('Save HTML refuses a body that is not an HTML document', bad.s === 400);
  const g = await (await fetch(base + '/api/workspace')).json();
  check('GET /api/workspace answers the live folder', g.root === ws.root && g.served === true);
  const hist = (await fetch(base + '/files/HISTORY/x.json')).status;
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? (e.name === 'sessions' ? [] : walk(path.join(d, e.name))) : [path.join(d, e.name)]));
  check('HISTORY\\ exists, holds no plain .json outside sessions\\, and is never served', fs.existsSync(ws.dirs.history) && walk(ws.dirs.history).every((f) => !f.endsWith('.json')) && hist === 404);
  const foreign = await fetch(base + '/api/workspace/parent', { method: 'POST', headers: { origin: 'https://evil.example', 'content-type': 'application/json' }, body: '{"parent":"C:\\\\x"}' });
  check('a foreign origin cannot change the save folder', foreign.status === 403);
  check('nothing was written beside the editor (no exports/ folder)', !fs.existsSync(path.join(tmp, 'exports')));

  // 0.13.0 review line 15: every saved file obeys "<title>-<date>-<AR|ENG>.<ext>" (share and report included), the title's
  // spaces kept (as the pipeline outputs), and no machine file (manifest.json …) outside HISTORY\
  check('outName keeps the spaces between the title words', W.outName('تحديث بيانات منتج غذائي', new Date(2026, 9, 29), 'ar', 'pdf') === 'تحديث بيانات منتج غذائي-2026-10-29-AR.pdf');
  const saveHtml = `<!doctype html><html lang="ar"><body><script type="application/json" id="bw-data">${JSON.stringify({ services: [{ id: 'doc-53a766e1-aaaa', editions: { ar: { raw: JSON.stringify(docs.ar) } } }] })}</script></body></html>`;
  const sh = await post('/api/share', { name: 'doc-53a766e1-aaaa.editor.html', html: saveHtml });
  check('share writes HTML\\<title>-<d>-AR.html (not doc-<id>.editor.html)', sh.s === 200 && path.dirname(sh.j.path) === ws.dirs.html && path.basename(sh.j.path) === W.outName(W.docTitle(docs.ar), new Date(), 'ar', 'html'), JSON.stringify(sh.j));
  const rp = await post('/api/report', { lang: 'ar' });
  const rpe = await post('/api/report', { lang: 'en' });
  check('the performance report goes to PDF\\ as <title>-<d>-AR.pdf / -ENG.pdf', rp.s === 200 && path.dirname(rp.j.pdf) === ws.dirs.pdf && /-\d{4}-\d\d-\d\d-AR\.pdf$/.test(rp.j.pdf) && /-\d{4}-\d\d-\d\d-ENG\.pdf$/.test(rpe.j.pdf), JSON.stringify([rp, rpe]));
  const NAME = /^.+-\d{4}-\d\d-\d\d-(AR|ENG)(-\d+)?\.(pdf|docx|html|print\.html)$/;
  const strays = ['pdf', 'docx', 'html'].flatMap((k) => fs.readdirSync(ws.dirs[k]).filter((f) => !NAME.test(f)).map((f) => `${k}/${f}`));
  check('PDF\\ DOCX\\ HTML\\ hold only "<title>-<date>-<AR|ENG>" files (no manifest.json, no ids)', strays.length === 0, strays.join(', '));
} finally {
  server.close();
  server.closeAllConnections?.();
}

console.log(out.join('\n'));
console.log(failed ? `\nFAILED: ${failed}` : `\nworkspace: ${out.length}/${out.length} PASS`);
try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* temp */ }
process.exit(failed ? 1 : 0);
