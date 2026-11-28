/* Spell checkers (0.15.0, owner note 16; architect dev/architect.md section 9, UX ux/designer.md «Spelling»).
 * Hunspell (hunspell-asm, WebAssembly) with the LibreOffice Ayaspell Arabic dictionary and SCOWL English, both bundled and unmodified (NOTICE.md).
 * Where the engine runs: a Worker (editor/spell-worker.js, served by engine/routes/spell.mjs; the page CSP needs `worker-src 'self'`); when the Worker
 * cannot start (the CSP does not allow it yet, no WebAssembly) the same engine answers from the host: POST /api/spell/check. Served pages only: a
 * file:// page keeps the browser's own checker (the `spellcheck` attribute), and the panel says so. No text ever leaves the machine.
 * Marks: the CSS Custom Highlight API (`::highlight(bw-spell)`), so the document's DOM, its print layout and Save HTML are untouched.
 * A word is checked against the dictionary of its own SCRIPT (Arabic letters -> Ayaspell, Latin -> SCOWL), after tashkeel and tatweel are stripped
 * (the owner rule: visible Arabic is unvowelled). Skipped, never flagged: numbers, ids and codes, URLs, e-mails, ALL-CAPS and camelCase words,
 * single letters, words in code/pre/svg, the technical list (editor/dict/tech.txt) and the user's own dictionary (bw:spell:user).
 * ONE switch (bw:spell:on) turns on both dictionaries; S.spell.ar/en stay equal to it (the old per-edition keys are migrated once and kept in step).
 * checking is ON for a new user (an explicit off stays off); the engine's verdict and suggestions are widened and re-ranked in the page (smartCheck, smartSuggest below)
 * with the word lists editor/dict/tech.txt, tech.ar.txt (accepted) and common.ar.txt, common.en.txt (a ranking prior only). Seams: EXT.spell.{check,suggest,rawCheck,rawSuggest} for the tests.
 * A click on a misspelt word opens a side panel over the pages (position: fixed, never in the layout flow): the word, up to 6 suggestions, Ignore, Ignore all, Add to dictionary.
 * The Spelling ribbon tab (25-ribbon.js) drives the same functions through the commands spellNext, spellPrev, spellFix, spellFixAll, spellIgnore, spellIgnoreAll, spellAdd, spellCount, spellLang.
 * The ignore-all list and the personal dictionary are kept per user (localStorage bw:spell:ign, bw:spell:user); the document stores no spelling state.
 * Applying a suggestion is typing: the word is selected in its field and replaced with execCommand('insertText'), so it takes the editor's own
 * input path (one undo step, provenance as the user). Seams: EXT.spell.{open,toggle,next,prev,scan,issues,enabled}; `runAction('spell')` opens the panel. */
