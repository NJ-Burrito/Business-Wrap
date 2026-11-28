/* ── UI (Shadow DOM): a floating island, a selection bar, a command palette ──
 * Design read: an authoring tool for bilingual requirement documents; the
 * island carries the SRS navy and gold so the tool and the document read as one.
 * Motion answers actions (press, open, confirm, count); calm mode turns it
 * all to instant cross-fades (the OS reduced-motion setting is not read). */
const host = document.createElement('div');
host.id = 'bw-ui-host';
document.body.prepend(host);
const root = host.attachShadow({ mode: 'open' });
const IC = DATA.icons || {};
// data-ic names the icon, so its own motion (editor/ext/40-icon-motion.css) finds it wherever it is drawn
// UI-CHROME-09: in a right-to-left UI the start/end and undo/redo glyphs swap with their partner (the partner is their exact mirror),
// and the SVG says so (data-sw) so the CSS mirror in 40-icon-motion.css skips it: never both. Indent/outdent, before/after,
// back/forward... keep the CSS mirror (swapping them would point the arrow the wrong way).
const IC_SWAP = { fmtAlignStart: 'fmtAlignEnd', fmtAlignEnd: 'fmtAlignStart', hdrStart: 'hdrEnd', hdrEnd: 'hdrStart', ftrStart: 'ftrEnd', ftrEnd: 'ftrStart', chStart: 'chEnd', chEnd: 'chStart', undo: 'redo', redo: 'undo' };
const ic = (k) => {
  const sw = IC_SWAP[k] && uiDir() === 'rtl' && IC[IC_SWAP[k]];
  const g = sw || IC[k];
  return g ? g.replace('<svg', `<svg data-ic="${k}"${sw ? ' data-sw="1"' : ''}`) : '';
};
S.calm = ls.get('bw:calm') === '1';
S.focus = false;
S.snap = ls.get('bw:snap') !== '0';
S.view = false;
const isCalm = () => S.calm;
const setRootFlags = () => {
  const d = document.documentElement.dataset;
  d.bwCalm = S.calm ? '1' : '0';
  d.bwFocus = S.focus ? '1' : '0';
  d.bwDark = S.dark ? '1' : '0';
};

/** Tools that change the document carry edit: true, so a guard can disable every one of them in one place. */
const EDIT_GROUPS = new Set(['insert', 'text', 'table', 'diagram', 'shape', 'arrange', 'arrow']);
const EDIT_IDS = new Set(['import', 'undo', 'redo', 'renumber', 'theme', 'styleThis', 'hideBlock', 'newdoc', 'process']);
/** Every action, in one registry: the island, the selection bar and the palette read from it. */
const CMDS = [
  ['save', 'file', 'Ctrl+S'], ['saveHtml', 'file'], ['import', 'file'], ['exportEdits', 'file'], ['exportAll', 'file'], ['projExport', 'file'], ['projImport', 'file'],
  ['image', 'insert'], ['logo', 'insert'], ['addDiagram', 'insert'], ['addPara', 'insert'],
  ['undo', 'edit', 'Ctrl+Z'], ['redo', 'edit', 'Ctrl+Y'], ['find', 'edit', 'Ctrl+F'],
  ['newdoc', 'document'], ['process', 'document'], ['outline', 'document'], ['pages', 'document'], ['check', 'document'], ['history', 'document'], ['renumber', 'document'], ['webhooks', 'document'],
  ['theme', 'design'], ['styleThis', 'design'], ['hideBlock', 'design'],
  ['side', 'view'], ['both', 'view'], ['uiLang', 'view'], ['dir', 'view'], ['dark', 'view'], ['calm', 'view'], ['focus', 'view', 'F'], ['spell', 'view'], ['snap', 'view'], ['zoomOut', 'view'], ['zoomReset', 'view'], ['zoomIn', 'view'], ['zoomFit', 'view', 'Ctrl+Alt+8'], ['zoomHeight', 'view', 'Ctrl+Alt+9'], ['zoomPct', 'view'], ['view.continuous', 'view'], ['view.single', 'view'], ['view.spread', 'view'], ['settings', 'view'],
  ['print', 'export', 'Ctrl+P'], ['exportPdf', 'export'], ...pcExportIds().map((id) => [id, 'export']),
  ['duplicate', 'text', 'Ctrl+D'], ['delete', 'text', 'Del'], ['moveUp', 'text', 'Alt+↑'], ['moveDown', 'text', 'Alt+↓'], ['comment', 'text'], ['breakBefore', 'text'], ['keepNext', 'text'],
  ['rowAdd', 'table'], ['rowDel', 'table'], ['colAdd', 'table'], ['colDel', 'table'],
  ['dgStaff', 'diagram'], ['dgApplicant', 'diagram'], ['dgStart', 'diagram'], ['dgPayment', 'diagram'], ['dgRework', 'diagram'], ['dgSystem', 'diagram'], ['dgDecision', 'diagram'], ['dgOk', 'diagram'], ['dgStop', 'diagram'],
  ['dgNote', 'diagram'], ['dgGroup', 'diagram'], ['dgText', 'diagram'], ['dgAuto', 'diagram'], ['dgReset', 'diagram'], ['dgLegend', 'diagram'], ['dgMermaidIn', 'diagram'], ['dgMermaidOut', 'diagram'],
  ['dgLabel', 'shape'], ['dgSub', 'shape'], ['dgConnect', 'shape'], ['dgDup', 'shape'], ['dgDel', 'shape', 'Del'], ['dgFront', 'shape'], ['dgBack', 'shape'],
  ['dgAlignL', 'arrange'], ['dgAlignC', 'arrange'], ['dgAlignR', 'arrange'], ['dgAlignT', 'arrange'], ['dgAlignM', 'arrange'], ['dgAlignB', 'arrange'], ['dgDistH', 'arrange'], ['dgDistV', 'arrange'], ['dgWrap', 'arrange'],
  ['dgEdgeLabel', 'arrow'], ['dgBendAdd', 'arrow'], ['dgBendDel', 'arrow'], ['dgRouteAuto', 'arrow'], ['dgReverse', 'arrow'], ['dgFrom', 'arrow'], ['dgTo', 'arrow'],
  ['dgZoomIn', 'diagram', 'Ctrl+wheel'], ['dgZoomOut', 'diagram'], ['dgZoomFit', 'diagram'], ['dgZoom100', 'diagram'],
].map(([id, group, key]) => ({ id, group, key, edit: EDIT_GROUPS.has(group) ? !/^dgZoom/.test(id) : EDIT_IDS.has(id) }));

