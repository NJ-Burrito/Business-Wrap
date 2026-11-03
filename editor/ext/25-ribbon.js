/* 0.14.0 · UX-RIBBON — a Word-style ribbon: tabs → groups → tools (R1), a selection that survives a tool press (R2).
 * The legacy sections stay in the toolbar's markup (hidden by 25-ribbon.css), so every older hook still finds them; the ribbon
 * is mounted inside the island, after it (`.ribbon`, kept out of syncUi's morph by UI_RUNTIME), and fed from the same CMDS
 * registry and the same buttons (`data-a`), so one click handler (onBar) runs every command. No command is invented here.
 * A contextual tab (Table · Picture · Diagram) appears while that selection exists and stays until it is gone; the docked
 * selection section (.ctx) stays as the shortcut strip. Keyboard: a tap on Alt, arrows, Home/End, Down into the tools, Esc out. */
const RB = { tab: 'home', collapsed: ls.get('bw:rb:c') === '1', ctx: null, key: '', base: '', cache: new Map(), snap: null, altOnly: false };
/** One tab: [id, [group, ids]…, contextual selection id | null, tab colour token, ] — the allocation of the 0.15.0 ribbon (note 7). A tab holds at most RB_MAX_TOOLS tools in at most
 *  RB_MAX_GROUPS groups, so the panel never needs a scroll bar (note 3); an id that no command has is skipped at draw time, a command no group lists lands in «more» (rbSweep). */