const SP = (() => {
  const served = /^https?:$/.test(location.protocol);
  const ICO = (p) => `<svg aria-hidden="true" focusable="false" class="ic" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
  const I = { // Lucide (ISC): chevron-up, chevron-down, x
    up: ICO('<path d="m18 15-6-6-6 6"/>'), down: ICO('<path d="m6 9 6 6 6-6"/>'), x: ICO('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>'),
  };
  const eds = ['ar', 'en'];
  const ROWS = 40; // rows drawn at once: the panel is a list to step through (Next / F7 reach every issue), not a table of all of them
  const norm = { ar: (w) => w.replace(/[ً-ٰٟـ]/g, ''), en: (w) => w.replace(/[’]/g, "'") };
  /* ── state ── */
  const sp = { issues: [], cur: -1, gen: 0, scanning: false, info: null, info0: false, ignoreAll: new Set(), side: null, ignoreOne: new Set(), composing: false, timer: 0 };
  const known = { ar: new Map(), en: new Map() }; // normalised word -> true (spelled right) | false
  const sugCache = new Map();
  const loadIgn = () => { try { const a = JSON.parse(ls.get('bw:spell:ign') || '[]'); return Array.isArray(a) ? a.filter((x) => typeof x === 'string') : []; } catch { return []; } };
  const saveIgn = () => ls.set('bw:spell:ign', JSON.stringify([...sp.ignoreAll].sort()));
  loadIgn().forEach((w) => sp.ignoreAll.add(w));
  const userWords = () => { try { const a = JSON.parse(ls.get('bw:spell:user') || '[]'); return Array.isArray(a) ? a.filter((x) => typeof x === 'string') : []; } catch { return []; } };
  const setUserWords = (a) => ls.set('bw:spell:user', JSON.stringify([...new Set(a)].sort()));
  /* ONE switch. bw:spell:on wins; a user from 0.15.0/0.15.1 has only the per-edition keys: the switch is on when either was on (an old «Arabic off» never leaves Arabic off for good). */
  const legacy = eds.map((ed) => ls.get(`bw:spell:${ed}`));
  // a new user starts with checking ON; only an explicit off (bw:spell:on = 0, or an old install whose per-edition keys are all 0) stays off.
  let master = ls.get('bw:spell:on') !== null ? ls.get('bw:spell:on') === '1' : legacy.some((v) => v !== null) ? legacy.includes('1') : true;
  const hasSaved = () => ls.get('bw:spell:on') !== null || eds.some((ed) => ls.get(`bw:spell:${ed}`) !== null);
  const enabled = () => master;
  const persist = () => { ls.set('bw:spell:on', master ? '1' : '0'); eds.forEach((ed) => ls.set(`bw:spell:${ed}`, master ? '1' : '0')); };
  const syncCore = () => { eds.forEach((ed) => { S.spell[ed] = master; }); };
  syncCore();
  if (hasSaved()) persist();

  /* ── the engine: a Worker, else the host ── */
  const ENG = {
    // try -> a Worker (only when the page CSP names `worker-src 'self'`; otherwise the browser would log a violation for nothing) | host | off (file://)
    mode: !served ? 'off' : /worker-src[^;]*'self'/.test(document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.content || '') ? 'try' : 'host',
    w: null, seq: 0, pend: new Map(), state: { ar: 'idle', en: 'idle' }, ms: { ar: 0, en: 0 }, ready: { ar: null, en: null },
    usable() { return this.mode !== 'off' && !!(window.CSS && CSS.highlights); },
    startWorker() {
      const w = new Worker('/api/spell/worker.js');
      w.onmessage = (e) => { const p = this.pend.get(e.data.id); if (!p) return; this.pend.delete(e.data.id); clearTimeout(p.timer); e.data.error ? p.rej(new Error(e.data.error)) : p.res(e.data); };
      w.onerror = () => { this.failWorker(new Error('worker')); };
      this.w = w;
    },
    failWorker(err) {
      this.w?.terminate?.();
      this.w = null;
      for (const [id, p] of this.pend) { clearTimeout(p.timer); p.rej(err); this.pend.delete(id); }
    },
    wcall(msg, ms) {
      if (!this.w) this.startWorker();
      return new Promise((res, rej) => {
        const id = ++this.seq;
        const timer = setTimeout(() => { this.pend.delete(id); rej(new Error('timeout')); }, ms);
        this.pend.set(id, { res, rej, timer });
        this.w.postMessage({ ...msg, id });
      });
    },
    async hcall(path, body) {
      const r = await fetch(`/api/spell/${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || r.status);
      return r.json();
    },
    /** Load one language's dictionary: Worker first; if it cannot run (CSP, WebAssembly, a hang) the host answers from now on. */
    ensure(lang) {
      if (this.state[lang] === 'ready') return Promise.resolve(true);
      if (this.ready[lang]) return this.ready[lang];
      this.state[lang] = 'loading';
      paint();
      const t0 = performance.now();
      const p = (async () => {
        if (this.mode === 'try') {
          try { await this.wcall({ op: 'load', lang, base: '/api/spell/' }, 15000); this.mode = 'worker'; } catch { this.failWorker(new Error('worker')); this.mode = 'host'; }
        }
        if (this.mode === 'host') await this.hcall('check', { lang, words: [] });
        else if (this.mode === 'worker') await this.wcall({ op: 'load', lang, base: '/api/spell/' }, 15000);
        else throw new Error('off');
        this.state[lang] = 'ready';
        this.ms[lang] = Math.round(performance.now() - t0);
      })().catch((e) => { this.state[lang] = 'error'; this.ready[lang] = null; throw e; }).finally(() => { if (this.state[lang] !== 'ready') this.ready[lang] = null; paint(); });
      this.ready[lang] = p.then(() => true);
      return this.ready[lang];
    },
    async check(lang, words) {
      if (this.mode === 'worker') return (await this.wcall({ op: 'check', lang, words }, 20000)).bad;
      return (await this.hcall('check', { lang, words })).bad;
    },
    /** The engine's own suggestions, as it ranks them (at most 5). */
    async rawSuggest(lang, word) {
      try { return this.mode === 'worker' ? (await this.wcall({ op: 'suggest', lang, word }, 10000)).s : (await this.hcall('suggest', { lang, word })).s; } catch { return []; }
    },
    /** The suggestions the panel shows: the engine's list widened and re-ranked (smartSuggest below). */
    async suggest(lang, word) {
      const k = `${lang}|${word}`;
      if (sugCache.has(k)) return sugCache.get(k);
      let s = [];
      try { s = await smartSuggest(lang, word); } catch { s = await this.rawSuggest(lang, word); }
      sugCache.set(k, s);
      return s;
    },
  };

  /* ── smarter checking and ranking (0.17.0, owner note 12) ──
   * The engine says «unknown» for a word that is fine in a document: an Arabic verb or noun with a chain of clitics (وسيستخدمونها, لبرمجياتهم), a British spelling (centre,
   * organisation), a possessive (testing's), a technical term or loan word (سيرفر, pdf). Before a word is flagged, the forms it may stand for are asked of the same engine:
   * Arabic with the prefixes و ف س ل ب ك ال (and للـ) and the pronoun endings taken off, English with the possessive taken off and the British spelling turned into the American
   * one. The suggestions: the engine's five, widened with every one-edit variant (keyboard neighbours, a doubled or dropped letter, a swap, the Arabic letter pairs that are
   * mistaken for each other: ا أ إ آ, ى ي, ة ه, ؤ و, ئ ي) that the dictionary accepts, then ranked by a weighted edit distance, the engine's own order, the words the document already
   * uses and a short list of everyday words (editor/dict/common.*.txt). A split («occur ed») and a hyphenated suggestion are dropped. All of it is local; nothing leaves the machine. */
  const AR_PRE1 = ['', 'و', 'ف'];
  const AR_PRE2 = ['', 'س', 'ل', 'ب', 'ك'];
  const AR_PRE2_ART = ['ال', 'بال', 'كال', 'لل'];
  const AR_SUF = ['', 'ها', 'هم', 'هن', 'هما', 'كما', 'كم', 'كن', 'نا', 'ني', 'ه', 'ك'];
  /** The forms an Arabic word may stand for once its clitics are taken off (the word itself excluded). The engine already knows the article (ال) on its nouns and the one-letter pronoun
   *  endings, and a stem taken out from under them would let real errors through (الحاله -> حاله, تدقيك -> تدقي), so only و ف س ل ب ك and the long pronouns come off; `article` is for
   *  the technical lists alone (الأتمتة -> أتمتة). */
  function arForms(w, article) {
    const out = new Set();
    for (const a of AR_PRE1) {
      if (a && !w.startsWith(a)) continue;
      const r1 = w.slice(a.length);
      for (const b of article ? [...AR_PRE2, ...AR_PRE2_ART] : AR_PRE2) {
        if (b && !r1.startsWith(b)) continue;
        const r2 = r1.slice(b.length);
        const bases = b === 'لل' ? [r2, `ال${r2}`] : [r2];
        for (const base of bases) {
          for (const c of AR_SUF) {
            if (c && (!base.endsWith(c) || base.startsWith('ال'))) continue;
            const stem = base.slice(0, base.length - c.length);
            if (c.length === 1 && !/(ون|وا|ات|ين|ان)$/.test(stem)) continue; // ه / ك after a plural or a verb ending only: تدقيك is not تدقي + ك
            if (stem.length < 3 || (!a && !b && !c)) continue;
            out.add(stem);
            if (c) {
              if (stem.endsWith('ت')) out.add(`${stem.slice(0, -1)}ة`);
              if (stem.endsWith('و')) { out.add(`${stem}ا`); out.add(`${stem}ن`); }
              if (stem.endsWith('ي')) out.add(`${stem}ن`);
            }
          }
        }
      }
    }
    out.delete(w);
    return [...out];
  }
  const BRIT = [[/isations$/, 'izations'], [/isation$/, 'ization'], [/ised$/, 'ized'], [/ises$/, 'izes'], [/ising$/, 'izing'], [/iser$/, 'izer'], [/ise$/, 'ize'], [/yse$/, 'yze'], [/ysed$/, 'yzed'], [/ysing$/, 'yzing'],
    [/ours$/, 'ors'], [/oured$/, 'ored'], [/ouring$/, 'oring'], [/our$/, 'or'], [/our(?=[a-z]{2,})/, 'or'], [/tres$/, 'ters'], [/tre$/, 'ter'], [/lled$/, 'led'], [/lling$/, 'ling'], [/ller$/, 'ler'], [/llers$/, 'lers'],
    [/ence$/, 'ense'], [/ences$/, 'enses'], [/ae/, 'e'], [/oe/, 'e'], [/ogue$/, 'og'], [/gramme$/, 'gram'], [/grammes$/, 'grams'], [/ageing$/, 'aging'], [/gement$/, 'gment'], [/gements$/, 'gments'], [/^grey/, 'gray'], [/^whilst$/, 'while'], [/^cheque/, 'check'], [/^tyre/, 'tire'], [/^sceptic/, 'skeptic']];
  /** The forms an English word may stand for: the possessive off, the American spelling of a British one, lower case. */
  function enForms(w) {
    const out = new Set();
    const low = w.toLowerCase();
    const base = low.replace(/['’]s?$/, '');
    for (const x of new Set([low, base])) {
      out.add(x);
      for (const [re, to] of BRIT) if (re.test(x)) out.add(x.replace(re, to));
    }
    if (/(tion|sion|ment|ness|ity|ism|ist|ance|ence|ship|hood)s$/.test(base)) out.add(base.slice(0, -1)); // a regular plural the dictionary lacks (integrations); «boxs» is not rescued
    out.delete(w);
    return [...out].filter((x) => x.length > 1);
  }
  const HY_PRE = new Set(['non', 'pre', 'post', 'co', 're', 'anti', 'multi', 'semi', 'sub', 'inter', 'intra', 'over', 'under', 'auto', 'cross', 'micro', 'pseudo', 'ex', 'un', 'mid', 'out', 'self', 'half', 'well', 'ill', 'e', 'x', 'wi', 'fi', 'back', 'front', 'up', 'down']);
  const tech = { ar: null, en: null };
  const techSets = () => {
    if (!tech.en) { tech.en = new Set((sp.info?.tech || []).map((w) => w.toLowerCase())); tech.ar = new Set((sp.info?.techAr || []).map((w) => norm.ar(w))); }
    return tech;
  };
  /** A word the technical lists know, or an inflection of one (webhook -> webhooks, a possessive, -ed/-ing). */
  function techHit(lang, w) {
    const t = techSets()[lang];
    if (!t.size) return false;
    if (lang === 'ar') return t.has(w) || arForms(w, true).some((f) => t.has(f));
    const low = w.toLowerCase();
    if (t.has(low)) return true;
    return enForms(w).some((f) => t.has(f)) || [/s$/, /es$/, /ed$/, /ing$/, /d$/].some((re) => re.test(low) && t.has(low.replace(re, '')));
  }
  /** Check `words` (unique): the engine, then the forms of every word it rejects. Returns the words still unknown. */
  async function smartCheck(lang, words) {
    const raw = await ENG.check(lang, words);
    if (!raw.length) return raw;
    const forms = new Map();
    const ask = new Set();
    const bad = [];
    for (const w of raw) {
      if (techHit(lang, w)) continue;
      const f = lang === 'ar' ? arForms(w) : enForms(w);
      if (!f.length) { bad.push(w); continue; }
      forms.set(w, f);
      f.forEach((x) => ask.add(x));
    }
    const askList = [...ask];
    const rejected = new Set();
    for (let i = 0; i < askList.length; i += 400) (await ENG.check(lang, askList.slice(i, i + 400))).forEach((x) => rejected.add(x));
    const t = techSets()[lang];
    const still = [...bad];
    for (const [w, f] of forms) if (!f.some((x) => !rejected.has(x) || t.has(x))) still.push(w);
    return still;
  }
  const AR_ALPHA = [...'ابتثجحخدذرزسشصضطظعغفقكلمنهويةىءأإآؤئ'];
  const EN_ALPHA = [...'abcdefghijklmnopqrstuvwxyz'];
  const AR_GROUPS = [[...'اأإآء'], [...'يىئ'], [...'ةه'], [...'وؤ'], [...'ضظ'], [...'ذز'], [...'سصث'], [...'تط'], [...'كق'], [...'حخج'], [...'غع'], [...'دذ']];
  const AR_GROUP_COST = [0.25, 0.3, 0.35, 0.3, 0.7, 0.7, 0.7, 0.7, 0.7, 0.7, 0.7, 0.7]; // the first four are spelling habits (hamza, ى/ي, ة/ه, ؤ/و); the rest are neighbouring keys or look-alikes
  const KB = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
  const kbNear = (a, b) => {
    for (let r = 0; r < KB.length; r++) {
      const i = KB[r].indexOf(a);
      if (i < 0) continue;
      for (const [dr, di] of [[0, -1], [0, 1], [-1, 0], [-1, 1], [1, -1], [1, 0]]) { const q = KB[r + dr]; if (q && q[i + di] === b) return true; }
    }
    return false;
  };
  const subCost = (a, b, lang) => {
    if (a === b) return 0;
    if (lang === 'ar') { for (let g = 0; g < AR_GROUPS.length; g++) if (AR_GROUPS[g].includes(a) && AR_GROUPS[g].includes(b)) return AR_GROUP_COST[g]; return 1; }
    if (a.toLowerCase() === b.toLowerCase()) return 0.1;
    const A = a.toLowerCase();
    const B = b.toLowerCase();
    if ('aeiou'.includes(A) && 'aeiou'.includes(B)) return 0.55;
    return kbNear(A, B) ? 0.65 : 1;
  };
  /** A weighted edit distance: a swap of neighbours 0.6, a doubled or dropped repeated letter 0.55, a dropped Arabic long vowel 0.6, a likely confusion 0.1-0.65, anything else 1. */
  function wdist(a, b, lang) {
    const n = a.length;
    const m = b.length;
    const d = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
    const gap = (s, i) => (s[i] !== undefined && (s[i] === s[i - 1] || s[i] === s[i + 1]) ? 0.55 : lang === 'ar' && 'اوي'.includes(s[i]) ? 0.6 : 1);
    for (let i = 1; i <= n; i++) d[i][0] = d[i - 1][0] + gap(a, i - 1);
    for (let j = 1; j <= m; j++) d[0][j] = d[0][j - 1] + gap(b, j - 1);
    for (let i = 1; i <= n; i++) {
      for (let j = 1; j <= m; j++) {
        let v = Math.min(d[i - 1][j] + gap(a, i - 1), d[i][j - 1] + gap(b, j - 1), d[i - 1][j - 1] + subCost(a[i - 1], b[j - 1], lang));
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, d[i - 2][j - 2] + 0.6);
        d[i][j] = v;
      }
    }
    return d[n][m];
  }
  /** Every one-edit variant of w: a dropped, doubled-in or swapped letter, any other letter in its place. */
  function edit1(lang, w) {
    const out = new Set();
    const ch = [...w];
    const alpha = lang === 'ar' ? AR_ALPHA : EN_ALPHA;
    for (let i = 0; i < ch.length; i++) {
      out.add(ch.slice(0, i).concat(ch.slice(i + 1)).join(''));
      if (i + 1 < ch.length) { const t = ch.slice(); [t[i], t[i + 1]] = [t[i + 1], t[i]]; out.add(t.join('')); }
      for (const c of alpha) { if (c !== ch[i]) { const t = ch.slice(); t[i] = c; out.add(t.join('')); } }
    }
    for (let i = 0; i <= ch.length; i++) for (const c of alpha) out.add(ch.slice(0, i).concat(c, ch.slice(i)).join(''));
    return out;
  }
  /** The candidates to ask the dictionary about: edit1(w); for Arabic also the double confusions (a hamza and a final ى in one word) and edit1 of the word with its first letter's hamza
   *  and its last letter's ه/ة or ى/ي swapped (إعدادت -> إعدادات, مسؤليه -> مسؤولية). */
  function variants(lang, w) {
    const out = edit1(lang, w);
    if (lang === 'ar') {
      const ch = [...w];
      const slots = ch.map((c, i) => [i, AR_GROUPS.filter((g) => g.includes(c)).flat().filter((x) => x !== c)]).filter(([, o]) => o.length).slice(0, 6);
      for (let x = 0; x < slots.length; x++) {
        for (let y = x + 1; y < slots.length; y++) {
          for (const p of slots[x][1]) for (const q of slots[y][1]) { const t = ch.slice(); t[slots[x][0]] = p; t[slots[y][0]] = q; out.add(t.join('')); }
        }
      }
      const first = ch[0];
      const last = ch[ch.length - 1];
      const heads = [first, ...(AR_GROUPS[0].includes(first) ? AR_GROUPS[0].filter((x) => x !== first && x !== 'ء') : [])];
      const tails = [last, ...(({ 'ه': 'ة', 'ة': 'ه', 'ى': 'ي', 'ي': 'ى' })[last] ? [({ 'ه': 'ة', 'ة': 'ه', 'ى': 'ي', 'ي': 'ى' })[last]] : [])];
      for (const h of heads) {
        for (const t of tails) {
          if (h === first && t === last) continue;
          const g = h + ch.slice(1, -1).join('') + t;
          out.add(g);
          edit1(lang, g).forEach((x) => out.add(x));
        }
      }
    }
    out.delete(w);
    return [...out].filter((x) => x.length > 0);
  }
  const wordLists = () => {
    if (!sp.lists) sp.lists = { ar: new Set((sp.info?.common?.ar || []).map((w) => norm.ar(w))), en: new Set((sp.info?.common?.en || []).map((w) => w.toLowerCase())) };
    return sp.lists;
  };
  const recase = (src, w) => (src.length > 1 && src === src.toUpperCase() ? w.toUpperCase() : src[0] !== src[0].toLowerCase() ? w[0].toUpperCase() + w.slice(1) : w);
  /** The suggestions for one unknown word, best first (at most 6). */
  async function smartSuggest(lang, word) {
    await loadInfo();
    const src = word;
    const w = lang === 'en' ? word.toLowerCase() : word;
    const base = await ENG.rawSuggest(lang, word);
    const rank = new Map();
    base.forEach((s, i) => { const k = lang === 'en' ? s.toLowerCase() : s; if (!rank.has(k)) rank.set(k, { i, s }); });
    const gen = variants(lang, w);
    const askList = gen.filter((x) => !rank.has(x));
    const rejected = new Set();
    for (let i = 0; i < askList.length; i += 500) (await ENG.check(lang, askList.slice(i, i + 500))).forEach((x) => rejected.add(x));
    const cands = new Map();
    for (const [k, v] of rank) cands.set(k, { text: v.s, i: v.i });
    for (const x of askList) if (!rejected.has(x) && !cands.has(x)) cands.set(x, { text: lang === 'en' ? recase(src, x) : x, i: 6 });
    const common = wordLists()[lang];
    const freq = sp.freq?.[lang];
    const user = new Set(userWords().map((x) => (lang === 'en' ? x.toLowerCase() : x)));
    const hyOk = /[-\s]/.test(word);
    const scored = [];
    for (const [k, c] of cands) {
      if (!hyOk && /[-\s]/.test(c.text)) continue;
      let sc = wdist(w, k, lang) + (c.i < 6 ? 0.12 * c.i : 0.1);
      const f = freq?.get(k) || 0;
      sc -= Math.max(f && !common.has(k) ? Math.min(0.7, 0.35 + 0.2 * Math.log2(f)) : 0, common.has(k) ? (f ? 0.75 : 0.5) : 0, user.has(k) ? 0.7 : 0); // known to the document (a domain word: how often it occurs counts), to the everyday list (a little more when the document uses it too) or to the user: the best of the three, not their sum
      if (lang === 'ar') { if (/^[أآإ]ل/.test(k) && /^ال/.test(w) && k.slice(1) === w.slice(1) && !common.has(k)) sc += 1.2; if (k[0] !== w[0] && !(AR_GROUPS[0].includes(k[0]) && AR_GROUPS[0].includes(w[0]))) sc += 0.4; } else if (k[0] !== w[0]) sc += 0.4;
      scored.push({ text: c.text, sc });
    }
    scored.sort((a, b) => a.sc - b.sc);
    const out = [];
    for (const s of scored) if (!out.includes(s.text)) out.push(s.text);
    return out.slice(0, 6);
  }

  /* ── tokens ── */
  const AR_RUN = /[ء-يٮ-ۓەۺ-ۿً-ٰٟ]+/g;
  const LAT_RUN = /[A-Za-zÀ-ɏ]+(?:['’][A-Za-zÀ-ɏ]+)*/g;
  const NOT_PROSE = /[0-9٠-٩۰-۹_@#\\/]|:\/\/|^www\.|\.(com|org|net|io|gov|json|html|pdf|docx|md|js|mjs|css|png|svg)\b/i;
  const TECH = () => new Set((sp.info?.tech || []).map((w) => w.toLowerCase()));
  let techSet = null;
  const skipLatin = (w) => w.length < 2 || w === w.toUpperCase() || /[a-z][A-Z]/.test(w) || /^[A-Z]{2,}s$/.test(w); // SLAs, KPIs: an acronym's plural
  /** The text of a field as one string with a node map (a word split by an inline <b> stays one word); a <br> is a break. */
  function textOf(el) {
    const map = [];
    let text = '';
    const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, { acceptNode: (n) => (n.nodeType === 1 && n.matches('code, pre, svg, style, script, [data-nospell]') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT) });
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      if (n.nodeType === 3) { map.push({ node: n, start: text.length }); text += n.data; } else if (n.tagName === 'BR') text += '\n';
    }
    return { text, map };
  }
  const place = (map, pos, end) => { // string offset -> [node, offset]
    let lo = 0;
    let hi = map.length - 1;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (map[m].start <= pos) lo = m; else hi = m - 1; }
    const e = map[lo];
    const off = Math.min(pos - e.start, e.node.data.length);
    return end && off === 0 && lo > 0 && map[lo - 1].node.data.length ? [map[lo - 1].node, map[lo - 1].node.data.length] : [e.node, off];
  };
  const MAX_WORD = 64;
  function leafTokens(el, ed, out) {
    const L = el.closest('[lang]')?.getAttribute('lang')?.slice(0, 2).toLowerCase();
    if (L && L !== 'ar' && L !== 'en') return;
    if (el.closest('code, pre, svg, .toc, [data-nospell]')) return;
    const { text, map } = textOf(el);
    if (!map.length || !/[A-Za-zء-ي]/.test(text)) return;
    const leaf = { el, ed, text, map, path: el.dataset.p };
    const chunk = /\S+/g;
    for (let m = chunk.exec(text); m; m = chunk.exec(text)) {
      const c = m[0];
      if (NOT_PROSE.test(c)) continue;
      for (const [re, lang] of [[AR_RUN, 'ar'], [LAT_RUN, 'en']]) {
        re.lastIndex = 0;
        for (let k = re.exec(c); k; k = re.exec(c)) {
          const raw = k[0];
          if (raw.length > MAX_WORD) continue; // no language has a 64-letter word; a pasted blob made the checker and the suggester run for minutes (the tab froze, then crashed)
          const start = m.index + k.index;
          if (lang === 'ar') { const w = norm.ar(raw); if (w.length < 2) continue; out.push({ leaf, lang, raw, word: w, start, end: start + raw.length }); } else {
            if (skipLatin(raw)) continue;
            // a Latin run glued to Arabic letters (an affix like «الـAPI») is not a word of either: only a run set apart counts
            const it = { leaf, lang, raw, word: norm.en(raw), start, end: start + raw.length };
            // a part of a hyphenated compound (Wi-Fi, e-mail, non-functional): the compound joined is the word to ask about, and a prefix like «non» is fine
            if (/[-‐‑]/.test(c[k.index - 1] || '') || /[-‐‑]/.test(c[k.index + raw.length] || '')) {
              const hm = [...c.matchAll(/[A-Za-z]+(?:[-‐‑][A-Za-z]+)+/g)].find((x) => x.index <= k.index && x.index + x[0].length >= k.index + raw.length);
              if (hm) { it.hy = true; it.join = hm[0].replace(/[-‐‑]/g, '').toLowerCase(); }
            }
            out.push(it);
          }
        }
      }
    }
  }
  const leaves = (ed) => [...(mainOf(ed)?.querySelectorAll('[data-p]') || [])].filter((el) => !el.querySelector('[data-p]'));
  const idle = () => new Promise((res) => (window.requestIdleCallback ? requestIdleCallback(() => res(), { timeout: 250 }) : setTimeout(res, 0)));
  const okWord = (it) => {
    if (sp.ignoreAll.has(it.word)) return true;
    const u = userWords();
    if (u.includes(it.raw) || u.includes(it.word) || (it.lang === 'en' && u.includes(it.word.toLowerCase()))) return true;
    if (it.lang === 'en') {
      techSet ||= TECH();
      if (techSet.has(it.word.toLowerCase())) return true;
      if (it.hy && (HY_PRE.has(it.word.toLowerCase()) || known.en.get(it.join) === true || techSets().en.has(it.join))) return true;
    }
    return false;
  };