/** A labelled toolbar section: icon + short title, then its tools (the same categories as the palette). */
function sec(cat, tools) {
  const name = t('sec' + cat[0].toUpperCase() + cat.slice(1));
  // the first tool always shows; the rest sit inline while the bar has room and fold into this section's «More» when it has not
  // the header and footer sections keep every tool in their tail: folded, they are a title and «…» (review2 · 34)
  const all = cat === 'header' || cat === 'footer';
  const rest = all ? tools : tools.slice(1);
  const tail = rest.length ? `<div class="more tail"><button type="button" class="b" data-a="more" aria-expanded="false" aria-haspopup="true" title="${esc(t('more'))}: ${esc(name)}" aria-label="${esc(t('more'))}: ${esc(name)}"><span class="i">${ic('more')}</span></button><div class="menu fm" role="group" aria-label="${esc(name)}">${rest.join('')}</div></div>` : '';
  return `<div class="sec" data-cat="${cat}" role="group" aria-label="${esc(name)}"><span class="sc" aria-hidden="true"><span class="i">${ic('sec' + cat[0].toUpperCase() + cat.slice(1))}</span><span class="st" data-alt="${esc(tAlt('sec' + cat[0].toUpperCase() + cat.slice(1)))}">${esc(name)}</span></span><div class="sb">${all ? '' : tools[0] || ''}${tail}</div></div>`;
}
/** A registry command as a toolbar tool: its label, its tooltip (with the shortcut), the shortcut shown in menus. */
const TIPS = { image: 'imageTip', logo: 'logoTip', exportPdf: 'exportPdfTip' };
/** 0.17.13: the top-bar Save draws the plain Lucide `save` (floppy, ISC) at the bar's stroke weight; the registry icon carries a gold highlight part that disappears on the gold fill. data-ic stays so the icon's own nudge still plays. */
const SAVE_ICON = '<svg aria-hidden="true" focusable="false" class="ic" data-ic="save" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7"/><path d="M7 3v4a1 1 0 0 0 1 1h7"/></svg>';
function tool(c) {
  return btn(c.id, { cls: c.id === 'save' ? 'primary' : '', tip: TIPS[c.id] ? t(TIPS[c.id]) : c.key ? `${t(c.id)} (${c.key})` : '' });
}
function btn(id, { label = t(id), tip = '', pressed, cls = '', extra = '' } = {}) {
  const key = CMDS.find((c) => c.id === id)?.key;
  return `<button type="button" class="b ${cls}" data-a="${id}"${key ? ` data-key="${esc(key)}"` : ''} title="${esc(tip || label)}"${pressed !== undefined ? ` aria-pressed="${pressed}"` : ''}${extra}><span class="i">${ic(id)}</span><span class="w"${label === t(id) ? ` data-alt="${esc(tAlt(id))}"` : ''}>${esc(label)}</span></button>`;
}
const dirOf = (l) => (l === 'ar' ? 'rtl' : 'ltr');
const langWord = (l) => (l === 'ar' ? 'ع' : 'E');
const uiDir = () => S.dir || S.dirs[S.ui] || dirOf(S.ui); // the edition in view first, then the flip stored for the interface language (a reload shows the first edition again)
const LAYOUT_DIR = 'rtl'; // the default (Arabic) layout: toolbar, panels, page and watermark never move (0.10.0)

/** R2/A4: the toolbar is mounted once; every later call patches the live nodes in place (syncUi), so a toggle
 *  never replays the entry motion, the thumbs or an explainer on controls nobody touched. */
function buildUi() {
  if (root.querySelector('.shell')) syncUi();
  else mountUi();
}
function uiHtml() {
  const svcOpts = DATA.services.map((s) => `<option value="${esc(s.id)}" ${s.id === S.svc ? 'selected' : ''}>${esc(s.editions[S.ed]?.name || s.editions.ar?.name || s.id)}</option>`).join('');
  const eds = Object.keys(M[S.svc]);
  const theme = S.dark ? 'dark' : 'light';
  return `<style>${DATA.uiCss}</style>
<section class="shell${buildUi.done ? '' : ' first'}" aria-label="${esc(t('appName'))}" dir="${LAYOUT_DIR}" data-tdir="${uiDir()}" lang="${S.ui}" data-theme="${theme}" data-calm="${isCalm() ? '1' : '0'}">
  <div class="island bar" role="toolbar" aria-label="${esc(t('toolbar'))}">
    <span class="brand" role="img" aria-label="${esc(t('appName'))}">${DATA.brand?.mark || ''}</span>
    <div class="grp doc">
      <label class="pick"><span class="vh">${esc(t('service'))}</span><select data-a="svc" aria-label="${esc(t('service'))}" data-alt="${esc(DATA.services.find((s) => s.id === S.svc)?.editions[other()]?.name || '')}">${svcOpts}</select></label>
      <div class="seg lang" role="group" data-x="ed" data-cmds="uiLang" aria-label="${esc(t('language'))}"><i class="thumb" aria-hidden="true"></i><span class="cap" aria-hidden="true"><span class="i">${ic('ed')}</span><span class="cw" data-alt="${esc(tAlt('language'))}">${esc(t('language'))}</span></span>
        ${['ar', 'en'].map((l) => `<button type="button" data-a="ed" data-ed="${l}" lang="${l}" aria-pressed="${l === S.ui}" aria-label="${langWord(l)}: ${esc(t(l === 'ar' ? 'langAr' : 'langEn'))}" title="${esc(t(l === 'ar' ? 'langAr' : 'langEn'))}"><span class="sw">${langWord(l)}</span></button>`).join('')}
      </div>
    </div>
    <div class="ctx sec now" role="group" hidden></div>
    ${['file', 'insert', 'edit', 'document', 'design', ...EXT.sections.map((x) => x.cat)].map((cat) => sec(cat, CMDS.filter((c) => c.group === cat && c.id !== 'save').map(tool))).join('')}
    ${sec('export', [pcExportMenu(), tool(CMDS.find((c) => c.id === 'print')), tool(CMDS.find((c) => c.id === 'exportPdf'))])}
    <span class="spacer"></span>
    <div class="status" role="status" aria-live="polite">
      <button type="button" class="count" data-a="history" title="${esc(t('history'))}" aria-label="${esc(changesName(opCount()))}"><span class="i">${ic('history')}</span><span class="w" data-alt="${esc(tAlt('changesWord'))}">${esc(t('changesWord'))}</span> <span class="n" aria-hidden="true">${opCount()}</span></button>
      <span class="zpill" data-zoom-pill role="button" tabindex="0" title="${esc(t('zoomPct'))}"${zoomEff() <= ZOOM_MIN + 1e-6 || zoomEff() >= ZOOM_MAX - 1e-6 ? ' data-limit="1"' : ''}>${zoomPctNow()}%</span>
      <span class="sel vh">${esc(selDesc())}</span><span class="flash vh"></span>
    </div>
    <div class="sec" data-cat="view" role="group" aria-label="${esc(t('secView'))}"><span class="sc" aria-hidden="true"><span class="i">${ic('secView')}</span><span class="st">${esc(t('secView'))}</span></span><div class="sb">
    <div class="seg ui" role="group" data-x="dir" aria-label="${esc(t('direction'))}"><i class="thumb" aria-hidden="true"></i><span class="cap" aria-hidden="true"><span class="i">${ic('dir')}</span><span class="cw" data-alt="${esc(tAlt('direction'))}">${esc(t('direction'))}</span></span>
      ${['rtl', 'ltr'].map((d) => `<button type="button" data-a="dir" data-d="${d}" aria-pressed="${uiDir() === d}" aria-label="${esc(t(d))}: ${esc(t(d === 'rtl' ? 'ux.dirRtl' : 'ux.dirLtr'))}" title="${esc(t(d === 'rtl' ? 'ux.dirRtl' : 'ux.dirLtr'))}"><span class="sw">${esc(t(d))}</span></button>`).join('')}
    </div>
    ${btn('view', { extra: ` aria-expanded="${S.view}" aria-controls="viewpop"` })}
    ${btn('settings')}
    </div></div>
    ${tool(CMDS.find((c) => c.id === 'save')).replace('class="b primary"', 'class="b primary bar-save"').replace(/<svg[\s\S]*?<\/svg>/, SAVE_ICON)}
    ${btn('palette', { cls: 'cmd', label: t('palette'), tip: `${t('palette')} (Ctrl+K)`, extra: ' aria-keyshortcuts="Control+K"' })}
    <div class="progress" hidden aria-hidden="true"><i></i></div>
  </div>
  ${viewPop()}
  <div class="drawer" role="dialog" aria-modal="false" hidden data-theme="${theme}"></div>
  <div class="dialog" role="dialog" aria-modal="true" hidden data-theme="${theme}"></div>
  <div class="scrim" hidden>
    <div class="palette" role="dialog" aria-modal="true" aria-label="${esc(t('paletteTitle'))}">
      <div class="pin"><span class="i">${ic('palette')}</span><input type="text" role="combobox" aria-expanded="true" aria-controls="cmdlist" aria-autocomplete="list" aria-label="${esc(t('paletteTitle'))}" placeholder="${esc(t('palettePlaceholder'))}" spellcheck="false"></div>
      <ul id="cmdlist" role="listbox" aria-label="${esc(t('paletteTitle'))}"></ul>
      <p class="empty" hidden>${esc(t('paletteEmpty'))}</p>
    </div>
  </div>
  <div class="toasts" aria-live="polite"></div>
  <button type="button" class="b focus-exit" data-a="focus" ${S.focus ? '' : 'hidden'}><span class="i">${ic('focus')}</span><span class="w">${esc(t('focusExit'))}</span></button>
</section>`;
}
function mountUi() {
  setRootFlags();
  root.innerHTML = uiHtml();
  syncUi.ui = S.ui;
  const shell = root.querySelector('.shell');
  if (!buildUi.done) { buildUi.done = true; setTimeout(() => document.documentElement.classList.add('bw-ready'), 900); }
  shell.addEventListener('click', onBar);
  root.querySelector('[data-a="svc"]').addEventListener('change', (e) => { S.svc = e.target.value; if (!M[S.svc][S.ed]) S.ed = Object.keys(M[S.svc])[0]; S.sel = null; buildUi(); render(false); emit('open', S.svc, S.ed); });
  root.querySelector('.scrim').addEventListener('click', (e) => { if (e.target.classList.contains('scrim')) closePalette(); });
  wirePalette();
  fitBar();
  measureBar();
  if (S.drawer) openDrawer(S.drawer);
  placeCtx();
  viewPopAfterBuild(); // views.js: the View menu in the top layer
  uxAfterBuild(); // shell-ux.js: the selection section survives a rebuild, segment thumbs, explainers
}
/* syncUi: the new markup is read into a template and the live tree is patched node by node. Kept as they are:
 * what other code owns at run time (the selection section, panel, dialog, toasts and palette list bodies, the
 * explainer card, the pager), inline geometry (style), the menu/popover state and the classes fitBar and the
 * motion add. A node whose kind changed is replaced: only that node is new. */
