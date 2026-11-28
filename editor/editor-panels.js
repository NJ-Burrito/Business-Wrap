/* ── zoom (0.15.0 note 9): 25 % to 400 %, presets for the buttons, x1.1 for Ctrl+wheel, the point under the window centre stays put ── */
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 4;
const ZOOM_PRESETS = [25, 33, 50, 67, 75, 80, 90, 100, 110, 125, 150, 175, 200, 250, 300, 400];
const A4_W = 210 * 96 / 25.4; // px at 100 %
const A4_H = 297 * 96 / 25.4;
const zoomClamp = (z) => (Number.isFinite(+z) ? Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(+z * 1000) / 1000)) : zoomEff());
/** 0.15.2 note 11: the zoom the person sees is the real size of a page on screen: 100 % = an A4 sheet at 96 dpi (793.7 CSS px wide), in every view.
 *  S.zoom is the number CSS multiplies by; the page views (views.js) multiply it by their fit-to-window scale (--bw-pz = fit x S.zoom) and the
 *  side-by-side view by .62, so the pill, the field, Ctrl+wheel and the presets all speak the EFFECTIVE percentage: eff = S.zoom x base. */
function zoomBase() {
  if (document.getElementById('bw-pair')?.classList.contains('bw-side')) return 0.62;
  if (typeof viewsActive === 'function' && viewsActive()) { const pz = parseFloat(document.documentElement.style.getPropertyValue('--bw-pz')); return pz > 0 && S.zoom > 0 ? pz / S.zoom : 1; }
  return 1;
}
const zoomEff = () => S.zoom * zoomBase();
const zoomPctNow = () => Math.round(zoomEff() * 100);
let zoomFillOn = false; // Fill height stays on (re-fitted when the ribbon opens / closes and the window resizes) until the next manual zoom
/** Set the zoom (a fraction, 1 = 100 % true size), clamped to 25-400 %; keeps the document point under the window centre where it was. */
function setZoom(z, o = {}) {
  if (!o.fill) zoomFillOn = false;
  const base = zoomBase();
  const eff = zoomClamp(z);
  const next = eff / base;
  const el = document.documentElement;
  const sh = el.scrollHeight || 1, sw = el.scrollWidth || 1;
  const cy = (window.scrollY + innerHeight / 2) / sh, cx = (window.scrollX + innerWidth / 2) / sw;
  const changed = Math.abs(next - S.zoom) > 1e-9;
  S.zoom = next;
  if (changed) {
    render();
    const h = el.scrollHeight, w = el.scrollWidth;
    if (!o.fill && (h > innerHeight || w > innerWidth)) window.scrollTo({ left: Math.max(0, cx * w - innerWidth / 2), top: Math.max(0, cy * h - innerHeight / 2), behavior: 'instant' });
  }
  viewPct();
  zoomPillSync();
  return S.zoom;
}
/** The next preset above / below the current zoom (the buttons step through the list, not by a fixed 10 %). */
function zoomStep(dir) {
  const pct = zoomPctNow();
  const p = dir > 0 ? ZOOM_PRESETS.find((v) => v > pct) : [...ZOOM_PRESETS].reverse().find((v) => v < pct);
  return setZoom((p ?? (dir > 0 ? 400 : 25)) / 100);
}
const zoomFitWidth = () => {
  const pages = (document.getElementById('bw-pair')?.classList.contains('bw-side') || (typeof viewsMode === 'function' && viewsActive() && viewsMode() === 'spread')) ? 2 : 1;
  return setZoom((document.documentElement.clientWidth - 96) / (A4_W * pages + (pages - 1) * 24));
};
/** Fill height (0.15.2 note 10): the page's top right under the ribbon / toolbar and its bottom just above the page pager (or the window's bottom
 *  when there is no pager), the SAME gap on both sides. The gap is the view's own natural top gap (the reserved band + the page view's padding);
 *  re-fitted when the ribbon opens, folds or finishes its transition, and on window resize, until another zoom is chosen. */