const RB_MAX_TOOLS = 28, RB_MAX_GROUPS = 6;
const RB_TABS = [
  ['file', [['save', ['save', 'saveHtml', 'import']], ['share', ['library', 'shShare']], ['newdoc', ['newdoc', 'process']]], null, '--bw-sec-file'],
  ['export', [['xpdf', ['export.pdf.ar', 'export.pdf.en', 'export.pdf.both']], ['xdocx', ['export.docx.ar', 'export.docx.en', 'export.docx.both']], ['xweb', ['export.html', 'export.printHtml.ar', 'export.printHtml.en', 'export.printHtml.both', 'export.edits', 'export.editsAll', 'export.pack']],
    ['xdiagram', ['export.mermaid', 'export.svg', 'export.png']], ['xprint', ['print', 'exportPdf', 'export.opts']], ['xproj', ['projExport', 'projImport']]], null, '--bw-sec-export'],
  ['home', [['edit', ['undo', 'redo', 'find', 'copyBlock', 'pasteBlock']], ['block', ['duplicate', 'delete', 'moveUp', 'moveDown', 'comment']]], null, '--bw-sec-edit'],
  ['font', [['fontface', ['fmtFont', 'fmtSize', 'fmtColor']], ['style', ['fmtBold', 'fmtItalic', 'fmtUnderline', 'fmtStrike', 'fmtCode']], ['fother', ['fmtLink', 'fmtClear']]], null, '--bw-sec-font'],
  ['para', [['align', ['fmtAlignStart', 'fmtAlignCenter', 'fmtAlignEnd', 'fmtJustify', 'fmtJustifyLow', 'fmtJustifyMedium', 'fmtJustifyHigh', 'fmtTop', 'fmtMiddle', 'fmtBottom']], ['spacing', ['fmtLine', 'fmtBefore', 'fmtAfter']],
    ['lists', ['fmtQuote', 'fmtBullets', 'fmtNumbers', 'fmtShapes', 'fmtIndent', 'fmtOutdent']]], null, '--bw-sec-para'],
  ['insert', [['content', ['image', 'logo', 'addDiagram', 'addPara', 'insTable', 'insSection', 'insChapter', 'insTextBox']], ['story', ['addStory', 'addOutputStory', 'addOutputsChapter', 'storyPoint', 'storyCard']],
    ['wrap', ['wrapInline', 'wrapSquare', 'wrapTight', 'wrapThrough', 'wrapTopBottom', 'wrapBehind', 'wrapFront']]], null, '--bw-sec-insert'],
  ['layout', [['page', ['pgSetup', 'pgBreak', 'breakBefore', 'keepNext', 'pages', 'renumber']], ['gaps', ['pgBreakAdd', 'pgBreakDel', 'pgPullUp', 'secDel', 'pgEmpty']],
    ['front', ['tocHide', 'tocAdd', 'fmRowAdd', 'fmRowDel', 'fmColAdd', 'fmColDel']]], null, '--bw-sec-gaps'],
  ['hf', [['header', ['hdrText', 'hdrField', 'hdrLogo', 'every', 'hdrStart', 'hdrCenter', 'hdrEnd', 'hdrDelete', 'hdrScope']], ['footer', ['ftrText', 'ftrField', 'hdrConf', 'ftrStart', 'ftrCenter', 'ftrEnd', 'ftrDelete', 'ftrScope']]], null, '--bw-sec-header'],
  ['design', [['design', ['theme', 'styleThis', 'hideBlock']], ['appearance', ['dark', 'calm', 'focus']]], null, '--bw-sec-design'],
  ['review', [['check', ['check', 'history', 'outline', 'find', 'comment']], ['flow', ['timeline', 'bulkEdit', 'webhooks']], ['sign', ['pvOpen', 'pvSign', 'lkToggle']]], null, '--bw-sec-document'],
  ['spelling', [['spOn', ['spell', 'spellCount', 'spellLang']], ['spMove', ['spellPrev', 'spellNext']], ['spFix', ['spellFix', 'spellFixAll']], ['spDict', ['spellIgnore', 'spellIgnoreAll', 'spellAdd']]], null, '--bw-sec-spell'],
  ['view', [['view', ['view', 'side', 'both', 'spell', 'snap', 'settings']], ['zoom', ['zoomOut', 'zoomPct', 'zoomIn', 'zoomReset', 'zoomFit', 'zoomHeight']], ['pages', ['view.continuous', 'view.single', 'view.spread']]], null, '--bw-sec-view'],
  ['table', [['rows', ['rowAdd', 'rowDel', 'rowUp', 'rowDown']], ['cols', ['colAdd', 'colDel']], ['cells', ['cellMerge', 'cellSplit', 'cellWrap', 'cellFill', 'cellColW', 'cellRowH', 'cellClearValue', 'cellKeepEmpty', 'cellClearFormat']],
    ['tblblock', ['duplicate', 'delete', 'moveUp', 'moveDown', 'comment', 'styleThis', 'hideBlock', 'breakBefore', 'keepNext']]], 'table', '--bw-sec-table'],
  ['picture', [['pic', ['replace', 'caption', 'every', 'ovDelete']], ['wrap', ['wrapInline', 'wrapSquare', 'wrapTight', 'wrapThrough', 'wrapTopBottom', 'wrapBehind', 'wrapFront']]], 'picture', '--bw-sec-footer'],
  ['diagram', [['nodes', ['dgStaff', 'dgApplicant', 'dgStart', 'dgPayment', 'dgRework', 'dgSystem', 'dgDecision', 'dgOk', 'dgStop', 'dgNote', 'dgGroup', 'dgText']],
    ['dgflow', ['dgAuto', 'dgReset', 'dgLegend', 'dgMermaidIn', 'dgMermaidOut']], ['dgzoom', ['dgZoomIn', 'dgZoomOut', 'dgZoomFit', 'dgZoom100']], ['legend', ['dgLgText', 'dgLgLook', 'dgLgDel', 'dgLgReset']]], 'diagram', '--bw-sec-diagram'],
  ['diagram2', [['shape', ['dgLabel', 'dgSub', 'dgConnect', 'dgDup', 'dgDel', 'dgFront', 'dgBack']], ['arrange', ['dgAlignL', 'dgAlignC', 'dgAlignR', 'dgAlignT', 'dgAlignM', 'dgAlignB', 'dgDistH', 'dgDistV', 'dgWrap']],
    ['arrow', ['dgEdgeLabel', 'dgBendAdd', 'dgBendDel', 'dgRouteAuto', 'dgRoute', 'dgHead', 'dgTail', 'dgLine', 'dgWeight', 'dgReverse', 'dgFrom', 'dgTo']]], 'diagram', '--bw-sec-diagram'],
];
const RB_ALIAS = ['exportEdits', 'exportAll']; // the old File-tab twins of export.edits / export.editsAll: one tool each now, on the Export tab
const RB_LISTED = new Set([...RB_TABS.flatMap((x) => x[1].flatMap((g) => g[1])), ...RB_ALIAS]);
const RB_PRESSED = { dark: () => S.dark, calm: () => S.calm, focus: () => S.focus, snap: () => S.snap, side: () => S.side, both: () => S.both, spell: () => !!(S.spell && (S.spell.ar || S.spell.en)) }; // spell: the one switch of 0.15.2 keeps S.spell.ar and .en equal
const RB_SKIP = new Set(['uiLang', 'dir']); // the language and direction pills live in the quick strip only (note 8)
/** The tab definitions with the sweep merged in: a command no group lists goes to View's «more» group, or to a tab of its own («tools») once View would pass the cap. */
function rbDefs() {
  if (RB.defs && RB.defsN === CMDS.length) return RB.defs;
  const defs = RB_TABS.map((x) => x.slice());
  const rest = CMDS.filter((c) => !RB_LISTED.has(c.id) && !RB_SKIP.has(c.id)).map((c) => c.id);
  if (rest.length) {
    const vi = defs.findIndex((x) => x[0] === 'view');
    const used = defs[vi][1].reduce((n, g) => n + g[1].length, 0);
    if (used + rest.length <= RB_MAX_TOOLS && defs[vi][1].length < RB_MAX_GROUPS) defs[vi] = [defs[vi][0], [...defs[vi][1], ['more', rest]], ...defs[vi].slice(2)];
    else {
      const gs = [];
      for (let i = 0; i < rest.length && gs.length < RB_MAX_GROUPS; i += 12) gs.push(['more', rest.slice(i, i + 12)]);
      defs.splice(vi + 1, 0, ['tools', gs, null, '--bw-sec-file']);
    }
  }
  RB.defs = defs; RB.defsN = CMDS.length;
  return defs;
}
/** The tab ids the ribbon draws now: the general ones, plus the contextual ones while their selection exists. */
const rbTabs = () => rbDefs().filter((x) => !x[2] || x[2] === RB.ctx);
/** What is selected, as a contextual tab id: a picture/logo, a diagram, or a table (a cell range counts). null = nothing. */
function rbCtxNow() {
  try {
    if (S.selOv != null) return 'picture';
    if (S.dg && typeof dgContext === 'function' && dgContext()) return 'diagram';
    if (EXT.cells?.state?.sel?.size || tableCtx()) return 'table';
  } catch { /* a selection mid-change: no contextual tab this round */ }
  return null;
}
/** A tool's name under its icon: a ribbon-short word (rb.s.<id>) when the full one needs three lines in a 64 px cell, the command's own word, or the ribbon's word for a command that has none yet (rb.n.<id>). */
function rbLabel(id) {
  const D = I18N.ui[S.ui] || {};
  if (D[`rb.s.${id}`]) return D[`rb.s.${id}`];
  if (D[id] ?? I18N.ui.en[id]) return t(id);
  return D[`rb.n.${id}`] ?? I18N.ui.en[`rb.n.${id}`] ?? t(id);
}
/** The Export tab's tools say why they cannot run, as the old Export menu did (a server-only format, no diagram, no edition). */
function rbExportExtra(id) {
  if (!/^export\./.test(id) || typeof pcServer !== 'function') return '';
  const need = !pcServer() && pcServerOnly(id);
  const noDg = !pcDiagrams().length && /^export\.(mermaid|svg|png)$/.test(id);
  const l = /\.(ar|en)$/.exec(id)?.[1];
  const note = need ? t('export.needsServer') : noDg ? t('export.noDiagram') : l && !M[S.svc][l] ? t('export.noEdition') : '';
  return note ? ` aria-disabled="true" data-note="${esc(note)}"` : '';
}
function rbBtn(id) {
  if (id === 'ovDelete') return btn('ovDelete', { label: t('delete') }).replace('<span class="i"></span>', `<span class="i">${ic('delete')}</span>`);
  const c = CMDS.find((x) => x.id === id);
  const pressed = RB_PRESSED[id] ? !!RB_PRESSED[id]() : undefined;
  return btn(id, { label: rbLabel(id), cls: id === 'save' ? 'primary' : '', tip: TIPS[id] ? t(TIPS[id]) : c?.key ? `${rbLabel(id)} (${c.key})` : rbLabel(id), pressed, extra: rbExportExtra(id) });
}
const RB_EXTRA_KNOWN = ['rowUp', 'rowDown', 'replace', 'caption', 'every', 'ovDelete'];
/** The export options (page range, cover page, save folder) the old Export menu held: a button that opens a small menu with just those fields; they feed the same pcOpts() the Export tab's tools read. */
function rbExportOpts() {
  if (typeof pcOpts !== 'function') return '';
  const o = pcOpts(), srv = typeof pcServer === 'function' && pcServer(), name = rbLabel('export.opts');
  return `<div class="more pcx"><button type="button" class="b" data-a="more" data-x="export.opts" aria-expanded="false" aria-haspopup="true" title="${esc(name)}"><span class="i">${ic('prefs')}</span><span class="w">${esc(name)}</span></button>
<div class="menu pc-menu" role="group" aria-label="${esc(name)}" hidden><div class="pc-opts">
  <label class="pc-f"><span>${esc(t('export.range'))}</span><input type="text" data-pc="range" inputmode="numeric" placeholder="1-3,5" value="${esc(o.range)}" spellcheck="false"></label>
  <label class="pc-c"><input type="checkbox" data-pc="cover" ${o.cover ? 'checked' : ''}> <span>${esc(t('export.cover'))}</span></label>
  ${srv ? `<label class="pc-f wide"><span>${esc(t('export.folder'))}</span><input type="text" data-pc="folder" placeholder="${esc(t('export.folderHint'))}" value="${esc(o.folder)}" spellcheck="false" dir="ltr"></label>` : `<p class="pc-note">${esc(t('export.offline'))}</p>`}
  <p class="pc-note">${esc(t('export.noWatermark'))}</p>
</div></div></div>`;
}
const rbItem = (id) => (id === 'export.opts' ? rbExportOpts() : RB_SKIP.has(id) || !(CMDS.some((c) => c.id === id) || RB_EXTRA_KNOWN.includes(id)) ? '' : rbBtn(id));
const rbTabWord = (tab) => t(`rb.tab.${tab}`);
/** One tab's groups as markup; a group whose commands are all absent is left out. */
function rbPanelInner(tab) {
  const def = rbDefs().find((x) => x[0] === tab);
  // 0.16.1 (fault 6): the shape-and-arrow tab follows what is selected, as the floating bar does: a shape shows its own tools and arrangement, an arrow its tools
  const hide = tab === 'diagram2' ? (RB.dgKind === 'shape' ? ['arrow'] : RB.dgKind === 'arrow' ? ['shape', 'arrange'] : []) : [];
  return (def ? def[1] : []).filter((x) => !hide.includes(x[0])).map(([g, ids]) => ({ g, items: ids.map(rbItem).filter(Boolean) })).filter((x) => x.items.length)
    .map(({ g, items }) => `<div class="rb-g" role="group" aria-label="${esc(t(`rb.g.${g}`))}"><div class="rb-tools">${items.join('')}</div><span class="rb-gl" aria-hidden="true">${esc(t(`rb.g.${g}`))}</span></div>`).join('');
}
/** What the Export tab's tools depend on besides the language: the service and its editions, a diagram in the document, a server. */
const rbStamp = () => [S.svc, Object.keys(M[S.svc] || {}).join(''), typeof pcDiagrams === 'function' && pcDiagrams().length ? 1 : 0, typeof pcServer === 'function' && pcServer() ? 1 : 0].join(',');
function rbHtml() {
  const defs = rbTabs();
  if (!defs.some((x) => x[0] === RB.tab)) RB.tab = 'home';
  const tabs = defs.map(([tab, , ctx, color]) => {
    const on = tab === RB.tab, w = rbTabWord(tab);
    return `<button type="button" class="rb-tab${ctx ? ' ctx' : ''}" role="tab" id="rb-tab-${tab}" data-rb="tab" data-tab="${tab}" style="--tc: var(${color})" aria-selected="${on}"${on ? ` aria-expanded="${!RB.collapsed}"` : ''} aria-controls="rb-panel" aria-label="${esc(w)}" tabindex="${on ? 0 : -1}"><span class="rb-ti" aria-hidden="true">${ic(`rbt.${tab}`)}</span><span class="rb-tl" data-alt="${esc(tAltRb(tab))}">${esc(w)}</span></button>`;
  }).join('');
  return `<div class="rb-bar"><div class="rb-tabs" role="tablist" aria-label="${esc(t('rb.label'))}">${tabs}</div><button type="button" class="rb-col" data-rb="collapse" aria-expanded="${!RB.collapsed}" aria-controls="rb-panel" title="${esc(t(RB.collapsed ? 'rb.expand' : 'rb.collapse'))}" aria-label="${esc(t(RB.collapsed ? 'rb.expand' : 'rb.collapse'))}"><span class="rb-chev" aria-hidden="true">${ic('rbt.collapse')}</span></button></div><div class="rb-panel" id="rb-panel" role="tabpanel" data-tab="${RB.tab}" aria-labelledby="rb-tab-${RB.tab}"${RB.collapsed ? ' hidden' : ''}>${RB.collapsed ? '' : rbPanelInner(RB.tab)}</div>`;
}
function tAltRb(tab) { const o = S.ui; S.ui = other(o); const w = rbTabWord(tab); S.ui = o; return w; }
/** The selected tab, the tab stops and the collapsed state, read from RB: the only thing a tab press changes on the bar. */
function rbMark(el) {
  el.querySelectorAll('.rb-tab').forEach((x) => {
    const on = x.dataset.tab === RB.tab;
    x.setAttribute('aria-selected', String(on));
    x.tabIndex = on ? 0 : -1;
    if (on) x.setAttribute('aria-expanded', String(!RB.collapsed)); else x.removeAttribute('aria-expanded');
  });
  const col = el.querySelector('.rb-col');
  if (col) { const w = t(RB.collapsed ? 'rb.expand' : 'rb.collapse'); col.setAttribute('aria-expanded', String(!RB.collapsed)); col.title = w; col.setAttribute('aria-label', w); }
}
/** Tab words: they stay while the tabs fit; first the gaps and padding tighten («tight»), only then do the unselected tabs shrink to their icon (the name stays in aria-label
 *  and the right-hand explainer). 0.15.9: a viewport media query used to drop the words at any width under 1280 px (a 1920 px screen at 150 % zoom is 1280 px) whether or not
 *  there was room; now only a measurement decides, and it runs again whenever the bar's own width changes (resize, zoom, a drawer, the contextual tab joining). */
