/* Business-Wrap editor — the Design side panel: plain-language labels with a one-line hint each, grouped
 * (Fonts, Colours, Text sizes, Spacing & lines, Page parts, Logos & images, Printed texts, Saving & export,
 * Advanced). Numbers use editor/value-control.js, fonts editor/fonts.js. Writes go through DESIGN (editor.js),
 * so undo, the edits JSON, the PDF and the DOCX carry every change.
 * Concatenated by engine/build-editor.mjs before editor/editor.js (uses its state and helpers at call time). */

const DP_COLOURS = ['primary', 'primary-deep', 'accent', 'accent-bright', 'accent-rule', 'ink', 'muted', 'rule', 'rule-strong', 'card', 'paper', 'signal', 'th-fill', 'th-ink', 'zebra'];
const DP_SIZES = [['title', '24pt'], ['h1', '18pt'], ['h2', '16pt'], ['h3', '14pt'], ['body', '14pt'], ['table', '12pt'], ['meta', '10pt'], ['micro', '9pt']];
const DP_SPACING = [['line', 'line', '1.8'], ['page-side', 'space', '16mm'], ['rule-w', 'width', '1px'], ['th-rule-w', 'width', '1.2pt']];
/** the per-element style fields (Style this element): CSS property → kind of control */
const DP_STYLE = [['color', 'colour'], ['background-color', 'colour'], ['font-size', 'size'], ['font-weight', 'weight'], ['line-height', 'line'], ['letter-spacing', 'track'], ['text-align', 'align'], ['padding', 'text'], ['margin', 'text'], ['border', 'text'], ['border-radius', 'radius']];
const dpKey = (k) => k.replace(/-(\w)/g, (_, c) => c.toUpperCase());
const dpHex = (v) => { const s = String(v || '').trim(); const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(s); if (!m) return null; const h = m[1].length === 3 ? m[1].replace(/./g, '$&$&') : m[1]; return `#${h.toLowerCase()}`; };
/** points in one em for this document's sizes: the body text size (12pt when it is itself in em) */
const dpEmPt = (th) => { const { n, u } = vcParse(th.sizes?.body || '14pt', 'size'); return n == null || u === 'em' ? 12 : vcConvert(n, u, 'pt'); };

function dpColour(id, prop, value, label, hint, data) {
  const uid = `cc-${id.replace(/[^a-z0-9]+/gi, '-')}`;
  const h = dpHex(value);
  return `<div class="cc"><label class="vc-l" for="${uid}">${esc(label)}</label>${hint ? `<p class="hint" id="${uid}-h">${esc(hint)}</p>` : ''}
<div class="vc-row"><input type="color" ${data}="${prop}" value="${h || '#ffffff'}" aria-label="${attr(t('design.swatch', { x: label }))}"${hint ? ` aria-describedby="${uid}-h"` : ''}>
<input type="text" class="cc-hex" id="${uid}" ${data.replace('data-', 'data-hex-')}="${prop}" value="${h || ''}" placeholder="${attr(t('design.noColour'))}" maxlength="7" dir="ltr" spellcheck="false" autocomplete="off"${hint ? ` aria-describedby="${uid}-h"` : ''}></div></div>`;
}