function zoomFillNow() {
  measureBar(true);
  if (typeof viewsActive === 'function' && viewsActive()) viewsFit(); // the page views' fit-to-window scale depends on the band just measured: read it fresh
  const bar = root.querySelector('.island');
  const view = document.querySelector('#bw-pair .bw-view') || document.querySelector('#bw-pair main.bw-doc');
  if (!view) return;
  const barBottom = S.focus || !bar ? 0 : bar.offsetTop + bar.offsetHeight;
  const pager = root.querySelector('.pager:not([hidden])');
  const limit = pager ? pager.getBoundingClientRect().top : innerHeight;
  window.scrollTo({ top: 0, behavior: 'instant' });
  const natural = Math.max(0, view.getBoundingClientRect().top - barBottom);
  const gap = Math.max(8, Math.min(28, natural)); // a tall reserved band above a continuous page is scrolled away, never kept as a gap
  setZoom((limit - barBottom - 2 * gap) / A4_H, { fill: true });
  const now = document.querySelector('#bw-pair .bw-view') || document.querySelector('#bw-pair main.bw-doc'); // render() replaced the nodes
  window.scrollTo({ top: Math.max(0, (now || view).getBoundingClientRect().top - barBottom - gap), behavior: 'instant' });
}
function zoomFitHeight() { zoomFillOn = true; zoomFillNow(); return S.zoom; }
{
  let t = 0;
  const again = () => { if (!zoomFillOn) return; clearTimeout(t); t = setTimeout(() => { if (zoomFillOn) zoomFillNow(); }, 140); };
  addEventListener('resize', again);
  addEventListener('resize', () => setTimeout(() => { zoomPillSync(); viewPct(); }, 0)); // the page views refit to the window: the pill follows the real size
  window.__bwFillAgain = again; // the ribbon's height changes (the bar's ResizeObserver in measureBar) and its transitionend call this
}
/** The % field of the View tab: accepts 25-400, anything else is corrected inline to the nearest limit (no toast). */
function zoomFromField(v) {
  const n = parseFloat(String(v ?? '').replace(/[^\d.]/g, ''));
  if (!Number.isFinite(n)) { viewPct(); return S.zoom; }
  return setZoom(n / 100);
}
// QA N28: the zoom pill takes a typed percent (README «type a number»): click, Enter or Space opens a field; Enter or leaving applies, Esc cancels
{
  const typeZoom = (p) => {
    if (p.querySelector('input')) return;
    const i = document.createElement('input');
    Object.assign(i, { type: 'number', min: '25', max: '400', step: '5', value: String(zoomPctNow()) });
    i.setAttribute('aria-label', t('zoomPct'));
    i.style.cssText = 'inline-size:6ch;font:inherit;padding:0 2px;border:1px solid currentColor;border-radius:4px;background:transparent;color:inherit';
    p.textContent = ''; p.appendChild(i); i.focus(); i.select();
    let done = false;
    const end = (apply) => { if (done) return; done = true; const v = i.value; i.remove(); if (apply) zoomFromField(v); zoomPillSync(); p.textContent ||= `${zoomPctNow()}%`; };
    i.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); end(true); p.focus(); } else if (e.key === 'Escape') { e.preventDefault(); end(false); p.focus(); } });
    i.addEventListener('blur', () => end(true));
  };
  root.addEventListener('click', (ev) => { const p = ev.target.closest?.('[data-zoom-pill]'); if (p && ev.target === p) typeZoom(p); });
  root.addEventListener('keydown', (ev) => { const p = ev.target.closest?.('[data-zoom-pill]'); if (p && ev.target === p && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); typeZoom(p); } });
}
// Ctrl + wheel zooms the page by x1.1 per notch (a diagram figure keeps its own Ctrl+wheel); one render per frame however many notches arrive
{
  let acc = 1, raf = 0;
  document.addEventListener('wheel', (e) => {
    if (!(e.ctrlKey || e.metaKey) || (e.target.closest?.('#bw-pair figure[data-dg]') && !dgWheelPage(e))) return;
    if (e.composedPath?.().some((x) => x === document.getElementById('bw-ui-host'))) return;
    e.preventDefault();
    acc *= e.deltaY < 0 ? 1.1 : 1 / 1.1;
    if (!raf) raf = requestAnimationFrame(() => { raf = 0; const f = acc; acc = 1; setZoom(zoomEff() * f); });
  }, { passive: false });
}
/** Does runAction know this id? (the core switch below, the registered extensions' actions, export.* and the diagram tools) */
let coreActionSrc = ''; // runAction's own source, read once right after it is defined (before any extension wraps it)
const actionKnown = (a) => typeof a === 'string' && (new RegExp(`case '${a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`).test(coreActionSrc) || !!EXT.actions[a] || /^export\./.test(a) || a === 'addDiagram' || a === 'dgSymbol' || /^dg/.test(a));
async function runAction(a, arg) {
  switch (a) {
    case 'side': S.side = !S.side; buildUi(); render(false); break;
    case 'uiLang': setLang(S.ui === 'ar' ? 'en' : 'ar'); break;
    case 'dir': setDir(uiDir() === 'rtl' ? 'ltr' : 'rtl'); break;
    case 'dark': S.dark = !S.dark; ls.set('bw:dark', S.dark ? '1' : '0'); buildUi(); EXT.start?.redraw?.(); break;
    case 'calm': S.calm = !S.calm; ls.set('bw:calm', S.calm ? '1' : '0'); buildUi(); EXT.start?.redraw?.(); toast(t(S.calm ? 'calmOn' : 'calmOff'), 'info'); break;
    case 'focus': S.focus = !S.focus; S.view = false; buildUi(); toast(t(S.focus ? 'focusOn' : 'focusOff'), 'info'); break;
    case 'view': S.view = !S.view; buildUi(); break;
    case 'snap': S.snap = !S.snap; ls.set('bw:snap', S.snap ? '1' : '0'); buildUi(); break;
    case 'palette': openPalette(); break;
    case 'undo': undo(); break;
    case 'redo': redo(); break;
    case 'duplicate': A.duplicate(); pop('duplicate'); break;
    case 'delete': A.delete(); break;
    case 'moveUp': case 'moveDown': {
      A.move(a === 'moveUp' ? -1 : 1);
      // R3: the focus stays on the pressed tool, so Alt+↑/↓, Ctrl+Z, Ctrl+D and Delete keep working from the toolbar
      let keep = root.querySelector(`.ctx [data-a="${a}"]:not([disabled])`); // the pressed tool is disabled once the block is last (or first): the keyboard goes to its twin, then to the first enabled tool
      if (!keep) keep = root.querySelector(`.ctx [data-a="${a === 'moveUp' ? 'moveDown' : 'moveUp'}"]:not([disabled])`) || root.querySelector('.ctx .sb .b:not([disabled])');
      if (keep && root.activeElement !== keep && !document.activeElement?.closest?.('#bw-pair')) keep.focus({ preventScroll: true });
      break;
    }
    case 'addPara': A.addPara(); break;
    case 'rowAdd': A.rowAdd(); break;
    case 'rowDel': A.rowDel(); break;
    case 'colAdd': A.colAdd(); break;
    case 'colDel': A.colDel(); break;
    case 'image': await A.image(); break;
    case 'logo': await OVL.add('logo'); break;
    case 'replace': await OVL.replace(); break;
    case 'caption': await OVL.caption(); break;
    case 'every': OVL.every(); break;
    case 'ovDelete': OVL.remove(); break;
    case 'comment': await A.comment(); break;
    case 'breakBefore': A.layout('breakBefore'); break;
    case 'keepNext': A.layout('keepNext'); break;
    case 'styleThis': openDrawer('style'); break;
    case 'hideBlock': DESIGN.toggleHidden(); break;
    case 'rowUp': DESIGN.moveRow(-1); break;
    case 'rowDown': DESIGN.moveRow(1); break;
    case 'renumber': A.renumber(); break;
    case 'find': case 'outline': case 'check': case 'history': case 'theme': case 'pages': case 'webhooks': case 'newdoc': case 'process': case 'settings':
      S.drawer === a ? closeDrawer() : openDrawer(a); break;
    case 'save': saveAll(); pop('save'); break;
    case 'saveHtml': await saveHtml(!!S.embedFonts); break;
    case 'import': { const f = await pickFile('.json,.html,application/json,text/html'); if (f) await importFile(f); break; }
    case 'exportEdits': download(`${S.svc}.edits-bundle.json`, JSON.stringify(bundle([S.svc]), null, 1)); emitHook('edits.exported', { scope: 'service' }); window.dispatchEvent(new CustomEvent('bw:wm', { detail: { id: 'W02' } })); break;
    case 'exportAll': download(`all-services.edits-bundle.json`, JSON.stringify(bundle(Object.keys(M)), null, 1)); emitHook('edits.exported', { scope: 'all' }); window.dispatchEvent(new CustomEvent('bw:wm', { detail: { id: 'W02' } })); break;
    case 'exportPdf': busy(true); try { await exportPdfDocx(); } finally { busy(false); } break;
    case 'print': pcOpenPrint(); break;
    case 'both': S.both = !S.both; buildUi(); break;
    case 'zoomReset': setZoom(1); break;
    case 'zoomFit': zoomFitWidth(); break;
    case 'zoomHeight': zoomFitHeight(); break;
    case 'zoomIn': zoomStep(1); break;
    case 'zoomOut': zoomStep(-1); break;
    case 'zoomPct': zoomFromField(arg ?? root.querySelector('[data-a="zoomPct"] input, input[data-a="zoomPct"]')?.value ?? window.BW?.zoomPctValue); break;
    // the projects lane (13-projects.js) registers these through bwExt({ actions }); until then the button says so instead of doing nothing
    case 'projExport': case 'projImport':
      if (EXT.actions[a]) await EXT.actions[a](a);
      else { window.dispatchEvent(new CustomEvent('bw:project', { detail: { op: a === 'projExport' ? 'export' : 'import' } })); toast(t('projSoon'), 'info'); }
      break;
    case 'spell': S.spell[S.ed] = !S.spell[S.ed]; ls.set(`bw:spell:${S.ed}`, S.spell[S.ed] ? '1' : '0'); buildUi(); render(); emit('spell', S.ed, S.spell[S.ed]); break; // 'spell' event: the extension starts or stops its checker
    case 'view.continuous': viewsSet('continuous'); break;
    case 'view.single': viewsSet('single'); break;
    case 'view.spread': viewsSet('spread'); break;
    case 'view.prev': viewsGo(-1); break;
    case 'view.next': viewsGo(1); break;
    default:
      if (EXT.actions[a]) await EXT.actions[a](a);
      else if (/^export\./.test(a)) await pcAction(a);
      else if (a === 'addDiagram' || a === 'dgSymbol' || /^dg/.test(a)) await dgAction(a);
      else throw new Error(`unknown action: ${a}`); // 0.15.0: a typo or a stale id fails loudly instead of doing nothing
      break;
  }
}
coreActionSrc = runAction.toString();

