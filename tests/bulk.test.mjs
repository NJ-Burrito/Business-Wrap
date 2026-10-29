// H1 bulk edit (0.13.1). Node: engine/bulk.mjs plans every operation by anchor on the sample pair (AR+EN in step,
// not found, ambiguous, already there, editions that differ). Browser (served, free port): the owner puts 3 documents in
// «Project A», opens «تعديل جماعي», ticks the project, adds a field → preview «سيتغير · 3» → Apply: each of the 3 gets
// one commit group in both editions, its own provenance entries and a timeline mark, its library entry saved; the 4th
// document (no project) is untouched. Then a section is deleted from 2 hand-picked documents (one of the picks is locked:
// skipped and listed), and one document's change is undone alone. A reload keeps it all.
//
//   node tests/bulk.test.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { buildEditor } from '../engine/build-editor.mjs';
import { launchOptions, REPO } from '../engine/export.mjs';
import { serve } from '../engine/serve.mjs';
import { BULK } from '../engine/bulk.mjs';
import { applyOps } from '../engine/edits.mjs';

let failed = 0;
const out = [];
const check = (n, ok, d = '') => { out.push(`${ok ? 'PASS' : 'FAIL'}  bulk: ${n}${d && !ok ? '  — ' + String(d).slice(0, 400) : ''}`); if (!ok) failed += 1; };
setTimeout(() => { console.log(`${out.join('\n')}\nFAILED: bulk stalled past 4 min`); process.exit(1); }, 4 * 60e3).unref();

// ── 1. the planner on the sample pair ──
const read = (l) => JSON.parse(fs.readFileSync(path.join(REPO, 'samples', 'event-permit', `document.${l}.json`), 'utf8'));
const eds = { ar: read('ar'), en: read('en') };
const run = (spec) => BULK.plan(eds, spec);
const after = (p) => ({ ar: applyOps(eds.ar, p.ops.ar), en: applyOps(eds.en, p.ops.en) });
{
  const p = run({ op: 'addField', section: '2.1', label: { ar: 'رقم المرجع', en: 'Reference' }, value: { ar: 'ر-1', en: 'R-1' } });
  const d = after(p);
  const rows = (x) => x.chapters[1].sections[0].blocks[1].rows;
  check('addField by section number: one row in each edition, each in its own language', p.status === 'change' && JSON.stringify(rows(d.ar).at(-1)) === '["رقم المرجع","ر-1"]' && JSON.stringify(rows(d.en).at(-1)) === '["Reference","R-1"]', JSON.stringify(p));
  const q = run({ op: 'addField', section: 'Service data', after: 'رمز الخدمة', label: { ar: 'س', en: 'S' }, value: 'v' });
  check('addField by the English heading, after a field named in Arabic: inserted right after it in both', q.status === 'change' && after(q).en.chapters[1].sections[0].blocks[1].rows[2][0] === 'S' && after(q).ar.chapters[1].sections[0].blocks[1].rows[2][0] === 'س', JSON.stringify(q.ops));
  check('addField of a label already there → conflict «exists»', run({ op: 'addField', section: '2.1', label: 'مدة الإنجاز', value: 'x' }).reason === 'exists');
  const del = run({ op: 'deleteField', field: 'مدة الانجاز' }); // hamza form folded
  check('deleteField matched by label (hamza and case folded), old kept for undo', del.status === 'change' && del.ops.ar[0].op === 'delete' && del.ops.en[0].old?.[0] === 'Completion time', JSON.stringify(del.ops));
  const ed = run({ op: 'editField', field: 'Completion time', value: { ar: 'يومان', en: 'Two days' } });
  check('editField: the value cell in each edition (setText with old)', ed.status === 'change' && ed.ops.ar[0].value === 'يومان' && ed.ops.en[0].old === 'Five working days');
  check('editField to the value it already has → «same»', run({ op: 'editField', field: 'Completion time', value: { ar: 'خمسة أيام عمل', en: 'Five working days' } }).status === 'same');
  const as = run({ op: 'addSection', chapter: '2', title: { ar: 'ملاحظات', en: 'Notes' }, text: { ar: 'نص', en: 'Text' } });
  check('addSection at the end of a chapter, both editions', as.status === 'change' && after(as).en.chapters[1].sections.at(-1).title === 'Notes' && after(as).ar.chapters[1].sections.length === 4);
  check('deleteSection by heading', run({ op: 'deleteSection', section: 'الرسوم' }).ops.en[0]?.path === '/chapters/1/sections/1');
  check('editSection heading', run({ op: 'editSection', section: '2.2', title: { ar: 'الرسوم والأجور', en: 'Fees and charges' } }).ops.en[0]?.value === 'Fees and charges');
  const rt = run({ op: 'replaceText', find: { ar: 'البوابة', en: 'portal' }, replace: { ar: 'المنصة', en: 'platform' } });
  check('replaceText: every text holding it, per edition', rt.status === 'change' && rt.ops.ar.length >= 1 && rt.ops.en.every((o) => o.value.includes('platform')));
  check('a missing anchor → «notfound»', run({ op: 'deleteSection', section: '9.9' }).status === 'notfound');
  const twin = JSON.parse(JSON.stringify(eds));
  twin.ar.chapters[1].sections[2].title = twin.ar.chapters[1].sections[1].title; // two sections with one heading
  check('two matches → «conflict» (ambiguous), nothing planned', BULK.plan(twin, { op: 'deleteSection', section: 'الرسوم' }).reason === 'ambiguous');
  const skew = JSON.parse(JSON.stringify(eds));
  skew.en.chapters[1].sections.splice(1, 1); // the EN edition lost a section: the pair differs at that place
  check('the editions differ at the anchor → «conflict» (editions), never one edition alone', BULK.plan(skew, { op: 'deleteSection', section: 'الرسوم' }).reason === 'editions');
}

