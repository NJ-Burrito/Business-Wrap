// lane spell (owner notes 2 and 12): spelling is ON for a new user (an explicit off stays off), and the Arabic and English checking is smarter.
// Real browser against the local server, through the real callers: the page's own scan (the marks the user sees) and the suggestion list the panel shows.
//   - default: nothing stored -> on; bw:spell:on=0 -> off; old per-edition keys all 0 -> off, one 1 -> on
//   - false flags: tests/fixtures/spell-0170/{ar,en}.json «correct» (affixed forms, loan words, British spellings, possessives, plurals, compounds, technical terms) put in the
//     document: how many the old checker (the engine alone, tokenised as before) flags and how many the page flags now
//   - real errors are still caught: every «wrong» word is flagged
//   - first suggestion: the engine's own first suggestion against the page's list, for the same words
//   - the document teaches the ranking: a word the document already uses rises
//   - the technical list is in before the first mark (no panel opened)
//
//   node tests/spell-0170.test.mjs
import './_isolate.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { launch, tmpDir, sleep, until, REPO } from './spell-helper.mjs';
import { buildEditor } from '../engine/build-editor.mjs';
import { serve } from '../engine/serve.mjs';
import { suite } from './_harness.mjs';

const S = suite("spell-0170");
const { check, results } = S;
const note = (s) => results.push(`INFO  spell-0170: ${s}`);
const fx = (n) => JSON.parse(fs.readFileSync(path.join(REPO, 'tests', 'fixtures', 'spell-0170', `${n}.json`), 'utf8'));
const FX = { ar: fx('ar'), en: fx('en') };
const tmp = tmpDir('bw-spell70-');
process.env.BW_LOCAL_DIR = path.join(tmp, 'local');
const f = path.join(tmp, 'sample.editor.html');
buildEditor({ inputs: [path.join(REPO, 'samples', 'event-permit')], out: f, set: 'sample' });
const browser = await launch();
const opened = [];
async function open({ store = {}, width = 1366 } = {}) {
  const server = await serve(f, 0, { workspace: null });
  const ctx = await browser.newContext({ viewport: { width, height: 860 } });
  await ctx.addInitScript((st) => { try { if (!sessionStorage.getItem('bw-70-init')) { sessionStorage.setItem('bw-70-init', '1'); localStorage.setItem('bw:ui', 'en'); localStorage.setItem('bw:xpl-panel', '0'); for (const [k, v] of Object.entries(st)) localStorage.setItem(k, v); } } catch { /* storage */ } }, store);
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
const issues = (page) => page.evaluate(() => BW.EXT.spell.issues());
/** The text of the first body field of an edition, replaced; the page rescans on its own. */
const setLeaf = (page, ed, text) => page.evaluate(async ([e, tx]) => {
  const ps = [...document.querySelectorAll(`main.bw-doc[data-locale="${e}"] [data-p]`)].filter((el) => !el.querySelector('[data-p]') && !document.querySelector(`.toc [data-p="${CSS.escape(el.dataset.p)}"]`) && /^\/chapters\//.test(el.dataset.p));
  ps.sort((a, b) => b.textContent.length - a.textContent.length); // a body paragraph, not a number or a title
  BW.setText(ps[0].dataset.p, tx, e);
  BW.render();
  return ps[0].dataset.p;
}, [ed, text]);
/** R15: a probe must prove it looked. A known-wrong word is put last in the text; the list is read only once that word is flagged and the list has stopped changing. */
const SENTINEL = { ar: 'مستنذ', en: 'qwxzy' };
const settled = async (page, lang) => {
  await until(() => page.evaluate((l) => BW.EXT.spell.engine().state[l] === 'ready', lang), 30000, 200);
  const seen = await until(async () => (await issues(page)).some((i) => i.ed === lang && i.word === SENTINEL[lang]), 40000, 300);
  if (!seen) throw new Error(`${lang}: the sentinel word was never flagged: the scan did not run; ${JSON.stringify(await page.evaluate(() => ({ n: BW.EXT.spell.issues().length, e: BW.EXT.spell.engine(), ed: BW.S.ed, side: BW.S.side, ds: document.documentElement.dataset.bwSpell })))}`);
  let last = '';
  let same = 0;
  for (let i = 0; i < 60 && same < 2; i++) { await sleep(500); const s = JSON.stringify((await issues(page)).map((x) => x.word)); same = s === last ? same + 1 : 0; last = s; }
  return issues(page);
};
const rate = (n, d) => `${n}/${d} = ${(100 * n / d).toFixed(1)}%`;

try {
  // ── 1. the default ────────────────────────────────────────────────────────────────
  const on = (page) => page.evaluate(() => ({ en: BW.EXT.spell.enabled(), core: BW.S.spell.ar && BW.S.spell.en, key: localStorage.getItem('bw:spell:on') }));
  const N = await open();
  const dN = await on(N.page);
  check('a new user (nothing stored): checking is ON in both editions', dN.en === true && dN.core === true, JSON.stringify(dN));
  await N.close();
  const OFF = await open({ store: { 'bw:spell:on': '0' } });
  const dOff = await on(OFF.page);
  check('an explicit off (bw:spell:on = 0) stays off', dOff.en === false && !dOff.core, JSON.stringify(dOff));
  await OFF.close();
  const LEG0 = await open({ store: { 'bw:spell:ar': '0', 'bw:spell:en': '0' } });
  check('an old install with both per-edition keys at 0 stays off', (await on(LEG0.page)).en === false);
  await LEG0.close();
  const LEG1 = await open({ store: { 'bw:spell:ar': '0', 'bw:spell:en': '1' } });
  check('an old install with one key at 1 is on', (await on(LEG1.page)).en === true);
  await LEG1.close();

  // ── 2. one browser session for the word sets ──────────────────────────────────────
  const A = await open();
  const pa = A.page;
  await pa.evaluate(() => { if (!BW.S.side) return BW.runAction('side'); }); // both editions on the page
  await sleep(300);
  check('fixtures: at least 60 correct and 60 wrong words per language', ['ar', 'en'].every((l) => FX[l].correct.length >= 60 && FX[l].wrong.length >= 60), JSON.stringify(['ar', 'en'].map((l) => [FX[l].correct.length, FX[l].wrong.length])));
  const base = {};
  for (const lang of ['ar', 'en']) {
    const ok = FX[lang].correct;
    // BEFORE: the old checker = the engine alone on the words as the old tokeniser cut them (a hyphenated word is its pieces; single letters, ALL-CAPS and camelCase were skipped)
    const pieces = (w) => (lang === 'ar' ? [w] : (w.match(/[A-Za-z]+(?:['’][A-Za-z]+)*/g) || []).filter((p) => p.length >= 2 && p !== p.toUpperCase() && !/[a-z][A-Z]/.test(p)));
    const all = [...new Set(ok.flatMap(pieces))];
    await pa.evaluate((l) => BW.EXT.spell.rawCheck(l, ['x']), lang);
    const rawBad = new Set(await pa.evaluate(([l, w]) => BW.EXT.spell.rawCheck(l, w), [lang, all]));
    base[lang] = { before: ok.filter((w) => pieces(w).some((p) => rawBad.has(p))) };
    // AFTER: the page's own scan, the marks the user sees
    await setLeaf(pa, lang, `${ok.join(lang === 'ar' ? ' ، ' : ' , ')} ${SENTINEL[lang]}`);
    const l = (await settled(pa, lang)).filter((i) => i.ed === lang);
    base[lang].flagged = l.map((i) => i.word);
    base[lang].after = ok.filter((w) => l.some((i) => w.includes(i.word) || i.word.includes(w)));
    note(`${lang} false flags before ${rate(base[lang].before.length, ok.length)} -> after ${rate(base[lang].after.length, ok.length)}; before: ${base[lang].before.join(' ')} | after: ${base[lang].after.join(' ')}`);
    check(`${lang}: the new checker flags fewer correct words than the engine alone`, base[lang].after.length < base[lang].before.length, `${base[lang].after.length} vs ${base[lang].before.length}`);
    check(`${lang}: at most 2 % of the correct words are flagged now`, base[lang].after.length <= Math.floor(ok.length * 0.02), base[lang].after.join(' '));
  }

  // real errors are still caught, and the first suggestion
  for (const lang of ['ar', 'en']) {
    const wr = FX[lang].wrong;
    await setLeaf(pa, lang, `${wr.map(([w]) => w).join(lang === 'ar' ? ' ، ' : ' , ')} ${SENTINEL[lang]}`);
    const l = (await settled(pa, lang)).filter((i) => i.ed === lang);
    const got = new Set(l.map((i) => i.word));
    const missed = wr.filter(([w]) => !got.has(w)).map(([w]) => w);
    // the same set judged by the old checker, for the record
    const rawBad = new Set(await pa.evaluate(([la, w]) => BW.EXT.spell.rawCheck(la, w), [lang, wr.map(([w]) => w)]));
    const rawMissed = wr.filter(([w]) => !rawBad.has(w)).length;
    check(`${lang}: every real misspelling in the set is flagged (${wr.length})`, missed.length === 0, `missed: ${missed.join(' ')}`);
    const t = await pa.evaluate(async ([la, list]) => {
      const o = { before: [], after: [], b5: 0, a5: 0 };
      for (const [w, fix] of list) {
        const raw = await BW.EXT.spell.rawSuggest(la, w);
        const sm = await BW.EXT.spell.suggest(la, w);
        o.before.push(raw[0] === fix); o.after.push(sm[0] === fix);
        if (raw.includes(fix)) o.b5 += 1;
        if (sm.slice(0, 5).includes(fix)) o.a5 += 1;
        if (sm[0] !== fix) (o.miss ||= []).push(`${w}: ${sm.slice(0, 3).join(' / ')} (want ${fix}; engine: ${raw.slice(0, 2).join(' / ')})`);
      }
      return o;
    }, [lang, wr]);
    const b1 = t.before.filter(Boolean).length;
    const a1 = t.after.filter(Boolean).length;
    note(`${lang} top-1 before ${rate(b1, wr.length)} -> after ${rate(a1, wr.length)}; in the first 5: before ${rate(t.b5, wr.length)} -> after ${rate(t.a5, wr.length)}; old checker missed ${rawMissed} of ${wr.length}`);
    if (t.miss?.length) note(`${lang} top-1 misses: ${t.miss.join(' ; ')}`);
    check(`${lang}: the first suggestion is right more often than the engine's own`, a1 > b1, `${a1} vs ${b1}`);
    check(`${lang}: the first suggestion is right for at least 85 % of the set`, a1 >= Math.ceil(wr.length * 0.85), `${a1}/${wr.length}`);
    check(`${lang}: the right word is among the first 5 for at least 95 %`, t.a5 >= Math.ceil(wr.length * 0.95), `${t.a5}/${wr.length}`);
  }

  // ── 3. the document teaches the ranking ───────────────────────────────────────────
  await setLeaf(pa, 'ar', 'المستخدمين يدخلون والمستخدمين يخرجون ثم المستخمين مستنذ');
  await settled(pa, 'ar');
  const docAr = await pa.evaluate(() => BW.EXT.spell.suggest('ar', 'المستخمين'));
  check('a word the document already uses rises: المستخمين -> المستخدمين first', docAr[0] === 'المستخدمين', docAr.join(' '));
  const parts = await pa.evaluate(async () => (await BW.EXT.spell.suggest('en', 'occured')).concat(['|'], await BW.EXT.spell.suggest('en', 'Recieve')));
  check('suggestions have no split («occur ed») and no hyphenated pieces', !parts.some((s) => /[\s-]/.test(s) && s !== '|'), parts.join(' '));
  check('a capitalised misspelling gets a capitalised suggestion (Recieve -> Receive)', parts[parts.indexOf('|') + 1] === 'Receive', parts.join(' '));

  // ── 4. the technical list is in before the first mark ────────────────────────────
  const B = await open();
  await B.page.evaluate(() => { if (!BW.S.side) return BW.runAction('side'); });
  await sleep(300);
  await setLeaf(B.page, 'en', 'Playwright and Chromium run the webhooks, then the pdf and the JSON export qwxzy');
  const lb = (await settled(B.page, 'en')).filter((i) => i.ed === 'en');
  check('technical words are not flagged on a fresh page (no panel opened)', lb.length === 1 && lb[0].word === 'qwxzy', lb.map((i) => i.word).join(' '));
  await B.close();

  check('no page errors', A.page.errors.length === 0, A.page.errors.join(' | '));
  await A.close();
} catch (e) {
  check('suite ran to the end', false, e.stack || String(e));
} finally {
  for (const h of opened) { try { await h.close(); } catch { /* closed */ } }
  await browser.close();
}
S.finish();