/** the whole Design drawer body (below its header) */
function designPanel() {
  const d = cur().doc;
  const th = designTheme(S.theme, d);
  const emPt = dpEmPt(th);
  // keep each group open or closed across redraws
  root.querySelectorAll('.drawer details[data-grp]').forEach((x) => { (S.grpOpen ||= {})[x.dataset.grp] = x.open; });
  const grp = (id, body, open = true) => `<details class="dgrp" data-grp="${id}" ${(S.grpOpen?.[id] ?? open) ? 'open' : ''}><summary><h3>${esc(t('design.grp.' + id))}</h3></summary><p class="hint">${esc(t('design.grp.' + id + 'Hint'))}</p>${body}</details>`;
  const L = labelsOf();
  const hide = new Set(d.layout?.hide || []);
  const front = [...(d.layout?.front || []), ...['control', 'revisions', 'toc'].filter((k) => !(d.layout?.front || []).includes(k))];
  const labRows = Object.entries(L).flatMap(([k, v]) => (k === 'control' ? Object.entries(v).map(([ck, cv]) => [`control/${ck}`, cv]) : Array.isArray(v) ? v.map((x, i) => [`${k}/${i}`, x]) : typeof v === 'string' ? [[k, v]] : []));
  const rej = sanitizeCss(d.design?.css).rejected;
  const ovs = d.overlays || [];
  const sel = blockOf(S.sel?.b);
  const imgW = (sel && get(d, sel.ptr)?.kind === 'shots' && get(d, sel.ptr).width) || 100;

  const fonts = FONTS.picker('text') + FONTS.picker('display') + FONTS.uploadedList();
  const colours = `<div class="grid2">${DP_COLOURS.map((k) => dpColour(`v-${k}`, k, th.vars[k], t(`design.c.${dpKey(k)}`), t(`design.c.${dpKey(k)}Hint`), 'data-dv')).join('')}</div>`;
  const sizes = DP_SIZES.map(([k, def]) => valueControl({ id: `sizes:${k}`, kind: 'size', label: t(`design.s.${k}`), hint: t(`design.s.${k}Hint`), value: th.sizes?.[k] || def, emPt: k === 'body' ? 12 : emPt })).join('');
  const spacing = DP_SPACING.map(([k, kind, def]) => valueControl({ id: `vars:${k}`, kind, label: t(`design.sp.${dpKey(k)}`), hint: t(`design.sp.${dpKey(k)}Hint`), value: th.vars[k] || def, emPt })).join('');
  const parts = `<ul class="list">${['cover', ...front, 'questions'].map((k) => `<li><label class="chk"><input type="checkbox" data-dpart="${k}" ${hide.has(k) ? '' : 'checked'}> ${esc(t('part_' + k))}</label>${front.includes(k) ? ` <button type="button" data-dmove="${k}" data-d="-1" aria-label="${attr(t('moveUp'))}: ${attr(t('part_' + k))}">${ic('moveUp')}</button><button type="button" data-dmove="${k}" data-d="1" aria-label="${attr(t('moveDown'))}: ${attr(t('part_' + k))}">${ic('moveDown')}</button>` : ''}</li>`).join('')}</ul>
<h4>${esc(t('dChapters'))}</h4><ul class="list">${d.chapters.map((ch, i) => `<li><label class="chk"><input type="checkbox" data-dch="${i}" ${ch.hidden ? '' : 'checked'}> ${esc(ch.number)} ${esc(ch.title)}</label> <button type="button" data-dchm="${i}" data-d="-1" aria-label="${attr(t('moveUp'))}: ${attr(ch.title)}">${ic('moveUp')}</button><button type="button" data-dchm="${i}" data-d="1" aria-label="${attr(t('moveDown'))}: ${attr(ch.title)}">${ic('moveDown')}</button><button type="button" data-dchd="${i}" aria-label="${attr(t('duplicate'))}: ${attr(ch.title)}">${ic('duplicate')}</button><button type="button" data-dchx="${i}" aria-label="${attr(t('delete'))}: ${attr(ch.title)}">${ic('delete')}</button></li>`).join('')}</ul>
<div class="btns"><button type="button" class="b" data-k="addTable"><span class="i">${ic('rowAdd')}</span><span class="w">${esc(t('addTable'))}</span></button><button type="button" class="b" data-k="addSection"><span class="i">${ic('add')}</span><span class="w">${esc(t('addSection'))}</span></button></div>`;
  const logos = `<ul class="list">${ovs.map((o, i) => (o.kind === 'logo' ? `<li><img alt="" src="${attr(o.src)}" class="thumb"> ${esc(t('mode_' + o.mode))} <button type="button" data-ovgo="${i}">${esc(t('show'))}</button></li>` : '')).join('')}</ul>
<div class="btns"><button type="button" class="b primary" data-k="logoAdd"><span class="i">${ic('logo')}</span><span class="w">${esc(t('logo'))}</span></button></div>
${valueControl({ id: 'img:width', kind: 'pct', label: t('design.imgWidth'), hint: t('design.imgWidthHint'), value: `${imgW}%` })}`;
  const base = I18N.doc[S.ed];
  const friendly = (k) => {
    if (k === 'comma') return t('design.labelComma');
    const [a, b] = k.split('/');
    const v = b === undefined ? base[a] : base[a]?.[b];
    return typeof v === 'string' && v.trim() ? v : t('design.labelOther');
  };
  const labels = `<label class="chk"><input type="checkbox" data-k="laball" ${S.labelAll ? 'checked' : ''}> ${esc(t('labelAll'))}</label>
<div class="labs">${labRows.map(([k, v]) => `<label>${esc(friendly(k))}<input type="text" data-lab="${attr(k)}" value="${attr(v)}" ${String(v).trim() || k === 'comma' ? '' : 'aria-invalid="true"'}></label>`).join('')}</div>`;
  const output = `<label class="chk"><input type="checkbox" data-k="embed" ${S.embedFonts ? 'checked' : ''}> ${esc(t('design.embedHtml'))}</label>
<label class="chk"><input type="checkbox" data-k="docxFonts" ${S.docxFonts ? 'checked' : ''}> ${esc(t('design.embedDocx'))}</label>
<p class="hint">${esc(t('design.packHint'))}</p><div class="btns"><button type="button" class="b" data-k="texp"><span class="w">${esc(t('themeExport'))}</span></button><button type="button" class="b" data-k="timp"><span class="w">${esc(t('themeImport'))}</span></button></div>`;
  const css = `<textarea data-dcss rows="6" spellcheck="false" dir="ltr" aria-label="${attr(t('design.grp.css'))}">${esc(d.design?.css || '')}</textarea>${rej.length ? `<p class="warn" role="status">${esc(t('vCss', { x: rej.join(' · ') }))}</p>` : ''}
<div class="btns"><button type="button" class="b" data-k="dcssApply"><span class="w">${esc(t('apply'))}</span></button></div>`;
  return grp('fonts', fonts) + grp('colours', colours) + grp('sizes', sizes) + grp('spacing', spacing) + grp('parts', parts) + grp('logos', logos)
    + grp('labels', labels, false) + grp('output', output) + grp('css', css, false)
    + `<h3>${esc(t('shortcuts'))}</h3><p class="hint">${esc(t('shortcutsText'))}</p>`;
}