function rbFitTabs(el) {
  const tabs = el?.querySelector('.rb-tabs');
  if (!tabs) return;
  tabs.classList.remove('icons', 'tight');
  const over = () => tabs.scrollWidth > tabs.clientWidth + 1;
  if (!over()) return;
  tabs.classList.add('tight');
  if (over()) { tabs.classList.remove('tight'); tabs.classList.add('icons'); }
}
const rbNarrow = () => window.matchMedia('(max-width: 1023px)').matches;
let rbFitRaf = 0;
const rbFitSoon = () => { if (!rbFitRaf) rbFitRaf = requestAnimationFrame(() => { rbFitRaf = 0; const el = root.querySelector('.island > .ribbon'); if (el) rbFitTabs(el); ctxFit(); }); };
window.addEventListener('resize', rbFitSoon);
if (document.fonts?.ready) document.fonts.ready.then(rbFitSoon); // the words measure wider once the real font is in
document.fonts?.addEventListener?.('loadingdone', () => { const c = root.querySelector('.island > .ctx'); if (c && !c.hidden && !ctxFits(c)) ctxFit.force = true; rbFitSoon(); }); // a font file arriving later (the first time its weight is drawn) changes the words' widths again

/* ── 0.15.9 · the selection strip fits its row ─────────────────────────────────────────────────────────────────────────────────────
 * The strip (.ctx) is one 42 px row (Z5). It holds the title, the first tools and a «More» menu. ctxFit measures the room the row gives it and chooses, from the roomiest
 * look to the tightest: title + words, title as an icon + words, icon only; at each look as many tools as fit, the rest in «More» (a popover: never clipped).
 * The tools are the same nodes in the strip and in the menu (moved, never rebuilt), so a click, a pressed state and a disabled state work wherever they sit. */