// ── 2. the editor ──
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-bulk-'));
process.env.BW_LOCAL_DIR = path.join(tmp, '.local'); // the host's profile and state stay in this run's folder (never the install's .local or a caller's)
const file = path.join(tmp, 'bulk.editor.html');
buildEditor({ inputs: [path.join(REPO, 'samples', 'event-permit'), path.join(REPO, 'samples', 'blank')], out: file, set: 'bulk-test', watermarkDir: null });
const ws = { parent: tmp, root: path.join(tmp, 'Business-Wrap'), dirs: Object.fromEntries(['pdf', 'docx', 'html', 'history'].map((k) => [k, path.join(tmp, 'Business-Wrap', k.toUpperCase())])) };
const server = await serve(file, 0, { workspace: ws });
const base = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch(launchOptions());
const errors = [];
try {
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('bw:profile', JSON.stringify({ name: 'Tester' })); } catch { /* storage */ } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  const ready = () => page.waitForFunction(() => window.BW?.ready && window.BW.EXT.bulk && window.BW.EXT.projects);
  const sh = (sel) => page.locator(`#bw-ui-host >> css=.drawer ${sel}`);
  const ds = () => page.evaluate(() => ({ ...document.getElementById('bw-ui-host').shadowRoot.querySelector('.drawer').dataset }));
  await page.goto(base);
  await ready();
  const ids = [];
  for (let i = 0; i < 4; i += 1) {
    const n = ids.length;
    await page.evaluate(() => { window.BW.S.svc = 'event-permit'; window.BW.S.ed = 'ar'; return window.BW.runAction('save'); });
    await page.waitForFunction((n) => (window.BW.libSaved || 0) > n, n, { timeout: 10000 });
    ids.push(await page.evaluate(() => window.BW.S.svc));
  }
  const [d1, d2, d3, d4] = ids;
  const pid = await page.evaluate((ids) => { const P = window.BW.EXT.projects; const p = P.create('Project A'); ids.forEach((i) => P.assign(i, p.id)); return p.id; }, [d1, d2, d3]);
  const stateOf = (id) => page.evaluate(async (id) => {
    const e = await window.BW.EXT.library.get(id);
    const docs = Object.fromEntries(Object.entries(e.editions).map(([ed, x]) => [ed, window.BW.applyOps(JSON.parse(x.raw), x.ops)]));
    return { ops: Object.fromEntries(Object.entries(e.editions).map(([ed, x]) => [ed, x.ops.map((o) => o.id)])), marks: Object.values(e.editions).flatMap((x) => (x.marks || []).map((m) => m.kind)), rows: Object.fromEntries(Object.entries(docs).map(([ed, d]) => [ed, d.chapters[1].sections[0].blocks[1].rows.map((r) => r[0])])), secs: Object.fromEntries(Object.entries(docs).map(([ed, d]) => [ed, d.chapters[1].sections.map((s) => s.title)])) };
  }, id);

  // «تعديل جماعي» from the toolbar action; tick the project → its 3 documents; add a field; preview
  await page.evaluate(() => window.BW.runAction('bulkEdit'));
  await page.waitForFunction(() => window.BW.S.drawer === 'bulk');
  await page.waitForFunction(() => document.getElementById('bw-ui-host').shadowRoot.querySelector('.drawer [data-bk-pj]'), null, { timeout: 5000 });
  await sh(`[data-bk-pj="${pid}"]`).check();
  const picked = (await ds()).bkPicked;
  check('ticking the project picks its 3 documents (the 4th, in no project, stays unticked)', picked === '3', picked);
  await sh('[data-bk-f="op"]').selectOption('addField');
  await sh('[data-bk-f="section"]').fill('2.1');
  await sh('[data-bk-f="labelAr"]').fill('رقم المرجع');
  await sh('[data-bk-f="labelEn"]').fill('Reference');
  await sh('[data-bk-f="valueAr"]').fill('ر-1');
  await sh('[data-bk-f="valueEn"]').fill('R-1');
  const applyOff = await sh('[data-bk="apply"]').isDisabled();
  await sh('[data-bk="preview"]').click();
  await page.waitForFunction(() => document.getElementById('bw-ui-host').shadowRoot.querySelector('.drawer').dataset.bkChange === '3', null, { timeout: 8000 }).catch(() => {});
  const pv = await ds();
  const untouched = await page.evaluate(async (ids) => Promise.all(ids.map(async (i) => Object.values((await window.BW.EXT.library.get(i)).editions).reduce((a, x) => a + x.ops.length, 0))), ids);
  check('Apply stays off until a Preview; the preview says «سيتغير · 3» and changes nothing', applyOff && pv.bkChange === '3' && untouched.every((n) => n === 0), JSON.stringify({ applyOff, pv, untouched }));
  await sh('[data-bk="apply"]').click();
  await page.waitForFunction(() => document.getElementById('bw-ui-host').shadowRoot.querySelector('.drawer')?.dataset.bkDone === '3', null, { timeout: 20000 }).catch(() => {});
  const ap = await ds();
  const s = await Promise.all(ids.map(stateOf));
  const added = s.slice(0, 3).every((x) => x.rows.ar.at(-1) === 'رقم المرجع' && x.rows.en.at(-1) === 'Reference');
  const oneGroup = s.slice(0, 3).every((x) => x.ops.ar.length === 1 && x.ops.en.length === 1 && x.ops.en[0].startsWith(x.ops.ar[0].split('.')[0] + '.m'));
  check('Apply: «عُدّل · 3»; the 3 project documents get the field in AR and EN (one commit group each, saved to the list)', ap.bkDone === '3' && added && oneGroup, JSON.stringify({ ap: ap.bkDone, s: s.slice(0, 3).map((x) => x.ops) }));
  check('the document not picked is never touched', s[3].ops.ar.length === 0 && s[3].ops.en.length === 0 && !s[3].rows.en.includes('Reference'));
  check('each changed document carries a «تعديل جماعي» mark in its timeline', s.slice(0, 3).every((x) => x.marks.includes('bulk')), JSON.stringify(s.map((x) => x.marks)));
  const logs = await page.evaluate((ids) => ids.map((i) => (window.BW.EXT.ledger.log(i)?.entries || []).filter((e) => e.kind === 'op' && e.data?.op?.op === 'insert' && /rows\/-$/.test(e.data.op.path)).map((e) => e.data.ed).sort().join()), ids);
  check('each of the 3 has its own provenance entries for the change (AR and EN), the 4th none', logs.slice(0, 3).every((x) => x === 'ar,en') && logs[3] === '', JSON.stringify(logs));
  const toastTxt = await page.evaluate(() => [...document.getElementById('bw-ui-host').shadowRoot.querySelectorAll('.toast')].map((x) => x.textContent).join('|'));
  check('a summary toast says how many changed', /عُدّل 3|3 changed/.test(toastTxt), toastTxt.slice(0, 200));
  const back = await page.evaluate(() => window.BW.S.svc);
  check('the run returns to the document that was on screen', back === d4, back);

  // lock d3, then delete «الرسوم» from hand-picked d1 + d4 (+ d3, locked)
  await page.evaluate((id) => window.BW.EXT.library.open(id), d3);
  await page.evaluate(() => window.BW.runAction('lkToggle'));
  await page.waitForFunction((id) => window.BW.EXT.lock.of(id)?.locked, d3);
  const spec = { op: 'deleteSection', section: 'الرسوم' };
  const pre = await page.evaluate(([ids, spec]) => window.BW.EXT.bulk.preview(ids, spec), [[d1, d3, d4], spec]);
  const cnt = (rows, st) => rows.filter((r) => r.status === st).length;
  check('preview of a section delete on 3 hand-picked across projects: 2 «سيتغير», 1 «مقفل»', cnt(pre, 'change') === 2 && cnt(pre, 'locked') === 1 && pre.find((r) => r.id === d3).status === 'locked', JSON.stringify(pre));
  const res = await page.evaluate(([ids, spec]) => window.BW.EXT.bulk.apply(ids, spec), [[d1, d3, d4], spec]);
  const s2 = await Promise.all(ids.map(stateOf));
  check('apply: d1 and d4 lose «الرسوم» in both editions; the locked d3 is skipped and listed; d2 (not picked) keeps it',
    cnt(res, 'done') === 2 && res.find((r) => r.id === d3)?.status === 'locked' && !s2[0].secs.ar.includes('الرسوم') && !s2[0].secs.en.includes('Fees') && !s2[3].secs.en.includes('Fees') && s2[2].secs.ar.includes('الرسوم') && s2[1].secs.ar.includes('الرسوم'), JSON.stringify({ res, secs: s2.map((x) => x.secs.en) }));
  const again = await page.evaluate(([ids]) => window.BW.EXT.bulk.preview(ids, { op: 'addField', section: '2.1', label: { ar: 'رقم المرجع', en: 'Reference' }, value: 'x' }), [[d1, d2, d3, d4]]);
  check('preview counts: the same field again → 2 «تعارض» (already there), 1 «مقفل», 1 «سيتغير» (d4)', cnt(again, 'conflict') === 2 && cnt(again, 'locked') === 1 && cnt(again, 'change') === 1, JSON.stringify(again.map((r) => r.status)));

  // undo per document: d1's delete only
  const u = await page.evaluate((id) => window.BW.EXT.bulk.undo(id), d1);
  const s3 = await Promise.all([d1, d4].map(stateOf));
  check('undo of one document (d1) brings its section back in AR and EN; d4 keeps its change', u === true && s3[0].secs.ar.includes('الرسوم') && s3[0].secs.en.includes('Fees') && !s3[1].secs.en.includes('Fees'), JSON.stringify(s3.map((x) => x.secs.en)));

  // reload: the list keeps every change
  await page.reload();
  await ready();
  const s4 = await Promise.all(ids.map(stateOf));
  check('after a reload the documents hold what was applied (field in d1–d3, section gone from d4 only)', s4.slice(0, 3).every((x) => x.rows.en.includes('Reference')) && !s4[3].secs.en.includes('Fees') && s4[0].secs.en.includes('Fees'));
  await ctx.close();
  check('no page errors', !errors.length, errors.join(' | '));
} catch (e) {
  check('run', false, e.stack?.split('\n').slice(0, 4).join(' / '));
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
}
console.log(out.join('\n'));
console.log(`\n${failed ? 'FAILED' : 'ALL PASS'}: ${out.length - failed} pass, ${failed} fail`);
try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* temp */ }
process.exit(failed ? 1 : 0);