const UI_OWN = '.ctx, .drawer, .dialog, .toasts, #cmdlist';
const UI_OWN_ATTR = new Set(['data-theme', 'lang', 'dir']);
const UI_RUNTIME = '.xpl, .pager, .xpl-dock, .bw-busy, .rd-exit, .ribbon';
const UI_KEEP_ATTR = new Set(['style', 'data-tt', 'aria-describedby', 'popover', 'data-open', 'disabled']);
const UI_RUNTIME_CLS = /^(has-sel|sq\d|nw|folded|sel-fold|done|swap|tick|in|closing)$/;
function uiMorph(a, b, fresh = false) {
  // fresh: the new markup is the whole truth about `disabled` (a ribbon tab switch lands other buttons in the same slots, so the old tab's disabled must not carry over)
  if (a.nodeType !== b.nodeType || a.nodeName !== b.nodeName) { a.replaceWith(b); return; }
  if (a.nodeType !== 1) { if (a.nodeValue !== b.nodeValue) a.nodeValue = b.nodeValue; return; }
  const own = a.matches(UI_OWN);
  for (const { name, value } of [...b.attributes]) {
    if (own && !UI_OWN_ATTR.has(name)) continue;
    if (name === 'class') {
      const v = [...new Set([...value.split(/\s+/).filter(Boolean), ...[...a.classList].filter((c) => UI_RUNTIME_CLS.test(c))])].join(' ');
      if (a.getAttribute('class') !== v) a.setAttribute('class', v);
    } else if (a.getAttribute(name) !== value) a.setAttribute(name, value);
  }
  if (own) return;
  for (const { name } of [...a.attributes]) {
    if (b.hasAttribute(name) || (UI_KEEP_ATTR.has(name) && !(fresh && name === 'disabled'))) continue;
    if (name === 'class') { const keep = [...a.classList].filter((c) => UI_RUNTIME_CLS.test(c)); if (keep.length) a.setAttribute('class', keep.join(' ')); else a.removeAttribute('class'); } else a.removeAttribute(name);
  }
  const ak = [...a.childNodes].filter((n) => !(n.nodeType === 1 && n.matches(UI_RUNTIME)));
  const bk = [...b.childNodes];
  bk.forEach((n, i) => { if (ak[i]) uiMorph(ak[i], n, fresh); else a.appendChild(n); });
  ak.slice(bk.length).forEach((n) => n.remove());
}
function syncUi() {
  setRootFlags();
  const tpl = document.createElement('template');
  tpl.innerHTML = uiHtml();
  const ak = [...root.childNodes];
  [...tpl.content.childNodes].forEach((n, i) => { if (ak[i]) uiMorph(ak[i], n); else root.appendChild(n); });
  const svc = root.querySelector('[data-a="svc"]');
  if (svc && svc.value !== S.svc) svc.value = S.svc;
  const pop = root.querySelector('#viewpop');
  if (!S.view && pop?.matches?.(':popover-open')) pop.hidePopover();
  fitBar();
  measureBar();
  if (S.drawer && (syncUi.ui !== S.ui || S.drawer === 'settings')) openDrawer(S.drawer); // new words; Settings mirrors the toggles; others are left alone
  syncUi.ui = S.ui;
  viewPopAfterBuild();
  uxAfterBuild();
}
// The page never jumps under the reader: the reserved band only grows (wrap, font load), resets only for focus mode.
let barH = 0;
function measureBar(force = false) {
  const bar = root.querySelector('.island');
  if (S.focus || !bar) { barH = 0; document.documentElement.style.setProperty('--bw-bar-h', '12px'); return; }
  // 0.15.0: the ribbon can change height after the last measure (tab switch, collapse, font load): the bar's own size re-measures it
  // (non-forcing: the band still only grows, so the page never jumps under the reader)
  if (measureBar.roBar !== bar && typeof ResizeObserver === 'function') {
    measureBar.ro?.disconnect();
    let q = 0;
    measureBar.ro = new ResizeObserver(() => { window.__bwFillAgain?.(); if (!q) q = requestAnimationFrame(() => { q = 0; measureBar(); }); });
    measureBar.ro.observe(bar);
    measureBar.roBar = bar;
  }
  // bar.offsetTop includes the room the server banner (18-server.js) takes above the toolbar
  const h = Math.round(bar.offsetTop + bar.offsetHeight + 12); // layout box: never the entry animation's mid-flight transform
  // force: the server banner came or went, the band follows it both ways; the page keeps its place under the pointer either way
  if (h > barH || (force && h !== barH)) {
    const grew = barH ? h - barH : 0;
    barH = h; document.documentElement.style.setProperty('--bw-bar-h', `${h}px`);
    // a contextual ribbon tab (Table, Picture, Diagram) opens on the press and grows the band: scroll by the same amount so the thing pressed stays under the pointer and the click lands on it
    if (grew && window.scrollY > 0) window.scrollBy({ top: grew, behavior: 'instant' });
  }
}
/** The bar never scrolls sideways when it can fold: first each section's extra tools go into its «More»,
 *  then (still too wide) the words of the selection's tools; section titles always stay. */
