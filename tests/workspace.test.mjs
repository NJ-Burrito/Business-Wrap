// A11 save folder (0.13.3 tree): with a temp parent, the server's export writes
// <parent>\Business-Wrap\المستندات - Documents\<title>\Exports\<date> <title> - العربية.pdf / - English.pdf and .docx; a second export never
// overwrites; Save HTML lands in the document's own folder; .system exists, holds no plain .json outside its index, and is never served;
// names with : / are sanitised; the default parent is never inside the repository; the folder dialog (stubbed) stores the choice.
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
// same rule as engine/workspace.mjs: a path on another drive comes back from path.relative as an absolute path, not inside
const inside = (p, dir) => { const r = path.relative(dir, p); return !r || (!r.startsWith('..') && !path.isAbsolute(r)); };

// the default and the guard against the repository
const d0 = W.workspace();
check('default parent is never inside the repository', !inside(d0.root, REPO) && d0.chosen === false, d0.root);
let refused = '';
try { W.setParent(path.join(REPO, 'exports')); } catch (e) { refused = e.message; }
check('a parent inside the repository is refused', !!refused);
check('outName: "<title>/Exports/<YYYY-MM-DD HH-MM> <title> - <language>.<ext>", : and / sanitised, Arabic kept',
  W.outName('تصريح: فعالية/عامة', new Date(2026, 9, 28, 7, 30), 'ar', 'pdf') === 'تصريح-فعالية-عامة/Exports/2026-10-28 07-30 تصريح-فعالية-عامة - العربية.pdf' && W.outName('A:B', '2026-01-05T10:00:00', 'en', 'docx') === 'A-B/Exports/2026-01-05 10-00 A-B - English.docx',
  W.outName('تصريح: فعالية/عامة', new Date(2026, 9, 28, 7, 30), 'ar', 'pdf'));

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
  const titles = { ar: W.docTitle(docs.ar), en: W.docTitle(docs.en) };
  const r1 = await post('/api/export', { service: 'event-permit', locale: 'ar', doc: docs.ar });
  const r2 = await post('/api/export', { service: 'event-permit', locale: 'en', doc: docs.en });
  const ws = W.workspace();
  // the document's Exports folder (named by its title) and an export file name: <date> <HH-MM> <title> - <language>[ (n)].<ext>
  const inDoc = (t) => path.join(ws.dirs.docs, W.titleStem(t), 'Exports');
  const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const named = (f, t, word, ext, n = '') => new RegExp(`^\\d{4}-\\d\\d-\\d\\d \\d\\d-\\d\\d ${esc(W.titleStem(t))} - ${word}${n}\\.${ext}$`).test(path.basename(f));
  check('export AR: Documents\\<t>\\Exports\\<date> <t> - العربية.pdf and .docx', r1.s === 200 && path.dirname(r1.j.pdf) === inDoc(titles.ar) && named(r1.j.pdf, titles.ar, 'العربية', 'pdf') && fs.existsSync(r1.j.pdf) && path.dirname(r1.j.docx) === inDoc(titles.ar) && named(r1.j.docx, titles.ar, 'العربية', 'docx') && fs.existsSync(r1.j.docx), JSON.stringify(r1.j).slice(0, 300));
  check('export EN: …\\Exports\\<date> <t> - English.pdf', r2.s === 200 && path.dirname(r2.j.pdf) === inDoc(titles.en) && named(r2.j.pdf, titles.en, 'English', 'pdf') && fs.existsSync(r2.j.pdf), JSON.stringify(r2.j).slice(0, 300));
  const r3 = await post('/api/export', { service: 'event-permit', locale: 'ar', doc: docs.ar });
  check('a second export of the document never overwrites the first (same minute: " (2)")', r3.j.pdf !== r1.j.pdf && fs.existsSync(r1.j.pdf) && fs.existsSync(r3.j.pdf) && named(r3.j.pdf, titles.ar, 'العربية', 'pdf', '( \\(2\\))?'), r3.j.pdf);
  const served = await fetch(base + r1.j.pdfUrl);
  check('the exported PDF is served under /files/', served.status === 200 && (await served.arrayBuffer()).byteLength > 1000, r1.j.pdfUrl);
  const h = await post('/api/workspace/html', { title: 'طلب: تصريح', locale: 'en', html: '<!doctype html><html><body>x</body></html>' });
  check('Save HTML lands in the document folder as <title>.html', h.s === 200 && h.j.file === path.join(ws.dirs.docs, 'طلب-تصريح', 'طلب-تصريح.html'), JSON.stringify(h.j));
  const bad = await post('/api/workspace/html', { title: 'x', html: 'not html' });
  check('Save HTML refuses a body that is not an HTML document', bad.s === 400);
  const g = await (await fetch(base + '/api/workspace')).json();
  check('GET /api/workspace answers the live folder', g.root === ws.root && g.served === true);
  const hist = (await fetch(base + '/files/.system/history/x.json')).status;
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? (e.name === 'sessions' ? [] : walk(path.join(d, e.name))) : [path.join(d, e.name)]));
  check('.system\\history exists, holds no plain .json but its index, and is never served', fs.existsSync(ws.dirs.history) && walk(ws.dirs.history).every((f) => !f.endsWith('.json') || path.basename(f) === 'index.json') && hist === 404);
  const foreign = await fetch(base + '/api/workspace/parent', { method: 'POST', headers: { origin: 'https://evil.example', 'content-type': 'application/json' }, body: '{"parent":"C:\\\\x"}' });
  check('a foreign origin cannot change the save folder', foreign.status === 403);
  check('nothing was written beside the editor (no exports/ folder)', !fs.existsSync(path.join(tmp, 'exports')));

  // 0.13.0 review line 15: every saved file obeys "<title>-<date>-<AR|ENG>.<ext>" (share and report included), the title's
  // spaces kept (as the pipeline outputs), and no machine file (manifest.json …) outside HISTORY\
  check('outName keeps the spaces between the title words', W.outName('تحديث بيانات منتج غذائي', new Date(2026, 9, 29, 8, 0), 'ar', 'pdf') === 'تحديث بيانات منتج غذائي/Exports/2026-10-29 08-00 تحديث بيانات منتج غذائي - العربية.pdf');
  const saveHtml = `<!doctype html><html lang="ar"><body><script type="application/json" id="bw-data">${JSON.stringify({ services: [{ id: 'doc-53a766e1-aaaa', editions: { ar: { raw: JSON.stringify(docs.ar) } } }] })}</script></body></html>`;
  const sh = await post('/api/share', { name: 'doc-53a766e1-aaaa.editor.html', html: saveHtml });
  check('share writes the document\'s Exports\\<date> <title> - العربية.shared.html (not doc-<id>.editor.html)', sh.s === 200 && path.dirname(sh.j.path) === inDoc(W.docTitle(docs.ar)) && named(sh.j.path, W.docTitle(docs.ar), 'العربية', 'shared\\.html'), JSON.stringify(sh.j));
  const rp = await post('/api/report', { lang: 'ar' });
  const rpe = await post('/api/report', { lang: 'en' });
  check('the performance report goes to Documents\\<report title>\\Exports\\<date> <title> - العربية.pdf / - English.pdf', rp.s === 200 && path.dirname(rp.j.pdf) === inDoc('تقرير الأداء') && named(rp.j.pdf, 'تقرير الأداء', 'العربية', 'pdf', '( \\(\\d+\\))?') && path.dirname(rpe.j.pdf) === inDoc('Performance report') && named(rpe.j.pdf, 'Performance report', 'English', 'pdf', '( \\(\\d+\\))?'), JSON.stringify([rp, rpe]));
  // the documents folder holds only document folders; each holds <title>.html, Exports\, Versions\, Sources\ (no manifest.json, no ids)
  const NAME = /^\d{4}-\d\d-\d\d \d\d-\d\d .+ - (العربية|English|both)( \(\d+\))?\.(pdf|docx|html|print\.html|shared\.html)$/;
  const strays = fs.readdirSync(ws.dirs.docs, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? fs.readdirSync(path.join(ws.dirs.docs, e.name), { withFileTypes: true }).flatMap((x) => (x.isDirectory() ? (x.name === 'Exports' ? fs.readdirSync(path.join(ws.dirs.docs, e.name, 'Exports')).filter((f) => !NAME.test(f)) : []) : (x.name === `${e.name}.html` ? [] : [x.name]))).map((f) => `${e.name}/${f}`) : [e.name]));
  check('the documents folder holds only document folders with <title>.html and Exports\\<date> <title> - <language> files (no manifest.json, no ids)', strays.length === 0, strays.join(', '));

  // H3: «افتح موقع الملف» after a share opened Documents: Explorer got «"/select,<path>"» quoted by Node. Now the command
  // is /select,"<path>" passed verbatim, only for a file inside the documents folder
  process.env.BW_REVEAL_STUB = path.join(tmp, 'reveal.log');
  const op = await post('/api/share/open', { path: sh.j.path });
  const rv = (() => { try { return JSON.parse(fs.readFileSync(process.env.BW_REVEAL_STUB, 'utf8').trim().split('\n').at(-1)); } catch { return null; } })();
  const outside = await post('/api/share/open', { path: path.join(tmp, 'elsewhere.html') });
  delete process.env.BW_REVEAL_STUB;
  check('share «افتح موقع الملف»: Explorer gets /select,"<that file>" verbatim; a file outside the documents folder is refused', op.s === 200 && (process.platform !== 'win32' || (rv?.cmd === 'explorer.exe' && rv.verbatim === true && rv.args[0] === `/select,"${sh.j.path}"`)) && outside.s === 404, JSON.stringify({ op, rv, outside: outside.s }));
  // H3 Save in place: the first Save names the document's own file, every later Save overwrites that file (no -2 copy);
  // a `file` outside HTML\ is never written
  const mkSave = (word) => saveHtml.replace('<body>', `<body><p>${word}</p>`);
  const s1 = await post('/api/library/html', { id: 'doc-5ave0001', title: 'وثيقة الحفظ', locale: 'ar', html: mkSave('one') });
  const s2 = await post('/api/library/html', { id: 'doc-5ave0001', title: 'عنوان تغير', locale: 'ar', html: mkSave('two'), file: s1.j.file });
  const s3 = await post('/api/library/html', { id: 'doc-5ave0001', title: 'وثيقة الحفظ', locale: 'ar', html: mkSave('three'), file: path.join(tmp, 'x.html') });
  const mine = fs.readdirSync(ws.dirs.docs).filter((f) => f.startsWith('وثيقة الحفظ') || f.startsWith('عنوان تغير') );
  check('Save in place: Documents\\<title>\\<title>.html at the first Save, the same file overwritten after by its id (no -2, a renamed title keeps the file)', s1.s === 200 && s1.j.file === path.join(ws.dirs.docs, 'وثيقة الحفظ', 'وثيقة الحفظ.html') && s2.j.file === s1.j.file && s2.j.overwritten === true && fs.readFileSync(s1.j.file, 'utf8').includes('<p>three</p>') && fs.readdirSync(path.join(path.dirname(s1.j.file), 'Versions')).length === 2, JSON.stringify({ s1: s1.j, s2: s2.j }));
  check('Save in place: a `file` outside the documents folder is never written (the document\'s own file is used)', s3.j.file === s1.j.file && !fs.existsSync(path.join(tmp, 'x.html')) && mine.length === 1, JSON.stringify({ s3: s3.j, mine }));
  const notOurs = await post('/api/library/html', { id: 'doc-5ave0001', title: 'x', locale: 'ar', html: '<!doctype html><p>x</p>' });
  check('Save in place refuses anything but a Save-HTML document', notOurs.s === 400);

  // review 2 row 10: the folder dialog never freezes the server, HISTORY is always hidden and never served (any case)
  {
    const slowParent = path.join(tmp, 'slow-parent');
    fs.mkdirSync(slowParent);
    delete process.env.BW_PICK_STUB;
    process.env.BW_PICK_CMD = JSON.stringify([process.execPath, '-e', `setTimeout(() => console.log(${JSON.stringify(slowParent)}), 1500)`]);
    const t0 = Date.now();
    const pick = post('/api/workspace/pick', {});
    await new Promise((r) => setTimeout(r, 200));
    const v = await fetch(base + '/api/version');
    const tv = Date.now() - t0;
    const pr = await pick;
    delete process.env.BW_PICK_CMD;
    check('the folder dialog runs off the event loop: /api/version answers while it is open', v.status === 200 && tv < 1200 && pr.j.ok && pr.j.parent === slowParent, JSON.stringify({ tv, pick: pr.j }));
    check('the Windows dialog script brings its owner window to the front (TopMost + SetForegroundWindow + Activate)', /TopMost = \$true/.test(W.PICK_PS) && /SetForegroundWindow/.test(W.PICK_PS) && /Activate\(\)/.test(W.PICK_PS) && /ShowDialog\(\$f\)/.test(W.PICK_PS));
    W.setParent(parent);
    const pre = path.join(tmp, 'pre-parent', 'Business-Wrap', '.system');
    fs.mkdirSync(pre, { recursive: true }); // a .system made before (no hidden attribute)
    W.ensure(W.setParent(path.join(tmp, 'pre-parent')));
    const attr = process.platform === 'win32' ? (await import('node:child_process')).spawnSync('attrib', [pre], { encoding: 'utf8' }).stdout : 'H';
    W.setParent(parent);
    check('an existing .system without the hidden attribute gets it (attrib +h)', /(^|\s)H(\s|$)/.test(attr.split(pre)[0]), attr.trim());
    fs.writeFileSync(path.join(ws.dirs.history, 'probe.txt'), 'x');
    const cases = await Promise.all(['/files/.system/history/probe.txt', '/files/.SYSTEM/history/probe.txt', '/files/.System/history/probe.txt', '/files/./.system/history/probe.txt', '/files/x/../.system/history/probe.txt'].map(async (u) => (await fetch(base + u)).status));
    check('.system is never served, whatever the case or path', cases.every((c) => c === 404), cases.join(','));
  }
  // review 2 row 2: the share file is named by the title as edited (the ops), an untitled EN edition borrows the AR name
  {
    const bl = (l) => fs.readFileSync(path.join(REPO, 'samples', 'blank', `document.${l}.json`), 'utf8');
    const op = { op: 'setText', path: '/control/coverTitle', value: 'خدمة مراجعة الإصدار', id: 'g1.0' };
    const data = { services: [{ id: 'doc-x', editions: { ar: { raw: bl('ar'), ops: [op] }, en: { raw: bl('en'), ops: [] } } }] };
    const mk = (lang) => `<!doctype html><html lang="${lang}"><body><script type="application/json" id="bw-data">${JSON.stringify(data)}</script></body></html>`;
    const sa = W.sharePath(ws.dirs.html, mk('ar'), 'doc-x.editor.html');
    const se = W.sharePath(ws.dirs.html, mk('en'), 'doc-x.editor.html');
    check('share: named by the edited cover title, AR and EN by the same rule, in one folder (no «خدمة جديدة» / "New service")', path.dirname(sa) === inDoc('خدمة مراجعة الإصدار') && path.dirname(se) === path.dirname(sa) && named(sa, 'خدمة مراجعة الإصدار', 'العربية', 'shared\\.html') && named(se, 'خدمة مراجعة الإصدار', 'English', 'shared\\.html'), `${sa} | ${se}`);
  }
} finally {
  server.close();
  server.closeAllConnections?.();
}

console.log(out.join('\n'));
console.log(failed ? `\nFAILED: ${failed}` : `\nworkspace: ${out.length}/${out.length} PASS`);
try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* temp */ }
process.exit(failed ? 1 : 0);
