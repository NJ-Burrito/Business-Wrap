// 0.15.2 lane spell (owner notes 7, 8, 9, 15): ONE spelling switch for both dictionaries, a side panel over the pages when a misspelt word is clicked,
// and a Spelling ribbon tab. Real browser (Edge when installed) against the local server, through the real callers (runAction('spell'), a mouse click on the word,
// a click on the ribbon tool).
//   - one switch turns on Arabic AND English (S.spell.ar/en follow it); Settings and the list drawer carry ONE switch and no per-dictionary switch
//   - the old per-edition keys migrate: an old «ar off, en on» is ON (never Arabic disabled forever), both off stays off, the new key wins
//   - a click on a misspelt word opens the side panel: the word, 1..6 suggestions, Ignore / Ignore all / Add to dictionary / Close; the pages' left edge moves by 0 px
//   - a suggestion is ONE undo step; Ignore all removes every mark of the word (kept per user); Add to dictionary survives a reload; Esc closes and the caret is back in the text
//   - the Spelling tab: 9 tools each with an icon and a name, next/previous, fix, fix all (one undo step), ignore, ignore all, add, count, language, on/off
//
//   node tests/spell-0152.test.mjs
import './_isolate.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { launch, browserName, tmpDir, shRoot, sleep, until, REPO } from './spell-helper.mjs';
import { buildEditor } from '../engine/build-editor.mjs';
import { serve } from '../engine/serve.mjs';

const results = [];
let failed = 0;
const check = (name, ok, detail = '') => { results.push(`${ok ? 'PASS' : 'FAIL'}  spell-0152: ${name}${detail && !ok ? '  — ' + detail : ''}`); if (!ok) failed += 1; };
const tmp = tmpDir('bw-spell52-');
process.env.BW_LOCAL_DIR = path.join(tmp, 'local');

