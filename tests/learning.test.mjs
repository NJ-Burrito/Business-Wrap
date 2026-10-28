// Local learning (engine/learning, editor/learning-hook.js): capture of every event kind in the real
// editor, nothing in Save HTML / PDF / DOCX / design pack / webhook, distil (groups, hits, scope,
// conflicts), promote / retire, rules.md AR + EN, a promoted wording rule applied and marked on a NEW
// harvest, forget, export / import, the security rule on a tracked journal, update apply keeps it.
//
//   node tests/learning.test.mjs
import fs from 'node:fs';
import os from 'node:os';
import http from 'node:http';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-learn-'));
process.env.BW_LEARNING_DIR = path.join(TMP, 'learning'); // before any learning module reads it

const { chromium } = await import('playwright-core');
const { REPO, launchOptions } = await import('../engine/export.mjs');
const { buildEditor } = await import('../engine/build-editor.mjs');
const { serve } = await import('../engine/serve.mjs');
const { harvestModel } = await import('../engine/harvest/cli.mjs');
const { swapInstall } = await import('../update/apply.mjs');
const C = await import('../engine/learning/core.mjs');
const L = await import('../engine/learning/store.mjs');

const OUT = path.join(REPO, 'out', 'learning-test');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const results = [];
let failed = 0;
const check = (name, ok, detail = '') => { results.push(`${ok ? 'PASS' : 'FAIL'}  learning: ${name}${detail ? '  — ' + detail : ''}`); if (!ok) failed += 1; };
const ev = (o) => ({ at: new Date(Date.now() + results.length).toISOString(), kind: 'edit', locale: 'en', origin: 'generated', ...o });
let n = 0;
const E = (o) => ev({ id: `t${n++}`, ref: `g${n}.0`, ...o });

/* ── 1. redaction, store, rotation ─────────────────────────────────────── */
{
  const k = (...p) => p.join(''); // samples assembled so this file carries no literal secret
  const r = C.redact({ a: k('pass', 'word: ', 'hunter22'), b: k('id ', '2', '000000001'), c: k('sk', '-', 'abcdefghijklmnopqrstuv'), d: 'plain words stay' });
  check('redact: password, long digit run and token removed, plain text kept', !/hunter22|000000001|abcdefghijklmnop/.test(JSON.stringify(r)) && r.d === 'plain words stay', JSON.stringify(r));
  L.setEnabled(false);
  check('learning off: nothing is written', L.append([E({ service: 's1', path: '/x', before: 'a', after: 'b' })]) === 0 && L.readEvents().length === 0);
  L.setEnabled(true);
  check('append: unknown fields dropped, secrets redacted on the way in', L.append([{ ...E({ service: 's1', path: '/p', before: 'x', after: k('token', '=', 'abcdefghijklmnopqrstuvwxyz0123') }), extra: 'gone' }]) === 1 && !('extra' in L.readEvents()[0]) && !/abcdefghijklmnopqrstuvwxyz/.test(L.readEvents()[0].after));
  fs.writeFileSync(path.join(L.dir(), 'journal.jsonl'), fs.readFileSync(path.join(L.dir(), 'journal.jsonl'), 'utf8') + `${JSON.stringify({ id: 'pad', kind: 'note', at: '2000-01-01', note: 'x'.repeat(L.MAX_JOURNAL) })}\n`);
  L.append([E({ service: 's1', path: '/q', before: 'm', after: 'n' })]);
  check('size cap: the journal rotates, both parts still read', fs.existsSync(path.join(L.dir(), 'journal.1.jsonl')) && fs.statSync(path.join(L.dir(), 'journal.jsonl')).size < 4096 && L.readEvents().length === 3);
  L.forget();
}

