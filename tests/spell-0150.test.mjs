// 0.15.0 lane spell: the spell checkers (editor/ext/35-spell.js, engine/routes/spell.mjs, editor/spell-worker.js, editor/dict/**), in a real
// browser (Edge when installed) against the local server. Real misspellings, both editions, through the real caller (runAction('spell')):
//   - 10 Arabic + 10 English misspellings flagged, each with the right first suggestion; 25 correct words per language NOT flagged
//   - a mixed Arabic + English paragraph: each run against its own dictionary; JSON and API (the technical list) and ids are not flagged
//   - typing «recieve requirment» then applying a suggestion = ONE undo step; «وثيقةة المسنخدم» flagged; turning AR off leaves EN marks alone
//   - the engine really runs: in a Worker under the product page CSP (worker-src 'self', 0.15.0) AND in the host when that directive is stripped (the fallback)
//   - nothing leaves 127.0.0.1; Save HTML carries no marks and no WebAssembly; file:// keeps the browser checker and says so
//   - the Arabic dictionary loads in < 3 s and the 1,000-word document is checked without a long task over 100 ms
//
//   node tests/spell-0150.test.mjs
import './_isolate.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { launch, browserName, tmpDir, shRoot, sleep, until, REPO } from './spell-helper.mjs';
import { buildEditor } from '../engine/build-editor.mjs';
import { serve } from '../engine/serve.mjs';

const results = [];
let failed = 0;
const check = (name, ok, detail = '') => { results.push(`${ok ? 'PASS' : 'FAIL'}  spell: ${name}${detail && !ok ? '  — ' + detail : ''}`); if (!ok) failed += 1; };
const tmp = tmpDir('bw-spell-');
process.env.BW_LOCAL_DIR = path.join(tmp, 'local');

const AR_BAD = [['المتطلبتا', 'المتطلبات'], ['المستخدمم', 'المستخدم'], ['الخدمه', 'الخدمة'], ['مستنذ', 'مستند'], ['الموافقه', 'الموافقة'], ['اللغه', 'اللغة'], ['الصلاحيتا', 'الصلاحيات'], ['المدرصة', 'المدرسة'], ['الحكومه', 'الحكومة'], ['يكتبوون', 'يكتبون']];
const EN_BAD = [['recieve', 'receive'], ['definately', 'definitely'], ['seperate', 'separate'], ['occured', 'occurred'], ['accomodate', 'accommodate'], ['requirment', 'requirement'], ['documnet', 'document'], ['managment', 'management'], ['enviroment', 'environment'], ['necesary', 'necessary']];
const AR_OK = 'كتاب المدرسة الحكومة والمستخدمين الوثيقة للمستخدم بالنظام المتطلبات الطلب الخدمة الإجراء المستند والمستندات بالمستخدمين الموافقة اللغة الصلاحيات النظام المشروع التقرير الخادم الملفات يكتبون والمهندسين للمؤسسة'.split(' ');
const EN_OK = 'accommodate receive requirement document management environment necessary separate occurred definitely specification authentication validation stakeholders application approval database interface performance requirements documents managers requested configured reviewed'.split(' ');