const f = path.join(tmp, 'sample.editor.html');
buildEditor({ inputs: [path.join(REPO, 'samples', 'event-permit')], out: f, set: 'sample' });
const browser = await launch();
const opened = [];
/** A fresh browser context (its own localStorage). `store` is written once, before the page boots (a reload keeps the stored state). */
async function open({ store = {}, width = 1366 } = {}) {
  const server = await serve(f, 0, { workspace: null });
  const ctx = await browser.newContext({ viewport: { width, height: 860 } });
  await ctx.addInitScript((st) => { try { if (!sessionStorage.getItem('bw-52-init')) { sessionStorage.setItem('bw-52-init', '1'); localStorage.setItem('bw:ui', 'en'); for (const [k, v] of Object.entries(st)) localStorage.setItem(k, v); } } catch { /* no storage */ } }, store);
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction(() => window.BW?.ready);
  await sleep(700);
  const h = { server, ctx, page, close: async () => { await ctx.close(); server.close(); server.closeAllConnections?.(); } };
  opened.push(h);
  return h;
}
const sh = (page, fn, arg) => shRoot(page, fn, arg);
const issues = (page) => page.evaluate(() => BW.EXT.spell.issues());
const waitIssues = (page, pred, ms = 20000) => until(async () => pred(await issues(page)), ms, 150);
const setLeaves = (page, ed, texts) => page.evaluate(async ([e, tx]) => {
  const ps = [...document.querySelectorAll(`main.bw-doc[data-locale="${e}"] [data-p]`)].filter((el) => !el.querySelector('[data-p]') && !document.querySelector(`.toc [data-p="${CSS.escape(el.dataset.p)}"]`) && /^\/chapters\//.test(el.dataset.p) && el.textContent.trim().length > 3).slice(0, tx.length).map((el) => el.dataset.p);
  ps.forEach((p, i) => BW.setText(p, tx[i], e));
  BW.render();
  return ps;
}, [ed, texts]);
const textAt = (page, ed, p) => page.evaluate(([e, q]) => document.querySelector(`main.bw-doc[data-locale="${e}"] [data-p="${CSS.escape(q)}"]`)?.textContent ?? null, [ed, p]);
/** The centre of the first occurrence of `word` inside the field at `p`, scrolled into view. */
const wordPoint = (page, ed, p, word, nth = 0) => page.evaluate(([e, q, w, n]) => {
  const el = document.querySelector(`main.bw-doc[data-locale="${e}"] [data-p="${CSS.escape(q)}"]`);
  el.scrollIntoView({ block: 'center' });
  const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let seen = 0;
  for (let node = tw.nextNode(); node; node = tw.nextNode()) {
    let i = node.data.indexOf(w);
    while (i >= 0) {
      if (seen === n) { const r = document.createRange(); r.setStart(node, i); r.setEnd(node, i + w.length); const b = r.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; }
      seen += 1;
      i = node.data.indexOf(w, i + 1);
    }
  }
  return null;
}, [ed, p, word, nth]);
const clickWord = async (page, ed, p, word, nth = 0) => { const pt = await wordPoint(page, ed, p, word, nth); await sleep(150); const pt2 = await wordPoint(page, ed, p, word, nth); await page.mouse.click(pt2.x, pt2.y); return pt2; };
const side = (page) => sh(page, (r) => { const d = r.querySelector('dialog.sp-side'); if (!d || !d.open) return null; const q = d.getBoundingClientRect(); return { word: d.querySelector('.sp-bigw')?.textContent, sug: [...d.querySelectorAll('.sp-s')].map((b) => b.textContent), btn: [...d.querySelectorAll('[data-k]')].map((b) => b.dataset.k), focus: r.activeElement === null ? 'doc' : r.activeElement.dataset?.k || r.activeElement.className, l: q.left, w: q.width, fixed: getComputedStyle(d).position }; });
const pageLeft = (page) => page.evaluate(() => { const m = document.querySelector('#bw-pair main.bw-doc'); return { l: m.getBoundingClientRect().left, w: m.getBoundingClientRect().width, sx: scrollX, z: getComputedStyle(document.documentElement).getPropertyValue('--bw-zoom') || document.documentElement.style.zoom || '' }; });
const closeDr = async (page) => { await shRoot(page, (r) => r.querySelector('.drawer:not([hidden]) [data-k="close"]')?.click()); await until(() => shRoot(page, (r) => !r.querySelector('.drawer:not([hidden]):not(.closing)')), 3000); };
const undoOnce = (page) => page.evaluate(() => BW.runAction('undo'));

try {
  // ── 1. ONE switch, both dictionaries ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
  const A = await open({ store: { 'bw:xpl-panel': '0' } }); // the explanation panel is shut: on this branch it still pads the page, and the spelling panel closes it anyway
  const pa = A.page;
  check(`browser is ${browserName()}; both editions on the page`, true);
  await pa.evaluate(() => { if (!BW.S.side) return BW.runAction('side'); });
  await sleep(300);
  const pAr = (await setLeaves(pa, 'ar', ['هذا مستنذ سليم نص']))[0];
  const pEn = (await setLeaves(pa, 'en', ['The recieve of a good document']))[0];
  check('checking starts off (nothing stored)', await pa.evaluate(() => !BW.S.spell.ar && !BW.S.spell.en && BW.EXT.spell.issues().length === 0));
  await pa.evaluate(() => BW.runAction('spell'));
  check('ONE command turns on both editions (S.spell.ar and S.spell.en) and stores one key bw:spell:on', await pa.evaluate(() => BW.S.spell.ar === true && BW.S.spell.en === true && localStorage.getItem('bw:spell:on') === '1'));
  check('the Arabic AND the English misspelling are both flagged with no second switch touched', await waitIssues(pa, (l) => l.some((i) => i.word === 'مستنذ' && i.ed === 'ar') && l.some((i) => i.word === 'recieve' && i.ed === 'en')), JSON.stringify(await issues(pa)));
  await pa.evaluate(() => BW.openDrawer('settings'));
  await until(() => sh(pa, (r) => !!r.querySelector('.set-x-spell .sp-sw')), 5000);
  const card = await sh(pa, (r) => { const c = r.querySelector('.set-x-spell'); return { sw: c.querySelectorAll('.sp-sw').length, perDict: c.querySelectorAll('.sp-sw[data-v], [data-k="spEd"]').length, dicts: c.querySelectorAll('.sp-dict').length, on: c.querySelector('.sp-sw').getAttribute('aria-checked') }; });
  check('Settings: ONE spelling switch (on), no per-dictionary switch, both dictionaries listed under it', card.sw === 1 && card.perDict === 0 && card.dicts === 2 && card.on === 'true', JSON.stringify(card));
  await sh(pa, (r) => r.querySelector('.set-x-spell .sp-sw').click());
  check('the Settings switch turns both dictionaries off (marks gone, both flags off, Settings stays open)', await until(async () => (await issues(pa)).length === 0 && (await pa.evaluate(() => !BW.S.spell.ar && !BW.S.spell.en && localStorage.getItem('bw:spell:ar') === '0' && localStorage.getItem('bw:spell:en') === '0' && BW.S.drawer === 'settings')), 3000));
  await sh(pa, (r) => r.querySelector('.set-x-spell .sp-sw').click());
  check('…and on again: both marks come back', await waitIssues(pa, (l) => l.some((i) => i.ed === 'ar') && l.some((i) => i.ed === 'en'), 15000));
  await pa.evaluate(() => BW.EXT.spell.open());
  const dr = await sh(pa, (r) => ({ sw: r.querySelectorAll('.drawer .sp .sp-sw').length, perDict: r.querySelectorAll('.drawer .sp [data-k="spEd"]').length }));
  check('the Spelling list drawer carries the one switch too', dr.sw === 1 && dr.perDict === 0, JSON.stringify(dr));
  check('no page errors (switch)', A.page.errors.length === 0, A.page.errors.join(' | '));

  // ── 2. migration of the old per-edition keys ─────────────────────────────────────────────────────────────────────────────────────────────────────
  for (const [name, store, want] of [
    ['old «Arabic off, English on» becomes ON (Arabic is not off for good)', { 'bw:spell:ar': '0', 'bw:spell:en': '1' }, true],
    ['old «Arabic on, English off» becomes ON', { 'bw:spell:ar': '1', 'bw:spell:en': '0' }, true],
    ['old «both off» stays OFF', { 'bw:spell:ar': '0', 'bw:spell:en': '0' }, false],
    ['the new key wins over the old ones', { 'bw:spell:on': '0', 'bw:spell:ar': '1', 'bw:spell:en': '1' }, false],
  ]) {
    const M = await open({ store });
    const got = await M.page.evaluate(() => ({ ar: BW.S.spell.ar, en: BW.S.spell.en, on: localStorage.getItem('bw:spell:on'), a: localStorage.getItem('bw:spell:ar'), e: localStorage.getItem('bw:spell:en') }));
    check(`migration: ${name}`, got.ar === want && got.en === want && got.on === (want ? '1' : '0') && got.a === got.on && got.e === got.on, JSON.stringify(got));
    await M.close();
  }

  // ── 3. a click on a misspelt word opens the side panel, over the pages ───────────────────────────────────────────────────────────────────────────
  await pa.evaluate(() => BW.EXT.spell.closeSide?.());
  await closeDr(pa);
  await sleep(500);
  await setLeaves(pa, 'en', ['The recieve of a good document and a definately seperate recieve']);
  check('the new text is marked: «definately», «seperate» and two «recieve»', await waitIssues(pa, (l) => ['definately', 'seperate'].every((w) => l.some((i) => i.ed === 'en' && i.word === w)) && l.filter((i) => i.ed === 'en' && i.word === 'recieve').length === 2, 20000), JSON.stringify(await issues(pa)));
  await clickWord(pa, 'en', pEn, 'good'); // a click in the field first
  // the baseline is taken once the page has stopped moving (a drawer that just closed gives the page back its room over a few frames)
  let before = await pageLeft(pa);
  for (let k = 0; k < 20; k += 1) { await sleep(300); const n = await pageLeft(pa); const same = n.l === before.l; before = n; if (same) break; }
  await clickWord(pa, 'en', pEn, 'definately');
  check('clicking the misspelt word opens the side panel (a fixed dialog)', await until(async () => !!(await side(pa)), 3000));
  await until(async () => (await side(pa))?.sug.length > 0, 8000); // the suggestions arrive a moment after the panel
  await sleep(200);
  const sp1 = await side(pa);
  check('the panel names the word, shows 1 to 6 suggestions with the right one first, and Ignore, Ignore all, Add, Close', sp1 && /definately/.test(sp1.word) && sp1.sug.length >= 1 && sp1.sug.length <= 6 && sp1.sug[0] === 'definitely' && ['spIgnore', 'spIgnoreAll', 'spAdd', 'spSideClose'].every((k) => sp1.btn.includes(k)), JSON.stringify(sp1));
  check('the panel is position: fixed and its first suggestion has the focus (keyboard reachable)', sp1.fixed === 'fixed' && (await sh(pa, (r) => r.activeElement?.classList.contains('sp-s'))), JSON.stringify(sp1));
  const after = await pageLeft(pa);
  check('note 15: opening the panel moves the pages by 0 px (left edge, width, scroll, zoom all equal)', before.l === after.l && before.w === after.w && before.sx === after.sx && before.z === after.z, JSON.stringify({ before, after }));
  await pa.keyboard.press('Escape');
  check('Esc closes the panel and the caret is back in the text', await until(async () => !(await side(pa)), 2000) && (await pa.evaluate(() => !!document.activeElement?.closest?.('[data-p]'))));
  const closed = await pageLeft(pa);
  check('closing the panel moves the pages by 0 px too', before.l === closed.l && before.w === closed.w, JSON.stringify({ before, closed }));

  // a suggestion = a fix, one undo step
  await clickWord(pa, 'en', pEn, 'definately');
  await until(async () => !!(await side(pa)), 3000);
  await until(async () => (await side(pa))?.sug.length > 0, 8000);
  const opsBefore = await pa.evaluate(() => BW.M[BW.S.svc].en.ops.length);
  await sh(pa, (r) => r.querySelector('dialog.sp-side .sp-s').click());
  check('a click on a suggestion replaces the word and closes the panel', await until(async () => /definitely/.test((await textAt(pa, 'en', pEn)) || '') && !/definately/.test((await textAt(pa, 'en', pEn)) || '') && !(await side(pa)), 4000), await textAt(pa, 'en', pEn));
  await sleep(300);
  await undoOnce(pa);
  check('one undo brings the old word back (the fix was ONE undo step)', await until(async () => /definately/.test((await textAt(pa, 'en', pEn)) || ''), 3000), await textAt(pa, 'en', pEn));
  check('…and that undo took exactly the fix (the other words are unchanged)', /seperate/.test((await textAt(pa, 'en', pEn)) || '') && (await pa.evaluate(() => BW.M[BW.S.svc].en.ops.length)) === opsBefore, `${opsBefore} -> ${await pa.evaluate(() => BW.M[BW.S.svc].en.ops.length)}`);

  // Ignore all: every mark of the word goes, kept per user
  await sleep(1200); // the undo re-rendered the page: the marks are redrawn on the new nodes a moment later
  await waitIssues(pa, (l) => l.filter((i) => i.word === 'recieve').length === 2, 15000);
  await clickWord(pa, 'en', pEn, 'recieve', 1);
  await until(async () => !!(await side(pa)), 3000);
  await sh(pa, (r) => r.querySelector('dialog.sp-side [data-k="spIgnoreAll"]').click());
  check('Ignore all removes every mark of the word (both «recieve»), the others stay, and the panel closes', await until(async () => { const l = await issues(pa); return l.every((i) => i.word !== 'recieve') && l.some((i) => i.word === 'seperate') && !(await side(pa)); }, 3000), JSON.stringify(await issues(pa)));
  check('the ignore-all list is kept per user (bw:spell:ign)', await pa.evaluate(() => JSON.parse(localStorage.getItem('bw:spell:ign') || '[]').includes('recieve')));
  // Ignore (this occurrence only)
  await clickWord(pa, 'en', pEn, 'seperate');
  await until(async () => !!(await side(pa)), 3000);
  await sh(pa, (r) => r.querySelector('dialog.sp-side [data-k="spIgnore"]').click());
  check('Ignore removes only that occurrence', await until(async () => (await issues(pa)).every((i) => i.word !== 'seperate'), 3000));

  // Add to dictionary survives a reload
  await setLeaves(pa, 'en', ['The zzyxq word and zzyxq again']);
  await waitIssues(pa, (l) => l.some((i) => i.word === 'zzyxq'), 15000);
  await clickWord(pa, 'en', pEn, 'zzyxq');
  await until(async () => !!(await side(pa)), 3000);
  await sh(pa, (r) => r.querySelector('dialog.sp-side [data-k="spAdd"]').click());
  check('Add to dictionary stops flagging the word and stores it (bw:spell:user)', await until(async () => (await issues(pa)).every((i) => i.word !== 'zzyxq') && (await pa.evaluate(() => JSON.parse(localStorage.getItem('bw:spell:user') || '[]').includes('zzyxq'))), 4000));
  await pa.reload();
  await pa.waitForFunction(() => window.BW?.ready);
  await sleep(700);
  check('after a reload the switch is still on and the personal dictionary and ignore list are still there', await pa.evaluate(() => BW.S.spell.ar && BW.S.spell.en && JSON.parse(localStorage.getItem('bw:spell:user') || '[]').includes('zzyxq') && JSON.parse(localStorage.getItem('bw:spell:ign') || '[]').includes('recieve')));
  await pa.evaluate(() => { if (!BW.S.side) return BW.runAction('side'); });
  await sleep(300);
  const pEn2 = (await setLeaves(pa, 'en', ['The zzyxq word, the recieve word and a wronng word']))[0];
  check('after the reload «zzyxq» (added) and «recieve» (ignored for all) stay unflagged, «wronng» is flagged', await waitIssues(pa, (l) => l.some((i) => i.word === 'wronng') && l.every((i) => i.word !== 'zzyxq' && i.word !== 'recieve'), 20000), JSON.stringify(await issues(pa)));
  check('no page errors (panel)', A.page.errors.length === 0, A.page.errors.join(' | '));

  // ── 4. the Spelling ribbon tab ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  const tab = await sh(pa, (r) => { const t = r.querySelector('#rb-tab-spelling'); return t ? { svg: !!t.querySelector('svg'), name: t.getAttribute('aria-label'), tc: t.getAttribute('style') } : null; });
  check('the ribbon has a Spelling tab with its own icon, name and colour token', tab && tab.svg && /Spelling/.test(tab.name) && /--bw-sec-spell/.test(tab.tc), JSON.stringify(tab));
  await sh(pa, (r) => r.querySelector('#rb-tab-spelling').click());
  await sleep(400);
  const tools = await sh(pa, (r) => [...r.querySelectorAll('.ribbon .rb-panel [data-a]')].map((b) => ({ a: b.dataset.a, svg: !!b.querySelector('svg'), word: b.querySelector('.w')?.textContent.trim() || '' })));
  const want = ['spell', 'spellCount', 'spellLang', 'spellPrev', 'spellNext', 'spellFix', 'spellFixAll', 'spellIgnore', 'spellIgnoreAll', 'spellAdd'];
  check('the tab holds the 10 tools (on/off, count, language, previous, next, fix, fix all, ignore, ignore all, add), each with an icon and a name under it', want.every((a) => tools.some((x) => x.a === a && x.svg && x.word)) && tools.length === 10, JSON.stringify(tools));
  const unclipped = await sh(pa, (r) => [...r.querySelectorAll('.ribbon .rb-panel [data-a] .w')].every((w) => w.scrollWidth <= w.clientWidth + 1 && w.getBoundingClientRect().width > 0));
  check('every tool name is whole (not clipped)', unclipped);
  const pressed = await sh(pa, (r) => r.querySelector('.ribbon [data-a="spell"]').getAttribute('aria-pressed'));
  check('the on/off tool shows the state (pressed while checking is on)', pressed === 'true', String(pressed));
  const badge = await sh(pa, (r) => r.querySelector('.ribbon [data-a="spellCount"] .sp-badge')?.textContent);
  const edNow = await pa.evaluate(() => BW.S.ed);
  const nNow = (await issues(pa)).filter((i) => i.ed === edNow).length;
  check('the count badge equals the open edition issue count', Number(badge) === nNow, `${badge} vs ${nNow}`);
  await shRoot(pa, (r) => r.querySelector('[data-a="ed"][data-ed="en"]')?.click());
  await sleep(400);
  const tool = (a) => pa.locator(`#bw-ui-host >> css=.ribbon .rb-panel [data-a="${a}"]`);
  // next / previous
  await setLeaves(pa, 'en', ['A wronng and a occured and a wronng again', 'Another wronng line']);
  await waitIssues(pa, (l) => l.filter((i) => i.word === 'wronng').length >= 3, 20000);
  const selWord = () => pa.evaluate(() => getSelection().toString());
  await tool('spellNext').click();
  const w1 = await until(async () => /wronng|occured/.test(await selWord()), 2000) && await selWord();
  await tool('spellNext').click();
  const w2 = await selWord();
  await tool('spellPrev').click();
  const w3 = await selWord();
  check('Next selects an error, Next again selects another, Previous goes back', !!w1 && !!w2 && w3 === w1, `${w1} | ${w2} | ${w3}`);
  // fix = first suggestion of the selected error
  const pEn3 = await pa.evaluate(() => [...document.querySelectorAll('main.bw-doc[data-locale="en"] [data-p]')].find((el) => /wronng/.test(el.textContent) && !el.querySelector('[data-p]'))?.dataset.p);
  await pa.evaluate(() => BW.EXT.spell.next());
  const cnt0 = (await issues(pa)).length;
  await tool('spellIgnore').click();
  check('Ignore (the selected error) removes that one mark', await until(async () => (await issues(pa)).length === cnt0 - 1, 3000), `${cnt0} -> ${(await issues(pa)).length}`);
  await setLeaves(pa, 'en', ['A wronng and a accomodate and a wronng again', 'Another wronng line']);
  await waitIssues(pa, (l) => l.filter((i) => i.word === 'wronng').length >= 3, 20000);
  // fix all: the same word everywhere, ONE undo step
  const pathsNow = await pa.evaluate(() => [...document.querySelectorAll('main.bw-doc[data-locale="en"] [data-p]')].filter((el) => /wronng/.test(el.textContent) && !el.querySelector('[data-p]')).map((el) => el.dataset.p));
  await pa.evaluate(() => localStorage.setItem('bw:xpl-panel', '1')); // the user prefers the explanation panel open
  const pt = await wordPoint(pa, 'en', pathsNow[0], 'wronng');
  const opsN0 = await pa.evaluate(() => BW.M[BW.S.svc].en.ops.length);
  await pa.mouse.click(pt.x, pt.y);
  await until(async () => !!(await side(pa)), 3000);
  check('opening the spelling panel does not change the stored explanation-panel preference (bw:xpl-panel stays 1)', (await pa.evaluate(() => localStorage.getItem('bw:xpl-panel'))) === '1');
  await pa.keyboard.press('Escape'); // the caret is on the word; the tool acts on it
  await tool('spellFixAll').click();
  check('Fix all replaces the word in every field of the edition', await until(async () => { const ts = await Promise.all(pathsNow.map((p) => textAt(pa, 'en', p))); return ts.every((x) => !/wronng/.test(x) && /wrong/.test(x)); }, 5000), JSON.stringify(await Promise.all(pathsNow.map((p) => textAt(pa, 'en', p)))));
  await sleep(300);
  const grp = await pa.evaluate((n) => BW.M[BW.S.svc].en.ops.slice(n).map((o) => String(o.id)), opsN0);
  check('Fix all made its ops as ONE real group: one group id, distinct suffixes, no relabel', grp.length >= 2 && new Set(grp.map((i) => i.split('.')[0])).size === 1 && new Set(grp).size === grp.length, JSON.stringify(grp));
  await undoOnce(pa);
  check('ONE undo brings every «wronng» back (fix all is one undo step)', await until(async () => { const ts = await Promise.all(pathsNow.map((p) => textAt(pa, 'en', p))); return ts.every((x) => /wronng/.test(x)); }, 3000), JSON.stringify(await Promise.all(pathsNow.map((p) => textAt(pa, 'en', p)))));
  // fix (first suggestion) on the caret word
  await sleep(1200); // the undo re-rendered the page: the marks are redrawn on the new nodes a moment later
  await waitIssues(pa, (l) => l.some((i) => i.word === 'accomodate'), 15000);
  const ptS = await wordPoint(pa, 'en', pathsNow[0], 'accomodate');
  await pa.mouse.click(ptS.x, ptS.y);
  await until(async () => !!(await side(pa)), 3000);
  await pa.keyboard.press('Escape');
  await tool('spellFix').click();
  check('Fix applies the first suggestion to the word under the caret', await until(async () => /accommodate/.test((await textAt(pa, 'en', pathsNow[0])) || '') && !/accomodate/.test((await textAt(pa, 'en', pathsNow[0])) || ''), 4000), await textAt(pa, 'en', pathsNow[0]));
  // ignore all / add via the tools
  await setLeaves(pa, 'en', ['A qwxzy and a qwxzy and a plkjh']);
  await waitIssues(pa, (l) => l.filter((i) => i.word === 'qwxzy').length === 2 && l.some((i) => i.word === 'plkjh'), 20000);
  const pQ = (await pa.evaluate(() => [...document.querySelectorAll('main.bw-doc[data-locale="en"] [data-p]')].find((el) => /qwxzy/.test(el.textContent) && !el.querySelector('[data-p]'))?.dataset.p));
  const ptQ = await wordPoint(pa, 'en', pQ, 'qwxzy');
  await pa.mouse.click(ptQ.x, ptQ.y); await until(async () => !!(await side(pa)), 3000); await pa.keyboard.press('Escape');
  await tool('spellIgnoreAll').click();
  check('Ignore all (tool) clears every mark of the word', await until(async () => (await issues(pa)).every((i) => i.word !== 'qwxzy') && (await issues(pa)).some((i) => i.word === 'plkjh'), 3000));
  const ptP = await wordPoint(pa, 'en', pQ, 'plkjh');
  await pa.mouse.click(ptP.x, ptP.y); await until(async () => !!(await side(pa)), 3000); await pa.keyboard.press('Escape');
  await tool('spellAdd').click();
  check('Add to dictionary (tool) adds the word under the caret to the personal dictionary', await until(async () => (await issues(pa)).every((i) => i.word !== 'plkjh') && (await pa.evaluate(() => JSON.parse(localStorage.getItem('bw:spell:user') || '[]').includes('plkjh'))), 3000));
  // count and language
  await tool('spellCount').click();
  check('the count tool opens the list of errors', await until(() => sh(pa, (r) => !!r.querySelector('.drawer:not([hidden]) .sp .sp-list')), 3000));
  await closeDr(pa);
  await tool('spellLang').click();
  check('the language tool says which dictionaries are active (Arabic and English)', await until(() => sh(pa, (r) => /Arabic/.test(r.querySelector('.toasts')?.textContent || '') && /English/.test(r.querySelector('.toasts')?.textContent || '')), 3000));
  // on/off
  await tool('spell').click();
  check('the on/off tool turns checking off: no marks, not pressed, both flags off', await until(async () => (await issues(pa)).length === 0 && (await pa.evaluate(() => !BW.S.spell.ar && !BW.S.spell.en)) && (await sh(pa, (r) => r.querySelector('.ribbon [data-a="spell"]').getAttribute('aria-pressed') === 'false')), 4000));
  await tool('spell').click();
  check('…and on again turns both dictionaries on', await until(async () => (await pa.evaluate(() => BW.S.spell.ar && BW.S.spell.en)) && (await sh(pa, (r) => r.querySelector('.ribbon [data-a="spell"]').getAttribute('aria-pressed') === 'true')), 4000));
  check('no page errors (tab)', A.page.errors.length === 0, A.page.errors.join(' | '));
  await A.close();
} catch (e) {
  check('suite ran to the end', false, e.stack || String(e));
} finally {
  for (const h of opened) { try { await h.close(); } catch { /* closed */ } }
  await browser.close();
}
console.log(results.join('\n'));
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