/* ── 2. distil: groups, hits, scope, conflicts; promote / retire; rules.md ── */
{
  const W = (svc, from, to, type = 'SRS') => E({ service: svc, serviceType: type, path: '/chapters/0/sections/0/blocks/0/paragraphs/0', field: 'block.prose.paragraphs', op: 'setText', before: `The system ${from} the request.`, after: `The system ${to} the request.` });
  const evs = [
    W('s1', 'shall send', 'sends'), W('s2', 'shall send', 'sends', 'Guide'), W('s3', 'shall send', 'sends'),
    W('s1', 'approves', 'accepts'), W('s1', 'approves', 'accepts'),
    W('s4', 'rejects', 'refuses'), W('s5', 'rejects', 'refuses'), W('s6', 'rejects', 'declines'), W('s7', 'rejects', 'declines'),
    E({ service: 's1', serviceType: 'SRS', path: '/control/classification', field: 'control.classification', op: 'setText', before: 'Internal', after: 'Restricted' }),
    E({ service: 's2', serviceType: 'SRS', path: '/control/classification', field: 'control.classification', op: 'setText', before: 'Internal', after: 'Restricted' }),
    E({ service: 's9', path: '/control/owner', field: 'control.owner', op: 'setText', before: 'A', after: 'Office' }),
    E({ service: 's9', path: '/control/owner', field: 'control.owner', op: 'setText', before: 'B', after: 'Office' }),
    E({ service: 's1', path: '/chapters/3/sections/2', field: 'section', op: 'delete', before: { title: 'Assumptions' }, after: null }),
    E({ service: 's2', path: '/chapters/3/sections/1', field: 'section', op: 'delete', before: { title: 'Assumptions' }, after: null }),
    E({ service: 's1', path: '/design/vars/primary', field: 'design.vars.primary', op: 'replace', before: '#000000', after: '#123456' }),
    E({ service: 's2', path: '/design/vars/primary', field: 'design.vars.primary', op: 'replace', before: '#000000', after: '#123456' }),
    E({ service: 's1', path: '/chapters/2/sections/0/blocks/0/model/nodes/3', field: 'diagram.node', op: 'delete', before: 'Check', after: null, meta: { nodeKind: 'system' } }),
    E({ service: 's2', path: '/chapters/2/sections/0/blocks/0/model/nodes/4', field: 'diagram.node', op: 'delete', before: 'Validate', after: null, meta: { nodeKind: 'system' } }),
  ];
  const undone = W('s8', 'opens', 'starts');
  evs.push(undone, W('s9', 'opens', 'starts'), { id: 'rv1', at: new Date(Date.now() + 9999).toISOString(), kind: 'revert', refs: [undone.ref] });
  const { lessons, conflicts } = C.distil(evs);
  const find = (type, f) => lessons.find((l) => l.type === type && f(l.pattern));
  const send = find('wording', (p) => p.from === 'shall send');
  check('wording: 3 services, 3 hits → promoted automatically, global scope', send?.hits === 3 && send.status === 'promoted' && send.by === 'auto' && send.scope === 'global' && send.evidence.length === 3, JSON.stringify(send));
  const appr = find('wording', (p) => p.from === 'approves');
  check('wording: 2 hits in one service → a candidate kept per service', appr?.hits === 2 && appr.status === 'candidate' && appr.scope === 'service:s1', JSON.stringify(appr));
  const rej = lessons.filter((l) => l.type === 'wording' && l.pattern.from === 'rejects');
  check('CONFLICT: «rejects» → refuses vs declines is listed, side by side, neither promoted', rej.length === 2 && conflicts.some((c) => c.flag === 'CONFLICT' && c.point === '«rejects»' && c.sides.includes('refuses') && c.sides.includes('declines')) && rej.every((l) => l.status === 'candidate' && l.kill.includes('conflict')), JSON.stringify(conflicts));
  const cls = find('field', (p) => p.field === 'control.classification');
  check('field: the same field corrected the same way in 2 services; scope by document type', cls?.hits === 2 && cls.services === 2 && cls.scope === 'type:SRS', JSON.stringify(cls));
  check('field: one service only → no lesson', !find('field', (p) => p.field === 'control.owner'));
  check('delete: a generated section the user always deletes', find('delete', (p) => p.title === 'Assumptions')?.hits === 2);
  check('design: an override applied in 2 services', find('design', (p) => p.path === '/design/vars/primary' && p.value === '#123456')?.hits === 2);
  check('diagram: system steps always removed', find('diagram', (p) => p.nodeKind === 'system')?.hits === 2);
  check('undo removes its evidence (1 live hit → no lesson)', !find('wording', (p) => p.from === 'opens'));
  // a reversal against a promoted lesson: listed, never auto-resolved
  const back = C.distil([...evs, W('s4', 'sends', 'shall send'), W('s5', 'sends', 'shall send')], lessons);
  check('REVERSAL against a promoted rule: listed; the rule stays promoted until the user decides', back.conflicts.some((c) => c.flag === 'REVERSAL') && back.lessons.find((l) => l.id === send.id).status === 'promoted', JSON.stringify(back.conflicts.filter((c) => c.flag === 'REVERSAL')));
  check('deterministic: same journal → same lessons', JSON.stringify(C.distil(evs).lessons) === JSON.stringify(lessons));

  L.append(evs);
  const d = L.distill();
  check('store distill: lessons.json, rules.json, rules.md written', d.promoted === 1 && fs.existsSync(path.join(L.dir(), 'rules.md')) && L.rules()[0].id === send.id, JSON.stringify({ promoted: d.promoted, lessons: d.lessons }));
  L.promote(appr.id);
  L.retire(send.id);
  const d2 = L.distill();
  check('promote by hand / retire: a retired rule is never re-promoted by distil', L.rules().map((r) => r.id).join() === appr.id && L.lessons().find((l) => l.id === send.id).status === 'retired' && d2.retired === 1);
  const md = fs.readFileSync(path.join(L.dir(), 'rules.md'), 'utf8');
  check('rules.md: Arabic and English, one line per rule each, with its evidence', /اكتب «accepts» بدل «approves»/.test(md) && /Write "accepts" instead of "approves"/.test(md) && /يبقى على جهازك فقط/.test(md) && /hits: 2/.test(md), md.slice(0, 160));
  const bundle = path.join(OUT, 'bundle.json');
  const { run } = await import('../engine/learning/cli.mjs');
  run(['export', bundle], () => {});
  const before = L.status();
  run(['forget'], () => {});
  check('forget without --yes does nothing', L.status().events === before.events);
  run(['forget', '--yes'], () => {});
  check('forget --yes wipes everything', !fs.existsSync(L.dir()) && L.status().events === 0 && L.rules().length === 0);
  run(['import', bundle], () => {});
  const after = L.status();
  check('export → import round trip: events, lessons and decisions come back', after.events === before.events && after.lessons === before.lessons && L.lessons().find((l) => l.id === send.id)?.status === 'retired', JSON.stringify({ before, after }));
  L.forget();
}