function fitBar() {
  const bar = root.querySelector('.island');
  if (!bar) return;
  // 0.14.0 perf: refreshUi runs on EVERY keystroke and this fit re-measured the whole bar (two-language word swap, ~270 DOM
  // mutations, forced layouts, 0.9 s of style + layout over 40 keys). The fit depends only on the bar's own markup, the
  // window width and the UI language, so when none of them moved since the last fit it is skipped (resize / font load force it).
  // 0.15.0 perf: the signature was bar.outerHTML (a full serialisation, 2.2 ms per key). A MutationObserver on the bar now says
  // «the markup changed since the last fit» (a flag), so the cheap part of the signature is only width and language.
  const FIT_OBS = { subtree: true, childList: true, attributes: true, attributeOldValue: true, characterData: true, characterDataOldValue: true };
  // A write that leaves the markup as it was (the same class, the same text set again, the visually hidden status line) is not a change.
  const real = (r) => {
    if (r.target.nodeType === 1 && r.target.closest?.('.vh')) return false;
    if (r.type === 'attributes' && (((r.attributeName.startsWith('data-') || r.attributeName === 'title') && r.target.classList?.contains('bw-stamp')) || r.attributeName === 'data-pulse')) return false; // the save stamp's data-* (a timestamp) and the server toggle's pulse flag (a timed animation switch) never change the bar's layout
    if (r.type === 'attributes') return r.target.getAttribute(r.attributeName) !== r.oldValue;
    if (r.type === 'characterData') return r.target.data !== r.oldValue;
    const gone = [...r.removedNodes], came = [...r.addedNodes];
    if (gone.length && gone.length === came.length && gone.every((n) => n.nodeType === 3) && came.every((n) => n.nodeType === 3)) return gone.map((n) => n.nodeValue).join('') !== came.map((n) => n.nodeValue).join('');
    return true;
  };
  if (fitBar.bar !== bar) { fitBar.mo?.disconnect(); fitBar.mo = new MutationObserver((rs) => { if (rs.some(real)) fitBar.dirty = true; }); fitBar.mo.observe(bar, FIT_OBS); fitBar.dirty = true; }
  if (fitBar.mo.takeRecords().some(real)) fitBar.dirty = true; // a change made in this same task, before the observer's microtask ran
  const fitSig = `${innerWidth}|${S.ui}`;
  if (!fitBar.force && fitBar.bar === bar && fitBar.sig === fitSig && !fitBar.dirty) return;
  fitBar.force = false;
  fitBar.mo.disconnect(); // the fit's own class and word changes are not watched (hundreds of records on a tab switch)
  bar.classList.remove('sq0', 'sq1', 'sq2', 'sq3', 'sq4', 'sq5', 'sq6');
  if (typeof w2selFold === 'function') w2selFold(bar); // 20-chrome: header / footer fold with a selection
  const secs = [...bar.querySelectorAll('.sec:not(.now)')].filter((x) => x.querySelector('.more.tail'));
  secs.forEach((x) => x.classList.remove('folded'));
  const restore = uxWidest(bar); // shell-ux.js: AR/EN parity
  const over = () => bar.scrollWidth > bar.clientWidth;
  // each step only while the bar still overflows: the general tools' words → one section at a time (last first)
  // folds its extra tools into its «More» → the selection's words → the picker; section titles never go
  // the general tools' words go one section at a time (last first), so the words stay wherever they fit (0.11.0)
  const gen = [...bar.querySelectorAll('.sec:not(.now)')];
  gen.forEach((x) => x.classList.remove('nw'));
  // one measure: each section's words (+ the padding they free); fold the fewest sections that cover the overflow
  let need = bar.scrollWidth - bar.clientWidth;
  if (need > 0) {
    const saves = gen.map((x) => [...x.querySelectorAll(':scope > .sb > .b .w')].reduce((n, w) => n + (w.offsetWidth ? w.offsetWidth + 15 : 0), 0));
    for (let i = gen.length - 1; i >= 0 && need > 0; i -= 1) { gen[i].classList.add('nw'); need -= saves[i]; }
    while (over() && gen.some((x) => !x.classList.contains('nw'))) gen.findLast((x) => !x.classList.contains('nw')).classList.add('nw');
  }
  if (gen.length && gen.every((x) => x.classList.contains('nw'))) bar.classList.add('sq0');
  for (const x of secs.reverse()) { if (!over()) break; x.classList.add('folded'); bar.classList.add('sq1'); }
  for (const step of ['sq2', 'sq3', 'sq4', 'sq5', 'sq6']) { if (!over()) break; bar.classList.add(step); }
  restore();
  fitBar.bar = bar;
  fitBar.sig = `${innerWidth}|${S.ui}`;
  fitBar.mo.observe(bar, FIT_OBS);
  fitBar.dirty = false;
}
window.addEventListener('resize', () => { fitBar.force = true; fitBar(); setTimeout(() => { fitBar.force = true; fitBar(); }, 200); }); // and once the resize has settled (a window drag lands mid-layout)
document.fonts?.addEventListener?.('loadingdone', () => { fitBar.force = true; fitBar(); }); // the first fit can run before the UI face is in: refit once it lands
let lastCount = -1;
/** the changes button's accessible name is exactly its visible text (the word, then the number): WCAG 2.5.3 label in name */
const changesName = (n) => t('changesWord') + ' ' + n;
const opCount = () => EXT.status?.count() ?? liveOps(cur()).length;
/** The zoom pill next to the status follows every zoom step; at 25 % and 400 % it carries data-limit (a gold rule). */
function zoomPillSync() {
  const p = root.querySelector('[data-zoom-pill]');
  if (!p || p.querySelector('input')) return; // typing a value: leave the field alone
  const txt = `${zoomPctNow()}%`;
  if (p.textContent !== txt) p.textContent = txt;
  p.toggleAttribute('data-limit', zoomEff() <= ZOOM_MIN + 1e-6 || zoomEff() >= ZOOM_MAX - 1e-6);
}
/** undo / redo are disabled while there is nothing to undo / redo, on the toolbar and on whatever ribbon tab is drawn */
function syncUndoState() {
  const dis = { undo: !cur().ops.length, redo: !cur().redo.length };
  root.querySelectorAll('.island button[data-a]').forEach((x) => { if (x.dataset.a in dis) x.disabled = dis[x.dataset.a]; });
}
function refreshUi() {
  const c = root.querySelector('.count');
  if (!c) return;
  zoomPillSync();
  const n = opCount();
  if (n !== lastCount) {
    const el = c.querySelector('.n');
    el.textContent = String(n);
    c.setAttribute('aria-label', changesName(n));
    if (lastCount >= 0 && !isCalm()) { el.classList.remove('tick'); void el.offsetWidth; el.classList.add('tick'); }
    lastCount = n;
  }
  root.querySelector('.sel').textContent = selDesc();
  const b = blockOf(S.sel?.b);
  const tb = !!tableCtx();
  syncUndoState();
  const v = validate();
  if (v.some((x) => x[0] === 'err') && !refreshUi.err) emitHook('validation.failed', { problems: v.filter((x) => x[0] === 'err').map((x) => x[1]) });
  refreshUi.err = v.some((x) => x[0] === 'err');
  if (S.drawer && !['find', 'theme', 'pages', 'webhooks', 'newdoc', 'process'].includes(S.drawer)) openDrawer(S.drawer, true);
  else if (S.drawer === 'style') openDrawer('style', true);
  buildCtx(b, tb);
  fitBar();
  measureBar();
}