function ctxMoreEl(sb) {
  const f = sb.__fit;
  if (!f.more) {
    const d = document.createElement('div');
    d.className = 'more';
    d.innerHTML = `<button type="button" class="b" data-a="more" aria-expanded="false" aria-haspopup="true" title="${esc(t('more'))}"><span class="i">${ic('more')}</span><span class="w">${esc(t('more'))}</span></button><div class="menu" role="group" aria-label="${esc(t('more'))}" hidden></div>`;
    f.more = d;
  }
  return f.more;
}
/** Put the first n tools in the strip (in order, before the zoom keys and «More») and the others in the menu. */
function ctxPlace(sb, n) {
  const f = sb.__fit;
  const open = f.more?.querySelector('.menu[data-open="1"]');
  if (open) return; // never rearrange under an open menu: it is re-fitted when it closes
  const keep = sb.querySelector(':scope > .keep-tools');
  const more = ctxMoreEl(sb);
  const menu = more.querySelector('.menu');
  const rest = f.all.slice(n);
  const want = [...f.all.slice(0, n), ...(keep ? [keep] : []), ...(rest.length ? [more] : [])];
  if (want.length !== sb.children.length || want.some((el, i) => sb.children[i] !== el)) { want.forEach((el) => sb.appendChild(el)); [...sb.children].filter((e) => !want.includes(e)).forEach((e) => e.remove()); }
  rest.forEach((el) => { if (el.parentNode !== menu) menu.appendChild(el); });
}
function ctxFits(ctx) {
  const box = ctx.getBoundingClientRect();
  const cs = getComputedStyle(ctx);
  const lo = box.left + (parseFloat(cs.borderLeftWidth) || 0) + (parseFloat(cs.paddingLeft) || 0) - 0.5;
  const hi = box.right - (parseFloat(cs.borderRightWidth) || 0) - (parseFloat(cs.paddingRight) || 0) + 0.5;
  for (const e of ctx.querySelectorAll(':scope > .sc, .sb > *')) { const r = e.getBoundingClientRect(); if (r.width && (r.left < lo || r.right > hi)) return false; }
  return true;
}
function ctxFit() {
  const ctx = root.querySelector('.island > .ctx');
  const sb = ctx?.querySelector('.sb');
  if (!ctx || ctx.hidden || !sb) return;
  const run = () => {
    if (!sb.__fit) { // a fresh strip from buildCtx: take stock of its tools in their order (the strip's, then the menu's)
      const menu = sb.querySelector(':scope > .more > .menu');
      sb.__fit = { all: [...[...sb.children].filter((e) => !e.matches('.keep-tools, .more')), ...(menu ? [...menu.children] : [])], more: sb.querySelector(':scope > .more') };
      const st = ctx.querySelector('.sc .st'); if (st) ctx.querySelector('.sc').title = st.textContent;
    }
    const N = sb.__fit.all.length;
    const looks = [[''], ['nolabel'], ['nolabel nowords']];
    let chosen = null;
    for (let li = 0; li < looks.length && !chosen; li += 1) {
      ctx.dataset.fit = looks[li][0];
      ctxPlace(sb, N);
      if (ctxFits(ctx)) { chosen = { li, n: N }; break; }
      // widths of the tools at this look, to pick the largest n that fits; verified by a real measure below
      for (let n = N - 1; n >= (li === looks.length - 1 ? 0 : Math.min(N, 3)); n -= 1) { ctxPlace(sb, n); if (ctxFits(ctx)) { chosen = { li, n }; break; } }
    }
    if (!chosen) { ctx.dataset.fit = looks[2][0]; ctxPlace(sb, 0); }
  };
  // 0.16.0: the same strip in the same room is not re-fitted: the loop below moves tools in and out of «More» to measure, which is hundreds of DOM changes per key
  // (tests/files-perf D1). The room is the strip's width, its title's width, its tool count and language; any of them changing fits again.
  const sc0 = ctx.querySelector(':scope > .sc');
  const sig = [ctx.getBoundingClientRect().width.toFixed(1), sc0 ? sc0.getBoundingClientRect().width.toFixed(1) : 0, sb.getBoundingClientRect().left.toFixed(1), ctx.dataset.fit || '', sb.__fit ? sb.__fit.all.length : sb.children.length, ctx.dataset.key || '', document.documentElement.lang, document.fonts?.status || ''].join('|');
  if (sb.__fit && sb.__fitSig === sig && !ctxFit.force) return;
  ctxFit.force = false;
  // the title's own width changes when the real font arrives, and so does a tool's (a font file is loaded the first time its weight is drawn, a picker shows another value):
  // every part of the row is watched, and a part that grew past the row fits it again even though the row's own width did not change
  if (ctxRo) { ctxRo.disconnect(); ctxRo.observe(ctx); for (const e of ctx.querySelectorAll(':scope > .sc, .sb > *')) ctxRo.observe(e); }
  RB.ctxBusy = true;
  // 0.16.0 (U1): moving a node from the strip into «More» (or back) blurs it. A tool that held the keyboard keeps it: the same node is focused again after the fit,
  // and when it now sits in the closed menu, the «More» button takes the keyboard (never the page).
  const held = ctx.contains(root.activeElement) ? root.activeElement : null;
  try { run(); } finally { RB.ctxBusy = false; ctxMo?.takeRecords(); }
  if (held && root.activeElement !== held) {
    const target = held.isConnected && !held.closest('.menu[hidden]') && !held.disabled ? held : ctx.querySelector('.sb > .more > [data-a="more"]') || ctx.querySelector('.sb .b:not([disabled])');
    target?.focus({ preventScroll: true });
  }
  sb.__fitSig = sb.__fit?.more?.querySelector('.menu[data-open="1"]') ? '' : sig;
}
let ctxMo = null, ctxRo = null;
if (typeof MutationObserver === 'function') {
  let ctxEl = null;
  const watch = () => {
    const ctx = root.querySelector('.island > .ctx');
    if (!ctx || ctx === ctxEl) return;
    ctxEl = ctx;
    ctxMo?.disconnect(); ctxRo?.disconnect();
    ctxMo = new MutationObserver(() => { if (RB.ctxBusy) return; ctxFit(); ctxMo.takeRecords(); rbFitSoon(); });
    ctxMo.observe(ctx, { childList: true, attributes: true, attributeFilter: ['hidden', 'data-key'] });
    ctxRo = new ResizeObserver(() => { if (!RB.ctxBusy && !ctxFits(ctx)) ctxFit.force = true; rbFitSoon(); });
    ctxRo.observe(ctx);
    ctxFit();
  };
  new MutationObserver(watch).observe(root, { childList: true, subtree: true });
  watch();
}
/** The new markup is patched into the live ribbon node by node (uiMorph), so a language or direction toggle never replaces the tools. */
function rbPaint(el, html) {
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  const ak = [...el.childNodes], bk = [...tpl.content.childNodes];
  bk.forEach((n, i) => { if (ak[i]) uiMorph(ak[i], n, true); else el.appendChild(n); });
  ak.slice(bk.length).forEach((n) => n.remove());
  syncUndoState();
  rbFitTabs(el);
}
/** 0.15.0 perf (booster 6): when only the tab (or the collapsed state) changed, the panel's children are swapped from a markup cached per tab and language, direction,
 *  selection and service: no morph, no per-node attribute copy, no second decorate pass. The cache is never live nodes, so a swapped-in panel carries no stale disabled state. */