/* ── 3. a promoted wording rule on a NEW harvest, applied and marked ────── */
const svcs = ['a', 'b', 'c'];
L.append(svcs.map((s) => E({ service: s, path: '/x', field: 'block.table.col1', op: 'setText', before: 'Submit the renewal form', after: 'Submit the renewal application' })));
L.distill();
const rule = L.rules().find((r) => r.type === 'wording');
const H = await harvestModel(path.join(REPO, 'tests', 'fixtures', 'harvest', 'steps.yaml'), { out: path.join(OUT, 'harvest') });
const en = JSON.parse(fs.readFileSync(H.documents[1], 'utf8'));
const hit = (en.learned || []).find((x) => x.rule === rule?.id);
check('engine: the promoted wording rule is applied to a new harvest and listed in doc.learned', rule?.pattern.from === 'form' && rule.pattern.to === 'application' && !!hit && JSON.stringify(en).includes('renewal application') && !JSON.stringify(en.chapters).includes('renewal form') && H.learned.includes(rule.id), JSON.stringify({ rule: rule?.pattern, hit, learned: H.learned }));

/* ── 4. the editor: capture, marks, panel, leaks ───────────────────────── */
const SAMPLE = path.join(REPO, 'samples', 'event-permit');
const ed1 = buildEditor({ inputs: [SAMPLE], out: path.join(OUT, 'sample.editor.html'), watermarkDir: null }).out;
const srv = await serve(ed1, 0, { out: path.join(OUT, 'exports') });
const srv2 = await serve(H.editor, 0, { out: path.join(OUT, 'exports2') });
const base = (s) => `http://127.0.0.1:${s.address().port}/`;
const browser = await chromium.launch(launchOptions());
const errors = [];
const open = async (url) => {
  const ctx = await browser.newContext({ acceptDownloads: true });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url);
  await page.waitForFunction(() => window.BW?.ready && window.BW_LEARNING);
  return { ctx, page };
};
const saveDl = async (page, fn) => { const [dl] = await Promise.all([page.waitForEvent('download'), page.evaluate(fn)]); const f = path.join(OUT, dl.suggestedFilename()); await dl.saveAs(f); return fs.readFileSync(f, 'utf8'); };
try {
  const { ctx, page } = await open(base(srv));
  await page.evaluate(async () => {
    const { BW } = window;
    const d = BW.M[BW.S.svc][BW.S.ed].doc;
    BW.setText('/chapters/0/sections/0/blocks/0/paragraphs/0', 'نص معدل للتعلم');
    BW.commit([{ op: 'replace', path: '/control/classification', value: 'سري', old: d.control.classification }]);
    BW.commit([{ op: 'replace', path: '/design', value: { ...(d.design || {}), vars: { primary: '#123456' } }, old: d.design }]);
    const blk = d.chapters[2].sections[0].blocks[0];
    const model = JSON.parse(JSON.stringify(blk.model));
    model.nodes = model.nodes.filter((x) => x.id !== 'rev');
    model.edges = model.edges.filter((x) => x.from !== 'rev' && x.to !== 'rev');
    BW.commit([{ op: 'replace', path: '/chapters/2/sections/0/blocks/0/model', value: model, old: blk.model }]);
    BW.commit([{ op: 'replace', path: '/overlays', value: [] }, { op: 'insert', path: '/overlays/-', value: { id: 'o1', kind: 'image', x: 10, y: 10, w: 20, src: 'data:image/png;base64,iVBORw0KGgo=' } }]);
    BW.commit([{ op: 'delete', path: '/chapters/1/sections/2/blocks/0/rows/1' }]);
    BW.undo();
    BW.selectEl(document.querySelector('main.bw-doc [data-p="/chapters/0/sections/0/blocks/0/paragraphs/1"]'));
    BW.A.comment();
  });
  await page.locator('.dialog textarea').fill('ملاحظة للتعلم');
  await page.locator('.dialog [data-k="ok"]').click();
  const html = await saveDl(page, () => window.BW.runAction('saveHtml'));
  await saveDl(page, () => window.BW.runAction('exportEdits'));
  await page.evaluate(() => window.BW.runAction('theme'));
  const pack = await saveDl(page, () => document.getElementById('bw-ui-host').shadowRoot.querySelector('.drawer [data-k="texp"]').click());
  await page.evaluate(() => window.BW.runAction('exportPdf'));
  await page.evaluate(() => window.BW_LEARNING.flush());
  const J = L.readEvents();
  const kinds = new Set(J.map((e) => e.kind));
  check('capture: edit, note, export and revert events reach .local/learning/journal.jsonl', ['edit', 'note', 'export', 'revert'].every((k) => kinds.has(k)), [...kinds].join(','));
  const by = (f) => J.find(f);
  check('capture: typed text as one event with before → after and its origin', by((e) => e.op === 'setText' && e.after === 'نص معدل للتعلم' && e.before && e.origin === 'generated' && e.field === 'block.prose.paragraphs' && e.service === 'event-permit'));
  check('capture: a label/control replace', !!by((e) => e.path === '/control/classification' && e.after === 'سري'));
  check('capture: a design change, split into the leaf that changed', !!by((e) => e.path === '/design/vars/primary' && e.after === '#123456' && e.field === 'design.vars.primary'));
  check('capture: a diagram op, the removed node with its kind', !!by((e) => e.field === 'diagram.node' && e.op === 'delete' && e.meta?.nodeKind === 'staff'));
  check('capture: placement (an overlay)', !!by((e) => e.field === 'overlay' && e.op === 'insert'));
  check('capture: undo is a revert naming the op it undid', !!by((e) => e.kind === 'revert' && e.op === 'delete' && e.refs?.length === 1));
  check('capture: the note with its path', !!by((e) => e.kind === 'note' && e.note === 'ملاحظة للتعلم' && e.path?.startsWith('/chapters/0/sections/0/blocks/0') && e.field === 'block.prose'));
  const formats = J.filter((e) => e.kind === 'export').map((e) => e.format);
  check('capture: exports with format and the accepted state', ['html', 'exportEdits', 'pdf+docx'].every((f) => formats.includes(f)) && by((e) => e.format === 'pdf+docx').accepted.length >= 5, formats.join(','));
  const ids = J.map((e) => e.id);
  const leak = (s) => ids.some((id) => s.includes(id)) || /"origin":"(generated|manual|harvested|learned)"/.test(s) || /"kind":"(edit|note|revert)"/.test(s); // the app code names its IndexedDB store; no event data may follow it
  check('nothing leaks into Save HTML (no event, no journal field)', !leak(html) && html.includes('id="bw-data"'));
  check('nothing leaks into the design pack', !leak(pack) && pack.includes('bw-design-pack'));
  const exp = path.join(OUT, 'exports', 'event-permit', 'ar');
  const pdf = path.join(exp, 'event-permit.ar.pdf');
  const docx = path.join(exp, 'event-permit.ar.docx');
  const unzip = (f) => spawnSync('python', ['-c', 'import sys,zipfile;z=zipfile.ZipFile(sys.argv[1]);sys.stdout.write("".join(z.read(n).decode("utf-8","replace") for n in z.namelist() if n.endswith(".xml")))', f], { encoding: 'utf8', env: { ...process.env, PYTHONUTF8: '1' } }).stdout || '';
  const pdfText = fs.existsSync(pdf) ? fs.readFileSync(pdf, 'latin1') : '';
  const docXml = fs.existsSync(docx) ? unzip(docx) : '';
  check('nothing leaks into the PDF or the DOCX (no event id, no journal field, no note)', pdfText.length > 1000 && docXml.length > 1000 && !leak(pdfText) && !leak(docXml) && !docXml.includes('ملاحظة للتعلم'), `pdf=${pdfText.length} docx=${docXml.length}`);
  // the panel: hidden (no toolbar button, no palette entry), a «التعلّم المحلي» section of Settings, privacy notice, counts
  const noBtn = await page.evaluate(() => { const r = document.getElementById('bw-ui-host').shadowRoot; window.BW.runAction('palette'); const inPal = !!r.querySelector('#cmdlist [data-cmd="learning"]'); r.querySelector('.scrim').hidden = true; return !r.querySelector('button[data-a="learning"]') && !inPal; });
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.BW.runAction('settings'));
  await page.locator('[data-lrn-mount] .bw-learning').waitFor();
  const panel = await page.locator('.set-lrn').innerText();
  check('panel: no toolbar button or palette entry; Settings «التعلّم المحلي» shows the privacy notice and the counts', noBtn && panel.includes('التعلّم المحلي') && panel.includes('يبقى على جهازك فقط') && /\d+\s*أحداث/.test(panel), panel.slice(0, 200));
  await page.locator('[data-lrn-mount] [data-lrn="toggle"]').uncheck();
  await page.waitForTimeout(400);
  const offSet = await (await fetch(base(srv) + 'api/learning/status')).json();
  const nOff = L.readEvents().length;
  await page.evaluate(async () => { window.BW.setText('/chapters/0/sections/0/blocks/0/paragraphs/0', 'لا يسجل'); await window.BW_LEARNING.flush(); });
  check('panel: off stops the capture (browser and server)', offSet.enabled === false && L.readEvents().length === nOff);
  await page.locator('[data-lrn-mount] [data-lrn="toggle"]').check();
  await page.waitForTimeout(400);
  await ctx.close();

  // webhook: a payload carrying learning fields reaches the receiver without them
  let got = null;
  const rx = http.createServer((q, s) => { const c = []; q.on('data', (x) => c.push(x)); q.on('end', () => { got = JSON.parse(Buffer.concat(c).toString()); s.end('{}'); }); });
  await new Promise((r) => rx.listen(0, '127.0.0.1', r));
  await fetch(base(srv) + 'api/webhook', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: `http://127.0.0.1:${rx.address().port}/`, payload: { schema: 'bw-webhook', event: 'export', learning: { events: J.slice(0, 2) }, journal: 'x', document: { control: {}, learned: [{ rule: 'Lzzz' }] } } }) });
  rx.close();
  check('webhook payloads exclude learning (no events, no journal, no doc.learned)', got && !('learning' in got) && !('journal' in got) && got.document && !('learned' in got.document), JSON.stringify(got));

  // the learned rule in the new harvest's editor: marked «مطبّق من التعلّم», Alt+click undoes it and teaches the reversal
  L.distill();
  const { ctx: c2, page: p2 } = await open(base(srv2));
  await p2.locator('button[data-a="ed"][data-ed="en"]').first().click();
  await p2.waitForSelector('main.bw-doc[data-locale="en"] .bw-learned');
  const mk = await p2.evaluate(() => { const el = document.querySelector('main.bw-doc[data-locale="en"] .bw-learned'); return { title: el.title, p: el.dataset.p, text: el.textContent }; });
  await p2.locator(`main.bw-doc[data-locale="en"] [data-p="${mk.p}"]`).click({ modifiers: ['Alt'] });
  await p2.evaluate(() => window.BW_LEARNING.flush());
  const now = await p2.evaluate((p) => { const B = window.BW; return B.M[B.S.svc].en.doc && JSON.stringify(B.M[B.S.svc].en.doc).includes('renewal form'); }, mk.p);
  const undoEv = L.readEvents().find((e) => e.origin === 'learned' && e.rule === rule?.id);
  check('editor: a learned change is marked «مطبّق من التعلّم» on hover; Alt+click undoes it, recorded with its rule', /Applied from learning|مطبّق من التعلّم/.test(mk.title) && now && !!undoEv, JSON.stringify({ mk, undo: !!undoEv }));
  const after = L.distill();
  check('the undone rule is a REVERSAL for the user, still promoted (never auto-resolved)', after.conflicts.some((c) => c.flag === 'REVERSAL' && (c.a === rule.id || c.b === rule.id)) && L.rules().some((r) => r.id === rule.id), JSON.stringify(after.conflicts));
  await c2.close();

  // file:// with no server: buffered in IndexedDB, never lost
  const { ctx: c3, page: p3 } = await open(pathToFileURL(ed1).href);
  const buf = await p3.evaluate(async () => { window.BW.setText('/chapters/0/sections/0/blocks/0/paragraphs/0', 'من ملف محلي'); await window.BW_LEARNING.flush(); return (await window.BW_LEARNING.buffered()).length; });
  check('file://: events buffered in IndexedDB (export/import moves them to a server)', buf >= 1, String(buf));
  await c3.close();
  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
} catch (e) {
  check('editor run', false, e.stack?.split('\n').slice(0, 4).join(' / '));
} finally {
  await browser.close();
  srv.close();
  srv2.close();
}