/** Style this element: the same plain labels and controls, written to the block's own style */
function styleInspector() {
  const b = blockOf(S.sel?.b);
  if (!b) return `<p class="hint">${esc(t('styleNone'))}</p>`;
  const node = get(cur().doc, b.ptr) || {};
  const st = node.style || {};
  const opt = (k, list, names) => `<select data-st="${k}" id="st-${k}"><option value="">${esc(t('design.inherit'))}</option>${list.map((v, i) => `<option value="${v}" ${String(st[k]) === String(v) ? 'selected' : ''}>${esc(names[i])}</option>`).join('')}</select>`;
  const fields = DP_STYLE.map(([k, kind]) => {
    const label = t(`style.${dpKey(k)}`);
    const hint = t(`style.${dpKey(k)}Hint`);
    if (kind === 'colour') return dpColour(`st-${k}`, k, st[k], label, '', 'data-st');
    if (kind === 'weight') return `<div class="cc"><label class="vc-l" for="st-${k}">${esc(label)}</label>${opt(k, [300, 400, 500, 700, 900], t('style.weights').split('|'))}</div>`;
    if (kind === 'align') return `<div class="cc"><label class="vc-l" for="st-${k}">${esc(label)}</label>${opt(k, ['start', 'center', 'end', 'justify'], t('style.aligns').split('|'))}</div>`;
    if (kind === 'text') return `<div class="cc"><label class="vc-l" for="st-${k}">${esc(label)}</label><p class="hint" id="st-${k}-h">${esc(hint)}</p><input type="text" id="st-${k}" data-st="${k}" value="${attr(st[k] || '')}" spellcheck="false" dir="ltr" aria-describedby="st-${k}-h"></div>`;
    return valueControl({ id: `style:${k}`, kind, label, hint, value: st[k] || '' });
  }).join('');
  return `<p class="hint">${esc(t('design.styleWhere'))}</p>${fields}
<label class="chk"><input type="checkbox" data-k="sthide" ${node.hidden ? 'checked' : ''}> ${esc(t('hideBlock'))}</label>
<div class="btns"><button type="button" class="b" data-k="stclear"><span class="w">${esc(t('styleClear'))}</span></button></div>`;
}

/* ── live preview and commit of the number controls ── */
const dpVar = (id) => { const [g, k] = id.split(':'); return g === 'sizes' ? `--t-${k}` : g === 'vars' ? `--${k}` : null; };
function dpPreview(id, css) {
  const v = dpVar(id);
  if (!v) return;
  if (css) document.documentElement.style.setProperty(v, css); else document.documentElement.style.removeProperty(v);
}
function dpCommit(id, css) {
  const [g, k] = id.split(':');
  const v = dpVar(id);
  if (v) document.documentElement.style.removeProperty(v);
  if (g === 'sizes' || g === 'vars') { if (((cur().doc.design || {})[g] || {})[k] === (css || undefined)) return; DESIGN.set('design', k, g, css); }
  else if (g === 'style') DESIGN.setStyle(k, css);
  else if (g === 'img' && css) A.width(parseFloat(css));
}
/** a typed hex code: applied when valid, refused (and put back) when not; empty = back to the pack's colour */
function dpHexChange(el) {
  const prop = el.dataset.hexDv || el.dataset.hexSt;
  if (!prop) return false;
  const v = el.value.trim();
  const h = v ? dpHex(v) : '';
  const swatch = el.closest('.vc-row').querySelector('input[type="color"]');
  if (h === null) {
    el.setAttribute('aria-invalid', 'true');
    toast(t('design.badHex'), 'warn');
    el.value = el.defaultValue;
    setTimeout(() => el.removeAttribute('aria-invalid'), 1600);
    return true;
  }
  el.value = h;
  el.defaultValue = h; // what a later invalid code is put back to
  if (h) swatch.value = h;
  if (el.dataset.hexDv) DESIGN.set('design', prop, 'vars', h); else DESIGN.setStyle(prop, h);
  return true;
}
/** the swatch moves → its hex field follows */
function dpSwatchInput(el) {
  if (el.type !== 'color') return;
  const hexEl = el.closest('.vc-row')?.querySelector('.cc-hex');
  if (hexEl) hexEl.value = el.value;
}
/** every event of the design drawers, routed from openDrawer's handlers */
const DP = {
  input(e) { if (FONTS.input(e)) return true; dpSwatchInput(e.target); return VC.input(e, dpPreview); },
  change(e) { if (e.target.classList?.contains('cc-hex')) return dpHexChange(e.target); return VC.change(e, dpCommit); },
  keydown(e) { return FONTS.keydown(e) || VC.keydown(e, dpPreview, dpCommit); },
  beforeinput(e) { return VC.beforeinput(e); },
  paste(e) { return VC.paste(e); },
};