function rbSwap(el) {
  const pn = el.querySelector('.rb-panel');
  rbMark(el);
  pn.hidden = RB.collapsed;
  pn.setAttribute('aria-labelledby', `rb-tab-${RB.tab}`);
  if (RB.collapsed || (pn.dataset.tab === RB.tab && pn.firstElementChild)) return;
  let tpl = RB.cache.get(`${RB.tab}|${RB.dgKind}`);
  if (!tpl) { tpl = document.createElement('template'); tpl.innerHTML = rbPanelInner(RB.tab); if (RB.tab !== 'export') RB.cache.set(`${RB.tab}|${RB.dgKind}`, tpl); } // Export holds live option fields: drawn fresh, never cached
  pn.replaceChildren(tpl.content.cloneNode(true));
  pn.dataset.tab = RB.tab;
  syncUndoState();
  if (typeof lkOn === 'function' && lkOn()) lkPaint();
  if (!isCalm()) pn.animate([{ opacity: 0, transform: 'translateY(-3px)' }, { opacity: 1, transform: 'none' }], { duration: 160, easing: 'cubic-bezier(.2,.8,.2,1)' });
}
/** One pass: mount if missing, redraw when something the ribbon shows changed, refresh the pressed states otherwise. */
function rbSync() {
  const isl = root.querySelector('.island');
  if (!isl) return;
  let el = isl.querySelector(':scope > .ribbon');
  if (!el) { el = document.createElement('div'); el.className = 'ribbon'; isl.appendChild(el); RB.key = ''; RB.base = ''; rbWire(el); }
  const now = rbCtxNow();
  if (now !== RB.ctx) {
    const was = RB.ctx;
    RB.ctx = now;
    // the contextual tab opens once, when the selection starts. 0.15.9: not under 1024 px, where its tools wrap onto a second band (360 px against 184) and selecting would push the page by 176 px: the tab still appears in the row, one press away, and the selection strip (.ctx) carries the tools
    // 0.17.0 (note 1): the tab the person was on is remembered (RB.pre) and comes back when the selection ends (a press on the background), so the ribbon is not thrown to Home
    if (now && !rbNarrow()) { if (!was) RB.pre = RB.tab; RB.tab = now; if (RB.collapsed) { RB.collapsed = false; ls.set('bw:rb:c', '0'); } }
    else if (RB.tab === was || RB.tab === 'diagram2') { RB.tab = RB.pre && RB.pre !== was && rbTabs().some((x) => x[0] === RB.pre) ? RB.pre : 'home'; RB.pre = null; }
    if (!now) RB.pre = null;
  }
  // 0.15.9 (M3): inside a diagram the ribbon follows what is selected: an arrow or a shape opens the tab that holds its tools, the empty drawing the tab that adds shapes.
  // It moves only when the KIND of selection changes (never while the person is working in a tab of their own choosing), and never under 1024 px (the page must not move).
  // 0.16.1 (fault 6): a legend entry is neither an arrow nor a shape: its tools (text, look, delete, reset) sit in the «diagram» tab, so the ribbon goes there
  const dk = now === 'diagram' ? (S.dg?.edge || S.dg?.joint || S.dg?.end ? 'arrow' : S.dg?.legend ? 'legend' : S.dg?.nodes?.length ? 'shape' : 'empty') : '';
  if (dk !== RB.dgKind) {
    RB.dgKind = dk;
    const to = dk === 'empty' || dk === 'legend' ? 'diagram' : 'diagram2';
    if (dk && !rbNarrow() && rbTabs().some((x) => x[0] === to)) RB.tab = to;
  }
  if (!rbTabs().some((x) => x[0] === RB.tab)) RB.tab = 'home';
  const base = [S.ui, uiDir(), RB.ctx, CMDS.length, rbStamp()].join('|');
  const key = `${base}|${RB.tab}|${RB.collapsed}|${RB.dgKind || ''}`;
  // 0.15.2 note 16: the panel is about to open or fold → measure first (one layout read, only on that transition), glide after the swap
  const pn0 = el.querySelector('.rb-panel');
  const turning = !S.focus && !!pn0 && (RB.glide ? RB.glide.target !== RB.collapsed : pn0.hidden !== RB.collapsed);
  if (turning && RB.glide) rbGlideEnd();
  const g0 = turning ? { b0: rbBand(isl), full: pn0.hidden ? 0 : pn0.offsetHeight, sy: window.scrollY } : null;
  if (key !== RB.key) {
    const had = el.contains(root.activeElement) && root.activeElement?.closest?.('.rb-tab') ? root.activeElement.dataset.tab : null;
    const fast = RB.base === base && !!el.querySelector('.rb-panel');
    RB.key = key;
    el.dir = 'rtl'; // the toolbar never moves with the language (0.10.0); the keys read the computed direction
    if (fast) rbSwap(el);
    else {
      RB.base = base; RB.cache.clear();
      rbPaint(el, rbHtml());
      if (typeof measureBar === 'function') measureBar(); // the band's height is read after the panel is in, so a drawer starts under it
    }
    if (had) el.querySelector(`#rb-tab-${had}`)?.focus({ preventScroll: true });
  }
  if (g0) rbGlide(isl, el, g0);
  el.querySelectorAll('[data-a]').forEach((b) => { const p = RB_PRESSED[b.dataset.a]; if (p) b.setAttribute('aria-pressed', String(!!p())); });
  isl.classList.toggle('rb-collapsed', RB.collapsed);
}

