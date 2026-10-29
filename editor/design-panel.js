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
  // A7 / F2 · 11: as every side panel: every group collapsed (what the person toggles is remembered)
  const grp = (id, body, open = false) => `<details class="dgrp" data-grp="${id}" ${(S.grpOpen?.[id] ?? open) ? 'open' : ''}><summary><h3>${esc(t('design.grp.' + id))}</h3></summary><p class="hint">${esc(t('design.grp.' + id + 'Hint'))}</p>${body}</details>`;
  const L = labelsOf();
  const hide = new Set(d.layout?.hide || []);
  const front = [...(d.layout?.front || []), ...['control', 'revisions', 'toc'].filter((k) => !(d.layout?.front || []).includes(k))];
  const labRows = Object.entries(L).flatMap(([k, v]) => (k === 'control' ? Object.entries(v).map(([ck, cv]) => [`control/${ck}`, cv]) : Array.isArray(v) ? v.map((x, i) => [`${k}/${i}`, x]) : typeof v === 'string' ? [[k, v]] : []));
  const rej = sanitizeCss(d.design?.css).rejected;
  const ovs = d.overlays || [];
  const sel = blockOf(S.sel?.b);
  const imgW = (sel && get(d, sel.ptr)?.kind === 'shots' && get(d, sel.ptr).width) || 100;

  const fonts = FONTS.picker('text') + FONTS.picker('display') + FONTS.uploadedList();
  const colours = palPanel() + `<div class="grid2">${DP_COLOURS.map((k) => dpColour(`v-${k}`, k, th.vars[k], t(`design.c.${dpKey(k)}`), t(`design.c.${dpKey(k)}Hint`), 'data-dv')).join('')}</div>`;
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
    + grp('labels', labels) + grp('output', output) + grp('css', css)
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
  input(e) { if (PAL.input(e)) return true; if (FONTS.input(e)) return true; dpSwatchInput(e.target); return VC.input(e, dpPreview); },
  change(e) { if (PAL.change(e)) return true; if (e.target.classList?.contains('cc-hex')) return dpHexChange(e.target); return VC.change(e, dpCommit); },
  keydown(e) { return FONTS.keydown(e) || VC.keydown(e, dpPreview, dpCommit); },
  beforeinput(e) { return VC.beforeinput(e); },
  paste(e) { return VC.paste(e); },
};

/* ── A28 (0.13.0) Import a colour palette: a file → each colour mapped to a role (suggested by name, else by lightness
 * and hue), previewed on the page, checked by the contrast gate of palette/check.py ported here (7:1 body, 4.5:1
 * secondary). A failing pair blocks Apply until the palette is fixed or that pair is overridden with a written reason
 * (kept in design.paletteOverrides). Apply is one change to /design, so one undo restores the theme. The Python gate
 * stays the build gate for palette/tokens.json. Strings live here (engine/i18n.json belongs to the document model). */
