/* Business-Wrap editor — one numeric setting = slider + number field + a separate unit selector.
 * Concatenated by engine/build-editor.mjs before editor/editor.js (uses its t/esc at call time).
 * The number field takes digits and one decimal point only (a leading minus only where a negative value
 * means something); arrows step it; slider and field follow each other live; changing the unit converts
 * the value. The stored value stays the CSS string (number + unit, e.g. "12.5pt"), the shape the renderer,
 * the DOCX builder and the design pack already read. */

/** Valid units per kind of setting, each with [min, max, step]. The first unit is the default. */
const VC_KINDS = {
  size: { pt: [6, 96, 0.5], px: [8, 128, 0.5], mm: [2, 34, 0.1], em: [0.4, 6, 0.05] },
  space: { mm: [0, 50, 0.5], cm: [0, 5, 0.05], px: [0, 190, 1], pt: [0, 142, 0.5] },
  width: { px: [0, 10, 0.1], pt: [0, 8, 0.1], mm: [0, 3, 0.05] },
  line: { x: [1, 3, 0.05] },
  pct: { '%': [10, 100, 5] },
  track: { px: [-5, 20, 0.1], pt: [-4, 15, 0.1], em: [-0.2, 1, 0.01] },
  radius: { px: [0, 40, 0.5], pt: [0, 30, 0.5], mm: [0, 10, 0.1] },
};
const VC_NEG = new Set(['track']);
/** points per unit; em is relative to the body text size, so it converts through that size */
const VC_PT = { pt: 1, px: 0.75, mm: 72 / 25.4, cm: 720 / 25.4 };
const vcDecimals = (step) => (String(step).split('.')[1] || '').length;
const vcRound = (v, step) => +(+v).toFixed(Math.max(vcDecimals(step), 2));
/** "12.5pt" → {n: 12.5, u: 'pt'}; a bare number takes the kind's first unit */
function vcParse(value, kind) {
  const units = Object.keys(VC_KINDS[kind]);
  const m = /^\s*(-?\d*\.?\d+)\s*([a-z%]*)\s*$/i.exec(String(value ?? ''));
  if (!m) return { n: null, u: units[0] };
  const u = units.includes(m[2]) ? m[2] : units[0];
  return { n: +m[1], u };
}
const vcFormat = (n, u) => (n == null || Number.isNaN(n) ? '' : `${n}${u === 'x' ? '' : u}`);
/** a value in one unit expressed in another; emPt = the size one em stands for, in points */
function vcConvert(n, from, to, emPt = 12) {
  if (from === to || n == null) return n;
  const pt = from === 'em' ? n * emPt : n * (VC_PT[from] || 1);
  return to === 'em' ? pt / emPt : pt / (VC_PT[to] || 1);
}
/** keep digits, one dot, and a leading minus where allowed; null when the text is not a number at all */
function vcClean(text, neg) {
  let s = String(text ?? '').replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660)).replace(/[٫,]/g, '.').trim();
  const re = neg ? /^-?\d*\.?\d*$/ : /^\d*\.?\d*$/;
  return re.test(s) ? s : null;
}

/** The HTML of one control. o: {id, kind, label, hint, value, emPt} — id names what it writes (e.g. "sizes:h1"). */
function valueControl(o) {
  const { n, u } = vcParse(o.value, o.kind);
  const units = Object.keys(VC_KINDS[o.kind]);
  const [min, max, step] = VC_KINDS[o.kind][u];
  const uid = `vc-${o.id.replace(/[^a-z0-9]+/gi, '-')}`;
  const unitBox = units.length > 1
    ? `<select class="vc-u" data-u="${u}" aria-label="${attr(t('unit.of', { x: o.label }))}">${units.map((x) => `<option value="${x}" ${x === u ? 'selected' : ''}>${esc(t('unit.' + (x === '%' ? 'pct' : x)))}</option>`).join('')}</select>`
    : `<span class="vc-u fixed" data-u="${u}" title="${attr(t('unit.' + (u === '%' ? 'pct' : u)))}">${u === 'x' ? '×' : esc(u)}</span>`;
  return `<div class="vc" data-vc="${attr(o.id)}" data-kind="${o.kind}" data-em="${o.emPt || 12}">
<label class="vc-l" for="${uid}">${esc(o.label)}</label>${o.hint ? `<p class="hint" id="${uid}-h">${esc(o.hint)}</p>` : ''}
<div class="vc-row"><input type="range" class="vc-s" min="${min}" max="${max}" step="${step}" value="${n ?? min}" aria-label="${attr(t('unit.slider', { x: o.label }))}"${o.hint ? ` aria-describedby="${uid}-h"` : ''}>
<input type="text" class="vc-n" id="${uid}" inputmode="decimal" autocomplete="off" spellcheck="false" dir="ltr" value="${n ?? ''}"${o.hint ? ` aria-describedby="${uid}-h"` : ''}>${unitBox}</div></div>`;
}