/* ── 5. the security rule catches a tracked journal ────────────────────── */
{
  const g = path.join(TMP, 'repo');
  fs.mkdirSync(path.join(g, 'security'), { recursive: true });
  for (const f of ['check.py', 'gitleaks.toml', 'denylist.sha256']) fs.copyFileSync(path.join(REPO, 'security', f), path.join(g, 'security', f));
  fs.mkdirSync(path.join(g, '.local', 'learning'), { recursive: true });
  fs.writeFileSync(path.join(g, '.local', 'learning', 'journal.jsonl'), '{"kind":"note"}\n');
  fs.writeFileSync(path.join(g, '.gitignore'), '.local/\n');
  const git = (...a) => spawnSync('git', ['-C', g, ...a], { encoding: 'utf8' });
  git('init', '-q');
  const clean = spawnSync('python', [path.join(g, 'security', 'check.py'), '--tree-only'], { encoding: 'utf8', env: { ...process.env, PYTHONUTF8: '1', PATH: process.env.PATH } });
  git('add', '-f', '.local/learning/journal.jsonl');
  const r = spawnSync('python', [path.join(g, 'security', 'check.py'), '--tree-only'], { encoding: 'utf8', env: { ...process.env, PYTHONUTF8: '1' } });
  check('security: a tracked .local/learning journal fails the gate (bw-learning-journal); untracked passes', r.status === 1 && /bw-learning-journal\s+\.local\/learning\/journal\.jsonl/.test(r.stdout) && !/bw-learning-journal/.test(clean.stdout), (r.stdout + r.stderr).split('\n').filter((x) => /learning|finding/.test(x)).join(' / '));
}

