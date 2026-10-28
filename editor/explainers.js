/* Business-Wrap editor — hover/focus explainers (0.10.0), concatenated after views.js.
 * Rest on a tool (pointer or keyboard focus) for 700 ms → a card: the tool's name, its shortcut, one plain sentence
 * (i18n `explain.<id>`, Arabic and English) and a small looping illustration of what it does (SVG + CSS motion,
 * one of a few scenes, carrying the tool's own icon). Moving to the next tool while a card is up shows the next card
 * at once (warm-up, as native tooltips do). Leaving, pressing, scrolling or Esc hides it. Reduced motion or calm mode:
 * the illustration holds a still frame. The card is never focusable and never covers the control it explains.
 * Declarations only (hoisted) — xplWire() runs from uxAfterBuild(). */

/** Which explainer a control has: data-x (a field), data-a (a tool), data-dg (a selection picker), data-k / data-f (panel option). */
function xplKey(el) {
  if (!el) return '';
  if (el.dataset.x) return el.dataset.x;
  if (el.dataset.a === 'ed' || el.dataset.a === 'dir') return el.dataset.a;
  if (el.dataset.a) return el.dataset.a;
  if (el.dataset.dg) return `dg_${el.dataset.dg}`;
  if (el.dataset.k) return `k_${el.dataset.k}`;
  if (el.dataset.f) return `k_${el.dataset.f}`;
  // the Design panel's controls (design-panel.js, value-control.js, fonts.js): one explainer per kind of control
  if (el.dataset.fpopen) return 'font.pick';
  if (el.dataset.fplocal) return 'font.local';
  if (el.dataset.fpupload) return 'font.upload';
  if (el.dataset.fprm) return 'font.remove';
  if (el.classList.contains('vc-s')) return 'vc.slider';
  if (el.classList.contains('vc-n')) return 'vc.number';
  if (el.classList.contains('vc-u')) return 'vc.unit';
  if (el.classList.contains('cc-hex')) return 'design.hex';
  if (el.type === 'color') return 'design.swatch';
  if (el.dataset.dpart) return 'design.part';
  if (el.dataset.dmove) return 'design.move';
  if (el.dataset.lab) return 'design.label';
  return '';
}
function xplTarget(node) {
  if (ls.get('bw:explainers') === '0') return null; // Settings → Preferences: explainer cards off
  const el = node?.closest?.('button[data-a], select[data-a], select[data-dg], [data-x], .drawer [data-k], .drawer [data-f], .pop label.chk, .drawer :is([data-fpopen], [data-fplocal], [data-fpupload], [data-fprm], .vc-s, .vc-n, .vc-u, .cc-hex, input[type="color"], [data-dpart], [data-dmove], [data-lab])');
  if (!el || el.closest('.palette, .xpl')) return null;
  if (el.matches('.pop label.chk')) { el.dataset.x = el.dataset.x || 'both'; }
  const k = xplKey(el);
  return k && I18N.ui[S.ui][`explain.${k}`] ? el : null;
}
function xplWire() {
  if (root.__xplWired) return;
  root.__xplWired = true;
  const st = { timer: 0, el: null, warmUntil: 0 };
  xplWire.st = st;
  const arm = (el, delay) => {
    clearTimeout(st.timer);
    // the card replaces the native tooltip; the name the title gave moves to aria-label so it is never lost
    if (el.title) { el.dataset.tt = el.title; el.removeAttribute('title'); if (!el.getAttribute('aria-label')) el.setAttribute('aria-label', el.dataset.tt); }
    st.timer = setTimeout(() => xplShow(el), delay);
  };
  root.addEventListener('pointerover', (e) => {
    if (e.pointerType === 'touch') return;
    const el = xplTarget(e.target);
    if (!el || el === st.el) return;
    arm(el, performance.now() < st.warmUntil ? 0 : 700);
  });
  root.addEventListener('pointerout', (e) => {
    const el = xplTarget(e.target);
    if (!el || el.contains(e.relatedTarget)) return;
    clearTimeout(st.timer);
    if (st.el === el) xplHide();
  });
  root.addEventListener('focusin', (e) => {
    const el = xplTarget(e.target);
    if (!el || !el.matches(':focus-visible')) return;
    arm(el, performance.now() < st.warmUntil ? 0 : 700);
  });
  root.addEventListener('focusout', () => { clearTimeout(st.timer); xplHide(); });
  root.addEventListener('pointerdown', () => { clearTimeout(st.timer); xplHide(); }, true);
  window.addEventListener('scroll', () => xplHide(), { passive: true });
  // Esc hides the card first, wherever the focus is (the next Esc does the usual)
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && xplHide()) { e.stopImmediatePropagation(); e.preventDefault(); } }, true);
}
/** Hide the card; true when one was showing. */
function xplHide() {
  const st = xplWire.st;
  if (!st) return false;
  clearTimeout(st.timer);
  const card = root.querySelector('.xpl');
  const was = !!(card && !card.hidden);
  if (st.el) { st.el.removeAttribute('aria-describedby'); st.el = null; }
  if (was) { card.hidden = true; st.warmUntil = performance.now() + 450; }
  return was;
}
function xplShow(el) {
  const st = xplWire.st;
  if (!el.isConnected || !root.contains(el)) return;
  const shell = root.querySelector('.shell');
  let card = root.querySelector('.xpl');
  if (!card) {
    card = document.createElement('div');
    card.className = 'xpl';
    card.id = 'bw-xpl';
    card.setAttribute('role', 'tooltip');
    card.hidden = true;
    shell.appendChild(card);
  }
  const k = xplKey(el);
  const name = el.getAttribute('aria-label')?.split(':')[0] || el.querySelector('.w, .sw')?.textContent || el.dataset.tt || t(k);
  const key = CMDS.find((c) => c.id === k)?.key;
  card.dir = shell.dataset.tdir || 'rtl';
  card.lang = S.ui;
  card.innerHTML = `<div class="xa" aria-hidden="true">${xplArt(k)}</div><div class="xt"><b>${esc(name)}</b>${key ? `<kbd>${esc(key)}</kbd>` : ''}</div><p>${esc(t(`explain.${k}`))}</p>`;
  card.hidden = false;
  // under the control, centred on it, kept inside the window; above it when there is no room below
  const r = el.getBoundingClientRect();
  const cw = card.offsetWidth;
  const ch = card.offsetHeight;
  const x = Math.min(innerWidth - cw - 10, Math.max(10, r.left + r.width / 2 - cw / 2));
  const below = r.bottom + 10 + ch < innerHeight;
  card.style.left = `${Math.round(x)}px`;
  card.style.top = `${Math.round(below ? r.bottom + 10 : r.top - ch - 10)}px`;
  card.dataset.side = below ? 'below' : 'above';
  card.classList.remove('in'); void card.offsetWidth; card.classList.add('in');
  el.setAttribute('aria-describedby', 'bw-xpl');
  st.el = el;
}

