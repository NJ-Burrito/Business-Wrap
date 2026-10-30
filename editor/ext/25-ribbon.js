/* 0.14.0 · UX-RIBBON — a Word-style ribbon: tabs → groups → tools (R1), a selection that survives a tool press (R2).
 * The legacy sections stay in the toolbar's markup (hidden by 25-ribbon.css), so every older hook still finds them; the ribbon
 * is mounted inside the island, after it (`.ribbon`, kept out of syncUi's morph by UI_RUNTIME), and fed from the same CMDS
 * registry and the same buttons (`data-a`), so one click handler (onBar) runs every command. No command is invented here.
 * A contextual tab (Table · Picture · Diagram) appears while that selection exists and stays until it is gone; the docked
 * selection section (.ctx) stays as the shortcut strip. Keyboard: a tap on Alt, arrows, Home/End, Down into the tools, Esc out. */
const RB = { tab: 'home', collapsed: ls.get('bw:rb:c') === '1', peek: false, ctx: null, key: '', snap: null, altOnly: false };
/** [tab, [group, ids, dense?]…]; an id that no command has is skipped at draw time, a command no group lists lands in «more» (rbSweep). */
const RB_TABS = [
  ['file', [['save', ['save', 'saveHtml', 'import', 'exportEdits', 'exportAll']], ['share', ['library', 'shShare']], ['export', ['export*', 'print', 'exportPdf']], ['newdoc', ['newdoc', 'process']]]],
  ['home', [['edit', ['undo', 'redo', 'find', 'copyBlock', 'pasteBlock']], ['font', ['fmtBold', 'fmtItalic', 'fmtUnderline', 'fmtStrike', 'fmtCode', 'fmtLink', 'fmtColor', 'fmtFont', 'fmtSize', 'fmtClear'], 1],
    ['para', ['fmtAlignStart', 'fmtAlignCenter', 'fmtAlignEnd', 'fmtJustify', 'fmtTop', 'fmtMiddle', 'fmtBottom', 'fmtLine', 'fmtBefore', 'fmtAfter', 'fmtQuote', 'fmtBullets', 'fmtNumbers', 'fmtShapes', 'fmtIndent', 'fmtOutdent'], 1],
    ['block', ['duplicate', 'delete', 'moveUp', 'moveDown', 'comment']]]],
  ['insert', [['content', ['image', 'logo', 'addDiagram', 'addPara', 'insTable', 'insSection', 'insChapter', 'insTextBox']], ['story', ['addStory', 'storyPoint', 'storyCard']], ['wrap', ['wrapInline', 'wrapSquare', 'wrapTight', 'wrapThrough', 'wrapTopBottom', 'wrapBehind', 'wrapFront'], 1],
    ['rows', ['rowAdd', 'rowDel', 'rowUp', 'rowDown', 'colAdd', 'colDel']], ['cells', ['cellMerge', 'cellSplit', 'cellWrap', 'cellFill', 'cellColW', 'cellRowH', 'cellClearValue', 'cellClearFormat']]]],
  ['layout', [['page', ['pgSetup', 'pgBreak', 'breakBefore', 'keepNext', 'pages', 'renumber']], ['gaps', ['pgBreakAdd', 'pgBreakDel', 'pgPullUp', 'secDel', 'pgEmpty']],
    ['header', ['hdrText', 'hdrField', 'hdrLogo', 'every', 'hdrStart', 'hdrCenter', 'hdrEnd', 'hdrDelete', 'hdrScope']], ['footer', ['ftrText', 'ftrField', 'hdrConf', 'ftrStart', 'ftrCenter', 'ftrEnd', 'ftrDelete', 'ftrScope']],
    ['front', ['tocHide', 'tocAdd', 'fmRowAdd', 'fmRowDel', 'fmColAdd', 'fmColDel']]]],
  ['design', [['design', ['theme', 'styleThis', 'hideBlock']]]],
  ['review', [['check', ['check', 'history', 'outline', 'find', 'comment']], ['flow', ['timeline', 'bulkEdit', 'webhooks']], ['sign', ['pvOpen', 'pvSign', 'lkToggle']]]],
  ['view', [['view', ['view', 'side', 'both', 'uiLang', 'dir*', 'dark', 'calm', 'focus', 'spell', 'snap', 'settings']], ['zoom', ['zoomOut', 'zoomReset', 'zoomIn', 'zoomFit']], ['pages', ['view.continuous', 'view.single', 'view.spread']]]],
  ['table', [['rows', ['rowAdd', 'rowDel', 'rowUp', 'rowDown']], ['cols', ['colAdd', 'colDel']], ['cells', ['cellMerge', 'cellSplit', 'cellWrap', 'cellFill', 'cellColW', 'cellRowH', 'cellClearValue', 'cellClearFormat']], ['tblblock', ['duplicate', 'delete', 'moveUp', 'moveDown', 'comment', 'styleThis', 'hideBlock', 'breakBefore', 'keepNext']]], 'table'],
  ['picture', [['pic', ['replace', 'caption', 'every', 'ovDelete']], ['wrap', ['wrapInline', 'wrapSquare', 'wrapTight', 'wrapThrough', 'wrapTopBottom', 'wrapBehind', 'wrapFront'], 1]], 'picture'],
  ['diagram', [['nodes', ['dgStaff', 'dgApplicant', 'dgStart', 'dgPayment', 'dgRework', 'dgSystem', 'dgDecision', 'dgOk', 'dgStop', 'dgNote', 'dgGroup', 'dgText'], 1], ['dgflow', ['dgAuto', 'dgReset', 'dgFlow', 'dgLegend', 'dgMermaidIn', 'dgMermaidOut']],
    ['shape', ['dgLabel', 'dgSub', 'dgConnect', 'dgDup', 'dgDel', 'dgFront', 'dgBack']], ['arrange', ['dgAlignL', 'dgAlignC', 'dgAlignR', 'dgAlignT', 'dgAlignM', 'dgAlignB', 'dgDistH', 'dgDistV', 'dgWrap'], 1],
    ['arrow', ['dgEdgeLabel', 'dgBendAdd', 'dgBendDel', 'dgRouteAuto', 'dgReverse', 'dgFrom', 'dgTo']], ['dgzoom', ['dgZoomIn', 'dgZoomOut', 'dgZoomFit', 'dgZoom100'], 1]], 'diagram'],
];
const RB_LISTED = new Set(RB_TABS.flatMap((x) => x[1].flatMap((g) => g[1])));
const RB_PRESSED = { dark: () => S.dark, calm: () => S.calm, focus: () => S.focus, snap: () => S.snap, side: () => S.side, both: () => S.both };
const RB_SKIP = new Set(['uiLang', 'dir']); // drawn by their own tokens («dir*»)
/** The tab ids the ribbon draws now: the general ones, plus the contextual one while its selection exists. */
const rbTabs = () => RB_TABS.filter((x) => !x[2] || x[2] === RB.ctx);
/** What is selected, as a contextual tab id: a picture/logo, a diagram, or a table (a cell range counts). null = nothing. */
function rbCtxNow() {
  try {
    if (S.selOv != null) return 'picture';
    if (S.dg && typeof dgContext === 'function' && dgContext()) return 'diagram';
    if (EXT.cells?.state?.sel?.size || tableCtx()) return 'table';
  } catch { /* a selection mid-change: no contextual tab this round */ }
  return null;
}
function rbBtn(id) {
  if (id === 'ovDelete') return btn('ovDelete', { label: t('delete') }).replace('<span class="i"></span>', `<span class="i">${ic('delete')}</span>`);
  const c = CMDS.find((x) => x.id === id);
  const pressed = RB_PRESSED[id] ? !!RB_PRESSED[id]() : undefined;
  return btn(id, { cls: id === 'save' ? 'primary' : '', tip: TIPS[id] ? t(TIPS[id]) : c?.key ? `${t(id)} (${c.key})` : '', pressed });
}
function rbGroups() {
  const out = rbTabs().map(([tab, groups]) => {
    const gs = groups.map(([g, ids, dense]) => {
      const items = ids.map((id) => {
        if (id === 'export*') return typeof pcExportMenu === 'function' ? pcExportMenu() : '';
        if (id === 'dir*') return ['rtl', 'ltr'].map((d) => `<button type="button" class="b" data-a="dir" data-d="${d}" aria-pressed="${uiDir() === d}" title="${esc(t(d === 'rtl' ? 'ux.dirRtl' : 'ux.dirLtr'))}"><span class="i">${ic('dir')}</span><span class="w">${esc(t(d))}</span></button>`).join('');
        if (RB_SKIP.has(id) && id !== 'uiLang') return '';
        const known = CMDS.some((c) => c.id === id) || ['rowUp', 'rowDown', 'replace', 'caption', 'every', 'ovDelete'].includes(id);
        if (!known) return '';
        return rbBtn(id);
      }).filter(Boolean);
      return { g, items, dense };
    }).filter((x) => x.items.length);
    return { tab, gs };
  });
  // every command a group above forgot (a later extension's) still has a place: the last general tab's «more» group
  const rest = CMDS.filter((c) => !RB_LISTED.has(c.id) && !RB_SKIP.has(c.id)).map((c) => rbBtn(c.id));
  if (rest.length) out.find((x) => x.tab === 'view').gs.push({ g: 'more', items: rest, dense: false });
  return out;
}
const rbTabWord = (tab) => t(`rb.tab.${tab}`);
function rbHtml() {
  const all = rbGroups();
  if (!all.some((x) => x.tab === RB.tab)) RB.tab = 'home';
  const tabs = all.map(({ tab }) => {
    const on = tab === RB.tab, ctx = tab === RB.ctx;
    return `<button type="button" class="rb-tab${ctx ? ' ctx' : ''}" role="tab" id="rb-tab-${tab}" data-rb="tab" data-tab="${tab}" aria-selected="${on}" aria-controls="rb-panel" tabindex="${on ? 0 : -1}"><span class="rb-tl" data-alt="${esc(tAltRb(tab))}">${esc(rbTabWord(tab))}</span></button>`;
  }).join('');
  const cur = all.find((x) => x.tab === RB.tab);
  const panel = cur.gs.map(({ g, items, dense }) => `<div class="rb-g${dense ? ' dense' : ''}" role="group" aria-label="${esc(t(`rb.g.${g}`))}"><div class="rb-tools">${items.join('')}</div><span class="rb-gl" aria-hidden="true">${esc(t(`rb.g.${g}`))}</span></div>`).join('');
  return `<div class="rb-bar"><div class="rb-tabs" role="tablist" aria-label="${esc(t('rb.label'))}">${tabs}</div><span class="rb-sp"></span><button type="button" class="rb-col" data-rb="collapse" aria-expanded="${!RB.collapsed}" aria-controls="rb-panel" title="${esc(t(RB.collapsed ? 'rb.expand' : 'rb.collapse'))}" aria-label="${esc(t(RB.collapsed ? 'rb.expand' : 'rb.collapse'))}"><span class="rb-chev" aria-hidden="true"></span></button></div><div class="rb-panel" id="rb-panel" role="tabpanel" aria-labelledby="rb-tab-${RB.tab}"${RB.collapsed && !RB.peek ? ' hidden' : ''}>${panel}</div>`;
}
function tAltRb(tab) { const o = S.ui; S.ui = other(o); const w = rbTabWord(tab); S.ui = o; return w; }
/** The new markup is patched into the live ribbon node by node (uiMorph), so a language or direction toggle never replaces the tools. */
function rbPaint(el, html) {
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  const ak = [...el.childNodes], bk = [...tpl.content.childNodes];
  bk.forEach((n, i) => { if (ak[i]) uiMorph(ak[i], n); else el.appendChild(n); });
  ak.slice(bk.length).forEach((n) => n.remove());
}
/** One pass: mount if missing, redraw when something the ribbon shows changed, refresh the pressed states otherwise. */
function rbSync() {
  const isl = root.querySelector('.island');
  if (!isl) return;
  let el = isl.querySelector(':scope > .ribbon');
  if (!el) { el = document.createElement('div'); el.className = 'ribbon'; isl.appendChild(el); RB.key = ''; rbWire(el); }
  const now = rbCtxNow();
  if (now !== RB.ctx) {
    const was = RB.ctx;
    RB.ctx = now;
    if (now) RB.tab = now; // the contextual tab opens once, when the selection starts
    else if (RB.tab === was) RB.tab = 'home';
    RB.peek = false;
  }
  const key = [S.ui, uiDir(), RB.ctx, RB.tab, RB.collapsed, RB.peek, CMDS.length].join('|');
  if (key !== RB.key) {
    const had = el.contains(root.activeElement) && root.activeElement?.closest?.('.rb-tab') ? root.activeElement.dataset.tab : null;
    RB.key = key;
    el.dir = 'rtl'; // the toolbar never moves with the language (0.10.0); the keys read the computed direction
    rbPaint(el, rbHtml());
    if (had) el.querySelector(`#rb-tab-${had}`)?.focus({ preventScroll: true });
  }
  el.querySelectorAll('[data-a]').forEach((b) => { const p = RB_PRESSED[b.dataset.a]; if (p) b.setAttribute('aria-pressed', String(!!p())); });
  el.querySelectorAll('[data-a="dir"]').forEach((b) => b.setAttribute('aria-pressed', String(uiDir() === b.dataset.d)));
  isl.classList.toggle('rb-collapsed', RB.collapsed);
}