/* ── drawers (slide-over panels) ───────────────────────────────────────── */
function closeDrawer() {
  S.drawer = null;
  const d = root.querySelector('.drawer');
  if (!d || d.hidden) return;
  if (EXT.start?.isOpen?.() && d.contains(root.activeElement)) root.querySelector('dialog.bw-start [data-st-set]')?.focus({ preventScroll: true }); // the start page is under the drawer: Esc, / and the arrows are its own
  if (isCalm()) { d.hidden = true; return; }
  d.classList.add('closing');
  // 240 ms = --bw-dur-base, the close animation; a drawer reopened before it finishes stays open (openDrawer cancels the hide)
  closeDrawer.timer = setTimeout(() => { closeDrawer.timer = 0; if (d.classList.contains('closing')) { d.hidden = true; d.classList.remove('closing'); } }, 240);
}
function openDrawer(kind, soft = false) {
  const d = root.querySelector('.drawer');
  if (soft && d.contains(root.activeElement)) return;
  S.drawer = kind;
  clearTimeout(closeDrawer.timer);
  d.hidden = false;
  d.classList.remove('closing');
  const head = (title) => `<header><h2>${esc(title)}</h2><button type="button" class="b" data-k="close" aria-label="${esc(t('close'))}"><span class="i">${ic('close')}</span><span class="w">${esc(t('close'))}</span></button></header>`;
  const icon = { err: ic('err'), warn: ic('warn'), info: ic('info'), ok: ic('ok') };
  const word = { err: t('err'), warn: t('warn'), info: t('info'), ok: t('ok') };
  let html = '';
  const x = EXT.drawers[kind]?.(d); // an extension's drawer: { title, html, mount?(drawer) }
  if (x) {
    d.setAttribute('aria-label', x.title);
    html = head(x.title) + x.html;
  } else if (kind === 'check') {
    const v = validate();
    d.setAttribute('aria-label', t('checkTitle'));
    html = head(t('checkTitle')) + (v.length ? `<ul class="list">${v.map(([lv, msg, ptr, fix]) => `<li class="${lv}"><span class="i">${icon[lv]}</span> <b>${esc(word[lv])}</b> ${esc(msg)}${ptr ? ` <button type="button" class="jump" data-go="${esc(ptr)}" data-ring="1">${esc(t('ux.jump'))}</button>` : ''}${fix ? ` <button type="button" class="jump fix" data-fix="${esc(fix.id)}"${fix.arg != null ? ` data-fix-arg="${esc(fix.arg)}"` : ''}>${esc(fix.label)}</button>` : ''}</li>`).join('')}</ul>` : `<p class="ok"><span class="i">${icon.ok}</span> ${esc(t('vAllGood'))}</p>`) + singleEditionPanel();
  } else if (kind === 'pages') {
    d.setAttribute('aria-label', t('pagesTitle'));
    html = head(t('pagesTitle')) + `<p class="hint out" role="status"></p><ol class="thumbs">${Array.from({ length: 6 }, () => '<li class="skel" aria-hidden="true"><i></i></li>').join('')}</ol>`;
    setTimeout(() => loadThumbs(d), 0);
  } else if (kind === 'outline') {
    d.setAttribute('aria-label', t('outline'));
    html = head(t('outline')) + `<ol class="list nav">${(() => { const NUM = docNumbers(cur().doc); return cur().doc.chapters.map((ch, i) => `<li><button type="button" data-go="/chapters/${i}/title">${esc(NUM.ch[i])} ${esc(ch.title)}</button><ol>${ch.sections.map((s, j) => `<li><button type="button" data-go="/chapters/${i}/sections/${j}/title">${esc(NUM.sec[i][j])} ${esc(s.title)}</button></li>`).join('')}</ol></li>`).join(''); })()}</ol>`;
  } else if (kind === 'find') {
    d.setAttribute('aria-label', t('find'));
    html = head(t('find')) + `<label>${esc(t('findLabel'))}<input data-f="q" type="search"></label><label>${esc(t('replaceLabel'))}<input data-f="r" type="text"></label><p class="hint">${esc(t('foldHint'))}</p><div class="btns"><button type="button" class="b primary" data-k="next"><span class="w">${esc(t('findNext'))}</span></button><button type="button" class="b" data-k="all"><span class="w">${esc(t('replaceAll'))}</span></button></div><p class="out" role="status"></p>`;
  } else if (kind === 'history') {
    d.setAttribute('aria-label', t('historyTitle'));
    const e = cur();
    const st = (o) => e.status[o.id] || 'pending';
    html = head(t('historyTitle')) + `<div class="btns"><button type="button" class="b" data-k="snap"><span class="w">${esc(t('snapshot'))}</span></button><button type="button" class="b" data-k="log"><span class="w">${esc(t('exportLog'))}</span></button></div>
<ol class="list log">${e.ops.map((o, i) => `<li class="${st(o)}"><code>${esc(o.op)}</code> <span class="path">${esc(o.path)}</span>${o.op === 'setText' ? `<div class="diff"><del>${esc(o.old ?? '')}</del><ins>${esc(o.value)}</ins></div>` : ''}<div class="btns"><span class="badge">${esc(t(st(o)))}</span><button type="button" data-ok="${i}" aria-pressed="${st(o) === 'approved'}">${esc(t('approve'))}</button><button type="button" data-no="${i}" aria-pressed="${st(o) === 'rejected'}">${esc(t('reject'))}</button></div></li>`).reverse().join('')}</ol>
<h3>${esc(t('snapshot'))}</h3><ul class="list">${e.versions.map((v, i) => `<li>${esc(v.name)} <small>${esc(v.at)}</small> <button type="button" data-diff="${i}">${esc(t('diff'))}</button></li>`).join('')}</ul><div class="difftable"></div>
${e.comments.length ? `<h3>${esc(t('comment'))}</h3><ul class="list">${e.comments.map((c, i) => `<li><button type="button" data-go="${esc(c.path)}">${esc(c.text)}</button> <button type="button" data-delc="${i}" aria-label="${esc(t('delete'))}">${ic('close')}</button></li>`).join('')}</ul><div class="btns"><button type="button" class="b" data-k="cexp"><span class="w">${esc(t('comment'))}</span></button></div>` : ''}`;
  } else if (kind === 'theme') {
    d.setAttribute('aria-label', t('theme'));
    FONTS.open = null;
    html = head(t('theme')) + DESIGN.panel();
    setTimeout(() => FONTS.autoLocal(), 0);
  } else if (kind === 'style') {
    d.setAttribute('aria-label', t('styleThis'));
    html = head(t('styleThis')) + DESIGN.inspector();
  } else if (kind === 'newdoc') {
    d.setAttribute('aria-label', t('newdoc'));
    html = head(t('newdoc')) + newdocPanel();
  } else if (kind === 'process') {
    d.setAttribute('aria-label', t('process'));
    html = head(t('process')) + processPanel();
  } else if (kind === 'settings') {
    d.setAttribute('aria-label', t('settings'));
    html = head(t('settings')) + settingsPanel(); // settings.js
  } else if (kind === 'webhooks') {
    d.setAttribute('aria-label', t('webhooks'));
    html = head(t('webhooks')) + hooksPanel();
  } else if (kind === 'conflicts') {
    d.setAttribute('aria-label', t('conflictTitle'));
    const opText = (o) => `${o.op} ${o.from ? `${o.from} → ` : ''}${o.path}`;
    const side = (c, k) => (c.kind === 'structure' ? c[k].map(opText).join(' · ') : JSON.stringify(c[k]));
    html = head(t('conflictTitle')) + `<ul class="list">${S.conflicts.map((c, i) => `<li data-kind="${c.kind || 'text'}"><span class="path">${esc(c.ed)} ${esc(c.path)}${c.kind === 'structure' ? ` (${esc(t('structConflict'))})` : ''}</span><div class="diff"><div><b>${esc(t('mine'))}</b> ${esc(side(c, 'mine'))}</div><div><b>${esc(t('theirs'))}</b> ${esc(side(c, 'theirs'))}</div></div><div class="btns"><button type="button" data-mine="${i}">${esc(t('keepMine'))}</button><button type="button" data-theirs="${i}">${esc(t('keepTheirs'))}</button></div></li>`).join('')}</ul>`;
  }
  d.innerHTML = html;
  uxDrawerGroups(d, kind); // shell-ux.js (A7): headed groups collapse, alternating rows
  if (kind === 'settings') window.BW_LEARNING?.mount(d.querySelector('[data-lrn-mount]'), { heading: false }); // learning-hook.js
  if (kind === 'settings') EXT.settings.forEach((c) => c.mount?.(d.querySelector(`.set-x-${c.id}`)));
  x?.mount?.(d);
  d.onclick = onDrawer;
  d.oninput = (e) => {
    if (DP.input(e)) return;
    DESIGN.input(e.target);
  };
  d.onkeydown = (e) => { DP.keydown(e); };
  d.onbeforeinput = (e) => { DP.beforeinput(e); };
  d.onpaste = (e) => { const big = (e.clipboardData?.getData('text/plain') || '').length > 20000; const end = big ? EXT.busy?.begin('busy.work') : null; try { DP.paste(e); } finally { end?.(); } };
  d.onchange = (e) => {
    if (DP.change(e)) return;
    if (e.target.dataset.k === 'embed') S.embedFonts = e.target.checked;
    if (e.target.dataset.k === 'docxFonts') { S.docxFonts = e.target.checked; ls.set('bw:docx-fonts', S.docxFonts ? '1' : '0'); }
    if (e.target.dataset.hook) hooksChange(e.target);
    if (e.target.dataset.set) settingsChange(e.target);
    if (e.target.dataset.pr) processChange(e.target);
    DESIGN.change(e.target);
  };
  if (!soft) {
    const f = d.querySelector('input,button:not([data-k="close"])');
    (f && !f.closest('details:not([open])') ? f : [...d.querySelectorAll('summary, input, button:not([data-k="close"])')].find((x) => x.matches('summary') || !x.closest('details:not([open])')))?.focus();
  }
}