/* ── 0.15.2 note 16 · the pages glide ───────────────────────────────────────────────────────────────────────────────────────────────
 * A ribbon tab opening pushes the pages DOWN and a re-press slides the panel back UP and the pages glide back (a side panel, by contrast, overlays
 * and never pushes: note 15). How: the page band (--bw-bar-h, the body's top padding) jumps to its final value at once, so the pages are laid out
 * ONCE; the jump is hidden by a Web Animation on #bw-pair (transform: compositor only, no layout per frame) from the old position to the new
 * one, while the panel itself grows or shrinks (height, inside the toolbar's own fixed box) over the same 240 ms on the same curve, so the two stay
 * edge to edge. Soft start, soft landing (ease-in-out), no overshoot. If the page is scrolled, the scroll position is moved by the same amount
 * (instant), so the text under the pointer does not move and only the bar covers more or less of it: the glide plays for the part that could not
 * be absorbed (page at the top). Only the editor's own calm button makes it instant: the OS reduced-motion setting is not read here (owner, 2026-10-31).
 * measureBar and the drawer-top observer stand down while it runs (they would re-measure the growing box every frame). */
const RB_GLIDE_MS = 240;
const RB_GLIDE_EASE = 'cubic-bezier(.65, 0, .35, 1)';
const rbBand = (isl) => Math.round(isl.offsetTop + isl.offsetHeight + 12); // the same sum as editor.js measureBar
if (typeof measureBar === 'function') {
  const rbMeasure = measureBar;
  measureBar = function measureBarGlide(...a) { return RB.glide ? undefined : rbMeasure.apply(this, a); };
}
function rbGlideEnd() {
  const g = RB.glide;
  if (!g) return;
  RB.glide = null;
  g.anims.forEach((a) => { try { a.cancel(); } catch { /* gone */ } });
  if (g.pn.isConnected) { g.pn.classList.remove('rb-glide'); g.pn.hidden = g.target; }
  if (typeof dtSync === 'function') dtSync();
  if (typeof measureBar === 'function') measureBar();
}
function rbGlide(isl, el, g0) {
  const pn = el.querySelector('.rb-panel');
  const closing = RB.collapsed;
  const b1 = rbBand(isl); // layout with the panel in its new state
  const delta = b1 - g0.b0;
  if (!delta || !pn) return;
  document.documentElement.style.setProperty('--bw-bar-h', `${b1}px`);
  barH = b1; // editor.js's own record of the band (it only ever grew; here it follows the bar both ways)
  if (g0.sy > 0) window.scrollBy({ top: delta, behavior: 'instant' });
  const visual = delta - (window.scrollY - g0.sy); // how far the pages really moved on screen
  if (S.calm || document.hidden || typeof pn.animate !== 'function') { if (typeof dtSync === 'function') dtSync(); return; }
  const opts = { duration: RB_GLIDE_MS, easing: RB_GLIDE_EASE };
  const anims = [];
  const pair = document.getElementById('bw-pair');
  if (pair && visual) anims.push(pair.animate([{ transform: `translateY(${-visual}px)` }, { transform: 'translateY(0)' }], opts));
  const full = closing ? g0.full : pn.offsetHeight;
  const up = { blockSize: `${full}px`, paddingBlock: '8px', opacity: 1 };
  const down = { blockSize: '0px', paddingBlock: '0px', opacity: 0 };
  if (closing) pn.classList.add('rb-glide'); // `hidden` is already set (the state is final at once); this class keeps the panel on screen while it folds
  const a = pn.animate(closing ? [up, down] : [down, up], { ...opts, fill: closing ? 'forwards' : 'none' });
  anims.push(a);
  RB.glide = { anims, pn, target: closing };
  a.onfinish = () => { if (RB.glide?.anims === anims) rbGlideEnd(); };
}