const PAL_ROLES = ['primary', 'accent', 'ink', 'paper', 'muted', 'signal'];
const PAL_REQUIRED = ['primary', 'accent', 'ink', 'paper'];
/** a colour named like this takes that role */
const PAL_NAMES = { primary: /^(primary|main|brand)$/i, accent: /^(accent|highlight)$/i, ink: /^(ink|text|body)$/i, paper: /^(paper|background|bg|page)$/i, muted: /^(muted|secondary|grey|gray)$/i, signal: /^(signal|alert|warning|error|danger)$/i };
/** [fg, bg, ratio needed, what it is]: the theme-variable subset of palette/tokens.json contrastPairs */
const PAL_PAIRS = [['ink', 'paper', 7, 'body'], ['muted', 'paper', 4.5, 'secondary'], ['primary', 'paper', 7, 'title'], ['accent', 'paper', 4.5, 'number'], ['#ffffff', 'primary', 7, 'reversed'], ['#ffffff', 'signal', 4.5, 'tag']];
const PAL_TXT = {
  ar: {
    btn: 'استيراد لوحة ألوان', guide: 'ماذا أعطي؟', none: 'بلا دور', apply: 'تطبيق اللوحة', cancel: 'إلغاء', map: 'لكل لون دوره في الوثيقة، واقترحنا دوراً لكل لون من اسمه أو سطوعه ودرجته. غيّره إن شئت.',
    bad: 'لم نجد ألواناً في هذا الملف. راجع «ماذا أعطي؟».', missing: 'أدوار مطلوبة بلا لون: {x}', pass: 'كل أزواج التباين ناجحة.', fail: 'زوج تباين راسب: لا تُطبَّق اللوحة حتى تصلحه أو تكتب سبب التجاوز.',
    over: 'تجاوز مع سبب', example: 'تنزيل المثال', reason: 'سبب التجاوز', done: 'طُبّقت اللوحة. التراجع يعيد الألوان السابقة.',
    body: 'نص الوثيقة على الخلفية', secondary: 'النص الثانوي على الخلفية', title: 'عناوين الفصول على الخلفية', number: 'أرقام الأقسام على الخلفية', reversed: 'رقم أبيض على اللون الأساسي', tag: 'وسم أبيض على لون التنبيه',
    g: ['من 6 إلى 10 ألوان، كل لون رمز سداسي يبدأ بـ # (مثل #1f6f5c).', 'الأدوار المطلوبة أربعة: اللون الأساسي، ولون التمييز، ولون النص، والخلفية. ويُستحسن لون للنص الثانوي ولون واحد للتنبيه والتحذير.', 'نص داكن على خلفية فاتحة: النص على الخلفية 7:1 على الأقل، والنص الثانوي 4.5:1.', 'الصيغ المقبولة: أسطر فيها رمز اللون ثم اسم اختياري، أو ملف JSON (رموز DTCG أو قائمة colors)، أو متغيرات CSS، أو ملف ASE من برامج التصميم، أو صورة عينات: مربعات مسطحة كبيرة على خلفية واحدة، بلا تدرج ولا ظل ولا نص.', 'مثال جاهز: نزّله بالزر أدناه وعدّل عليه.'],
  },
  en: {
    btn: 'Import a colour palette', guide: 'What do I provide?', none: 'No role', apply: 'Apply the palette', cancel: 'Cancel', map: 'Each colour gets a role in the document; we suggested one from its name, or its lightness and hue. Change it if you like.',
    bad: 'No colours found in this file. See «What do I provide?».', missing: 'Required roles with no colour: {x}', pass: 'Every contrast pair passes.', fail: 'A contrast pair fails: the palette cannot be applied until you fix it or write a reason to override it.',
    over: 'Override with a reason', example: 'Download the example', reason: 'Reason for the override', done: 'Palette applied. Undo brings the previous colours back.',
    body: 'Body text on the background', secondary: 'Secondary text on the background', title: 'Chapter titles on the background', number: 'Section numbers on the background', reversed: 'White numeral on the main colour', tag: 'White tag on the alert colour',
    g: ['6 to 10 colours, each a hex code starting with # (such as #1f6f5c).', 'Four roles are required: main colour, accent, text and background. A secondary text colour and one alert colour for warnings are recommended.', 'Dark text on a light background: text on the background at least 7:1, secondary text 4.5:1.', 'Accepted: lines with a colour code and an optional name, a JSON file (DTCG tokens or a colors list), CSS custom properties, an ASE file from design tools, or an image of swatches: large flat squares on one background, no gradient, shadow or text.', 'A ready example: download it with the button below and edit it.'],
  },
};
/** the same file as palette/example-import.json (tests/design.test.mjs keeps the two equal) */
const PAL_EXAMPLE = {"$description": "Example palette for the editor's «Import a colour palette» (Design → Colours). Six roles; every pair passes the contrast gate (ink and primary 7:1 on paper, muted and accent 4.5:1). Invented colours.", "name": "Example: deep teal", "colors": {"primary": "#0b4f4a", "accent": "#8a5a00", "ink": "#1a1a1a", "paper": "#ffffff", "muted": "#55595e", "signal": "#b3261e"}};
const PAL_T = () => PAL_TXT[S.ui] || PAL_TXT.en;
const pt = (k, x) => String(PAL_T()[k] ?? PAL_TXT.en[k]).replace('{x}', x ?? '');
const palLum = (h) => { const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
/** contrast ratio, rounded to 2 places as palette/check.py does */
const palRatio = (a, b) => { const [x, y] = [palLum(a), palLum(b)].sort((m, n) => n - m); return Math.round(((x + 0.05) / (y + 0.05)) * 100) / 100; };
const palHsl = (h) => { const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255); const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn; const s = d ? d / (1 - Math.abs(2 * l - 1)) : 0; const hue = !d ? 0 : mx === r ? 60 * (((g - b) / d) % 6) : mx === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4); return { h: (hue + 360) % 360, s, l }; };
const palRed = (hex) => { const { h, s } = palHsl(hex); return (h < 25 || h > 335) && s > 0.4; };