/** Live behaviour, attached once per drawer render. onPreview(id, css) while moving; onCommit(id, css) when settled. */
const VC = {
  box: (el) => el.closest?.('.vc'),
  read(box) {
    const u = box.querySelector('.vc-u').dataset.u;
    const raw = box.querySelector('.vc-n').value;
    return { n: raw === '' || raw === '-' || raw === '.' ? null : +raw, u };
  },
  limits(box) { return VC_KINDS[box.dataset.kind][box.querySelector('.vc-u').dataset.u]; },
  css(box) { const { n, u } = VC.read(box); return vcFormat(n, u); },
  sync(box, from) {
    const s = box.querySelector('.vc-s');
    const f = box.querySelector('.vc-n');
    if (from === 'slider') f.value = String(vcRound(s.value, +s.step));
    else if (f.value !== '' && !Number.isNaN(+f.value)) s.value = f.value;
  },
  /** returns true when the event belonged to a value control */
  beforeinput(e) {
    const f = e.target;
    if (!f.classList?.contains('vc-n') || e.data == null || !e.inputType.startsWith('insert')) return false;
    const neg = VC_NEG.has(VC.box(f).dataset.kind);
    const next = f.value.slice(0, f.selectionStart) + e.data + f.value.slice(f.selectionEnd);
    if (vcClean(next, neg) === null) { e.preventDefault(); VC.reject(f); }
    return true;
  },
  paste(e) {
    const f = e.target;
    if (!f.classList?.contains('vc-n')) return false;
    e.preventDefault();
    const text = (e.clipboardData?.getData('text') || '').trim();
    const neg = VC_NEG.has(VC.box(f).dataset.kind);
    const clean = vcClean(text, neg);
    if (clean === null || clean === '') { VC.reject(f); return true; }
    f.value = clean;
    f.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  },
  reject(f) {
    f.setAttribute('aria-invalid', 'true');
    toast(t('unit.onlyNumbers'), 'warn');
    clearTimeout(f._bwInv);
    f._bwInv = setTimeout(() => f.removeAttribute('aria-invalid'), 1600);
  },
  input(e, onPreview) {
    const el = e.target;
    const box = VC.box(el);
    if (!box || !el.matches('.vc-n, .vc-s')) return false;
    if (el.classList.contains('vc-n')) {
      // whatever reached the field (IME, autofill, drop): keep only what a number may hold
      const clean = vcClean(el.value, VC_NEG.has(box.dataset.kind));
      if (clean === null) { el.value = el.value.replace(VC_NEG.has(box.dataset.kind) ? /[^\d.-]/g : /[^\d.]/g, '').replace(/(\..*)\./g, '$1').replace(/(?!^)-/g, ''); VC.reject(el); }
      VC.sync(box, 'field');
    } else VC.sync(box, 'slider');
    onPreview(box.dataset.vc, VC.css(box));
    return true;
  },
  keydown(e, onPreview, onCommit) {
    const f = e.target;
    if (!f.classList?.contains('vc-n') || !['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown'].includes(e.key)) return false;
    e.preventDefault();
    const box = VC.box(f);
    const [min, max, step] = VC.limits(box);
    const k = (e.key.startsWith('Page') || e.shiftKey ? 10 : 1) * (e.key === 'ArrowUp' || e.key === 'PageUp' ? 1 : -1);
    const now = f.value === '' || Number.isNaN(+f.value) ? min : +f.value;
    f.value = String(vcRound(Math.min(max, Math.max(min, now + k * step)), step));
    VC.sync(box, 'field');
    onPreview(box.dataset.vc, VC.css(box));
    clearTimeout(box._bwT);
    box._bwT = setTimeout(() => onCommit(box.dataset.vc, VC.css(box)), 450);
    return true;
  },
  change(e, onCommit) {
    const el = e.target;
    const box = VC.box(el);
    if (!box) return false;
    if (el.classList.contains('vc-u')) {
      const from = el.dataset.u;
      const to = el.value;
      const f = box.querySelector('.vc-n');
      const [min, max, step] = VC_KINDS[box.dataset.kind][to];
      el.dataset.u = to;
      const s = box.querySelector('.vc-s');
      Object.assign(s, { min, max, step });
      if (f.value !== '' && !Number.isNaN(+f.value)) f.value = String(vcRound(vcConvert(+f.value, from, to, +box.dataset.em), step));
      VC.sync(box, 'field');
    } else if (el.classList.contains('vc-n')) {
      const [min, max, step] = VC.limits(box);
      if (el.value !== '' && !Number.isNaN(+el.value)) el.value = String(vcRound(Math.min(max, Math.max(min, +el.value)), step));
      VC.sync(box, 'field');
    } else if (!el.classList.contains('vc-s')) return false;
    clearTimeout(box._bwT);
    onCommit(box.dataset.vc, VC.css(box));
    return true;
  },
};