/* the selection section: the tools of what is selected, first in the docked toolbar; nothing selected → the general sections only */
function ctxModel(b, tb) {
  const ov = S.selOv != null ? (cur().doc.overlays || [])[S.selOv] : null;
  // a text box is not a picture: no «استبدال» (replace image), its own name (F2 · 38)
  if (ov?.kind === 'text') return { cat: 'image', label: t('insTextBox'), groups: [[...(EXT.w2wrapPick?.() ? [EXT.w2wrapPick()] : []), 'ovDelete']] };
  if (ov) return { cat: ov.kind === 'logo' ? 'logo' : 'image', label: t(ov.kind === 'logo' ? 'selLogo' : 'selImage'), groups: [['replace', 'caption', ...(ov.kind === 'logo' ? ['every'] : EXT.w2wrapPick?.() ? [EXT.w2wrapPick()] : []), 'ovDelete']] };
  const dg = dgContext();
  if (dg) return dg;
  // R5: the table tools come first, for every table with rows (front matter too: only the tools that apply there)
  const x = tb && tableCtx();
  if (x && !x.b) {
    if (x.rows === '/toc') return { cat: 'table', label: t('selTable'), groups: [['rowAdd', 'rowDel']] };
    return { cat: 'table', label: t('selTable'), groups: [['rowAdd', 'rowDel', ...(x.cols ? ['colAdd', 'colDel'] : []), 'rowUp', 'rowDown']] };
  }
  if (!b) {
    if (/^\/chapters\/\d+\/sections\/\d+\/(title|number)$/.test(S.sel?.p || '')) return { cat: 'text', label: t('ux.selSection'), groups: [['moveUp', 'moveDown', 'comment']] };
    if (/^\/chapters\/\d+\/(title|number)$/.test(S.sel?.p || '')) return { cat: 'text', label: t('ux.selChapter'), groups: [['moveUp', 'moveDown', 'comment']] }; // 0.16.0 (L7): a chapter heading has its strip too
    return null;
  }
  const blk = get(cur().doc, b.ptr);
  if (tb) return { cat: 'table', label: t('selTable'), groups: [['rowAdd', 'rowDel', 'colAdd', 'colDel', 'rowUp', 'rowDown'], ['duplicate', 'delete', 'moveUp', 'moveDown'], ['comment', 'styleThis', 'hideBlock', 'breakBefore', 'keepNext'], ...(EXT.cells ? [EXT.cells.tools()] : [])] };
  return { cat: 'text', label: t('selText', { x: kindName(blk?.kind || 'text') }), groups: [['duplicate', 'delete', 'moveUp', 'moveDown', 'addPara', ...(EXT.w2wrapPick?.() ? [EXT.w2wrapPick()] : [])], ['comment', 'styleThis', 'hideBlock', 'breakBefore', 'keepNext']] };
}
function ctxTool(id, ov) {
  if (typeof id === 'string' && id.startsWith('<')) return id; // a ready control (a select)
  if (id === 'every') return btn('every', { pressed: ov?.mode === 'every' });
  if (id === 'ovDelete') return btn('ovDelete', { label: t('delete') }).replace('<span class="i"></span>', `<span class="i">${ic('delete')}</span>`);
  return btn(id);
}
function buildCtx(b, tb) {
  const ctx = root.querySelector('.ctx');
  if (!ctx) return;
  const island = root.querySelector('.island');
  const m = ctxModel(b, tb);
  island?.classList.toggle('has-sel', !!m);
  if (!m) { ctx.hidden = true; ctx.dataset.key = ''; return; }
  const ov = S.selOv != null ? (cur().doc.overlays || [])[S.selOv] : null;
  const key = JSON.stringify([m.label, m.groups, m.keep, ov?.mode, S.ui]);
  if (ctx.dataset.key !== key) {
    ctx.dataset.key = key;
    ctx.dataset.cat = m.cat;
    ctx.setAttribute('aria-label', m.label);
    // the first group stays in view; the rest wait in this section's «more» menu, so a row never jams at 1366 px
    // at most four tools in view; the rest wait in «more»
    const all = m.groups.flat();
    const first = all.slice(0, 4);
    const more = all.slice(4);
    // kept tools (the diagram's zoom) stay in view as icons, after the first four
    const kept = (m.keep || []).map((id) => btn(id, { cls: 'ico' })).join('');
    const ui0 = S.ui; S.ui = other(ui0); const altLabel = ctxModel(b, tb)?.label || ''; S.ui = ui0; // the other language's title, for the parity measure
    const focusedTool = ctx.contains(root.activeElement) ? root.activeElement.dataset?.a || '' : null; // a tool pressed by keyboard or mouse keeps the keyboard when the strip is rebuilt under it
    ctx.innerHTML = `<span class="sc"><span class="i" aria-hidden="true">${ic('secSel')}</span><span class="st" data-alt="${esc(altLabel)}">${esc(m.label)}</span></span><div class="sb">${first.map((id) => ctxTool(id, ov)).join('')}${kept ? `<span class="keep-tools" role="group" aria-label="${esc(t('zoom'))}">${kept}</span>` : ''}${more.length ? `<div class="more"><button type="button" class="b" data-a="more" aria-expanded="false" aria-haspopup="true" title="${esc(t('more'))}"><span class="i">${ic('more')}</span><span class="w">${esc(t('more'))}</span></button><div class="menu" role="group" aria-label="${esc(t('more'))}" hidden>${more.map((id) => ctxTool(id, ov)).join('')}</div></div>` : ''}</div>`;
    if (!isCalm()) { ctx.classList.remove('swap'); void ctx.offsetWidth; ctx.classList.add('swap'); }
    if (focusedTool != null) { const again = focusedTool && [...ctx.querySelectorAll('[data-a]')].find((x) => x.dataset.a === focusedTool && !x.disabled); (again || ctx.querySelector('.sb .b:not([disabled])'))?.focus({ preventScroll: true }); }
  }
  ctx.hidden = false;
}
function placeCtx() { /* docked in the toolbar since 0.9.0: nothing to position */ }
let ctxRaf = 0;
window.addEventListener('scroll', () => { if (!ctxRaf) ctxRaf = requestAnimationFrame(() => { ctxRaf = 0; placeCtx(); }); }, { passive: true });