/** text formats: DTCG or {colors} JSON, CSS custom properties, or lines of "#hex name" → [{hex, name}] */
function palParse(text) {
  const out = [];
  const add = (v, name = '') => { const h = dpHex(typeof v === 'string' ? v : v?.hex || (Array.isArray(v?.components) ? `#${v.components.map((c) => Math.round(c * 255).toString(16).padStart(2, '0')).join('')}` : '')); if (h && !out.some((o) => o.hex === h && o.name === name)) out.push({ hex: h, name: String(name).slice(0, 40) }); };
  const s = String(text).trim();
  if (/^[{[]/.test(s)) {
    const j = JSON.parse(s);
    if (j.colors && typeof j.colors === 'object') { for (const [k, v] of Object.entries(j.colors)) add(v, Array.isArray(j.colors) ? v?.name || '' : k); return out; }
    const walk = (n, key) => { if (!n || typeof n !== 'object') return; if ('$value' in n) { if (!/^\{/.test(String(n.$value))) add(n.$value, key); return; } for (const [k, v] of Object.entries(n)) if (!k.startsWith('$')) walk(v, k); };
    walk(j, '');
    return out;
  }
  for (const m of s.matchAll(/--([\w-]+)\s*:\s*(#[0-9a-f]{3,6})(?![0-9a-f])/gi)) add(m[2], m[1]);
  if (out.length) return out;
  for (const line of s.split(/\r?\n/)) { const m = /^(#?[0-9a-f]{6}|#[0-9a-f]{3})(?![0-9a-f])[\s,;:]*(.*)$/i.exec(line.trim()); if (m) add(m[1], m[2].trim()); }
  return out;
}
/** Adobe Swatch Exchange: RGB entries only (CMYK, LAB and Gray entries are not converted) */
function palParseAse(buf) {
  const v = new DataView(buf);
  if (buf.byteLength < 12 || v.getUint32(0) !== 0x41534546) return [];
  const out = [];
  let p = 12;
  for (let n = v.getUint32(8); n > 0 && p + 6 <= buf.byteLength; n -= 1) {
    const type = v.getUint16(p), len = v.getUint32(p + 2), body = p + 6;
    if (type === 1) {
      const nl = v.getUint16(body);
      let name = '';
      for (let i = 0; i < nl - 1; i += 1) name += String.fromCharCode(v.getUint16(body + 2 + i * 2));
      const m = body + 2 + nl * 2;
      if (String.fromCharCode(...new Uint8Array(buf, m, 4)) === 'RGB ') out.push({ hex: `#${[0, 1, 2].map((i) => Math.round(v.getFloat32(m + 4 + i * 4) * 255).toString(16).padStart(2, '0')).join('')}`, name });
    }
    p = body + len;
  }
  return out;
}
/** an image of swatches: the most frequent flat colours, at most 10, visibly distinct */
async function palFromImage(file) {
  const img = await createImageBitmap(file);
  const cv = Object.assign(document.createElement('canvas'), { width: 64, height: 64 });
  const cx = cv.getContext('2d');
  cx.drawImage(img, 0, 0, 64, 64);
  const px = cx.getImageData(0, 0, 64, 64).data;
  const bins = new Map();
  for (let i = 0; i < px.length; i += 4) { const key = `#${[0, 1, 2].map((c) => Math.min(255, Math.round(px[i + c] / 17) * 17).toString(16).padStart(2, '0')).join('')}`; bins.set(key, (bins.get(key) || 0) + 1); }
  const out = [];
  for (const [hex, n] of [...bins].sort((a, b) => b[1] - a[1])) { if (out.length >= 10 || n < 20) break; if (out.every((o) => palRatio(o.hex, hex) > 1.15 || Math.abs(palHsl(o.hex).h - palHsl(hex).h) > 18)) out.push({ hex, name: '' }); }
  return out;
}
/** a role per colour: a role name wins; then paper = the lightest, ink = the darkest, signal = a saturated red,
 * primary = the darkest saturated left, accent = the most saturated left, muted = the greyest left */
function palSuggest(colors) {
  const taken = new Set();
  for (const c of colors) { const r = PAL_ROLES.find((k) => PAL_NAMES[k].test(c.name || '')); c.role = r && !taken.has(r) ? r : ''; if (c.role) taken.add(r); }
  const pick = (role, score, ok = () => true) => { if (taken.has(role)) return; const f = colors.filter((c) => !c.role && ok(c)); if (!f.length) return; f.reduce((a, b) => (score(b) > score(a) ? b : a)).role = role; taken.add(role); };
  pick('paper', (c) => palLum(c.hex));
  pick('ink', (c) => -palLum(c.hex));
  pick('signal', (c) => palHsl(c.hex).s, (c) => palRed(c.hex));
  pick('primary', (c) => palHsl(c.hex).s - palLum(c.hex) * 2);
  pick('accent', (c) => palHsl(c.hex).s);
  pick('muted', (c) => -palHsl(c.hex).s);
  return colors;
}
/** the palette over the current theme vars, and every pair checked */
function palVars() { const v = { ...designTheme(S.theme, cur().doc).vars }; for (const c of S.pal?.colors || []) if (c.role) v[c.role] = c.hex; return v; }
function palCheck(vars = palVars()) {
  return PAL_PAIRS.map(([fg, bg, need, what]) => { const a = fg.startsWith('#') ? fg : dpHex(vars[fg]); const b = dpHex(vars[bg]); const ratio = a && b ? palRatio(a, b) : 0; return { key: `${fg}/${bg}`, need, what, ratio, ok: ratio >= need }; });
}
const palBlocked = () => PAL_REQUIRED.some((r) => !S.pal.colors.some((c) => c.role === r)) || palCheck().some((p) => !p.ok && !(S.pal.over[p.key] || '').trim());
function palPreview(on) {
  const el = document.documentElement.style;
  for (const r of PAL_ROLES) el.removeProperty(`--${r}`);
  if (on) for (const c of S.pal?.colors || []) if (c.role) el.setProperty(`--${c.role}`, c.hex);
}
const palName = (r) => (r ? t(`design.c.${dpKey(r)}`) : pt('none'));
function palHtml() {
  if (!S.pal) return '';
  const P = S.pal;
  const pairs = palCheck();
  const missing = PAL_REQUIRED.filter((r) => !P.colors.some((c) => c.role === r));
  const opts = (sel) => ['', ...PAL_ROLES].map((r) => `<option value="${r}" ${r === sel ? 'selected' : ''}>${esc(palName(r))}</option>`).join('');
  const allOk = pairs.every((p) => p.ok);
  return `<p class="hint">${esc(pt('map'))}</p><ul class="list pal-list">${P.colors.map((c, i) => `<li><span class="pal-sw" style="background:${c.hex}"></span><span class="pal-hex" dir="ltr">${esc(c.hex)}</span>${c.name ? `<small>${esc(c.name)}</small>` : ''}<select data-palrole="${i}" aria-label="${attr(`${c.hex}${c.name ? ` ${c.name}` : ''}`)}">${opts(c.role)}</select></li>`).join('')}</ul>
${missing.length ? `<p class="warn" role="status">${esc(pt('missing', missing.map(palName).join(S.ui === 'ar' ? '، ' : ', ')))}</p>` : ''}
<table class="pal-gate"><tbody>${pairs.map((p) => `<tr data-ok="${p.ok ? 1 : 0}"><td aria-hidden="true">${p.ok ? '✔' : '✖'}</td><td>${esc(pt(p.what))}</td><td dir="ltr" class="pal-ratio">${p.ratio}:1 / ${p.need}:1</td>
<td>${p.ok ? '' : `<label class="chk"><input type="checkbox" data-palover="${attr(p.key)}" ${P.over[p.key] !== undefined ? 'checked' : ''}> ${esc(pt('over'))}</label>${P.over[p.key] !== undefined ? `<input type="text" data-palreason="${attr(p.key)}" value="${attr(P.over[p.key])}" aria-label="${attr(pt('reason'))}" placeholder="${attr(pt('reason'))}">` : ''}`}</td></tr>`).join('')}</tbody></table>
<p class="${allOk ? 'hint' : 'warn'}" role="status">${esc(allOk ? pt('pass') : pt('fail'))}</p>
<div class="btns"><button type="button" class="b primary" data-palapply ${palBlocked() ? 'disabled aria-disabled="true"' : ''}><span class="w">${esc(pt('apply'))}</span></button><button type="button" class="b" data-palcancel><span class="w">${esc(pt('cancel'))}</span></button></div>`;
}
const palRedraw = () => { const m = root.querySelector('.drawer .palmap'); if (m) m.innerHTML = palHtml(); palPreview(!!S.pal); };
/** the import button, the guideline and the mapping area, at the top of the Colours group */
const palPanel = () => `<div class="pal"><div class="btns"><button type="button" class="b" data-palimp><span class="i">${ic('themeImport') || ''}</span><span class="w">${esc(pt('btn'))}</span></button></div>
<details class="palguide"><summary>${esc(pt('guide'))}</summary><ul class="list">${PAL_T().g.map((l) => `<li>${esc(l)}</li>`).join('')}</ul><div class="btns"><button type="button" class="b" data-palex><span class="w">${esc(pt('example'))}</span></button></div></details>
<div class="palmap" aria-live="polite">${palHtml()}</div></div>`;
const PAL = {
  async import(file) {
    let colors = [];
    try {
      if (/\.ase$/i.test(file.name)) colors = palParseAse(await file.arrayBuffer());
      else if (/^image\//.test(file.type)) colors = await palFromImage(file);
      else colors = palParse(await readAs(file, 'text'));
    } catch { colors = []; }
    if (!colors.length) { toast(pt('bad'), 'warn'); return; }
    S.pal = { colors: palSuggest(colors.slice(0, 16)), over: {} };
    palRedraw();
  },
  apply() {
    if (!S.pal || palBlocked()) return;
    const d = cur().doc;
    const next = JSON.parse(JSON.stringify(d.design || {}));
    next.vars = { ...(next.vars || {}) };
    for (const c of S.pal.colors) if (c.role) next.vars[c.role] = c.hex;
    const over = palCheck().filter((p) => !p.ok).map((p) => ({ pair: p.key, ratio: p.ratio, need: p.need, reason: S.pal.over[p.key].trim(), at: new Date().toISOString() }));
    if (over.length) next.paletteOverrides = [...(next.paletteOverrides || []), ...over];
    S.pal = null;
    palPreview(false);
    commit([{ op: 'replace', path: '/design', value: next, old: d.design }], { mirror: true });
    toast(pt('done'), 'ok');
    openDrawer('theme', true);
  },
  click(e) {
    const b = e.target.closest?.('button');
    if (!b) return false;
    if (b.dataset.palimp !== undefined) { pickFile('.json,.css,.txt,.ase,image/png,image/jpeg,image/webp').then((f) => f && PAL.import(f)); return true; }
    if (b.dataset.palapply !== undefined) { PAL.apply(); return true; }
    if (b.dataset.palex !== undefined) { download('example-import.json', `${JSON.stringify(PAL_EXAMPLE, null, 2)}
`); return true; }
    if (b.dataset.palcancel !== undefined) { S.pal = null; palRedraw(); return true; }
    return false;
  },
  change(e) {
    const x = e.target;
    if (!S.pal) return false;
    if (x.dataset.palrole !== undefined) { const me = S.pal.colors[+x.dataset.palrole]; for (const c of S.pal.colors) if (c !== me && x.value && c.role === x.value) c.role = ''; me.role = x.value; palRedraw(); return true; }
    if (x.dataset.palover !== undefined) { if (x.checked) S.pal.over[x.dataset.palover] = ''; else delete S.pal.over[x.dataset.palover]; palRedraw(); return true; }
    return false;
  },
  input(e) {
    const x = e.target;
    if (!S.pal || x.dataset.palreason === undefined) return false;
    S.pal.over[x.dataset.palreason] = x.value;
    const btn = root.querySelector('.drawer [data-palapply]');
    if (btn) { const bl = palBlocked(); btn.disabled = bl; btn.setAttribute('aria-disabled', bl ? 'true' : 'false'); }
    return true;
  },
};