/* ── tabs, collapse, keyboard ──────────────────────────────────────────────── */
function rbSetTab(tab, { focus = false } = {}) {
  if (RB.collapsed && RB.tab === tab && RB.peek) { RB.peek = false; } else { RB.tab = tab; if (RB.collapsed) RB.peek = true; }
  rbSync();
  if (focus) root.querySelector(`#rb-tab-${tab}`)?.focus({ preventScroll: true });
}
function rbCollapse(on) {
  RB.collapsed = on ?? !RB.collapsed;
  RB.peek = false;
  ls.set('bw:rb:c', RB.collapsed ? '1' : '0');
  rbSync();
}
const rbDirSign = (el) => (getComputedStyle(el).direction === 'rtl' ? -1 : 1); // +1: the next item is to the right
function rbMove(list, from, key, el) {
  const i = list.indexOf(from);
  const s = rbDirSign(el);
  let to = -1;
  if (key === 'ArrowRight') to = i + s; else if (key === 'ArrowLeft') to = i - s; else if (key === 'Home') to = 0; else if (key === 'End') to = list.length - 1;
  if (to < 0 || to >= list.length) return null;
  return list[to];
}
function rbWire(el) {
  el.addEventListener('click', (e) => {
    const x = e.target.closest('[data-rb]');
    if (!x) { if (e.target.closest('button[data-a]') && RB.collapsed && RB.peek) { RB.peek = false; rbSync(); } return; }
    if (x.dataset.rb === 'tab') rbSetTab(x.dataset.tab);
    else if (x.dataset.rb === 'collapse') rbCollapse();
  });
  el.addEventListener('dblclick', (e) => { if (e.target.closest('.rb-tab')) rbCollapse(); });
  el.addEventListener('keydown', (e) => {
    const tab = e.target.closest?.('.rb-tab');
    const tabs = [...el.querySelectorAll('.rb-tab')];
    if (tab) {
      if (e.key === 'ArrowDown') { e.preventDefault(); el.querySelector('.rb-panel [data-a], .rb-panel button')?.focus({ preventScroll: true }); return; }
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); rbSetTab(tab.dataset.tab, { focus: true }); return; }
      const to = rbMove(tabs, tab, e.key, el);
      if (to) { e.preventDefault(); to.focus({ preventScroll: true }); if (!RB.collapsed) rbSetTab(to.dataset.tab, { focus: true }); }
      return;
    }
    const b = e.target.closest?.('.rb-panel button');
    if (!b) return;
    const tools = [...el.querySelectorAll('.rb-panel button:not(:disabled)')];
    if (e.key === 'Escape') { e.preventDefault(); if (RB.collapsed && RB.peek) { RB.peek = false; rbSync(); } root.querySelector(`#rb-tab-${RB.tab}`)?.focus({ preventScroll: true }); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); root.querySelector(`#rb-tab-${RB.tab}`)?.focus({ preventScroll: true }); return; }
    const to = rbMove(tools, b, e.key, el);
    if (to) { e.preventDefault(); to.focus({ preventScroll: true }); }
  });
}
// a tap on Alt (nothing else pressed with it) puts the focus on the active tab, as in Word; Alt+arrows etc. are the editor's own
document.addEventListener('keydown', (e) => { RB.altOnly = e.key === 'Alt' && !e.ctrlKey && !e.shiftKey && !e.metaKey && !e.repeat; }, true);
document.addEventListener('keyup', (e) => {
  if (e.key !== 'Alt' || !RB.altOnly) return;
  RB.altOnly = false;
  const tab = root.querySelector(`.ribbon #rb-tab-${RB.tab}`);
  if (!tab) return;
  e.preventDefault();
  if (root.activeElement === tab) { const sel = document.querySelector('#bw-pair [data-p]'); sel?.focus?.({ preventScroll: true }); } else tab.focus({ preventScroll: true });
});