/* toasts, banner, progress */
/** A1: info/ok live 2.5 s, warn/err 4 s; a click anywhere on it dismisses (an action button still runs its action);
 *  hover or keyboard focus pauses the timer (WCAG 2.2.1); the same message again refreshes the one shown.
 *  review2 · 1: a toast with buttons (share, undo …) lives 6 s too, so `persist` only holds a warning or an error,
 *  and that one is a banner (a tamper warning is never lost); one queue, at most TOAST_MAX toasts besides the banners;
 *  focus the code moves onto a toast does not pin it, only a hover or the keyboard's own focus does. */
const TOAST_MS = { info: 2500, ok: 2500, warn: 4000, err: 4000 };
const TOAST_ACT_MS = 6000;
const TOAST_MAX = 2;
/** F2 · extra 10: a destructive action says so for 5 s with «تراجع». The press undoes it (the change counter goes back
 *  too) while it is still the newest change of its edition; after later edits, back() restores just that thing. */
function undoToast(msg, back, { viaUndo = true } = {}) {
  const svc = S.svc, ed = S.ed;
  const g = viaUndo ? M[svc]?.[ed]?.ops.at(-1)?.id.split('.')[0] : null;
  return toast(msg, 'info', { cls: 'undo', ms: 5000, actions: [[t('ux.undoDel'), () => {
    if (g && svc === S.svc && M[svc]?.[ed]?.ops.at(-1)?.id.split('.')[0] === g) undo(ed);
    else back?.();
  }]] });
}
function toast(msg, kind = 'info', { actions = [], persist = false, cls = '', ms = 0 } = {}) {
  const box = root.querySelector('.toasts');
  if (!box) return null;
  const isBanner = /banner/.test(cls) || (persist && (kind === 'warn' || kind === 'err'));
  if (isBanner && !/banner/.test(cls)) cls = `${cls} banner`.trim();
  persist = isBanner;
  const same = [...box.children].find((x) => x.dataset.msg === `${kind}|${msg}` && !x.classList.contains('out'));
  if (same && (persist || !actions.length)) { same.bwArm?.(); return same; }
  same?.remove(); // an action toast again (a second delete …): the newest one's buttons win
  const el = document.createElement('div');
  el.className = `toast ${kind} ${cls}`;
  el.dataset.msg = `${kind}|${msg}`;
  el.setAttribute('role', kind === 'err' ? 'alert' : 'status');
  el.innerHTML = `<span class="i">${ic(kind === 'err' ? 'err' : kind === 'ok' ? 'ok' : kind === 'warn' ? 'warn' : 'info')}</span><span class="m">${esc(msg)}</span>${actions.map(([l], i) => `<button type="button" data-k="${i}">${esc(l)}</button>`).join('')}`;
  el.onclick = (e) => {
    const k = e.target.closest('button')?.dataset.k;
    if (k === undefined && persist) return; // a banner waits for its choice
    dismiss(el);
    if (k !== undefined) actions[k][1]();
  };
  if (!persist) {
    let timer = 0;
    let held = 0;
    el.bwArm = () => { clearTimeout(timer); if (!held) timer = setTimeout(() => dismiss(el), Math.min(TOAST_ACT_MS, ms || (actions.length ? TOAST_ACT_MS : TOAST_MS[kind] || 2500))); };
    const hold = (on) => { held += on ? 1 : -1; if (held < 0) held = 0; if (held) clearTimeout(timer); else el.bwArm(); };
    el.addEventListener('pointerenter', () => hold(true));
    el.addEventListener('pointerleave', () => hold(false));
    // only the keyboard's own focus holds it (a focus() from code would pin it for ever)
    el.addEventListener('focusin', (e) => { if (e.target.matches?.(':focus-visible')) { el.bwKey = 1; hold(true); } });
    el.addEventListener('focusout', () => { if (el.bwKey) { el.bwKey = 0; hold(false); } });
    el.bwArm();
  }
  box.appendChild(el);
  const live = () => [...box.children].filter((x) => !x.classList.contains('banner') && !x.classList.contains('out'));
  while (live().length > TOAST_MAX) live()[0].remove();
  return el;
}
function dismiss(el) {
  if (!el.isConnected) return;
  if (isCalm()) { el.remove(); return; }
  el.classList.add('out');
  setTimeout(() => el.remove(), 260);
}
function flash(msg, bad = false) {
  if (bad && EXT.deps?.map?.(msg)) return; // 0.17.13: a missing playwright-core is one friendly notice with «Install now», not the raw path (ext/19-deps.js)
  const f = root.querySelector('.flash');
  if (f) f.textContent = msg;
  toast(msg, bad ? 'err' : 'ok');
}
/** F2 · 38: a live toast or banner (the restore-draft prompt …) follows a UI language switch: each fixed string is
 *  looked up by its words in the old language and replaced by the same key's words in the new one. */
function retranslateToasts(from, to) {
  if (from === to) return;
  const back = new Map(Object.entries(I18N.ui[from] || {}).filter(([, v]) => typeof v === 'string').map(([k, v]) => [v, k]));
  root.querySelectorAll('.toasts .toast :is(.m, button)').forEach((x) => {
    const k = back.get(x.textContent);
    if (k && typeof I18N.ui[to]?.[k] === 'string') x.textContent = I18N.ui[to][k];
  });
  root.querySelectorAll('.toasts .toast').forEach((x) => { x.lang = to; });
}
function banner(msg, actions) {
  const el = toast(msg, 'info', { actions, persist: true, cls: 'banner' });
  el?.querySelector('button')?.focus();
}
function busy(on) {
  const p = root.querySelector('.progress');
  if (p) p.hidden = !on;
}
function pop(id) {
  const b = root.querySelector(`.island [data-a="${id}"], .ctx [data-a="${id}"]`);
  if (!b || isCalm()) return;
  b.classList.remove('done'); void b.offsetWidth; b.classList.add('done');
  setTimeout(() => b.classList.remove('done'), 900);
}

