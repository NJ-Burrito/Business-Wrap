/* 0.17.6 · Page margins «الهوامش» — doc.layout.margins = {top, bottom, start, end} in mm (start/end follow the reading direction).
 * One recorded, undoable edit (a replace of /layout, as the page setup does), saved with the file; no setting = today's margins (18 above, 16 below,
 * the theme's page-side at the sides) and the document's output is unchanged. Limits and rules live in engine/render.mjs (marginsOf).
 * The API the ruler uses (window.BW.EXT.margins):
 *   get() -> {top, bottom, start, end}            the margins in force now (a live drag included), in mm
 *   set(partial, {live})                          live:true previews on the page without recording (during a drag); live:false records ONE undoable edit
 * and `document` gets a 'bw:margins' CustomEvent ({detail: {top, bottom, start, end, live}}) on every change: a live step, an edit, an undo or a redo. */
IC.margins = IC.margins || '<svg aria-hidden="true" focusable="false" class="ic" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><rect x="8" y="8" width="8" height="8" rx="1"/><path d="M12 3v5"/><path d="M12 16v5"/><path d="M3 12h5"/><path d="M16 12h5"/></svg>';
const W2M = { live: null, sig: null, raf: 0 }; // live: the previewed margins while a drag or a typed value is not recorded yet
const W2M_KEYS = ['top', 'bottom', 'start', 'end'];
const W2M_PRESETS = { normal: null, narrow: { top: 12, bottom: 12, start: 10, end: 10 }, wide: { top: 25, bottom: 22, start: 25, end: 25 } };
/** Today's margins for the open document: 18 above, 16 below, the theme's page-side (16 mm unless the design panel changed it) at the sides. */
function w2mDefault() {
  const main = mainOf(S.ed) || document.querySelector('#bw-pair main.bw-doc');
  const v = main ? parseFloat(getComputedStyle(main).getPropertyValue('--page-side')) : NaN;
  const side = v > 0 ? v : MARGIN_DEFAULT.start;
  return { top: MARGIN_DEFAULT.top, bottom: MARGIN_DEFAULT.bottom, start: side, end: side };
}
const w2mClamp = (k, v, d) => { const n = +v; if (!Number.isFinite(n)) return d; const [lo, hi] = MARGIN_LIMIT[k]; return Math.min(hi, Math.max(lo, Math.round(n * 10) / 10)); };
/** The margins in force: the live preview, else the document's setting, else today's. */
function w2mGet() {
  const d = w2mDefault();
  const m = W2M.live || marginsOf(w2doc());
  return Object.fromEntries(W2M_KEYS.map((k) => [k, m ? m[k] : d[k]]));
}
function w2mAnnounce(live) {
  const g = w2mGet();
  W2M.sig = JSON.stringify(g);
  document.dispatchEvent(new CustomEvent('bw:margins', { detail: { ...g, live: !!live } }));
}
/** The page shows `m` now (inline vars on every page; no document change). null puts the document's own setting back. */
function w2mPaint(m) {
  for (const main of document.querySelectorAll('#bw-pair main.bw-doc')) {
    for (const k of W2M_KEYS) { if (m) main.style.setProperty(`--pm-${k}`, `${m[k]}mm`); else main.style.removeProperty(`--pm-${k}`); }
    if (m) main.dataset.pm = '1'; else delete main.dataset.pm;
  }
  if (typeof viewsActive === 'function' && viewsActive() && !W2M.raf) {
    W2M.raf = requestAnimationFrame(() => { W2M.raf = 0; try { viewsApply(); } catch { /* the view repaints on the next render */ } });
  }
}
const w2mSame = (a, b) => W2M_KEYS.every((k) => Math.abs(a[k] - b[k]) < 0.05);
function w2mSet(partial = {}, opt = {}) {
  const now = w2mGet();
  const next = {};
  for (const k of W2M_KEYS) next[k] = partial[k] === undefined ? now[k] : w2mClamp(k, partial[k], now[k]);
  if (opt.live) {
    W2M.live = next;
    w2mPaint(next);
    w2mAnnounce(true);
    return next;
  }
  // recorded: the live preview goes first, then one replace of /layout (the page setup's own op), both editions alike
  W2M.live = null;
  w2mPaint(null);
  const d = w2doc();
  const def = w2mDefault();
  const lay = { ...(d.layout || {}) };
  if (w2mSame(next, def) && !d.layout?.margins) { w2mAnnounce(false); return next; }
  if (w2mSame(next, def)) delete lay.margins; else lay.margins = next;
  if (!Object.keys(lay).length) commit([{ op: 'delete', path: '/layout', old: d.layout }], { mirror: true });
  else commit([{ op: 'replace', path: '/layout', value: lay, old: d.layout }], { mirror: true });
  w2mAnnounce(false);
  return next;
}
const W2M_FIELD = { top: 'm.top', bottom: 'm.bottom', start: 'm.start', end: 'm.end' };
bwExt({
  cmds: [{ id: 'margins', group: 'document', edit: false }],
  actions: { margins: () => { openDrawer('w2margins'); } },
  drawers: {
    w2margins: () => {
      const g = w2mGet();
      const field = (k) => `<label class="w2m-f">${esc(t(W2M_FIELD[k]))} <input type="number" inputmode="decimal" step="0.5" min="${MARGIN_LIMIT[k][0]}" max="${MARGIN_LIMIT[k][1]}" value="${g[k]}" data-w2m="${k}"> <span class="w2m-u">${esc(t('m.mm'))}</span></label>`;
      return {
        title: t('margins'),
        html: `<div class="btns w2m-presets" role="group" aria-label="${esc(t('m.presets'))}">${['normal', 'narrow', 'wide'].map((p) => `<button type="button" class="b" data-w2mp="${p}"><span class="w">${esc(t('m.' + p))}</span></button>`).join('')}</div>
<p class="w2m-h">${esc(t('m.custom'))}</p>
<div class="w2m-grid">${W2M_KEYS.map(field).join('')}</div>
<div class="w2m-prev" aria-hidden="true"><i class="w2m-page"><i class="w2m-text"></i></i></div>
<p class="w2m-note">${esc(t('m.limits'))}</p>
<div class="btns"><button type="button" class="b primary" data-w2ma="apply"><span class="w">${esc(t('m.apply'))}</span></button><button type="button" class="b" data-w2ma="cancel"><span class="w">${esc(t('m.cancel'))}</span></button></div>`,
        mount: (el) => {
          const read = () => Object.fromEntries(W2M_KEYS.map((k) => [k, el.querySelector(`[data-w2m="${k}"]`).value]));
          const prev = (m) => {
            const pg = el.querySelector('.w2m-page'), tx = el.querySelector('.w2m-text');
            const sp = pageSpec(w2doc().layout?.page);
            const rtl = (mainOf(S.ed)?.dir || 'rtl') === 'rtl';
            pg.style.aspectRatio = `${sp.w} / ${sp.h}`;
            const L = rtl ? m.end : m.start, R = rtl ? m.start : m.end;
            Object.assign(tx.style, { top: `${(m.top / sp.h) * 100}%`, bottom: `${(m.bottom / sp.h) * 100}%`, left: `${(L / sp.w) * 100}%`, right: `${(R / sp.w) * 100}%` });
          };
          const fill = (m) => { for (const k of W2M_KEYS) el.querySelector(`[data-w2m="${k}"]`).value = m[k]; prev(m); };
          prev(w2mGet());
          el.addEventListener('input', (e) => {
            if (!e.target.matches('[data-w2m]')) return;
            const raw = read();
            if (W2M_KEYS.some((k) => raw[k] === '' || !Number.isFinite(+raw[k]))) return; // a half-typed number waits
            prev(w2mSet(raw, { live: true }));
          });
          el.addEventListener('change', (e) => { if (e.target.matches('[data-w2m]')) fill(w2mSet(read(), { live: true })); }); // the field shows the clamped value
          el.addEventListener('click', (e) => {
            const p = e.target.closest('[data-w2mp]');
            if (p) { fill(w2mSet(W2M_PRESETS[p.dataset.w2mp] || w2mDefault(), { live: false })); toast(t('m.set'), 'info'); return; }
            const a = e.target.closest('[data-w2ma]')?.dataset.w2ma;
            if (a === 'apply') { w2mSet(read(), { live: false }); closeDrawer(); }
            else if (a === 'cancel') { W2M.live = null; w2mPaint(null); w2mAnnounce(false); closeDrawer(); }
          });
        },
      };
    },
  },
  expose: { margins: { get: w2mGet, set: w2mSet } },
  on: {
    boot: () => w2docCss('w2-margins-css', `@media screen{main.bw-doc[data-pm] .wrap{padding-inline:var(--pm-start) var(--pm-end)}
main.bw-doc[data-pm] :is(h4,.gap){margin-inline:calc(0mm - var(--pm-start)) calc(0mm - var(--pm-end));padding-inline:var(--pm-start) var(--pm-end)}
.w2m-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px 12px;margin:8px 0}.w2m-f{display:flex;align-items:center;gap:6px}.w2m-f input{width:5.5em}
.w2m-prev{display:flex;justify-content:center;margin:10px 0}.w2m-page{position:relative;display:block;width:90px;background:var(--paper,#fff);box-shadow:0 0 0 1px var(--rule-strong,#cfd6de)}
.w2m-text{position:absolute;display:block;background:rgba(0,30,61,.1);outline:1px dashed var(--accent,#be9a41)}
.w2m-h{margin:10px 0 0;font-weight:700}.w2m-note{opacity:.7;font-size:.9em}}`),
    // an undo, a redo or a record changes the setting: the event goes out once per change (a live step announced its own)
    render: () => { W2M.live = null; if (JSON.stringify(w2mGet()) !== W2M.sig) w2mAnnounce(false); },
  },
});
