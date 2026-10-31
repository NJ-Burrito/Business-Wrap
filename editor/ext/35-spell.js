/* Spell checkers (0.15.0, owner note 16; architect dev/architect.md section 9, UX ux/designer.md «Spelling»).
 * Hunspell (hunspell-asm, WebAssembly) with the LibreOffice Ayaspell Arabic dictionary and SCOWL English, both bundled and unmodified (NOTICE.md).
 * Where the engine runs: a Worker (editor/spell-worker.js, served by engine/routes/spell.mjs; the page CSP needs `worker-src 'self'`); when the Worker
 * cannot start (the CSP does not allow it yet, no WebAssembly) the same engine answers from the host: POST /api/spell/check. Served pages only: a
 * file:// page keeps the browser's own checker (the `spellcheck` attribute), and the panel says so. No text ever leaves the machine.
 * Marks: the CSS Custom Highlight API (`::highlight(bw-spell)`), so the document's DOM, its print layout and Save HTML are untouched.
 * A word is checked against the dictionary of its own SCRIPT (Arabic letters -> Ayaspell, Latin -> SCOWL), after tashkeel and tatweel are stripped
 * (the owner rule: visible Arabic is unvowelled). Skipped, never flagged: numbers, ids and codes, URLs, e-mails, ALL-CAPS and camelCase words,
 * single letters, words in code/pre/svg, the technical list (editor/dict/tech.txt) and the user's own dictionary (bw:spell:user).
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
  const sp = { issues: [], cur: -1, gen: 0, scanning: false, info: null, info0: false, ignoreAll: new Set(), ignoreOne: new Set(), composing: false, timer: 0 };
  const known = { ar: new Map(), en: new Map() }; // normalised word -> true (spelled right) | false
  const sugCache = new Map();
  const userWords = () => { try { const a = JSON.parse(ls.get('bw:spell:user') || '[]'); return Array.isArray(a) ? a.filter((x) => typeof x === 'string') : []; } catch { return []; } };
  const setUserWords = (a) => ls.set('bw:spell:user', JSON.stringify([...new Set(a)].sort()));
  const enabled = (ed) => !!S.spell[ed];
  const saved = (ed) => ls.get(`bw:spell:${ed}`);
  eds.forEach((ed) => { if (saved(ed) === '1') S.spell[ed] = true; });
  const persist = (ed) => ls.set(`bw:spell:${ed}`, S.spell[ed] ? '1' : '0');

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
    async suggest(lang, word) {
      const k = `${lang}|${word}`;
      if (sugCache.has(k)) return sugCache.get(k);
      let s = [];
      try { s = this.mode === 'worker' ? (await this.wcall({ op: 'suggest', lang, word }, 10000)).s : (await this.hcall('suggest', { lang, word })).s; } catch { s = []; }
      sugCache.set(k, s);
      return s;
    },
  };

  /* ── tokens ── */
  const AR_RUN = /[ء-يٮ-ۓەۺ-ۿً-ٰٟ]+/g;
  const LAT_RUN = /[A-Za-zÀ-ɏ]+(?:['’][A-Za-zÀ-ɏ]+)*/g;
  const NOT_PROSE = /[0-9٠-٩۰-۹_@#\\/]|:\/\/|^www\.|\.(com|org|net|io|gov|json|html|pdf|docx|md|js|mjs|css|png|svg)\b/i;
  const TECH = () => new Set((sp.info?.tech || []).map((w) => w.toLowerCase()));
  let techSet = null;
  const skipLatin = (w) => w.length < 2 || w === w.toUpperCase() || /[a-z][A-Z]/.test(w);
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
          const start = m.index + k.index;
          if (lang === 'ar') { const w = norm.ar(raw); if (w.length < 2) continue; out.push({ leaf, lang, raw, word: w, start, end: start + raw.length }); } else {
            if (skipLatin(raw)) continue;
            // a Latin run glued to Arabic letters (an affix like «الـAPI») is not a word of either: only a run set apart counts
            out.push({ leaf, lang, raw, word: norm.en(raw), start, end: start + raw.length });
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
    if (it.lang === 'en') { techSet ||= TECH(); if (techSet.has(it.word.toLowerCase())) return true; }
    return false;
  };

  /* ── the scan: tokens, then the unknown words to the engine in chunks, then ranges and highlights ── */
  const HL = 'bw-spell';
  function marks() { try { CSS.highlights.set(HL, new Highlight(...sp.issues.flatMap((i) => [i.range, ...i.extra]))); } catch { /* no highlight API */ } }
  function clearMarks() { try { CSS.highlights?.delete(HL); } catch { /* no highlight API */ } }
  function summary() { document.documentElement.dataset.bwSpell = String(sp.issues.length); }
  async function scan() {
    const gen = ++sp.gen;
    const on = eds.filter((ed) => enabled(ed) && mainOf(ed));
    if (!on.length || !ENG.usable()) { sp.issues = []; sp.cur = -1; clearMarks(); summary(); sp.scanning = false; paint(); return; }
    sp.scanning = true;
    if (!sp.issues.length) { sp.scanningShown = true; paint(); } // a first scan with nothing yet to show says «checking»
    let t0 = performance.now();
    const toks = [];
    for (const ed of on) {
      for (const el of leaves(ed)) {
        leafTokens(el, ed, toks);
        if (performance.now() - t0 > 8) { await idle(); if (gen !== sp.gen) return; t0 = performance.now(); }
      }
    }
    const need = { ar: new Set(), en: new Set() };
    for (const it of toks) if (!okWord(it) && known[it.lang].get(it.word) === undefined) need[it.lang].add(it.word);
    try {
      for (const lang of eds) {
        if (!need[lang].size) continue;
        await ENG.ensure(lang);
        if (gen !== sp.gen) return;
        const all = [...need[lang]];
        for (let i = 0; i < all.length; i += 200) {
          const part = all.slice(i, i + 200);
          const bad = new Set(await ENG.check(lang, part));
          if (gen !== sp.gen) return;
          part.forEach((w) => known[lang].set(w, !bad.has(w)));
          await idle();
          if (gen !== sp.gen) return;
        }
      }
    } catch { sp.scanning = false; paint(); return; }
    // the issues, in document order, each with a live Range. A field that prints more than once (a running header on every page) is ONE issue
    // with one row; its other copies are marked too (`extra`), and fixing the field fixes them all, because the page draws them from the same text.
    const issues = [];
    const byKey = new Map();
    const firstOf = new Map(); // ed|path -> the first element that printed it
    t0 = performance.now();
    for (const it of toks) {
      if (okWord(it) || known[it.lang].get(it.word) !== false) continue;
      const lf = it.leaf;
      if (!lf.el.isConnected) continue;
      const fk = `${lf.ed}|${lf.path}`;
      if (!firstOf.has(fk)) firstOf.set(fk, lf.el);
      lf.seen ||= new Map();
      const nk = `${fk}|${it.raw}`;
      const nth = (lf.seen.get(nk) || 0) + 1;
      lf.seen.set(nk, nth);
      const a = place(lf.map, it.start, false);
      const b = place(lf.map, it.end, true);
      const range = document.createRange();
      try { range.setStart(a[0], a[1]); range.setEnd(b[0], b[1]); } catch { continue; }
      const key = `${nk}|${nth}`;
      if (sp.ignoreOne.has(key)) continue;
      if (firstOf.get(fk) !== lf.el && byKey.has(key)) { byKey.get(key).extra.push(range); continue; }
      const is = { id: issues.length, ed: lf.ed, el: lf.el, path: lf.path, raw: it.raw, word: it.word, lang: it.lang, range, extra: [], key: nk, nth, ctx: lf.text.slice(Math.max(0, it.start - 22), it.end + 22).replace(/\s+/g, ' ').trim(), sug: null };
      byKey.set(key, is);
      issues.push(is);
      if (issues.length >= 4000) break;
      if (performance.now() - t0 > 8) { await idle(); if (gen !== sp.gen) return; t0 = performance.now(); }
    }
    if (gen !== sp.gen) return;
    const sig = `${S.ed}|${S.ui}|${eds.map((e) => (enabled(e) ? 1 : 0)).join('')}|${issues.map((i) => `${i.key}|${i.nth}`).join(',')}`; // what the panel shows: the open edition's rows
    const same = sig === sp.sig && !sp.scanningShown;
    issues.forEach((i) => { const o = sp.byKey?.get(`${i.key}|${i.nth}`); if (o?.sug) i.sug = o.sug; else if (sugCache.has(`${i.lang}|${i.word}`)) i.sug = sugCache.get(`${i.lang}|${i.word}`); });
    sp.sig = sig;
    sp.byKey = new Map(issues.map((i) => [`${i.key}|${i.nth}`, i]));
    sp.issues = issues;
    if (sp.cur >= issues.length) sp.cur = issues.length - 1;
    sp.scanning = false;
    sp.scanningShown = false;
    marks();
    summary();
    if (!same) paint();
    loadSuggestions(gen); // a scan that finds the same issues still finishes the suggestions an earlier, superseded scan left unfetched
  }
  async function loadSuggestions(gen) {
    let n = 0;
    for (const is of sp.issues.filter((i) => i.ed === S.ed).slice(0, ROWS)) {
      if (gen !== sp.gen) return;
      if (is.sug) continue;
      is.sug = await ENG.suggest(is.lang, is.word);
      n += 1;
      if (n === 12) paint(); // the first screenful at once, the rest in one more repaint (a repaint per row is what made the panel janky)
    }
    if (n && gen === sp.gen) paint();
  }
  function schedule(ms = 600) {
    clearTimeout(sp.timer);
    sp.timer = setTimeout(() => { if (sp.composing) return schedule(300); scan(); }, ms);
  }

  /* ── native checker follows: ours when the engine runs, the browser's when it cannot ── */
  function native() {
    for (const ed of eds) mainOf(ed)?.setAttribute('spellcheck', enabled(ed) && !EXT.spell?.owns?.(ed) ? 'true' : 'false'); // owns() = enabled && the engine can run: the same rule as editor.js decorate()
  }
  function setEd(ed, on) {
    S.spell[ed] = on;
    persist(ed);
    native();
    buildUi();
    if (on) ENG.usable() && ENG.ensure(ed).catch(() => {});
    scan();
    paint();
  }

  /* ── the panel ── */
  const dictName = (ed) => (ed === 'ar' ? t('sp.dictAr') : t('sp.dictEn'));
  const lic = (ed) => (ed === 'ar' ? 'MPL 1.1' : 'BSD');
  const stateOf = (ed) => (!served ? 'unavail' : !enabled(ed) ? 'off' : ENG.state[ed] === 'idle' ? 'idle' : ENG.state[ed]);
  function chip(ed) {
    const s = stateOf(ed);
    const ver = ed === 'en' && sp.info?.langs?.en?.version ? ` ${esc(sp.info.langs.en.version)}` : '';
    return `<div class="sp-chip" data-ed="${ed}" data-st="${s}"><button type="button" class="sp-sw" data-k="spEd" data-v="${ed}" role="switch" aria-checked="${enabled(ed)}"${served ? '' : ' disabled'} aria-label="${esc(ed === 'ar' ? t('sp.edAr') : t('sp.edEn'))}"><span class="sp-ed" lang="${ed}">${ed === 'ar' ? 'ع' : 'EN'}</span><span class="sp-dot" aria-hidden="true"></span></button>
<div class="sp-meta"><b>${esc(dictName(ed))}${ver}</b><span>${esc(lic(ed))} · ${esc(t('sp.offline'))}</span><span class="sp-state">${esc(t(`sp.st.${s}`))}${s === 'error' ? ` <button type="button" class="b sp-retry" data-k="spRetry" data-v="${ed}">${esc(t('sp.retry'))}</button>` : ''}</span>${s === 'loading' ? `<span class="sp-bar" role="progressbar" aria-valuetext="${esc(t('sp.st.loading'))}"><i></i></span>` : ''}</div></div>`;
  }
  function rowHtml(is) {
    const sug = is.sug === null ? '' : is.sug.length ? is.sug.slice(0, 5).map((s, i) => `<button type="button" class="sp-s" data-k="spFix" data-i="${is.id}" data-n="${i}" lang="${is.lang}" title="${esc(t('sp.fixTitle', { s }))}">${esc(s)}</button>`).join('') : `<span class="sp-nosug">${esc(t('sp.noSug'))}</span>`;
    return `<li class="sp-row" data-i="${is.id}" data-ed="${is.ed}"${sp.cur === is.id ? ' aria-current="true"' : ''}><button type="button" class="sp-w" data-k="spGo" data-i="${is.id}" lang="${is.lang}">${esc(is.raw)}</button><span class="sp-ctx" lang="${is.lang}" dir="auto">${esc(is.ctx)}</span><div class="sp-sug">${sug}</div><div class="sp-act"><button type="button" class="b" data-k="spIgnore" data-i="${is.id}">${esc(t('sp.ignore'))}</button><button type="button" class="b" data-k="spIgnoreAll" data-i="${is.id}">${esc(t('sp.ignoreAll'))}</button><button type="button" class="b" data-k="spAdd" data-i="${is.id}">${esc(t('sp.add'))}</button></div></li>`;
  }
  function bodyHtml() {
    const mine = sp.issues.filter((i) => i.ed === S.ed);
    const u = userWords();
    const sumTxt = !served ? t('sp.noServer') : !enabled(S.ed) ? t('sp.off') : sp.scanning && !sp.issues.length ? t('sp.checking') : mine.length ? t('sp.issues', { n: mine.length }) : t('sp.none');
    return `<p class="hint sp-intro">${esc(t('sp.intro'))}</p>
<div class="sp-eds" role="group" aria-label="${esc(t('sp.title'))}">${eds.map(chip).join('')}</div>
<p class="sp-sum" role="status" aria-live="polite" data-n="${mine.length}">${esc(sumTxt)}</p>
<ul class="sp-list">${mine.slice(0, ROWS).map(rowHtml).join('')}${mine.length > ROWS ? `<li class="sp-more" role="note">${esc(t('sp.more', { n: mine.length - ROWS }))}</li>` : ''}</ul>
<div class="sp-nav"><button type="button" class="b" data-k="spPrev"${mine.length ? '' : ' disabled'}><span class="i">${I.up}</span><span class="w">${esc(t('sp.prev'))}</span></button><button type="button" class="b" data-k="spNext"${mine.length ? '' : ' disabled'}><span class="i">${I.down}</span><span class="w">${esc(t('sp.next'))}</span></button><span class="hint">${esc(t('sp.kbd'))}</span></div>
<details class="sp-my"><summary>${esc(t('sp.myDict', { n: u.length }))}</summary>${u.length ? `<ul class="sp-words">${u.map((w) => `<li><bdi>${esc(w)}</bdi><button type="button" class="b" data-k="spDel" data-v="${esc(w)}" aria-label="${esc(t('sp.remove', { w }))}"><span class="i">${I.x}</span></button></li>`).join('')}</ul>` : `<p class="hint">${esc(t('sp.myDictEmpty'))}</p>`}</details>`;
  }
  const panel = () => root.querySelector('.drawer .sp');
  function paint() {
    const p = panel();
    if (p && S.drawer === 'spell') {
      const keep = root.activeElement?.dataset?.k;
      const keepI = root.activeElement?.dataset?.i;
      const sc = p.querySelector('.sp-list')?.scrollTop || 0;
      p.innerHTML = bodyHtml();
      const l = p.querySelector('.sp-list');
      if (l) l.scrollTop = sc;
      if (keep && root.activeElement === null) p.querySelector(`[data-k="${keep}"]${keepI ? `[data-i="${keepI}"]` : ''}`)?.focus();
    }
    paintSettings();
  }
  function paintRow(is) {
    const li = panel()?.querySelector(`.sp-row[data-i="${is.id}"]`);
    if (li) li.outerHTML = rowHtml(is);
  }
  function paintSettings() {
    const c = root.querySelector('.drawer .set-x-spell');
    if (c) c.innerHTML = settingsHtml();
  }
  async function loadInfo() {
    if (sp.info0 || !served) return;
    sp.info0 = true;
    try { sp.info = await (await fetch('/api/spell/info', { cache: 'no-store' })).json(); techSet = null; } catch { /* the chips show the bundled names without versions */ }
    paint();
  }
  function open() {
    // the panel opens as the checker's tool: the open edition starts checking the first time (a later off stays off)
    if (saved(S.ed) === null && !S.spell[S.ed]) { S.spell[S.ed] = true; persist(S.ed); native(); buildUi(); }
    openDrawer('spell');
    loadInfo();
    if (served) eds.filter(enabled).forEach((ed) => ENG.ensure(ed).catch(() => {}));
    scan();
  }
  function toggle(ed = S.ed) { setEd(ed, !enabled(ed)); }
  /** The `spell` command (ribbon tool, palette, View menu switch): off -> on, with the panel; on, panel closed -> the panel; panel open -> off. */
  function act() {
    if (!enabled(S.ed)) { setEd(S.ed, true); open(); } else if (S.drawer !== 'spell') open(); else setEd(S.ed, false);
  }

  /* ── moving and fixing ── */
  const mineList = () => sp.issues.filter((i) => i.ed === S.ed);
  function go(is, { focus = false } = {}) {
    if (!is) return;
    sp.cur = is.id;
    const r = is.range;
    r.startContainer.parentElement?.scrollIntoView?.({ block: 'center', behavior: 'auto' });
    const s = getSelection();
    s.removeAllRanges();
    s.addRange(r.cloneRange());
    panel()?.querySelectorAll('.sp-row').forEach((li) => { if (+li.dataset.i === is.id) { li.setAttribute('aria-current', 'true'); li.scrollIntoView({ block: 'nearest' }); } else li.removeAttribute('aria-current'); });
    if (!is.sug) ENG.suggest(is.lang, is.word).then((s2) => { is.sug = s2; paintRow(is); });
    if (focus) panel()?.querySelector(`.sp-row[data-i="${is.id}"] .sp-w`)?.focus();
  }
  function step(d) {
    const l = mineList();
    if (!l.length) return;
    const k = l.findIndex((i) => i.id === sp.cur);
    go(l[(k < 0 ? (d > 0 ? 0 : l.length - 1) : (k + d + l.length) % l.length)], { focus: true });
  }
  /** One undo step, as the user: select the word in its field and type the replacement over it. */
  function fix(is, text) {
    const el = is.el.isConnected ? is.el : mainOf(is.ed)?.querySelector(`[data-p="${CSS.escape(is.path)}"]`);
    const r = is.range;
    if (!el || r.collapsed || r.toString() !== is.raw) { toast(t('sp.stale'), 'info'); scan(); return false; }
    el.focus({ preventScroll: true }); // the editor's focusin makes the field editable and starts a fresh typing group
    S.typingGroup = null;
    const s = getSelection();
    s.removeAllRanges();
    s.addRange(r.cloneRange());
    const ok = document.execCommand('insertText', false, text);
    S.typingGroup = null;
    if (!ok) { toast(t('sp.stale'), 'info'); scan(); return false; }
    window.dispatchEvent(new CustomEvent('bw:wm', { detail: { id: 'W04' } }));
    schedule(80);
    return true;
  }
  const issueOf = (x) => sp.issues.find((i) => i.id === +x.dataset.i);
  function drop(is) { sp.issues = sp.issues.filter((i) => i !== is); marks(); summary(); paint(); }
  function click(e) {
    const x = e.target.closest?.('button');
    const k = x?.dataset.k;
    if (!k || !k.startsWith('sp')) return false;
    const is = x.dataset.i !== undefined ? issueOf(x) : null;
    if (k === 'spEd') { toggle(x.dataset.v); setTimeout(() => root.querySelector(`.drawer .sp-sw[data-v="${x.dataset.v}"]`)?.focus(), 60); } // buildUi may reopen the Settings drawer: the switch keeps the focus
    else if (k === 'spRetry') { ENG.state[x.dataset.v] = 'idle'; ENG.ensure(x.dataset.v).then(scan).catch(() => {}); }
    else if (k === 'spGo') go(is, { focus: true });
    else if (k === 'spNext') step(1);
    else if (k === 'spPrev') step(-1);
    else if (k === 'spFix' && is) { const w = is.sug?.[+x.dataset.n]; if (w !== undefined) fix(is, w); }
    else if (k === 'spIgnore' && is) { sp.ignoreOne.add(`${is.key}|${is.nth}`); drop(is); }
    else if (k === 'spIgnoreAll' && is) { sp.ignoreAll.add(is.word); sp.issues = sp.issues.filter((i) => i.word !== is.word); marks(); summary(); paint(); }
    else if (k === 'spAdd' && is) { setUserWords([...userWords(), is.lang === 'en' ? is.word.toLowerCase() : is.word]); toast(t('sp.added', { w: is.raw }), 'ok'); sp.issues = sp.issues.filter((i) => i.word !== is.word); marks(); summary(); paint(); }
    else if (k === 'spDel') { setUserWords(userWords().filter((w) => w !== x.dataset.v)); scan(); paint(); }
    else if (k === 'spOpen') open();
    else return false;
    return true;
  }
  function drawer(d) {
    return {
      title: t('sp.title'),
      html: `<div class="sp" dir="${uiDir()}" lang="${S.ui}">${bodyHtml()}</div>`,
      mount: (dr) => {
        if (dr.__spClick) dr.removeEventListener('click', dr.__spClick);
        dr.__spClick = (e) => { if (S.drawer === 'spell') click(e); };
        dr.addEventListener('click', dr.__spClick);
      },
    };
  }
  /* ── Settings card ── */
  function settingsHtml() {
    const mb = (b) => ((b || 0) / 1048576).toFixed(1);
    const info = sp.info?.langs;
    return `<p class="hint">${esc(t('sp.intro'))}</p><div class="sp-eds">${eds.map(chip).join('')}</div>
<dl class="set-dl"><dt>${esc(t('sp.dictAr'))}</dt><dd>${esc(lic('ar'))} · ${esc(t('sp.set.size', { mb: mb(info?.ar?.bytes) }))}</dd><dt>${esc(t('sp.dictEn'))}</dt><dd>${esc(lic('en'))}${info?.en?.version ? ` · ${esc(info.en.version)}` : ''} · ${esc(t('sp.set.size', { mb: mb(info?.en?.bytes) }))}</dd></dl>
<p class="hint">${esc(t('sp.set.native'))}</p><p class="hint">${esc(t('sp.set.licence'))}</p>
<div class="btns"><button type="button" class="b primary" data-k="spOpen"><span class="i">${ic('spell')}</span><span class="w">${esc(t('sp.set.open'))}</span></button></div>`;
  }
  function settingsMount(card) {
    if (!card) return;
    loadInfo();
    if (card.__spClick) card.removeEventListener('click', card.__spClick);
    card.__spClick = (e) => { if (click(e)) e.stopPropagation(); };
    card.addEventListener('click', card.__spClick);
  }

  /* ── the marks' own CSS (the document is in the light DOM: the shadow root's styles do not reach it) ── */
  function css() {
    if (document.getElementById('bw-spell-css')) return;
    const s = document.createElement('style');
    s.id = 'bw-spell-css';
    // #a81a1f on the paper colour (#e9e6df and white) is the signal that passes 4.5:1 in light and in dark; the wavy line is the second cue (not colour alone)
    s.textContent = '::highlight(bw-spell) { text-decoration: underline wavy #a81a1f 1.5px; text-decoration-skip-ink: none; } @media print { ::highlight(bw-spell) { text-decoration: none; } }';
    document.head.appendChild(s);
  }
  function init() {
    css();
    document.addEventListener('compositionstart', () => { sp.composing = true; }, true);
    document.addEventListener('compositionend', () => { sp.composing = false; schedule(600); }, true);
    window.addEventListener('pagehide', () => ENG.w?.terminate?.());
    window.addEventListener('bw:server', () => { if (served) schedule(300); });
    native();
    if (eds.some(enabled)) { if (served) eds.filter(enabled).forEach((ed) => ENG.ensure(ed).catch(() => {})); schedule(300); }
    // 'spell' was a bare toggle in editor.js: it now also brings the panel (the same hook the ribbon, the palette and the View popover call)
    for (const holder of [window, window.BW]) {
      if (holder === window) runAction = spellWrap(runAction); else if (holder?.runAction) holder.runAction = spellWrap(holder.runAction);
    }
  }
  /** The `spell` command keeps core's toggle (it persists the switch and fires the `spell` event, which this module answers below); the panel comes with it: on and panel closed -> the panel only. */
  function spellWrap(o) {
    return function spellRun(a, ...r) {
      if (a !== 'spell') return o.call(this, a, ...r);
      if (enabled(S.ed) && S.drawer !== 'spell') { open(); return undefined; }
      return Promise.resolve(o.call(this, a, ...r)).then(() => { if (enabled(S.ed)) open(); });
    };
  }
  bwExt({
    drawers: { spell: drawer },
    settings: [{ id: 'spell', title: 'sp.title', icon: 'spell', html: settingsHtml, mount: settingsMount }],
    on: {
      boot: init,
      spell: (ed, on) => { native(); if (on && ENG.usable()) ENG.ensure(ed).catch(() => {}); scan(); paint(); }, // core's `spell` command (toggle + remembered switch) fired: start or stop the checker
      render: () => { native(); schedule(250); },
      commit: (ops, ed, kind) => { if (kind === 'type' || kind === 'commit' || kind === 'undo' || kind === 'redo') schedule(kind === 'type' ? 600 : 250); },
      keydown: (e) => {
        if (e.key !== 'F7') return false;
        e.preventDefault();
        if (S.drawer !== 'spell') open(); else step(e.shiftKey ? -1 : 1);
        return true;
      },
    },
    expose: { spell: { owns: (ed) => enabled(ed) && ENG.usable(), open, act, toggle, scan, enabled, next: () => step(1), prev: () => step(-1), issues: () => sp.issues.map((i) => ({ ed: i.ed, word: i.raw, lang: i.lang, path: i.path })), engine: () => ({ mode: ENG.mode, state: { ...ENG.state }, ms: { ...ENG.ms } }), ignoreCount: () => sp.ignoreAll.size } },
  });
  return { open };
})();