/** A4: a press replays the pressed button's own icon motion (.ic-go), never another button's. */
function icPress(b) {
  const s = b.querySelector('.ic[data-ic]');
  if (!s || isCalm()) return;
  const parts = [...s.children];
  parts.forEach((x) => { x.style.animation = 'none'; }); void s.getBoundingClientRect(); parts.forEach((x) => { x.style.animation = ''; });
  b.classList.add('ic-go');
  clearTimeout(b.icGo); b.icGo = setTimeout(() => b.classList.remove('ic-go'), 900);
}

/** A small edit dialog. review2 · extra 9: what was typed is never thrown away without a choice — a click outside, or
 *  another tool asking, leaves a changed dialog open (it nudges); only «حفظ» / «إغلاق» / Esc end it.
 *  type: 'text' (a textarea), 'color' (the native swatch), 'number' (a stepper, min/max/step), 'select' (options). */
/** UIP-13: one exit for the ask dialog, the palette and the print center, the family of the drawer and bw-modal exits
 * (.closing: fade + small scale, --t-close = --bw-dur-fast, ease-in). Calm mode and reduced motion hide at once. */
function leaveEl(el, done) {
  clearTimeout(el.bwLeave);
  const end = () => { el.bwLeave = 0; el.classList.remove('closing'); done(); };
  if (isCalm() || el.hidden) { end(); return; }
  el.classList.add('closing');
  el.bwLeave = setTimeout(() => { if (el.classList.contains('closing')) end(); }, 180); // 160 ms (--bw-dur-fast) + a frame
}
/** the counterpart: a panel opened again before its exit finished stays open */
function arriveEl(el) { clearTimeout(el.bwLeave); el.bwLeave = 0; el.classList.remove('closing'); }
/** 0.17.0 (note 13): `preview` = { text, css(value) -> inline css, opt?(value) -> css of one list row, chips? } draws a live preview of the value under the field:
 *  the text under the selection (else a sample) in the face, size and colour being chosen, at its real point size, updated on every keystroke / arrow / click.
 *  A list shows each row in its own face; `chips` are one-press values (the type scale). */