async function onDrawer(e) {
  if (FONTS.click(e)) return;
  const x = e.target.closest('button');
  if (!x) return;
  const d = root.querySelector('.drawer');
  const k = x.dataset.k;
  if (k === 'close') { closeDrawer(); return; }
  if (S.drawer === 'settings' && await settingsClick(x)) return;
  if (x.dataset.page) {
    const first = x.dataset.first || '';
    // the PDF's first line, matched loosely (numbers, punctuation and spaces dropped) to a document field
    const norm = (x) => fold(String(x).normalize('NFKC')).replace(/[^\p{L}]+/gu, '');
    // up to three lines per page: a page may open in the middle of a paragraph or a table
    const fields = [...(mainOf(S.ed)?.querySelectorAll('[data-p]') || [])].map((el) => [el, norm(el.innerText)]);
    let hit = null;
    for (const line of first.split(' | ').map(norm).filter((l) => l.length >= 3)) {
      const probe = line.slice(0, 16);
      hit = fields.find(([, e]) => e.length >= 3 && (line.includes(e) || e.includes(probe)))?.[0];
      if (hit) break;
    }
    if (hit) { hit.scrollIntoView({ block: 'start', behavior: reduced() ? 'auto' : 'smooth' }); hit.focus(); }
    return;
  }
  if (x.dataset.fix) { // 0.15.3: a Check finding's one-click fix (the finding goes away on the redraw)
    const id = x.dataset.fix;
    Promise.resolve(DOC153.fix(id, x.dataset.fixArg)).then(() => { if (S.drawer === 'check') openDrawer('check'); });
    return;
  }
  if (x.dataset.go) {
    const go = x.dataset.go;
    // F2 · 17: the element in the BODY (a TOC row or the header strip carries the same pointer: never those);
    // a finding with no element on the page opens the Design group it is fixed in, or rings the cover's logo slots
    const findGo = () => go === '#logos' ? (mainOf(S.ed)?.querySelector('.cover .lockup') || mainOf(S.ed)?.querySelector('.cover'))
      : [...(mainOf(S.ed)?.querySelectorAll(`[data-p="${CSS.escape(go)}"],[data-b="${CSS.escape(go)}"]`) || [])].find((n) => !n.closest('table.toc, .toc, .w2-strip'));
    const el = findGo();
    const grp = /^#design:(\w+)$/.exec(go)?.[1] || (!el && go.startsWith('/labels/') ? 'labels' : null);
    if (grp) {
      (S.grpOpen ||= {})[grp] = true;
      openDrawer('theme');
      const g = root.querySelector(`.drawer details[data-grp="${grp}"]`);
      if (g) { g.open = true; g.scrollIntoView({ block: 'start' }); g.classList.remove('bw-jump'); void g.offsetWidth; g.classList.add('bw-jump'); setTimeout(() => g.classList.remove('bw-jump'), 1200); }
      return;
    }
    if (el) {
      el.scrollIntoView({ block: 'center', behavior: reduced() || x.dataset.ring ? 'auto' : 'smooth' });
      el.focus?.({ preventScroll: true });
      selectEl(el);
      if (x.dataset.ring) { // A14: a 1.2 s ring. A render that lands after the click (a slow machine) replaces the body's nodes: ring the one that is on the page now
        const ringIt = (n) => { n.classList.remove('bw-jump'); void n.offsetWidth; n.classList.add('bw-jump'); setTimeout(() => n.classList.remove('bw-jump'), 1200); };
        ringIt(el);
        requestAnimationFrame(() => requestAnimationFrame(() => { if (!el.isConnected) { const n2 = findGo(); if (n2) ringIt(n2); } }));
      }
    } else if (x.dataset.ring) { // nothing on the page yet (a render still pending on a slow machine): look again once the page has painted
      setTimeout(() => { const n2 = findGo(); if (n2) { n2.scrollIntoView({ block: 'center' }); n2.classList.remove('bw-jump'); void n2.offsetWidth; n2.classList.add('bw-jump'); setTimeout(() => n2.classList.remove('bw-jump'), 1200); } }, 250);
    }
    return;
  }
  if (k === 'next') d.querySelector('.out').textContent = t('found', { n: findNext(d.querySelector('[data-f="q"]').value) });
  if (k === 'all') d.querySelector('.out').textContent = t('found', { n: replaceAll(d.querySelector('[data-f="q"]').value, d.querySelector('[data-f="r"]').value) });
  const e2 = cur();
  if (x.dataset.ok !== undefined || x.dataset.no !== undefined) {
    const op = e2.ops[+(x.dataset.ok ?? x.dataset.no)];
    const want = x.dataset.ok !== undefined ? 'approved' : 'rejected';
    e2.status[op.id] = e2.status[op.id] === want ? 'pending' : want;
    rebuild(e2);
    touched();
    render();
    openDrawer('history');
  }
  if (k === 'snap') {
    const name = await ask(t('snapshotName'));
    if (name) { e2.versions.push({ name, at: new Date().toISOString(), ops: JSON.parse(JSON.stringify(liveOps(e2))) }); touched(); openDrawer('history'); }
  }
  if (x.dataset.diff !== undefined) {
    const v = e2.versions[+x.dataset.diff];
    const rows = diffDocs(applyOps(e2.base, v.ops), e2.doc);
    d.querySelector('.difftable').innerHTML = `<table><thead><tr><th>#</th><th>${esc(t('before'))}</th><th>${esc(t('after'))}</th></tr></thead><tbody>${rows.map((r) => `<tr><td class="path">${esc(r.path)}</td><td><del>${esc(r.before ?? '')}</del></td><td><ins>${esc(r.after ?? '')}</ins></td></tr>`).join('')}</tbody></table>`;
  }
  if (k === 'log') {
    const log = { kind: 'bw-change-log', version: 1, service: S.svc, locale: S.ed, baseHash: e2.hash, exportedAt: new Date().toISOString(), changes: e2.ops.map((o) => ({ ...o, status: e2.status[o.id] || 'pending' })), versions: e2.versions.map((v) => ({ name: v.name, at: v.at, ops: v.ops.length })) };
    download(`${S.svc}.${S.ed}.change-log.json`, JSON.stringify(log, null, 1));
  }
  if (k === 'cexp') download(`${S.svc}.comments.json`, JSON.stringify({ kind: 'bw-comments', version: 1, comments: Object.values(M[S.svc]).flatMap((x) => x.comments) }, null, 1));
  if (x.dataset.delc !== undefined) { e2.comments.splice(+x.dataset.delc, 1); touched(); render(); openDrawer('history'); }
  if (k === 'logoAdd') { await OVL.add('logo'); openDrawer('theme'); }
  if (x.dataset.ovgo !== undefined) { const el = mainOf(S.ed)?.querySelector(`.bw-ov[data-i="${x.dataset.ovgo}"]`); el?.scrollIntoView({ block: 'center', behavior: isCalm() ? 'auto' : 'smooth' }); el?.focus(); }
  if (x.dataset.hk) { await hooksClick(x); return; }
  if (k === 'nd-model') { const f = await pickFile('.bpmn,.bpmn20.xml,.xml,.drawio,.yaml,.yml,.json'); if (f) await newFromModel(f); return; }
  if (k === 'nd-merge') { await newFromMerge(); return; }
  if (k === 'nd-crawl') { await newFromCrawl(root.querySelector('.drawer [data-f="crawl"]').value); return; }
  if (await processClick(x)) return;
  if (k === 'texp') exportDesignPack();
  if (DESIGN.click(x)) return;
  if (k === 'timp') {
    const f = await pickFile('.json,application/json');
    if (!f) return;
    const endBusy = EXT.busy?.begin('busy.work');
    try {
      const p = JSON.parse(await readAs(f, 'text'));
      if (p.kind !== 'bw-design-pack') throw new Error();
      const { kind, version, fontFaces, ...rest } = p;
      // fonts: the pack's choice applies to this document; an uploaded font comes in only as a font data URI
      const faces = (Array.isArray(fontFaces) ? fontFaces : []).filter((f) => f && typeof f.family === 'string' && /^data:font\/(ttf|otf|woff|woff2);base64,[A-Za-z0-9+/]+=*$/.test(String(f.src || ''))).map((f) => ({ family: f.family.replace(/[^\p{L}\p{N}\s._-]/gu, '').slice(0, 80), weight: +f.weight === 700 ? 700 : 400, src: f.src, format: String(f.format || ''), outlines: String(f.outlines || ''), embed: !!f.embed }));
      if (rest.fonts || faces.length) {
        const dd = cur().doc;
        const next = JSON.parse(JSON.stringify(dd.design || {}));
        if (rest.fonts) next.fonts = { ...(next.fonts || {}), ...Object.fromEntries(['text', 'display'].filter((r) => typeof rest.fonts[r] === 'string').map((r) => [r, rest.fonts[r]])) };
        if (faces.length) next.fontFaces = [...(next.fontFaces || []).filter((x) => !faces.some((f) => f.family === x.family && f.weight === +x.weight)), ...faces];
        commit([{ op: 'replace', path: '/design', value: next, old: dd.design }], { mirror: true });
      }
      const safeLogos = Object.fromEntries(Object.entries(rest.logos || {}).map(([k2, v]) => [k2, /^data:image\/(png|jpeg|svg\+xml);/.test(v) ? v : '']));
      const safeVars = Object.fromEntries(Object.entries(rest.vars || {}).filter(([k2, v]) => /^[a-z0-9-]+$/.test(k2) && /^[#a-zA-Z0-9(),.\s%-]+$/.test(String(v))));
      S.theme = { ...S.theme, ...rest, vars: { ...S.theme.vars, ...safeVars }, logos: { ...S.theme.logos, ...safeLogos } };
      touched(); render(); openDrawer('theme');
    } catch { flash(t('badFile'), true); } finally { endBusy?.(); }
  }
  if (x.dataset.mine !== undefined || x.dataset.theirs !== undefined) {
    const i = +(x.dataset.mine ?? x.dataset.theirs);
    const c = S.conflicts[i];
    if (c.kind === 'structure') {
      const e3 = cur(c.ed);
      try {
        const next = resolveStructure(e3.base, e3.ops, c, x.dataset.theirs !== undefined ? 'theirs' : 'mine');
        if (next !== e3.ops) {
          const group = newGroup();
          next.forEach((o, k) => { if (!o.id) o.id = `${group}.${k}`; });
          e3.ops = next;
          e3.redo = [];
          rebuild(e3);
          touched();
          render();
        }
      } catch (err) { flash(String(err.message || err), true); return; }
    } else if (x.dataset.theirs !== undefined) {
      const keepEd = S.ed;
      S.ed = c.ed;
      commit([{ op: typeof c.theirs === 'string' ? 'setText' : 'replace', path: c.path, value: c.theirs, old: c.mine }], { ed: c.ed });
      S.ed = keepEd;
    }
    S.conflicts.splice(i, 1);
    S.conflicts.length ? openDrawer('conflicts') : closeDrawer();
  }
}

/* ── page thumbnails (printed by the local server: pagination exists only in print) ── */
const thumbCache = new Map();
async function loadThumbs(d) {
  const out = d.querySelector('.out');
  const list = d.querySelector('.thumbs');
  if (!location.protocol.startsWith('http')) { out.textContent = t('pagesNeedServer'); return; }
  const key = `${S.svc}|${S.ed}|${JSON.stringify(liveOps(cur()).map((o) => o.id))}|${JSON.stringify(S.theme)}`;
  let data = thumbCache.get(key);
  if (!data) {
    out.textContent = t('pagesLoading');
    try {
      const r = await fetch('/api/pages', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ locale: S.ed, doc: cur().doc, theme: S.theme }) });
      data = await r.json();
      if (!r.ok) throw new Error(data.error || r.status);
      thumbCache.clear();
      thumbCache.set(key, data);
    } catch (err) { out.textContent = String(err.message || err); return; }
  }
  out.textContent = t('pagesCount', { n: data.pages.length, ms: data.ms });
  list.innerHTML = data.pages.map((p) => `<li><button type="button" data-page="${p.n}" data-first="${esc(p.first)}" aria-label="${esc(t('page', { n: p.n }))}"><img alt="" src="${p.png}" class="${p.wide ? 'wide' : ''}"><span>${p.n}</span></button></li>`).join('');
}

/* ── images: every accepted image is re-encoded through a canvas (metadata gone,
 * SVG rasterised, size capped) before it can enter the document ─────────── */
async function reencode(blob, maxPx = 2000) {
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const k = Math.min(1, maxPx / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
    const w = Math.max(1, Math.round((img.naturalWidth || 300) * k));
    const h = Math.max(1, Math.round((img.naturalHeight || 150) * k));
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0, w, h);
    const px = g.getImageData(0, 0, w, h).data;
    let alpha = false;
    for (let i = 3; i < px.length; i += 16) if (px[i] < 250) { alpha = true; break; }
    const out = alpha || /svg|png/.test(blob.type) ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', 0.9);
    return { src: out, ratio: h / w };
  } finally { URL.revokeObjectURL(url); }
}
const ACCEPT_IMG = 'image/png,image/jpeg,image/webp,image/gif,image/svg+xml';
async function pickImage() {
  const f = await pickFile(ACCEPT_IMG);
  if (!f) return null;
  if (!/^image\//.test(f.type)) { flash(t('badFile'), true); return null; }
  try { return await reencode(f); } catch { flash(t('badFile'), true); return null; }
}