/* ── R2: a tool never costs the selection ──────────────────────────────────── */
/** What is selected right now: the page's text range (as nodes and as a path + character offsets, which outlives a re-render),
 *  the cell range, the picked block / picture / drawing. */
function rbOffset(el, node, off) { const r = document.createRange(); r.selectNodeContents(el); r.setEnd(node, off); return r.toString().length; }
function rbAt(el, n) { // the text position n characters into el
  const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let left = n, last = null;
  for (let x = w.nextNode(); x; x = w.nextNode()) { last = x; if (left <= x.length) return [x, left]; left -= x.length; }
  return last ? [last, last.length] : [el, 0];
}
function rbSnap() {
  const s = getSelection();
  let range = null, at = null;
  if (s.rangeCount) {
    const r = s.getRangeAt(0);
    const n = r.commonAncestorContainer;
    const host = (n.nodeType === 1 ? n : n.parentElement)?.closest?.('#bw-pair');
    if (host) {
      range = r.cloneRange();
      const el = (n.nodeType === 1 ? n : n.parentElement).closest('[data-p]');
      if (el && el.contains(r.startContainer) && el.contains(r.endContainer)) at = { p: el.dataset.p, ed: el.closest('main.bw-doc')?.dataset.locale, a: rbOffset(el, r.startContainer, r.startOffset), z: rbOffset(el, r.endContainer, r.endOffset) };
    }
  }
  const ce = EXT.cells?.state;
  const cells = ce?.sel?.size ? { cells: [...ce.sel].map((k) => k.split(',').map(Number)), tbl: { ed: ce.ed, rows: ce.rows, b: ce.b } } : null;
  return { range, at, cells, sel: S.sel, selOv: S.selOv, dg: S.dg };
}
const rbHasText = (snap) => { const s = getSelection(); if (!s.rangeCount || (s.isCollapsed && snap?.at && snap.at.a !== snap.at.z)) return false; const n = s.getRangeAt(0).commonAncestorContainer; return !!(n.nodeType === 1 ? n : n.parentElement)?.closest?.('#bw-pair') && n.isConnected; };
/** The text range back by its path, once a re-render replaced the nodes the old range pointed at. */
function rbRestoreText(snap) {
  if (!snap?.at || rbHasText(snap)) return;
  const main = [...document.querySelectorAll('#bw-pair main.bw-doc')].find((m) => m.dataset.locale === snap.at.ed) || document.querySelector('#bw-pair main.bw-doc');
  const el = main && [...main.querySelectorAll('[data-p]')].find((x) => x.dataset.p === snap.at.p);
  if (!el || (document.activeElement?.closest?.('#bw-pair') === null && document.activeElement && document.activeElement !== document.body && !document.activeElement.closest?.('#bw-ui-host') && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName))) return;
  if (!el.isContentEditable) el.contentEditable = 'plaintext-only';
  el.focus({ preventScroll: true });
  const [sn, so] = rbAt(el, snap.at.a), [en, eo] = rbAt(el, snap.at.z);
  const r = document.createRange();
  r.setStart(sn, so); r.setEnd(en, eo);
  const s = getSelection(); s.removeAllRanges(); s.addRange(r);
}
/** Puts back what the press itself took away (never what the user deselected before it: the snapshot is taken at the press). */
function rbRestore(snap) {
  if (!snap) return;
  let again = false;
  if (snap.range?.startContainer.isConnected && snap.range.endContainer.isConnected) {
    const s = getSelection();
    const r = s.rangeCount ? s.getRangeAt(0) : null;
    if (!r || r.compareBoundaryPoints(Range.START_TO_START, snap.range) || r.compareBoundaryPoints(Range.END_TO_END, snap.range)) { s.removeAllRanges(); s.addRange(snap.range.cloneRange()); }
  } else rbRestoreText(snap);
  if (snap.cells && EXT.cells && !EXT.cells.state.sel.size) { EXT.cells.select(snap.cells.cells, snap.cells.tbl); again = true; }
  if (snap.sel && !S.sel && S.selOv == null && !S.dg) { S.sel = snap.sel; again = true; }
  if (snap.selOv != null && S.selOv == null && !S.sel && !S.dg) { S.selOv = snap.selOv; again = true; }
  if (snap.dg && !S.dg && !S.sel && S.selOv == null) { S.dg = snap.dg; again = true; }
  if (again) { try { paintSel(); if (S.dg && typeof dgPaint === 'function') dgPaint(); } catch { /* repaint is best effort */ } refreshUi(); }
}
const RB_PRESS = 'button, [role="tab"], summary, .more, .menu';
const RB_TEXT = 'input, select, textarea, [contenteditable]';
function rbShellWire() {
  const shell = root.querySelector('.shell');
  if (!shell || shell.bwRb) return;
  shell.bwRb = true;
  // the press never moves focus or the selection off the page (a button is not a text field), and what was selected is put back before the command runs
  shell.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    RB.snap = rbSnap();
    if (e.target.closest?.(RB_PRESS) && !e.target.closest?.(RB_TEXT)) e.preventDefault();
  }, true);
  shell.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') RB.snap = rbSnap(); }, true);
  shell.addEventListener('click', () => {
    const snap = RB.snap;
    RB.snap = null;
    rbRestore(snap);
    RB.last = snap;
    setTimeout(() => { if (RB.last === snap) RB.last = null; }, 1000);
    // the command is async and may redraw the page: look again once it has (text only; a command that selects something itself is left alone)
    for (const ms of [30, 120, 400]) setTimeout(() => rbRestoreText(snap), ms);
  }, true);
}
{ const o = buildCtx; buildCtx = function (b, tb) { o(b, tb); rbShellWire(); rbSync(); }; } // refreshUi and every (re)build end in buildCtx

bwExt({ on: { render: () => { if (RB.last) rbRestoreText(RB.last); } }, expose: { ribbon: { listed: () => [...RB_LISTED].filter((x) => !/\*$/.test(x)), tabs: () => rbTabs().map((x) => x[0]), state: RB, sync: rbSync, snap: rbSnap, restore: rbRestore, restoreText: rbRestoreText, setTab: rbSetTab, collapse: rbCollapse } } });