/* ── 6. update --apply keeps .local/learning ───────────────────────────── */
{
  const inst = path.join(TMP, 'install');
  const fresh = path.join(TMP, 'fresh');
  fs.mkdirSync(path.join(inst, '.local', 'learning'), { recursive: true });
  fs.mkdirSync(path.join(fresh, 'engine'), { recursive: true });
  fs.writeFileSync(path.join(inst, '.local', 'learning', 'journal.jsonl'), '{"id":"keep"}\n');
  fs.writeFileSync(path.join(inst, '.local', 'learning', 'rules.md'), '# rules\n');
  fs.mkdirSync(path.join(inst, 'engine'), { recursive: true });
  fs.writeFileSync(path.join(inst, 'engine', 'old.mjs'), 'old');
  fs.writeFileSync(path.join(fresh, 'engine', 'new.mjs'), 'new');
  fs.mkdirSync(path.join(fresh, '.local', 'learning'), { recursive: true });
  fs.writeFileSync(path.join(fresh, '.local', 'learning', 'journal.jsonl'), '{"id":"from-release"}\n');
  const r = await swapInstall(inst, fresh, 'test');
  check('update apply: .local/learning untouched, product files swapped', r.ok && fs.readFileSync(path.join(inst, '.local', 'learning', 'journal.jsonl'), 'utf8').includes('keep') && fs.existsSync(path.join(inst, '.local', 'learning', 'rules.md')) && !fs.existsSync(path.join(inst, 'engine', 'old.mjs')) && fs.existsSync(path.join(inst, 'engine', 'new.mjs')), JSON.stringify(r));
  fs.rmSync(`${inst}.backup-test`, { recursive: true, force: true });
}

fs.rmSync(TMP, { recursive: true, force: true });
console.log(results.join('\n'));
console.log(`\n${failed ? 'FAILED' : 'ALL PASS'}: ${results.length - failed}/${results.length}`);
process.exit(failed ? 1 : 0);