function ask(label, value = '', { type = 'text', options = [], min, max, step, preview = null } = {}) {
  const d = root.querySelector('.dialog');
  if (!d.hidden && d.bwDirty?.()) { dlgNudge(d); return Promise.resolve(''); }
  d.bwCancel?.();
  arriveEl(d);
  d.hidden = false;
  d.setAttribute('aria-label', label);
  const num = (k, v) => (v != null ? ` ${k}="${esc(String(v))}"` : '');
  const field = type === 'color' ? `<input type="color" value="${esc(/^#[0-9a-f]{6}$/i.test(value) ? value : '#000000')}" />`
    : type === 'number' ? `<input type="number" inputmode="decimal" value="${esc(String(value))}"${num('min', min)}${num('max', max)}${num('step', step)} />`
      : type === 'select' ? `<select>${options.map((o) => { const [v, l] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(v)}"${v === value ? ' selected' : ''}${preview?.opt ? ` style="${attr(preview.opt(v))}"` : ''}>${esc(l)}</option>`; }).join('')}</select>`
        : `<textarea rows="3">${esc(value)}</textarea>`;
  const pvHtml = preview ? `${preview.chips ? `<div class="dlg-chips" role="group" aria-label="${esc(t('ux.previewSizes'))}">${preview.chips.map((c) => `<button type="button" class="b" data-chip="${esc(String(c))}"><span class="w">${esc(String(c))}</span></button>`).join('')}</div>` : ''}<div class="dlg-prev"><span class="dlg-prev-k">${esc(t('ux.preview'))}</span><div class="dlg-prev-t" dir="auto" role="img" aria-label="${esc(t('ux.preview'))}">${esc(preview.text || t('ux.previewSample'))}</div></div>` : '';
  d.innerHTML = `<label>${esc(label)}${field}</label>${preview ? pvHtml : ''}<p class="dlg-hint" hidden>${esc(t('ux.dlgKeep'))}</p><div class="btns"><button type="button" class="b primary" data-k="ok"><span class="w">${esc(t('save'))}</span></button><button type="button" class="b" data-k="no"><span class="w">${esc(t('close'))}</span></button></div>`;
  const f = d.querySelector('textarea, input, select');
  const initial = f.value;
  d.bwDirty = () => f.value !== initial;
  if (preview) {
    const pv = d.querySelector('.dlg-prev-t');
    const upd = () => { pv.style.cssText = preview.css(f.value); };
    for (const ev of ['input', 'change', 'keyup']) f.addEventListener(ev, upd);
    d.querySelectorAll('[data-chip]').forEach((c) => c.addEventListener('click', () => { f.value = c.dataset.chip; upd(); f.focus(); }));
    upd();
  }
  f.focus();
  return new Promise((res) => {
    const done = (v) => { d.bwDirty = null; d.bwCancel = null; leaveEl(d, () => { d.hidden = true; }); res(v); };
    d.bwCancel = () => done('');
    d.onclick = (e) => {
      const k = e.target.closest('button')?.dataset.k;
      if (k) done(k === 'ok' ? f.value.trim() : '');
    };
    d.onkeydown = (e) => {
      if (e.key === 'Escape') done('');
      else if (e.key === 'Enter' && f.tagName !== 'TEXTAREA') { e.preventDefault(); done(f.value.trim()); }
    };
  });
}
function dlgNudge(d) {
  const h = d.querySelector('.dlg-hint');
  if (h) h.hidden = false;
  d.classList.remove('nudge'); void d.offsetWidth; d.classList.add('nudge');
  d.querySelector('textarea, input, select')?.focus({ preventScroll: true });
}
// a press outside a changed dialog keeps it (and says so); an untouched one stays open as before
window.addEventListener('pointerdown', (e) => {
  const d = root.querySelector('.dialog');
  if (!d || d.hidden || !d.bwDirty?.() || e.composedPath().includes(d)) return;
  dlgNudge(d);
}, true);

/* command palette (Ctrl+K): type to filter, arrows to move, Enter to run, Esc to close */
let palIdx = 0;
function wirePalette() {
  const input = root.querySelector('.palette input');
  input.addEventListener('input', () => { palIdx = 0; fillPalette(); });
  input.addEventListener('keydown', (e) => {
    const items = [...root.querySelectorAll('#cmdlist [role="option"]')];
    if (e.key === 'ArrowDown') { e.preventDefault(); palIdx = Math.min(items.length - 1, palIdx + 1); markPal(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); palIdx = Math.max(0, palIdx - 1); markPal(); }
    else if (e.key === 'Enter') { e.preventDefault(); items[palIdx]?.click(); }
    else if (e.key === 'Escape') { e.preventDefault(); closePalette(); }
  });
  root.querySelector('#cmdlist').addEventListener('click', (e) => {
    const li = e.target.closest('[data-cmd]');
    if (!li) return;
    closePalette();
    runAction(li.dataset.cmd);
  });
}
/** The palette offers exactly what the toolbar offers now (one registry): the general sections and the selection's tools. */
const GENERAL_GROUPS = ['file', 'insert', 'edit', 'document', 'design', 'view', 'export'];
function paletteCmds() {
  const m = ctxModel(blockOf(S.sel?.b), !!tableCtx());
  const here = new Set([...(m?.groups || []).flat(), ...(m?.keep || [])]);
  const fmt = typeof W2F !== 'undefined' && W2F.leaf?.() != null; // the format bar is showing: its tools are in the palette too (TW-06)
  return CMDS.filter((c) => GENERAL_GROUPS.includes(c.group) || here.has(c.id) || (fmt && c.group === 'format'));
}
function fillPalette() {
  const q = fold(root.querySelector('.palette input').value.trim());
  const list = root.querySelector('#cmdlist');
  const hits = paletteCmds().filter((c) => !q || fold(`${t(c.id)} ${t('grp_' + c.group)} ${c.id}`).includes(q));
  let html = '';
  let g = '';
  hits.forEach((c, i) => {
    if (c.group !== g) { g = c.group; html += `<li role="presentation" class="gh">${esc(t('grp_' + g))}</li>`; }
    html += `<li role="option" id="cmd-${c.id}" data-cmd="${c.id}" aria-selected="${i === palIdx}" style="--k:${i}"><span class="i">${ic(c.id)}</span><span class="w">${esc(t(c.id))}</span>${c.key ? `<kbd>${esc(c.key)}</kbd>` : ''}</li>`;
  });
  list.innerHTML = html;
  root.querySelector('.palette .empty').hidden = hits.length > 0;
  markPal();
}
function markPal() {
  const items = [...root.querySelectorAll('#cmdlist [role="option"]')];
  items.forEach((x, i) => x.setAttribute('aria-selected', String(i === palIdx)));
  const cur2 = items[palIdx];
  root.querySelector('.palette input').setAttribute('aria-activedescendant', cur2?.id || '');
  cur2?.scrollIntoView({ block: 'nearest' });
}
function openPalette() {
  const s = root.querySelector('.scrim');
  arriveEl(s);
  s.hidden = false;
  palIdx = 0;
  const input = root.querySelector('.palette input');
  input.value = '';
  fillPalette();
  input.focus();
}
function closePalette() {
  const s = root.querySelector('.scrim');
  if (s && !s.hidden) leaveEl(s, () => { s.hidden = true; });
}

async function onBar(e) {
  if (uxSegClick(e)) return; // shell-ux.js: a click anywhere on a segmented field toggles it
  const b = e.target.closest('button[data-a]');
  if (!b || b.closest('.palette')) return;
  const a = b.dataset.a;
  icPress(b);
  if (a === 'more') { uxMenuToggle(b); return; } // shell-ux.js: the menu opens in the top layer, anchored to its button
  if (b.closest('.menu')) uxMenuClose(b.closest('.menu'));
  if (a === 'ed') { setLang(b.dataset.ed); return; }
  if (a === 'dir') { setDir(b.dataset.d); return; }
  await runAction(a);
}
/** 0.17.0 (note 3): the place the person is working on, kept across a language / direction switch. The anchor is the leaf under the caret (else the
 *  first leaf in view; in a page view the first leaf on the page shown) with its distance from the top of the window. Both editions share their
 *  pointers, so the same leaf is found in the other edition; then a page view shows the page that leaf is on now, and the continuous page scrolls
 *  so the leaf sits where it was. No anchor found (an empty page): the scroll and the page index stay as they were. Returns the restore function. */
function placeHold() {
  const main = mainOf(S.ed);
  const paged = typeof viewsActive === 'function' && viewsActive();
  const at0 = S.pageAt || 0;
  const y0 = window.scrollY;
  let p = null, top = 0;
  if (main) {
    const band = S.focus ? 0 : (barH || 90);
    const leaves = [...main.querySelectorAll('[data-p]')];
    const ae = document.activeElement?.closest?.('#bw-pair [data-p]');
    const seen = (el) => { const r = el.getBoundingClientRect(); return r.height > 0 && r.bottom > band && r.top < innerHeight && (!paged || [at0, viewsMode() === 'spread' && at0 > 0 ? at0 + 1 : at0].includes(viewsPageOf(el))); };
    const el = (ae && main.contains(ae) && seen(ae) ? ae : null) || leaves.find(seen);
    if (el) { p = el.dataset.p; top = el.getBoundingClientRect().top; }
  }
  return () => {
    const m = mainOf(S.ed);
    let el = null;
    for (let q = p; m && q && !el; q = q.slice(0, Math.max(0, q.lastIndexOf('/')))) { el = m.querySelector(`[data-p="${CSS.escape(q)}"]`); if (!q.includes('/')) break; }
    if (paged) {
      const pg = el ? viewsPageOf(el) : -1;
      S.pageAt = pg >= 0 ? pg : at0;
      viewsGo(0, true);
    } else if (el) window.scrollTo({ top: Math.max(0, window.scrollY + el.getBoundingClientRect().top - top), behavior: 'instant' });
    else window.scrollTo({ top: y0, behavior: 'instant' });
  };
}
// Language «ع» / «E»: the interface language and the document edition together.
function setLang(l, opts = {}) {
  const edChange = !!M[S.svc][l] && l !== S.ed;
  if (l === S.ui && !edChange) return;
  const was = S.ui;
  S.ui = l;
  ls.set('bw:ui', S.ui);
  // owner rule 2026-11-16: a language switch always lands on the language's own direction (ar RTL, en LTR); a manual flip lasts until the next switch
  if (!opts.keepDir) for (const k of ['ar', 'en']) { S.dirs[k] = null; ls.del(`bw:dir:${k}`); ls.del(`bw:start-dir:${k}`); } // keepDir: a tool walking the editions (print-center), not a person's switch
  if (!opts.keepDir) EXT.session?.push?.(); // the host forgets the flip now, not at the next edit
  const back = placeHold(); // the page being worked on stays (note 3)
  if (edChange) { S.ed = l; S.sel = null; S.selOv = null; }
  retranslateToasts(was, l);
  buildUi();
  render(!edChange);
  back();
  window.BW_WM?.relabel();
  EXT.start?.redraw?.(); // Settings opened over the start page: the page behind follows the language
}
// Layout direction RTL / LTR: independent of the language; remembered per edition (AR keeps RTL when EN goes LTR).
function setDir(d) {
  const back = placeHold(); // note 3: a direction switch keeps the page too
  S.dir = d;
  ls.set(`bw:dir:${S.ed}`, d);
  buildUi();
  render();
  back();
}