  /* ── the scan: tokens, then the unknown words to the engine in chunks, then ranges and highlights ── */
  const HL = 'bw-spell';
  function marks() { try { CSS.highlights.set(HL, new Highlight(...sp.issues.flatMap((i) => [i.range, ...i.extra]))); } catch { /* no highlight API */ } }
  function clearMarks() { try { CSS.highlights?.delete(HL); } catch { /* no highlight API */ } }
  function summary() { document.documentElement.dataset.bwSpell = String(sp.issues.length); }
  async function scan() {
    const gen = ++sp.gen;
    const on = master ? eds.filter((ed) => mainOf(ed)) : [];
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
    if (served && !sp.infoDone) { await loadInfo(); if (gen !== sp.gen) return; } // the technical lists must be in before the first verdict, or «Playwright» is flagged until the panel is opened (later scans do not wait: they stay as quick as before)
    const need = { ar: new Set(), en: new Set() };
    for (const it of toks) {
      if (okWord(it)) continue;
      if (known[it.lang].get(it.word) === undefined) need[it.lang].add(it.word);
      if (it.join && known.en.get(it.join) === undefined) need.en.add(it.join);
    }
    try {
      for (const lang of eds) {
        if (!need[lang].size) continue;
        await ENG.ensure(lang);
        if (gen !== sp.gen) return;
        const all = [...need[lang]];
        for (let i = 0; i < all.length; i += 200) {
          const part = all.slice(i, i + 200);
          const bad = new Set(await smartCheck(lang, part));
          if (gen !== sp.gen) return;
          part.forEach((w) => known[lang].set(w, !bad.has(w)));
          await idle();
          if (gen !== sp.gen) return;
        }
      }
    } catch { sp.scanning = false; paint(); return; }
    // the words the document itself spells right and uses: they rank first when a suggestion is asked for
    sp.freq = { ar: new Map(), en: new Map() };
    for (const it of toks) { const k = it.lang === 'en' ? it.word.toLowerCase() : it.word; if (known[it.lang].get(it.word) === true || okWord(it)) sp.freq[it.lang].set(k, (sp.freq[it.lang].get(k) || 0) + 1); }
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
    const sig = `${S.ed}|${S.ui}|${master ? 1 : 0}|${issues.map((i) => `${i.key}|${i.nth}`).join(',')}`; // what the panel shows: the open edition's rows
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
    syncSide();
    if (!same) paint();
    syncRibbon();
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
    for (const ed of eds) mainOf(ed)?.setAttribute('spellcheck', master && !EXT.spell?.owns?.(ed) ? 'true' : 'false'); // owns() = enabled && the engine can run: the same rule as editor.js decorate()
  }
  /** The one switch: both dictionaries on or off together; the core's per-edition flags follow it. */
  function setOn(on) {
    master = !!on;
    syncCore();
    persist();
    native();
    buildUi();
    closeSide();
    if (master && ENG.usable()) eds.forEach((ed) => ENG.ensure(ed).catch(() => {}));
    scan();
    paint();
  }

  /* ── the panel ── */
  const dictName = (ed) => (ed === 'ar' ? t('sp.dictAr') : t('sp.dictEn'));
  const lic = (ed) => (ed === 'ar' ? 'MPL 1.1' : 'BSD');
  const stateOf = (ed) => (!served ? 'unavail' : !master ? 'off' : ENG.state[ed] === 'idle' ? 'idle' : ENG.state[ed]);
  function chip(ed) {
    const s = stateOf(ed);
    const ver = ed === 'en' && sp.info?.langs?.en?.version ? ` ${esc(sp.info.langs.en.version)}` : '';
    return `<div class="sp-chip sp-dict" data-ed="${ed}" data-st="${s}"><span class="sp-ed" lang="${ed}" aria-hidden="true">${ed === 'ar' ? 'ع' : 'EN'}<i class="sp-dot"></i></span>
<div class="sp-meta"><b>${esc(dictName(ed))}${ver}</b><span>${esc(lic(ed))} · ${esc(t('sp.offline'))}</span><span class="sp-state">${esc(t(`sp.st.${s}`))}${s === 'error' ? ` <button type="button" class="b sp-retry" data-k="spRetry" data-v="${ed}">${esc(t('sp.retry'))}</button>` : ''}</span>${s === 'loading' ? `<span class="sp-bar" role="progressbar" aria-valuetext="${esc(t('sp.st.loading'))}"><i></i></span>` : ''}</div></div>`;
  }
  /** The one switch, with both dictionaries under it. */
  function switchHtml() {
    return `<div class="sp-chip sp-master"><button type="button" class="sp-sw" data-k="spOn" role="switch" aria-checked="${master}"${served ? '' : ' disabled'} aria-label="${esc(t('sp.switch'))}"><span class="sp-knob" aria-hidden="true"></span></button>
<div class="sp-meta"><b>${esc(t('sp.switch'))} · ${esc(t(master ? 'sp.on' : 'sp.offw'))}</b><span>${esc(t('sp.switchHint'))}</span></div></div><div class="sp-eds">${eds.map(chip).join('')}</div>`;
  }
  function rowHtml(is) {
    const sug = is.sug === null ? '' : is.sug.length ? is.sug.slice(0, 5).map((s, i) => `<button type="button" class="sp-s" data-k="spFix" data-i="${is.id}" data-n="${i}" lang="${is.lang}" title="${esc(t('sp.fixTitle', { s }))}">${esc(s)}</button>`).join('') : `<span class="sp-nosug">${esc(t('sp.noSug'))}</span>`;
    return `<li class="sp-row" data-i="${is.id}" data-ed="${is.ed}"${sp.cur === is.id ? ' aria-current="true"' : ''}><button type="button" class="sp-w" data-k="spGo" data-i="${is.id}" lang="${is.lang}">${esc(is.raw)}</button><span class="sp-ctx" lang="${is.lang}" dir="auto">${esc(is.ctx)}</span><div class="sp-sug">${sug}</div><div class="sp-act"><button type="button" class="b" data-k="spIgnore" data-i="${is.id}">${esc(t('sp.ignore'))}</button><button type="button" class="b" data-k="spIgnoreAll" data-i="${is.id}">${esc(t('sp.ignoreAll'))}</button><button type="button" class="b" data-k="spAdd" data-i="${is.id}">${esc(t('sp.add'))}</button></div></li>`;
  }
  function bodyHtml() {
    const mine = sp.issues.filter((i) => i.ed === S.ed);
    const u = userWords();
    const sumTxt = !served ? t('sp.noServer') : !master ? t('sp.off') : sp.scanning && !sp.issues.length ? t('sp.checking') : mine.length ? t('sp.issues', { n: mine.length }) : t('sp.none');
    return `<p class="hint sp-intro">${esc(t('sp.intro'))}</p>
<div class="sp-sws" role="group" aria-label="${esc(t('sp.title'))}">${switchHtml()}</div>
<p class="sp-sum" role="status" aria-live="polite" data-n="${mine.length}">${esc(sumTxt)}</p>
<ul class="sp-list">${mine.slice(0, ROWS).map(rowHtml).join('')}${mine.length > ROWS ? `<li class="sp-more" role="note">${esc(t('sp.more', { n: mine.length - ROWS }))}</li>` : ''}</ul>
<div class="sp-nav"><button type="button" class="b" data-k="spPrev"${mine.length ? '' : ' disabled'}><span class="i">${I.up}</span><span class="w">${esc(t('sp.prev'))}</span></button><button type="button" class="b" data-k="spNext"${mine.length ? '' : ' disabled'}><span class="i">${I.down}</span><span class="w">${esc(t('sp.next'))}</span></button><span class="hint">${esc(t('sp.kbd'))}</span></div>
<details class="sp-my"><summary>${esc(t('sp.myDict', { n: u.length }))}</summary>${u.length ? `<ul class="sp-words">${u.map((w) => `<li><bdi>${esc(w)}</bdi><button type="button" class="b" data-k="spDel" data-v="${esc(w)}" aria-label="${esc(t('sp.remove', { w }))}"><span class="i">${I.x}</span></button></li>`).join('')}</ul>` : `<p class="hint">${esc(t('sp.myDictEmpty'))}</p>`}</details>
<details class="sp-my sp-ign"><summary>${esc(t('sp.ignoredList', { n: sp.ignoreAll.size }))}</summary>${sp.ignoreAll.size ? `<ul class="sp-words">${[...sp.ignoreAll].sort().map((w) => `<li><bdi>${esc(w)}</bdi><button type="button" class="b" data-k="spUnign" data-v="${esc(w)}" aria-label="${esc(t('sp.remove', { w }))}"><span class="i">${I.x}</span></button></li>`).join('')}</ul>` : `<p class="hint">${esc(t('sp.ignoredEmpty'))}</p>`}</details>`;
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
    syncRibbon();
  }
  function paintRow(is) {
    const li = panel()?.querySelector(`.sp-row[data-i="${is.id}"]`);
    if (li) li.outerHTML = rowHtml(is);
  }
  function paintSettings() {
    const c = root.querySelector('.drawer .set-x-spell .set-x-body'); // the body only, so the card keeps its title and icon
    if (c) c.innerHTML = settingsHtml();
  }
  function loadInfo() {
    if (!served) return Promise.resolve();
    sp.info0 = true;
    sp.infoP ||= (async () => {
      try { sp.info = await (await fetch('/api/spell/info', { cache: 'no-store' })).json(); techSet = null; tech.en = null; sp.lists = null; } catch { /* the chips show the bundled names without versions */ }
      sp.infoDone = true;
      paint();
    })();
    return sp.infoP;
  }
  function open() {
    // the list opens as the checker's tool: the very first time it also switches checking on (a later off stays off)
    if (!hasSaved() && !master) { master = true; syncCore(); persist(); native(); buildUi(); }
    openDrawer('spell');
    loadInfo();
    if (served && master) eds.forEach((ed) => ENG.ensure(ed).catch(() => {}));
    scan();
  }
  function toggle() { setOn(!master); }
  const act = toggle;

  /* ── moving and fixing ── */
  const mineList = () => sp.issues.filter((i) => i.ed === S.ed);
  function go(is, { focus = false } = {}) {
    if (!is) return;
    sp.cur = is.id;
    if (sp.side) openSide(is, { focus: false }); // the side panel follows «next» and «previous»
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
  const isKey = (i) => `${i.key}|${i.nth}`;
  /** Types the replacement over the word, as the user would (one undo step): select it in its field, execCommand('insertText'). No toast, no rescan: the callers do that. */
  function applyFix(is, text, batch = false) {
    const el = is.el.isConnected ? is.el : mainOf(is.ed)?.querySelector(`[data-p="${CSS.escape(is.path)}"]`);
    const r = is.range;
    if (!el || r.collapsed || r.toString() !== is.raw) return false;
    el.focus({ preventScroll: true }); // the editor's focusin makes the field editable and starts a fresh typing group
    if (!batch) S.typingGroup = null;
    const s = getSelection();
    s.removeAllRanges();
    s.addRange(r.cloneRange());
    const ok = document.execCommand('insertText', false, text);
    if (!batch) S.typingGroup = null;
    return ok;
  }
  const gone = (list) => { sp.issues = sp.issues.filter((i) => !list.includes(i)); marks(); summary(); paint(); };
  function fix(is, text) {
    if (!applyFix(is, text)) { toast(t('sp.stale'), 'info'); scan(); return false; }
    window.dispatchEvent(new CustomEvent('bw:wm', { detail: { id: 'W04' } }));
    sp.cur = -1;
    gone([is]);
    schedule(80);
    return true;
  }
  /** The same misspelling everywhere in the edition, replaced in ONE undo step: the undo groups are per edition, every edit joins one group opened in S.batchGroup (editor.js setText), no relabel afterwards. */
  function fixAll(is, text) {
    const same = sp.issues.filter((i) => i.ed === is.ed && i.raw === is.raw && i.word === is.word);
    let n = 0;
    const done = [];
    S.batchGroup = { g: newGroup(), n: 0 }; // setText (editor.js) puts every edit made while this is set into this one group
    S.typingGroup = null;
    try {
      for (const i of [...same].reverse()) if (applyFix(i, text, true)) { n += 1; done.push(i); } // last to first: an earlier range is never shifted by a later edit
    } finally { S.batchGroup = null; S.typingGroup = null; }
    if (!n) { toast(t('sp.stale'), 'info'); scan(); return false; }
    window.dispatchEvent(new CustomEvent('bw:wm', { detail: { id: 'W04' } }));
    toast(t('sp.fixedAll', { w: is.raw, n }), 'ok');
    sp.cur = -1;
    gone(done);
    schedule(80);
    return true;
  }
  const first = async (is) => is.sug?.[0] ?? (await ENG.suggest(is.lang, is.word))[0];
  function doIgnore(is) { sp.ignoreOne.add(isKey(is)); gone([is]); }
  function doIgnoreAll(is) { sp.ignoreAll.add(is.word); saveIgn(); gone(sp.issues.filter((i) => i.word === is.word)); }
  function doAdd(is) { setUserWords([...userWords(), is.lang === 'en' ? is.word.toLowerCase() : is.word]); toast(t('sp.added', { w: is.raw }), 'ok'); gone(sp.issues.filter((i) => i.word === is.word)); }
  /** The issue a tool acts on: the one the caret or selection is inside, else the one «next» last moved to. */
  function curIssue() {
    const s = getSelection();
    if (s.rangeCount) {
      const r = s.getRangeAt(0);
      const hit = sp.issues.find((i) => i.ed === S.ed && i.range.startContainer.isConnected && r.compareBoundaryPoints(Range.START_TO_START, i.range) >= 0 && r.compareBoundaryPoints(Range.END_TO_END, i.range) <= 0);
      if (hit) return hit;
    }
    return sp.issues.find((i) => i.id === sp.cur && i.ed === S.ed) || null;
  }

  /* ── the side panel (owner note 8; note 15: it floats OVER the pages: position fixed, nothing in the layout moves) ──
   * A non-modal <dialog> on the shadow root (outside .shell: the page's tokens reach it through the host), built here because ux.css's .bw-sidepanel is not ours to edit. */
  const sideEl = () => root.querySelector('.sp-side:not([data-slide])') || null; // a panel sliding out is already closed
  const issueOfKey = (k) => sp.issues.find((i) => isKey(i) === k) || null;
  function sideHtml(is) {
    const n = sp.issues.filter((i) => i.ed === is.ed && i.raw === is.raw).length;
    const sug = is.sug == null ? `<span class="sp-nosug">${esc(t('sp.checking'))}</span>`
      : is.sug.length ? is.sug.slice(0, 6).map((w, k) => `<button type="button" class="sp-s" data-k="spFix" data-i="${is.id}" data-n="${k}" lang="${is.lang}" title="${esc(t('sp.fixTitle', { s: w }))}">${esc(w)}</button>`).join('')
        : `<span class="sp-nosug">${esc(t('sp.noSug'))}</span>`;
    return `<header class="sp-sh"><h2>${esc(t('sp.panel.title'))}</h2><button type="button" class="b sp-x" data-k="spSideClose" aria-label="${esc(t('sp.panel.close'))}" title="${esc(t('sp.panel.close'))}"><span class="i">${I.x}</span></button></header>
<p class="sp-bigw" lang="${is.lang}" dir="auto"><bdi>${esc(is.raw)}</bdi></p>${n > 1 ? `<p class="hint">${esc(t('sp.panel.times', { n }))}</p>` : ''}
<h3 class="sp-h3">${esc(t('sp.panel.sugs'))}</h3><div class="sp-sug sp-sug-col" role="group" aria-label="${esc(t('sp.panel.sugs'))}">${sug}</div>
<div class="sp-act"><button type="button" class="b" data-k="spIgnore" data-i="${is.id}">${esc(t('sp.ignore'))}</button><button type="button" class="b" data-k="spIgnoreAll" data-i="${is.id}">${esc(t('sp.ignoreAll'))}</button><button type="button" class="b" data-k="spAdd" data-i="${is.id}">${esc(t('sp.add'))}</button></div>`;
  }
  function placeSide(el) {
    el.dir = uiDir();
    el.lang = S.ui;
  }
  function openSide(is, { focus = true } = {}) {
    if (!is) return;
    sp.cur = is.id;
    sp.side = isKey(is);
    sp.sideIs = is;
    let el = sideEl();
    if (!el) {
      el = document.createElement('dialog');
      el.className = 'sp-side bw-sidepanel'; // .bw-sidepanel (ux.css, explain lane): fixed to the right edge, over the pages, 220 ms human ease; sp-side carries the same rules when it is absent
      el.setAttribute('aria-label', t('sp.panel.title'));
      el.addEventListener('click', (e) => { if (click(e)) e.stopPropagation(); });
      el.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeSide(true); } });
      root.appendChild(el);
    }
    placeSide(el);
    el.innerHTML = sideHtml(is);
    if (typeof xplPanelVisible === 'function' && typeof xplPanelSet === 'function' && xplPanelVisible()) xplPanelSet(false, true); // temp: the stored bw:xpl-panel preference is not changed; the explanation panel and this one are never open together
    if (!el.open) { const show = () => el.show(); if (typeof bwSidePanelOpen === 'function') bwSidePanelOpen(el, show); else show(); }
    if (is.sug == null) ENG.suggest(is.lang, is.word).then((s2) => { is.sug = s2; if (sp.sideIs === is) refreshSide(is, { first: true }); });
    sp.sideFocus = focus;
    if (focus) (el.querySelector('.sp-s') || el.querySelector('[data-k="spIgnore"]'))?.focus({ preventScroll: true });
  }
  /** The panel's content again (suggestions arrived, a scan moved on); what had the focus inside it keeps it, else the first suggestion takes it. */
  function refreshSide(is, { first = false } = {}) {
    const el = sideEl();
    if (!el) return;
    const had = el.matches(':focus-within') || root.activeElement === null && sp.sideFocus;
    const k = root.activeElement?.dataset?.k;
    el.innerHTML = sideHtml(is);
    if (had) (k && k !== 'spFix' && !first ? el.querySelector(`[data-k="${k}"]`) : el.querySelector('.sp-s') || el.querySelector('[data-k="spIgnore"]'))?.focus({ preventScroll: true });
  }
  /** Closes the panel; refocus = the caret goes back to the word in the text (a closed panel never keeps the focus). */
  function closeSide(refocus = false) {
    const is = sp.sideIs;
    sp.side = null;
    sp.sideIs = null;
    const el = sideEl();
    if (el) {
      const gone = () => { if (el.open) el.close(); el.remove(); };
      if (typeof bwSidePanelClose === 'function') bwSidePanelClose(el, gone); else gone();
    }
    if (typeof xplPanelRelease === 'function') xplPanelRelease();
    if (refocus && is?.el?.isConnected) {
      is.el.focus({ preventScroll: true });
      try { if (!is.range.collapsed && is.range.toString() === is.raw) { const s = getSelection(); const c = is.range.cloneRange(); c.collapse(false); s.removeAllRanges(); s.addRange(c); } } catch { /* the range is gone: the field keeps its own caret (it sits just after the word otherwise) */ }
    }
  }
  /** After a scan: the panel follows its issue (the same word, the same place), or closes when that issue is gone. */
  function syncSide() {
    if (!sp.side) return;
    const is = issueOfKey(sp.side);
    if (!is) { closeSide(false); return; }
    sp.sideIs = is;
    refreshSide(is);
  }
  const inRects = (r, e) => { try { return [...r.getClientRects()].some((q) => e.clientX >= q.left - 1 && e.clientX <= q.right + 1 && e.clientY >= q.top - 1 && e.clientY <= q.bottom + 1); } catch { return false; } };
  /** A click on a marked word (the point inside one of the word's rects) opens the panel; a click anywhere else in the pages closes it. */
  function pageClick(e) {
    if (!master || e.defaultPrevented || e.button !== 0 || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
    const el = e.target.closest?.('#bw-pair [data-p]');
    if (!el) return;
    const s = getSelection();
    if (s.rangeCount && !s.isCollapsed) return; // a drag-selection is not a click on a word
    const hit = sp.issues.find((i) => (i.el.contains(el) || el.contains(i.el)) && [i.range, ...i.extra].some((r) => inRects(r, e)));
    if (hit) openSide(hit); else if (sp.side) closeSide(false);
  }

  /* ── clicks in the list drawer, the Settings card and the side panel ── */
  const issueOf = (x) => sp.issues.find((i) => i.id === +x.dataset.i);
  function click(e) {
    const x = e.target.closest?.('button');
    const k = x?.dataset.k;
    if (!k || !k.startsWith('sp')) return false;
    const is = x.dataset.i !== undefined ? issueOf(x) : null;
    const inSide = !!x.closest('.sp-side');
    if (k === 'spOn') { toggle(); setTimeout(() => root.querySelector('.drawer .sp-sw')?.focus(), 60); } // buildUi may reopen the Settings drawer: the switch keeps the focus
    else if (k === 'spRetry') { ENG.state[x.dataset.v] = 'idle'; ENG.ensure(x.dataset.v).then(scan).catch(() => {}); }
    else if (k === 'spGo') go(is, { focus: true });
    else if (k === 'spNext') step(1);
    else if (k === 'spPrev') step(-1);
    else if (k === 'spSideClose') closeSide(true);
    else if (k === 'spFix' && is) {
      const w = is.sug?.[+x.dataset.n];
      if (w !== undefined) { if (inSide) closeSide(false); fix(is, w); }
    } else if (k === 'spIgnore' && is) { if (inSide) closeSide(true); doIgnore(is); }
    else if (k === 'spIgnoreAll' && is) { if (inSide) closeSide(true); doIgnoreAll(is); }
    else if (k === 'spAdd' && is) { if (inSide) closeSide(true); doAdd(is); }
    else if (k === 'spDel') { setUserWords(userWords().filter((w) => w !== x.dataset.v)); scan(); paint(); }
    else if (k === 'spUnign') { sp.ignoreAll.delete(x.dataset.v); saveIgn(); scan(); paint(); }
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
    return `<p class="hint">${esc(t('sp.intro'))}</p><div class="sp-sws">${switchHtml()}</div>
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
  /** The Spelling tab's tools sit in the ribbon (25-ribbon.js draws them from the registry): the on/off tool shows its state, the count tool shows the number. */
  function syncRibbon() {
    const rb = root.querySelector('.ribbon');
    if (!rb) return;
    rb.querySelectorAll('[data-a="spell"]').forEach((b) => { if (b.getAttribute('aria-pressed') !== String(master)) b.setAttribute('aria-pressed', String(master)); });
    const n = String(master ? mineList().length : 0);
    rb.querySelectorAll('[data-a="spellCount"]').forEach((b) => {
      let k = b.querySelector('.sp-badge');
      if (!k) { k = document.createElement('b'); k.className = 'sp-badge'; k.setAttribute('aria-hidden', 'true'); b.querySelector('.i')?.appendChild(k); }
      if (k.textContent !== n) k.textContent = n;
      const tip = `${t('spellCount')}: ${n}`;
      if (b.title !== tip) b.title = tip;
    });
  }
  const ribbonHit = (m) => m.type === 'childList' && m.target.nodeType === 1 && m.target.matches('.rb-panel, .rb-tools, .rb-g, .ribbon, [data-a="spellCount"], [data-a="spellCount"] .i');
  let rbRaf = 0;
  /* ── the Spelling tab's commands (owner note 9) ── */
  const needOn = () => { if (master) return true; toast(t('sp.off'), 'info'); return false; };
  const ACTIONS = {
    spellNext: () => { if (needOn()) { if (mineList().length) step(1); else toast(t('sp.noMore'), 'ok'); } },
    spellPrev: () => { if (needOn()) { if (mineList().length) step(-1); else toast(t('sp.noMore'), 'ok'); } },
    spellFix: async () => {
      if (!needOn()) return;
      const is = curIssue();
      if (!is) { toast(t('sp.nothingSel'), 'info'); return; }
      const w = await first(is);
      if (w === undefined) toast(t('sp.noSug'), 'info'); else fix(is, w);
    },
    spellFixAll: async () => {
      if (!needOn()) return;
      const is = curIssue();
      if (!is) { toast(t('sp.nothingSel'), 'info'); return; }
      const w = await first(is);
      if (w === undefined) toast(t('sp.noSug'), 'info'); else fixAll(is, w);
    },
    spellIgnore: () => { if (!needOn()) return; const is = curIssue(); if (is) doIgnore(is); else toast(t('sp.nothingSel'), 'info'); },
    spellIgnoreAll: () => { if (!needOn()) return; const is = curIssue(); if (is) doIgnoreAll(is); else toast(t('sp.nothingSel'), 'info'); },
    spellAdd: () => { if (!needOn()) return; const is = curIssue(); if (is) doAdd(is); else toast(t('sp.nothingSel'), 'info'); },
    spellCount: () => open(),
    spellLang: () => toast(t('sp.langInfo', { l: t(`sp.langName.${S.ed}`) }), 'info'),
  };
  function init() {
    css();
    document.addEventListener('compositionstart', () => { sp.composing = true; }, true);
    document.addEventListener('compositionend', () => { sp.composing = false; schedule(600); }, true);
    document.addEventListener('click', pageClick);
    window.addEventListener('pagehide', () => ENG.w?.terminate?.());
    window.addEventListener('bw:server', () => { if (served) schedule(300); });
    new MutationObserver((ms) => { if (!rbRaf && ms.some(ribbonHit)) rbRaf = requestAnimationFrame(() => { rbRaf = 0; syncRibbon(); }); }).observe(root, { childList: true, subtree: true });
    native();
    if (served) loadInfo();
    if (master) { if (served) eds.forEach((ed) => ENG.ensure(ed).catch(() => {})); schedule(300); }
    syncRibbon();
  }
  bwExt({
    cmds: Object.keys(ACTIONS).map((id) => ({ id, group: 'view' })),
    actions: ACTIONS,
    drawers: { spell: drawer },
    settings: [{ id: 'spell', title: 'sp.title', icon: 'spell', html: settingsHtml, mount: settingsMount }],
    on: {
      boot: init,
      // core's `spell` command (the ribbon tool, the palette, the View switch) toggled the open edition: the one switch follows it, both dictionaries together
      spell: (ed, on) => { master = !!on; syncCore(); persist(); if (!master) closeSide(); native(); if (master && ENG.usable()) eds.forEach((e) => ENG.ensure(e).catch(() => {})); scan(); paint(); },
      render: () => { native(); schedule(250); },
      commit: (ops, ed, kind) => { if (kind === 'type' || kind === 'commit' || kind === 'undo' || kind === 'redo') schedule(kind === 'type' ? 600 : 250); },
      keydown: (e) => {
        if (e.key === 'Escape' && sp.side) { closeSide(true); return true; }
        if (e.key !== 'F7') return false;
        e.preventDefault();
        if (S.drawer !== 'spell') open(); else step(e.shiftKey ? -1 : 1);
        return true;
      },
    },
    expose: { spell: { check: async (lang, words) => { await ENG.ensure(lang); await loadInfo(); return smartCheck(lang, [...new Set(words)]); }, suggest: async (lang, word) => { await ENG.ensure(lang); return ENG.suggest(lang, word); }, rawSuggest: async (lang, word) => { await ENG.ensure(lang); return ENG.rawSuggest(lang, word); }, rawCheck: async (lang, words) => { await ENG.ensure(lang); return ENG.check(lang, words); }, owns: () => master && ENG.usable(), open, act, toggle, scan, enabled, next: () => step(1), prev: () => step(-1), issues: () => sp.issues.map((i) => ({ ed: i.ed, word: i.raw, lang: i.lang, path: i.path })), engine: () => ({ mode: ENG.mode, state: { ...ENG.state }, ms: { ...ENG.ms } }), ignoreCount: () => sp.ignoreAll.size, side: () => (sp.sideIs ? { word: sp.sideIs.raw, ed: sp.sideIs.ed } : null), closeSide } },
  });
  return { open };
})();