/* ── illustrations: a scene per kind of action, with the tool's own icon ─────────────── */
function xplScene(k) {
  const by = {
    pop: ['image', 'logo', 'addDiagram', 'addPara', 'newdoc', 'comment', 'dgStaff', 'dgApplicant', 'dgStart', 'dgPayment', 'dgRework', 'dgSystem', 'dgDecision', 'dgOk', 'dgStop', 'dgNote', 'dgGroup', 'dgText', 'dg_symbol', 'k_logoAdd'],
    dup: ['duplicate', 'dgDup'],
    del: ['delete', 'ovDelete', 'dgDel', 'hideBlock'],
    up: ['moveUp', 'rowUp', 'dgFront'],
    down: ['moveDown', 'rowDown', 'dgBack'],
    rows: ['rowAdd', 'rowDel'],
    cols: ['colAdd', 'colDel'],
    undo: ['undo'],
    redo: ['redo'],
    scan: ['find', 'check', 'outline', 'k_q', 'k_next', 'k_all', 'k_r', 'renumber'],
    save: ['save', 'saveHtml', 'exportEdits', 'exportAll', 'k_snap', 'k_log'],
    out: ['exportPdf', 'print'],
    in: ['import', 'dgMermaidIn', 'replace', 'dgMermaidOut', 'svc'],
    panel: ['theme', 'styleThis', 'history', 'process', 'webhooks', 'pages', 'palette', 'more', 'view', 'k_close'],
    zoom: ['zoomIn', 'zoomOut', 'dgZoomIn', 'dgZoomOut', 'dgZoomFit', 'dgZoom100'],
    toggle: ['dark', 'calm', 'snap', 'spell', 'focus', 'both', 'every'],
    lang: ['ed', 'uiLang'],
    dir: ['dir', 'dgFlow', 'dgReverse'],
    align: ['dgAlignL', 'dgAlignC', 'dgAlignR', 'dgAlignT', 'dgAlignM', 'dgAlignB', 'dgDistH', 'dgDistV', 'dgWrap', 'dgAuto', 'dgReset'],
    link: ['dgConnect', 'dgEdgeLabel', 'dgBendAdd', 'dgBendDel', 'dgRouteAuto', 'dgFrom', 'dgTo', 'dg_wire', 'keepNext'],
    split: ['breakBefore'],
    font: ['font.pick', 'font.local', 'font.upload', 'font.remove', 'k_embed', 'k_docxFonts'],
    slider: ['vc.slider', 'vc.number', 'vc.unit', 'design.part', 'design.move'],
    swatch: ['design.swatch', 'design.hex', 'k_texp', 'k_timp', 'k_dcssApply', 'k_stclear', 'k_sthide'],
    label: ['design.label', 'k_laball', 'k_addSection', 'k_addTable', 'dgLabel', 'dgSub', 'caption', 'dg_kind', 'dg_color', 'dg_badge', 'dg_icon', 'dgLegend'],
    single: ['view.single', 'view.prev', 'view.next'],
    spread: ['view.spread', 'view.mode', 'side'],
    flow: ['view.continuous'],
  };
  for (const [scene, ids] of Object.entries(by)) if (ids.includes(k)) return scene;
  return 'panel';
}
/** A 160×96 drawing: a page (or two), the moving part, and the tool's icon in a gold badge. */
function xplArt(k) {
  const scene = xplScene(k);
  const lines = (x, y, n, w = 44) => Array.from({ length: n }, (_, i) => `<rect class="ln" x="${x}" y="${y + i * 9}" width="${i % 3 === 2 ? w - 14 : w}" height="4" rx="2"/>`).join('');
  const page = (x = 52, cls = 'pg') => `<g class="${cls}"><rect class="sheet" x="${x}" y="8" width="56" height="78" rx="5"/>${lines(x + 6, 18, 7)}</g>`;
  const block = (cls, y = 36) => `<rect class="${cls}" x="58" y="${y}" width="44" height="12" rx="3"/>`;
  const art = {
    pop: `${page()}${block('blk pop')}`,
    dup: `${page()}${block('blk')}${block('blk ghost dup', 36)}`,
    del: `${page()}${block('blk del')}`,
    up: `${page()}${block('blk up', 54)}`,
    down: `${page()}${block('blk down', 22)}`,
    rows: `<g class="tbl"><rect class="sheet" x="40" y="14" width="80" height="66" rx="5"/>${[0, 1, 2].map((i) => `<rect class="cell" x="46" y="${22 + i * 14}" width="68" height="10" rx="2"/>`).join('')}<rect class="cell hi grow-y" x="46" y="64" width="68" height="10" rx="2"/></g>`,
    cols: `<g class="tbl"><rect class="sheet" x="40" y="14" width="80" height="66" rx="5"/>${[0, 1, 2].map((i) => `<rect class="cell" x="${46 + i * 18}" y="22" width="14" height="52" rx="2"/>`).join('')}<rect class="cell hi grow-x" x="100" y="22" width="14" height="52" rx="2"/></g>`,
    undo: `${page()}<rect class="blk type" x="58" y="36" width="44" height="12" rx="3"/><path class="arc back" d="M118 30 a14 14 0 1 0 6 18" />`,
    redo: `${page()}<rect class="blk type" x="58" y="36" width="44" height="12" rx="3"/><path class="arc fwd" d="M42 30 a14 14 0 1 1 -6 18" />`,
    scan: `${page()}<rect class="hit" x="58" y="24" width="30" height="7" rx="2"/><g class="lens"><circle cx="0" cy="0" r="9"/><path d="M6 6 l8 8"/></g>`,
    save: `${page()}<g class="drop"><path d="M80 -6 v16 m-7 -7 l7 7 l7 -7"/></g><rect class="tray" x="60" y="88" width="40" height="5" rx="2"/>`,
    out: `${page()}<g class="fly">${page(52, 'pg copy')}</g><rect class="tray" x="118" y="70" width="30" height="20" rx="4"/>`,
    in: `<rect class="tray" x="10" y="36" width="30" height="24" rx="4"/>${page()}<rect class="blk slidein" x="58" y="36" width="44" height="12" rx="3"/>`,
    panel: `${page(70)}<g class="pane"><rect class="side" x="14" y="8" width="44" height="78" rx="6"/>${lines(20, 20, 5, 30)}</g>`,
    zoom: `<g class="zm">${page()}</g>`,
    toggle: `<rect class="track" x="48" y="34" width="64" height="28" rx="14"/><circle class="knob" cx="62" cy="48" r="10"/>`,
    lang: `<rect class="sheet" x="30" y="16" width="100" height="62" rx="8"/><text class="glyph a" x="80" y="57" text-anchor="middle">ع</text><text class="glyph e" x="80" y="57" text-anchor="middle">E</text>`,
    dir: `<rect class="sheet" x="30" y="16" width="100" height="62" rx="8"/><g class="rtl">${lines(70, 30, 4, 50)}</g><path class="dirarrow" d="M58 70 h44 m-8 -6 l8 6 l-8 6"/>`,
    align: `<rect class="sheet" x="26" y="10" width="108" height="76" rx="6"/><rect class="bx a1" x="40" y="20" width="34" height="16" rx="3"/><rect class="bx a2" x="66" y="44" width="50" height="16" rx="3"/><rect class="bx a3" x="52" y="66" width="26" height="12" rx="3"/><path class="guide" d="M40 14 v68"/>`,
    link: `<rect class="sheet" x="18" y="10" width="124" height="76" rx="6"/><rect class="bx" x="28" y="36" width="34" height="22" rx="4"/><rect class="bx" x="98" y="36" width="34" height="22" rx="4"/><path class="wire" d="M62 47 C 76 30, 84 64, 98 47"/><path class="tip" d="M92 42 l6 5 l-6 5"/>`,
    split: `${page(28, 'pg p1')}${page(78, 'pg p2')}<path class="cut" d="M58 4 v88"/>`,
    label: `<rect class="sheet" x="26" y="18" width="108" height="58" rx="8"/><rect class="bx" x="44" y="34" width="72" height="26" rx="5"/><rect class="caret" x="60" y="41" width="2" height="12"/><rect class="type" x="64" y="43" width="36" height="8" rx="2"/>`,
    font: `<rect class="sheet" x="26" y="14" width="108" height="66" rx="8"/><text class="glyph a" x="80" y="58" text-anchor="middle">Aa</text><text class="glyph e fnt" x="80" y="58" text-anchor="middle">أب</text>`,
    slider: `<rect class="sheet" x="18" y="22" width="124" height="50" rx="8"/><rect class="track" x="28" y="44" width="70" height="6" rx="3"/><circle class="knob slide" cx="36" cy="47" r="7"/><rect class="cell" x="106" y="36" width="28" height="22" rx="4"/><rect class="type" x="111" y="44" width="18" height="6" rx="2"/>`,
    swatch: `<rect class="sheet" x="26" y="18" width="108" height="58" rx="8"/><rect class="chip" x="38" y="30" width="34" height="34" rx="6"/><rect class="cell" x="80" y="38" width="44" height="16" rx="3"/><rect class="type" x="85" y="43" width="30" height="6" rx="2"/>`,
    single: `<g class="book one">${page(52)}</g><path class="turn" d="M112 48 l8 0 m-4 -4 l4 4 l-4 4"/>`,
    spread: `<g class="book">${page(24, 'pg l')}${page(84, 'pg r')}</g>`,
    flow: `<g class="scroll">${page(52)}<g transform="translate(0 84)">${page(52)}</g></g>`,
  }[scene];
  return `<svg viewBox="0 0 160 96" class="sc-${scene}" focusable="false">${art}<g class="badge" transform="translate(132 68)"><circle r="14"/><g transform="translate(-9 -9) scale(.75)">${(ic(k) || ic(k.replace(/^dg_/, 'dg')) || ic('info')).replace('<svg', '<svg width="24" height="24"')}</g></g></svg>`;
}