/** An editor built from the sample. The product page CSP has `worker-src 'self'` (0.15.0, build-editor.mjs); `workerSrc: false` strips it to force the host fallback. */
function build(name, { workerSrc = true } = {}) {
  const f = path.join(tmp, `${name}.editor.html`);
  buildEditor({ inputs: [path.join(REPO, 'samples', 'event-permit')], out: f, set: 'sample' });
  const html = fs.readFileSync(f, 'utf8');
  const had = /worker-src 'self'/.test(html);
  if (workerSrc && !had) throw new Error("the built page CSP has no worker-src 'self' (build-editor.mjs csp)");
  if (!workerSrc) fs.writeFileSync(f, html.replace(/worker-src 'self';\s*/, ''));
  return f;
}
const browser = await launch();
const opened = [];
async function open(file, { served = true } = {}) {
  let server = null;
  let url = pathToFileURL(file).href;
  if (served) { server = await serve(file, 0, { workspace: null }); url = `http://127.0.0.1:${server.address().port}/`; }
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 860 }, acceptDownloads: true });
  const page = await ctx.newPage();
  page.errors = [];
  page.reqs = [];
  page.cons = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  page.on('request', (r) => page.reqs.push(r.url()));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') page.cons.push(m.text()); });
  await page.addInitScript(() => {
    window.__long = [];
    try { new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__long.push(Math.round(e.duration)))).observe({ entryTypes: ['longtask'] }); } catch { /* no longtask support */ }
  });
  await page.goto(url);
  await page.waitForFunction(() => window.BW?.ready);
  await sleep(700);
  const h = { server, ctx, page, close: async () => { await ctx.close(); server?.close(); server?.closeAllConnections?.(); } };
  opened.push(h);
  return h;
}
const leafPaths = (page, ed, n) => page.evaluate(([e, k]) => [...document.querySelectorAll(`main.bw-doc[data-locale="${e}"] [data-p]`)].filter((el) => !el.querySelector('[data-p]') && !document.querySelector(`.toc [data-p="${CSS.escape(el.dataset.p)}"]`) && /^\/chapters\//.test(el.dataset.p) && el.textContent.trim().length > 3).slice(0, k).map((el) => el.dataset.p), [ed, n]);
const setLeaves = (page, ed, texts) => page.evaluate(async ([e, tx]) => {
  const ps = [...document.querySelectorAll(`main.bw-doc[data-locale="${e}"] [data-p]`)].filter((el) => !el.querySelector('[data-p]') && !document.querySelector(`.toc [data-p="${CSS.escape(el.dataset.p)}"]`) && /^\/chapters\//.test(el.dataset.p) && el.textContent.trim().length > 3).slice(0, tx.length).map((el) => el.dataset.p);
  ps.forEach((p, i) => BW.setText(p, tx[i], e));
  BW.render();
  return ps;
}, [ed, texts]);
const issues = (page) => page.evaluate(() => BW.EXT.spell.issues());
const waitIssues = (page, n, ms = 20000) => until(async () => (await issues(page)).length === n, ms, 150);
const panelRows = (page) => shRoot(page, (r) => [...r.querySelectorAll('.drawer .sp-row')].map((li) => ({ w: li.querySelector('.sp-w')?.textContent, first: li.querySelector('.sp-s')?.textContent || '', n: li.querySelectorAll('.sp-s').length })));
const switchEd = async (page, ed) => { await shRoot(page, (r, e) => r.querySelector(`[data-a="ed"][data-ed="${e}"]`)?.click(), ed); await sleep(300); };

try {
  // ── 1. the host path (fallback, forced: the page CSP with worker-src stripped) ─────────────────────────────────────────────────────────────────────────
  const A = await open(build('host', { workerSrc: false }));
  const pa = A.page;
  const edNow = await pa.evaluate(() => BW.S.ed);
  check(`browser is ${browserName()}; the sample opens in an edition`, !!edNow, edNow);
  const edKeys = await pa.evaluate(() => Object.keys(BW.M[BW.S.svc]).sort().join());
  check('the sample has both editions', edKeys === 'ar,en', edKeys);
  await switchEd(pa, 'ar');
  // Arabic: 10 wrong words, 25 right ones, an id, a URL, a number
  await setLeaves(pa, 'ar', [AR_BAD.map((x) => x[0]).join(' ، '), `${AR_OK.join(' ')} BW-SRS-NEW-001 https://example.com/x 2026 ٢٠٢٦`]);
  await pa.evaluate(() => BW.runAction('spell'));
  await pa.evaluate(() => BW.EXT.spell.open());
  check('runAction(spell) switches checking on and the Spelling list (drawer) opens', await until(() => shRoot(pa, (r) => !!r.querySelector('.drawer:not([hidden]) .sp')), 5000));
  check('the one switch is on (both editions follow it, 0.15.2)', await pa.evaluate(() => BW.S.spell.ar === true));
  check('Arabic: exactly the 10 misspellings are flagged (25 correct words, an id, a URL, numbers and all the sample own Arabic text are not)', await waitIssues(pa, 10), JSON.stringify((await issues(pa)).map((i) => i.word)));
  const flagged = new Set((await issues(pa)).map((i) => i.word));
  check('Arabic: every misspelling is the one planted', AR_BAD.every(([w]) => flagged.has(w)), [...flagged].join(' '));
  await until(async () => { const rows = await panelRows(pa); return AR_BAD.every(([w]) => rows.find((r) => r.w === w)?.n > 0); }, 20000);
  const rowsAr = await panelRows(pa);
  const firstOk = AR_BAD.filter(([w, good]) => rowsAr.find((r) => r.w === w)?.first === good).length;
  check('Arabic: the first suggestion is the right word for all 10', firstOk === 10, `${firstOk}/10 ${JSON.stringify(rowsAr.map((r) => [r.w, r.first]))}`);
  const eng = await pa.evaluate(() => BW.EXT.spell.engine());
  check('engine mode is host when the page CSP is forced to have no worker-src; Arabic dictionary ready', eng.mode === 'host' && eng.state.ar === 'ready', JSON.stringify(eng));
  check('the marks are CSS highlights over the page (>= 10 ranges) and the markup is untouched', (await pa.evaluate(() => CSS.highlights.get('bw-spell')?.size)) >= 10 && (await pa.evaluate(() => !document.querySelector('main.bw-doc[data-locale="ar"] mark, main.bw-doc[data-locale="ar"] [class*="spell"]'))));
  // a tashkeel-vowelled correct word is not flagged (the dictionary is asked without the marks)
  await setLeaves(pa, 'ar', [AR_BAD.map((x) => x[0]).join(' ، '), 'الْمُسْتَنَدُ والمـــــشروع الوثيقةةة']);
  check('Arabic: tashkeel and tatweel are stripped before the lookup (الْمُسْتَنَدُ and والمـــشروع pass; a tripled taa marbuta is flagged)', await until(async () => { const w = (await issues(pa)).map((i) => i.word); return w.length === 11 && w.includes('الوثيقةةة') && !w.includes('الْمُسْتَنَدُ'); }, 15000), JSON.stringify((await issues(pa)).map((i) => i.word)));
  // AC2: «وثيقةة المسنخدم»
  await setLeaves(pa, 'ar', ['وثيقةة المسنخدم وثيقة المستخدم BW-SRS-NEW-001', 'نص سليم']);
  check('AC2: «وثيقةة المسنخدم» are both flagged; «وثيقة المستخدم» and the id are not', await until(async () => { const w = (await issues(pa)).map((i) => i.word).sort(); return w.length === 2 && w.includes('وثيقةة') && w.includes('المسنخدم'); }, 15000), JSON.stringify((await issues(pa)).map((i) => i.word)));
  // a mixed paragraph: each run in its own dictionary, the technical list for JSON and API
  await setLeaves(pa, 'ar', ['هذه وثيقة المستخدم تستخدم JSON و API مع recieve و OAuth و BW-SRS-001 والمدرصة', 'نص سليم']);
  check('mixed AR+EN paragraph: «recieve» (EN) and «والمدرصة» (AR) are flagged; JSON, API, OAuth and the id are not', await until(async () => { const w = (await issues(pa)).map((i) => i.word).sort(); return w.length === 2 && w.includes('recieve') && w.includes('والمدرصة'); }, 15000), JSON.stringify((await issues(pa)).map((i) => i.word)));
  // English edition
  await switchEd(pa, 'en');
  await setLeaves(pa, 'en', [EN_BAD.map((x) => x[0]).join(' , '), `${EN_OK.join(' ')} BW-SRS-NEW-001 https://example.com/x 2026 JSON API`]);
  await pa.evaluate(() => { if (!BW.S.spell[BW.S.ed]) return BW.runAction('spell'); });
  check('English: the English edition starts checking (the one switch covers it) and all 10 misspellings are flagged', await until(async () => { const w = new Set((await issues(pa)).filter((i) => i.ed === 'en').map((i) => i.word)); return EN_BAD.every(([x]) => w.has(x)); }, 25000), JSON.stringify((await issues(pa)).map((i) => `${i.ed}:${i.word}`)));
  await until(async () => { const rows = await panelRows(pa); return EN_BAD.every(([w]) => rows.find((r) => r.w === w)?.n > 0); }, 20000);
  const rowsEn = await panelRows(pa);
  check('English: the first suggestion is the right word for all 10', EN_BAD.filter(([w, good]) => rowsEn.find((r) => r.w === w)?.first === good).length === 10, JSON.stringify(rowsEn.map((r) => [r.w, r.first])));
  const okSet = new Set([...EN_OK, 'json', 'api', 'JSON', 'API', 'BW', 'SRS', 'NEW', 'example', 'com']);
  check('English: none of the 25 correct words, JSON, API, the id or the URL is flagged (the sample own British spellings may be: the dictionary is en_US)', (await issues(pa)).filter((i) => i.ed === 'en').every((i) => !okSet.has(i.word)), JSON.stringify((await issues(pa)).filter((i) => i.ed === 'en').map((i) => i.word)));
  // AC1: real typing, one undo step
  const p1 = (await leafPaths(pa, 'en', 1))[0];
  await pa.evaluate((p) => BW.setText(p, 'x', 'en'), p1);
  await pa.evaluate(() => BW.render());
  await pa.focus(`main.bw-doc[data-locale="en"] [data-p="${p1}"]`);
  await pa.keyboard.press('Control+A');
  await pa.keyboard.type('recieve requirment');
  check('AC1: typing «recieve requirment» gives 2 issues in that field (debounced, after the typing stops)', await until(async () => (await issues(pa)).filter((i) => i.path === p1).length === 2, 15000), JSON.stringify((await issues(pa)).filter((i) => i.path === p1)));
  await pa.evaluate(() => document.activeElement?.blur?.());
  const opsBefore = await pa.evaluate(() => BW.M[BW.S.svc].en.ops.length);
  const textBefore = await pa.evaluate((p) => document.querySelector(`main.bw-doc[data-locale="en"] [data-p="${p}"]`).textContent, p1);
  await until(async () => (await panelRows(pa)).some((r) => r.w === 'recieve' && r.n), 10000);
  await shRoot(pa, (r) => [...r.querySelectorAll('.drawer .sp-row')].find((li) => li.querySelector('.sp-w')?.textContent === 'recieve')?.querySelector('.sp-s')?.click());
  check('AC1: applying the first suggestion puts «receive» in the field', await until(() => pa.evaluate((p) => /^receive requirment$/.test(document.querySelector(`main.bw-doc[data-locale="en"] [data-p="${p}"]`).textContent.trim()), p1), 8000), textBefore);
  const opsAfter = await pa.evaluate(() => BW.M[BW.S.svc].en.ops.length);
  check('AC1: the replacement is ONE operation in the history (as typing is), the checker re-marks only «requirment»', opsAfter === opsBefore + 1 && (await until(async () => (await issues(pa)).filter((i) => i.path === p1).map((i) => i.word).join() === 'requirment', 10000)), `${opsBefore} -> ${opsAfter}`);
  await pa.evaluate(() => BW.undo('en'));
  check('AC1: ONE undo brings «recieve requirment» back', await until(() => pa.evaluate((p) => document.querySelector(`main.bw-doc[data-locale="en"] [data-p="${p}"]`)?.textContent.trim() === 'recieve requirment', p1), 5000), '');
  // 0.15.2: ONE switch for both dictionaries: off removes every mark (Arabic and English), on brings both back
  await switchEd(pa, 'ar');
  await pa.evaluate(() => { if (!BW.S.side) return BW.runAction('side'); }); // both editions on the page, so both can carry marks
  await setLeaves(pa, 'ar', ['وثيقةة المسنخدم', 'نص سليم']);
  await pa.evaluate(() => BW.EXT.spell.open());
  await until(async () => (await issues(pa)).some((i) => i.ed === 'ar'), 15000);
  check('the open list has ONE spelling switch and no per-edition switches', await shRoot(pa, (r) => r.querySelectorAll('.drawer .sp-sw').length === 1 && r.querySelectorAll('.drawer .sp-sw[data-v]').length === 0));
  await shRoot(pa, (r) => r.querySelector('.drawer .sp-sw').click());
  check('turning the one switch off removes every highlight (Arabic and English) within 1.5 s', await until(async () => (await issues(pa)).length === 0 && !(await pa.evaluate(() => CSS.highlights.has('bw-spell'))), 1500, 80));
  // the switch is remembered
  check('the switch is remembered (localStorage bw:spell:on, and the old per-edition keys follow it)', await pa.evaluate(() => localStorage.getItem('bw:spell:on') === '0' && localStorage.getItem('bw:spell:ar') === '0' && localStorage.getItem('bw:spell:en') === '0'));
  // my dictionary: add a word, it is no longer flagged; remove it, it is flagged again
  await shRoot(pa, (r) => r.querySelector('.drawer .sp-sw').click());
  await switchEd(pa, 'en');
  await setLeaves(pa, 'en', ['The zzyzx recieve']);
  await until(async () => { const w = (await issues(pa)).filter((i) => i.ed === 'en').map((i) => i.word); return w.includes('zzyzx') && w.includes('recieve'); }, 15000);
  await shRoot(pa, (r) => [...r.querySelectorAll('.drawer .sp-row')].find((li) => li.querySelector('.sp-w')?.textContent === 'zzyzx')?.querySelector('[data-k="spAdd"]')?.click());
  check('«Add to my dictionary» stops flagging the word (kept in bw:spell:user) and the list in the panel shows it', await until(async () => (await issues(pa)).every((i) => i.word !== 'zzyzx') && (await pa.evaluate(() => JSON.parse(localStorage.getItem('bw:spell:user') || '[]').includes('zzyzx'))), 5000));
  await shRoot(pa, (r) => r.querySelector('.drawer .sp-my summary')?.click());
  await shRoot(pa, (r) => r.querySelector('.drawer [data-k="spDel"]')?.click());
  check('removing it from the list flags it again', await until(async () => (await issues(pa)).some((i) => i.word === 'zzyzx'), 8000));
  // ignore all
  await shRoot(pa, (r) => [...r.querySelectorAll('.drawer .sp-row')].find((li) => li.querySelector('.sp-w')?.textContent === 'zzyzx')?.querySelector('[data-k="spIgnoreAll"]')?.click());
  check('«Ignore all» drops every mark of that word for this session', await until(async () => (await issues(pa)).every((i) => i.word !== 'zzyzx'), 4000));
  // F7 / Shift+F7 step through the issues
  await pa.evaluate(() => document.activeElement?.blur?.());
  await pa.keyboard.press('F7');
  check('F7 moves to the next issue and selects the word in the page', await until(async () => { const sel = await pa.evaluate(() => getSelection().toString()); return !!sel && (await issues(pa)).some((i) => i.word === sel); }, 4000));
  // performance: Arabic dictionary load time and a 1,000-word document with no long task over 100 ms
  const engNow = await pa.evaluate(() => BW.EXT.spell.engine());
  check('the Arabic dictionary loaded in under 3 s', engNow.ms.ar > 0 && engNow.ms.ar < 3000, JSON.stringify(engNow.ms));
  await switchEd(pa, 'en');
  const big = Array.from({ length: 125 }, (_, i) => `The requirement ${i % 7 ? 'document' : 'documnet'} and the managment of environment`).join('. ');
  await setLeaves(pa, 'en', [big]);
  await sleep(120); // the editor's own re-render is not the checker's cost: the budget starts after it
  await pa.evaluate(() => { window.__long.length = 0; });
  const words = big.split(/\s+/).length;
  check('a 1,000-word English field is checked', await until(async () => (await issues(pa)).filter((i) => i.ed === 'en').length >= 18, 20000), `${words} words`);
  await sleep(500);
  const longs = await pa.evaluate(() => window.__long.slice());
  check('no long task over 100 ms while a 1,000-word field is checked (page stays interactive)', longs.every((d) => d < 100), JSON.stringify(longs));
  // nothing leaves 127.0.0.1; the dictionaries come from the local route
  const hosts = new Set(pa.reqs.map((u) => { try { return new URL(u).hostname; } catch { return 'x'; } }).filter((h) => h && h !== ''));
  check('no request leaves 127.0.0.1 (the dictionaries and the engine come from /api/spell/)', [...hosts].every((h) => h === '127.0.0.1'), [...hosts].join(','));
  check('the engine fetched the bundled dictionaries only through the host route (check/suggest POSTs)', pa.reqs.some((u) => /\/api\/spell\/check$/.test(u)) && !pa.reqs.some((u) => /\/api\/spell\/[ae][rn]\.(dic|aff)/.test(u)));
  check('no page error and no CSP violation logged with the 0.14 page CSP (the Worker is not even tried)', pa.errors.length === 0 && !pa.cons.some((m) => /Content Security Policy/i.test(m)), `${pa.errors.join(' | ')} ${pa.cons.join(' | ')}`.slice(0, 300));
  // Save HTML: no marks, no WebAssembly
  const dl = pa.waitForEvent('download');
  await pa.evaluate(() => BW.saveHtml(false));
  const saved = fs.readFileSync(await (await dl).path(), 'utf8');
  const mainHtml = (saved.match(/<main[\s\S]*?<\/main>/) || [''])[0];
  check('Save HTML: the saved page has no spelling marks in its document and no WebAssembly bytes', mainHtml.length > 100 && !/bw-spell|<mark[\s>]/.test(mainHtml) && !saved.includes('AGFzbQ'), `main ${mainHtml.length} B; marks ${(mainHtml.match(/bw-spell|<mark[\s>]/g) || []).length}; wasm ${saved.includes('AGFzbQ')}`);
  // the command itself (0.15.2): a plain on/off toggle for both dictionaries (the View menu switch and the ribbon tools are this command)
  await pa.evaluate(() => { if (!BW.S.spell[BW.S.ed]) BW.EXT.spell.toggle(); });
  await pa.evaluate(() => BW.runAction('spell'));
  check('runAction(spell) switches checking off (both editions)', await pa.evaluate(() => !BW.S.spell.ar && !BW.S.spell.en));
  await pa.evaluate(() => BW.runAction('spell'));
  check('runAction(spell) once more switches it on again (both editions)', await until(() => pa.evaluate(() => BW.S.spell.ar && BW.S.spell.en), 3000));
  // Settings card: the same switches, the licences in words, a button that opens the panel
  await pa.evaluate(() => BW.openDrawer('settings'));
  await until(() => shRoot(pa, (r) => !!r.querySelector('.set-x-spell .sp-sw')), 5000);
  const card = await shRoot(pa, (r) => { const c = r.querySelector('.set-x-spell'); return { sw: c?.querySelectorAll('.sp-sw').length, txt: c?.textContent || '' }; });
  check('Settings has a Spelling card with the ONE switch, the licences (MPL 1.1, BSD) and the Save-HTML fallback note', card.sw === 1 && /MPL 1\.1/.test(card.txt) && /BSD/.test(card.txt) && /HTML/.test(card.txt), card.txt.slice(0, 200));
  const enWas = await pa.evaluate(() => BW.S.spell.en);
  await shRoot(pa, (r) => r.querySelector('.set-x-spell .sp-sw').click());
  check('the card switch works (turns both dictionaries on/off) and the Settings drawer stays open', (await pa.evaluate(() => BW.S.spell.en)) === !enWas && (await pa.evaluate(() => BW.S.spell.ar)) === !enWas && (await pa.evaluate(() => BW.S.drawer)) === 'settings');
  await shRoot(pa, (r) => r.querySelector('.set-x-spell [data-k="spOpen"]').click());
  check('the card button opens the Spelling panel', await until(() => shRoot(pa, (r) => !!r.querySelector('.drawer .sp-list')), 4000));
  // the route itself
  const info = await (await fetch(`http://127.0.0.1:${A.server.address().port}/api/spell/info`)).json();
  check('/api/spell/info names the bundled engine and dictionaries (ok, tech list)', info.ok && info.engine.name === 'hunspell-asm' && info.tech.includes('JSON') && info.langs.ar.bytes > 7000000);
  const dic = await fetch(`http://127.0.0.1:${A.server.address().port}/api/spell/en.dic`, { headers: { 'accept-encoding': 'gzip' } });
  check('the dictionaries are served from the route, gzip-compressed and cacheable (etag)', dic.ok && dic.headers.get('content-encoding') === 'gzip' && !!dic.headers.get('etag'));
  const w = await fetch(`http://127.0.0.1:${A.server.address().port}/api/spell/worker.js`);
  check('worker.js carries its own CSP: wasm-unsafe-eval and nothing wider', /wasm-unsafe-eval/.test(w.headers.get('content-security-policy') || '') && !/'unsafe-eval'/.test(w.headers.get('content-security-policy') || ''));
  const bad = await fetch(`http://127.0.0.1:${A.server.address().port}/api/spell/check`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ lang: 'fr', words: ['x'] }) });
  const evil = await fetch(`http://127.0.0.1:${A.server.address().port}/api/spell/check`, { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://evil.example' }, body: JSON.stringify({ lang: 'en', words: ['x'] }) });
  check('the host check refuses an unknown language (400) and a foreign Origin (403)', bad.status === 400 && evil.status === 403, `${bad.status} ${evil.status}`);
  await A.close();

  // ── 2. the Worker path (the product page CSP: worker-src 'self') ────────────────────────────────────────
  const B = await open(build('worker'));
  const pb = B.page;
  await switchEd(pb, 'ar');
  await setLeaves(pb, 'ar', [AR_BAD.map((x) => x[0]).join(' ، ')]);
  await pb.evaluate(() => BW.runAction('spell'));
  check('Worker: the 10 Arabic misspellings are flagged', await waitIssues(pb, 10), JSON.stringify((await issues(pb)).map((i) => i.word)));
  const engB = await pb.evaluate(() => BW.EXT.spell.engine());
  check('Worker: the engine runs in a Worker (hunspell-asm + WebAssembly under the page CSP), Arabic ready in under 3 s', engB.mode === 'worker' && engB.state.ar === 'ready' && engB.ms.ar < 3000, JSON.stringify(engB));
  check('Worker: the dictionaries were fetched by the Worker from /api/spell/ and no check was posted to the host', pb.reqs.some((u) => /\/api\/spell\/worker\.js/.test(u)) && !pb.reqs.some((u) => /\/api\/spell\/check$/.test(u)));
  check('Worker: no CSP violation and no page error', pb.errors.length === 0 && !pb.cons.some((m) => /Content Security Policy/i.test(m)), `${pb.errors.join(' | ')} ${pb.cons.join(' | ')}`.slice(0, 300));
  await switchEd(pb, 'en');
  await setLeaves(pb, 'en', [EN_BAD.map((x) => x[0]).join(' , ')]);
  await pb.evaluate(() => { if (!BW.S.spell[BW.S.ed]) return BW.runAction('spell'); });
  check('Worker: the 10 English misspellings are flagged too', await until(async () => { const w = new Set((await issues(pb)).filter((i) => i.ed === 'en').map((i) => i.word)); return EN_BAD.every(([x]) => w.has(x)); }, 20000));
  await B.close();

  // ── 3. file:// : no server, the browser's own checker stays in charge and the panel says so ───────────────────────────────────────
  const C = await open(build('file'), { served: false });
  const pc = C.page;
  await pc.evaluate(() => BW.runAction('spell'));
  await pc.evaluate(() => BW.EXT.spell.open());
  await sleep(1200);
  const txt = await shRoot(pc, (r) => r.querySelector('.drawer .sp')?.innerText || '');
  check('file://: the panel opens and says the bundled dictionaries need the local server', /الخادم المحلي|local server/.test(txt), txt.slice(0, 120));
  check('file://: no engine (mode off), no spell request, the native spellcheck attribute is on for the open edition', (await pc.evaluate(() => BW.EXT.spell.engine().mode)) === 'off' && !C.page.reqs.some((u) => /\/api\/spell\//.test(u)) && (await pc.evaluate(() => document.querySelector('main.bw-doc[data-locale="' + BW.S.ed + '"]')?.getAttribute('spellcheck'))) === 'true');
  await C.close();
} catch (e) {
  check('suite ran to the end', false, e.stack || String(e));
} finally {
  for (const h of opened) { try { await h.close(); } catch { /* closed */ } }
  await browser.close();
}
console.log(results.join('\n'));
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