/* ── tabs, collapse, keyboard ──────────────────────────────────────────────── */
/** Select a tab (the programmatic and keyboard-arrow path): a collapsed ribbon opens on it. */
function rbSetTab(tab, { focus = false } = {}) {
  const changed = tab !== RB.tab;
  RB.tab = tab;
  if (RB.collapsed) { RB.collapsed = false; ls.set('bw:rb:c', '0'); }
  rbSync();
  if (focus) root.querySelector(`#rb-tab-${tab}`)?.focus({ preventScroll: true });
  if (changed) { try { window.dispatchEvent(new CustomEvent('bw:wm', { detail: { id: 'W05' } })); } catch { /* no watermark */ } } // the watermark's tab tick (a real change, not a collapse, not the first paint)
}
function rbCollapse(on) {
  RB.collapsed = on ?? !RB.collapsed;
  ls.set('bw:rb:c', RB.collapsed ? '1' : '0');
  rbSync();
}
/** A press on a tab (click, Enter, Space): the selected tab folds / unfolds the ribbon, another tab is selected (note 6). */
function rbTabPress(tab, opts) {
  if (tab === RB.tab) { rbCollapse(); if (opts?.focus) root.querySelector(`#rb-tab-${tab}`)?.focus({ preventScroll: true }); } else rbSetTab(tab, opts);
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
    if (!x) return;
    if (x.dataset.rb === 'tab') rbTabPress(x.dataset.tab);
    else if (x.dataset.rb === 'collapse') rbCollapse();
  });
  el.addEventListener('keydown', (e) => {
    const tab = e.target.closest?.('.rb-tab');
    const tabs = [...el.querySelectorAll('.rb-tab')];
    if (tab) {
      if (e.key === 'ArrowDown') { e.preventDefault(); el.querySelector('.rb-panel [data-a], .rb-panel button')?.focus({ preventScroll: true }); return; }
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); rbTabPress(tab.dataset.tab, { focus: true }); return; }
      const to = rbMove(tabs, tab, e.key, el);
      if (to) { e.preventDefault(); to.focus({ preventScroll: true }); if (!RB.collapsed) rbSetTab(to.dataset.tab, { focus: true }); }
      return;
    }
    const b = e.target.closest?.('.rb-panel button');
    if (!b) return;
    const tools = [...el.querySelectorAll('.rb-panel button:not(:disabled)')];
    if (e.key === 'Escape') { e.preventDefault(); root.querySelector(`#rb-tab-${RB.tab}`)?.focus({ preventScroll: true }); return; }
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
  // a pointer or key on the page itself (not in the shell) is the person choosing a new selection: pending restores stand down
  for (const ev of ['mousedown', 'keydown']) document.addEventListener(ev, (e) => { if (!e.composedPath().includes(shell)) RB.gen = (RB.gen || 0) + 1; }, true);
  shell.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') RB.snap = rbSnap(); }, true);
  shell.addEventListener('click', () => {
    const snap = RB.snap;
    RB.snap = null;
    rbRestore(snap);
    RB.last = snap;
    setTimeout(() => { if (RB.last === snap) RB.last = null; }, 1000);
    // the command is async and may redraw the page: look again once it has (text only; a command that selects something itself is left alone)
    // ...unless the person has since chosen another selection (a click or a key on the page): then the old offsets are stale and the next command must act on the new text
    const gen = RB.gen;
    for (const ms of [30, 120, 400]) setTimeout(() => { if (RB.gen === gen) rbRestoreText(snap); }, ms);
  }, true);
}
{ const o = buildCtx; buildCtx = function (b, tb) { o(b, tb); rbShellWire(); rbSync(); }; } // refreshUi and every (re)build end in buildCtx

// 0.15.6 (A6): the arrow's pickers (route, head, tail, line, weight) are commands of the arrow group; each opens a small list at its button
bwExt({ cmds: ['dgRoute', 'dgHead', 'dgTail', 'dgLine', 'dgWeight', 'dgLgText', 'dgLgLook', 'dgLgDel', 'dgLgReset'].map((id) => ({ id, group: 'arrow', edit: true })), on: { render: () => { if (RB.last) rbRestoreText(RB.last); } }, expose: { ribbon: { panelHtml: rbPanelInner, listed: () => [...RB_LISTED], tabs: () => rbTabs().map((x) => x[0]), budget: (raw = false) => (raw ? RB_TABS : rbDefs()).map((x) => ({ tab: x[0], tools: x[1].reduce((n, g) => n + g[1].length, 0), groups: x[1].length, ctx: x[2] })), max: { tools: RB_MAX_TOOLS, groups: RB_MAX_GROUPS }, state: RB, sync: rbSync, snap: rbSnap, restore: rbRestore, restoreText: rbRestoreText, setTab: rbSetTab, collapse: rbCollapse } } });
