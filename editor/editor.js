/* Business-Wrap editor — runs on top of the print markup from engine/render.mjs.
 * Concatenated by engine/build-editor.mjs after engine/edits.mjs and
 * engine/render.mjs (exports stripped) inside one IIFE; uses their functions.
 * The editor layer lives in a Shadow DOM host (#bw-ui-host) and an overlay
 * (#bw-overlay): both are print-hidden and never written into an export.
 */
const DATA = JSON.parse(document.getElementById('bw-data').textContent);
const WATERMARK = (() => {
  const el = document.getElementById('bw-watermark-data');
  try { return el ? JSON.parse(el.textContent) : []; } catch { return []; }
})();
const I18N = DATA.i18n;
const KEY = `bw:draft:${DATA.setId}`;
const ls = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); return true; } catch { return false; } },
  del(k) { try { localStorage.removeItem(k); } catch { /* storage unavailable */ } },
};

const S = {
  ui: ls.get('bw:ui') || DATA.uiLang || 'ar',
  dir: ls.get('bw:dir') || null,
  docxFonts: ls.get('bw:docx-fonts') !== '0', // DOCX carries the fonts unless turned off // layout direction override; null = follows the language
  dark: ls.get('bw:dark') === '1',
  svc: DATA.services[0].id,
  ed: DATA.services[0].editions.ar ? 'ar' : 'en',
  side: false,
  both: true,
  zoom: 1,
  spell: { ar: false, en: false },
  theme: DATA.theme,
  sel: null, // {p, b, el}
  drawer: null,
  conflicts: [],
  dirty: false,
  savedAt: null,
};
let gseq = 0;
const newGroup = () => `g${Date.now().toString(36)}${(gseq++).toString(36)}`;

/* ── model ─────────────────────────────────────────────────────────────── */
const M = {}; // M[svc][ed] = {base, raw, hash, ops, redo, status, stale:Set, comments:[], versions:[], doc}
for (const s of DATA.services) {
  M[s.id] = {};
  for (const [ed, e] of Object.entries(s.editions)) {
    const base = JSON.parse(e.raw);
    M[s.id][ed] = {
      base, raw: e.raw, hash: e.hash, name: e.name,
      ops: e.ops || [], redo: [], status: e.status || {}, stale: new Set(e.stale || []),
      comments: e.comments || [], versions: e.versions || [], doc: null,
    };
  }
}
const cur = (ed = S.ed, svc = S.svc) => M[svc][ed];
const other = (ed = S.ed) => (ed === 'ar' ? 'en' : 'ar');
const hasOther = () => !!M[S.svc][other()];
const liveOps = (e) => e.ops.filter((o) => e.status[o.id] !== 'rejected');
function rebuild(e) { e.doc = applyOps(e.base, liveOps(e)); return e.doc; }
for (const s of Object.values(M)) for (const e of Object.values(s)) rebuild(e);

/* ── i18n ──────────────────────────────────────────────────────────────── */
const t = (k, vars = {}) => {
  let s = I18N.ui[S.ui][k] ?? I18N.ui.en[k] ?? k;
  for (const [a, b] of Object.entries(vars)) s = s.replace(`{${a}}`, b);
  return s;
};
const tAlt = (k) => I18N.ui[S.ui === 'ar' ? 'en' : 'ar'][k] ?? ''; // the other language's word (toolbar parity measure)
const kindName = (k) => (I18N.ui[S.ui].kinds || {})[k] || k;

/* ── rendering ─────────────────────────────────────────────────────────── */
const docCssEl = document.getElementById('bw-doc-css');
const fontsEl = document.getElementById('bw-fonts');
function renderOne(ed) {
  const e = cur(ed);
  const parts = renderParts(e.doc, { locale: ed, labels: I18N.doc[ed], theme: S.theme, editor: true });
  return { html: documentMain(parts, S.theme.logos, ed), sheet: parts.sheet };
}
function render(keepScroll = true) {
  const y = window.scrollY;
  const eds = S.side && hasOther() ? ['ar', 'en'].filter((x) => M[S.svc][x]) : [S.ed];
  let html = '';
  let sheet;
  for (const ed of eds) {
    const r = renderOne(ed);
    if (ed === S.ed) sheet = r.sheet;
    html += ed === S.ed ? r.html : r.html.replace('<main class="bw-doc"', '<main class="bw-doc bw-other"');
  }
  docCssEl.textContent = documentCss(S.theme, sheet, cur().doc);
  document.documentElement.classList.add('bw-ed');
  let pair = document.getElementById('bw-pair');
  if (!pair) {
    pair = document.createElement('div');
    pair.id = 'bw-pair';
    const old = document.querySelector('main.bw-doc');
    old.before(pair);
    old.remove();
  }
  pair.className = S.side && eds.length > 1 ? 'bw-side' : '';
  pair.innerHTML = html;
  if (S.dir) pair.querySelectorAll('main.bw-doc').forEach((m) => { m.dir = S.dir; }); // view only; exports keep the edition's direction
  document.documentElement.lang = S.ed;
  document.documentElement.dir = LAYOUT_DIR; // the layout never flips (0.10.0): only the words' direction follows S.dir / the language
  document.documentElement.style.setProperty('--bw-zoom', String(S.zoom));
  decorate();
  if (keepScroll) window.scrollTo(0, y);
  restoreSel();
  refreshUi();
  dgZoomAll();
  if (S.dg) dgPaint();
  viewsApply();
}
function mainOf(ed) {
  return document.querySelector(`#bw-pair main.bw-doc[data-locale="${ed}"]`);
}
function decorate() {
  for (const ed of ['ar', 'en']) {
    const main = mainOf(ed);
    if (!main) continue;
    const e = cur(ed);
    main.setAttribute('spellcheck', S.spell[ed] ? 'true' : 'false');
    main.querySelectorAll('[data-p]').forEach((el) => {
      el.tabIndex = 0;
      if (e.stale.has(el.dataset.p)) { el.classList.add('bw-stale'); el.title = t('staleTip'); }
    });
    const commented = new Set(e.comments.map((c) => c.path));
    main.querySelectorAll('[data-b]').forEach((el) => {
      if (commented.has(el.dataset.b) && !el.previousElementSibling?.matches?.(`[data-b="${CSS.escape(el.dataset.b)}"]`)) el.classList.add('bw-has-comment');
    });
    decorateOverlays(main);
  }
}

/* ── ops ───────────────────────────────────────────────────────────────── */
function commit(ops, { ed = S.ed, rerender = true, group = newGroup(), mirror = false } = {}) {
  const e = cur(ed);
  ops.forEach((op, k) => {
    op.id = `${group}.${k}`;
    op.at = new Date().toISOString();
    applyOp(e.doc, op); // throws before anything is recorded if a pointer is wrong
    e.ops.push(op);
  });
  e.redo = [];
  if (mirror && S.both && hasOther()) {
    const o = cur(other(ed));
    const copy = ops.map((op) => ({ ...JSON.parse(JSON.stringify(op)) }));
    try {
      const test = JSON.parse(JSON.stringify(o.doc));
      copy.forEach((op) => applyOp(test, op));
      copy.forEach((op, k) => { op.id = `${group}.m${k}`; applyOp(o.doc, op); o.ops.push(op); });
      o.redo = [];
    } catch { /* other edition does not have this shape — the check panel reports the pair */ }
  }
  touched();
  if (rerender) render();
}
/** The labels this edition prints: house ← design pack ← document. */
const labelsOf = (ed = S.ed) => withLabels(I18N.doc[ed], S.theme.labels?.[ed], cur(ed).doc.labels);
/** /labels/<key>[/<sub>] edited for the first time: create the map (and an array or control map) from what prints now. */
function ensurePath(path, ed) {
  const e = cur(ed);
  const m = /^\/labels\/([^/]+)(\/.*)?$/.exec(path);
  const pre = [];
  if (m) {
    if (!e.doc.labels) pre.push({ op: 'replace', path: '/labels', value: {} });
    if (m[2] && (e.doc.labels || {})[m[1]] === undefined) { const now = labelsOf(ed)[m[1]]; pre.push({ op: 'replace', path: `/labels/${m[1]}`, value: Array.isArray(now) ? [...now] : {} }); }
  }
  if (/^\/control\/(coverTitle|subtitle)$/.test(path) && !e.doc.control) pre.push({ op: 'replace', path: '/control', value: {} });
  if (pre.length) commit(pre, { ed, rerender: false });
}
/** A harvested (generated) value edited by hand is flagged manual, so a re-harvest keeps it and reports a conflict. */
function flagManual(path, old, ed) {
  const e = cur(ed);
  if (!e.doc.harvest || path.startsWith('/labels') || path.startsWith('/manual')) return;
  if (e.doc.manual?.[path]) return;
  const pre = [];
  if (!e.doc.manual) pre.push({ op: 'replace', path: '/manual', value: {} });
  pre.push({ op: 'replace', path: `/manual/${path.replace(/~/g, '~0').replace(/\//g, '~1')}`, value: { generated: old ?? '' } });
  commit(pre, { ed, rerender: false });
}
function setText(path, value, ed = S.ed) {
  ensurePath(path, ed);
  const e = cur(ed);
  const old = get(e.doc, path) ?? (path.startsWith('/labels/') ? get(labelsOf(ed), path.slice(7)) : undefined);
  if (old === value) return;
  if (path.startsWith('/labels/')) S.labelEdit = { path, value, ed };
  flagManual(path, old, ed);
  const last = e.ops.at(-1);
  if (last && last.op === 'setText' && last.path === path && S.typingGroup && last.id.startsWith(S.typingGroup + '.')) {
    last.value = value;
    last.at = new Date().toISOString();
    applyOp(e.doc, last);
  } else {
    S.typingGroup = newGroup();
    commit([{ op: 'setText', path, value, old }], { ed, rerender: false, group: S.typingGroup });
  }
  if (hasOther()) {
    if (e.stale.has(path)) e.stale.delete(path);
    else cur(other(ed)).stale.add(path);
  }
  touched();
}
function undo(ed = S.ed) {
  const e = cur(ed);
  const last = e.ops.at(-1);
  if (!last) return;
  const g = last.id.split('.')[0];
  const grp = [];
  while (e.ops.length && e.ops.at(-1).id.split('.')[0] === g) grp.unshift(e.ops.pop());
  e.redo.push(grp);
  rebuild(e);
  touched();
  render();
}
function redo(ed = S.ed) {
  const e = cur(ed);
  const grp = e.redo.pop();
  if (!grp) return;
  e.ops.push(...grp);
  rebuild(e);
  touched();
  render();
}

/* ── autosave + recovery ───────────────────────────────────────────────── */
let saveTimer;
function snapshotState() {
  const out = { v: 1, at: new Date().toISOString(), theme: S.theme, svc: {} };
  for (const [sid, s] of Object.entries(M)) {
    out.svc[sid] = {};
    for (const [ed, e] of Object.entries(s))
      out.svc[sid][ed] = { hash: e.hash, ops: e.ops, status: e.status, stale: [...e.stale], comments: e.comments, versions: e.versions };
  }
  return out;
}
// The draft write. S.pending is true while a debounced write has not happened yet; every write bumps
// <html data-bw-draft>, so a caller (or a test) waits on the outcome, never on a guessed delay.
let draftSeq = 0;
function writeDraft() {
  clearTimeout(saveTimer);
  S.pending = false;
  if (!ls.set(KEY, JSON.stringify(snapshotState()))) return false;
  S.savedAt = new Date();
  document.documentElement.dataset.bwDraft = String(++draftSeq);
  return true;
}
function touched() {
  S.dirty = true;
  S.pending = true;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { if (writeDraft()) flash(t('autosaved')); }, 400);
  refreshUi();
}
function loadDraft(d) {
  if (d.theme) S.theme = d.theme;
  for (const [sid, s] of Object.entries(d.svc || {}))
    for (const [ed, x] of Object.entries(s)) {
      const e = M[sid]?.[ed];
      if (!e || e.hash !== x.hash) continue;
      Object.assign(e, { ops: x.ops || [], status: x.status || {}, stale: new Set(x.stale || []), comments: x.comments || [], versions: x.versions || [], redo: [] });
      rebuild(e);
    }
}
function offerRecovery() {
  const raw = ls.get(KEY);
  if (!raw) return;
  let d;
  try { d = JSON.parse(raw); } catch { return; }
  const embedded = JSON.stringify(Object.values(M).flatMap((s) => Object.values(s).map((e) => e.ops)));
  const drafted = JSON.stringify(Object.entries(d.svc || {}).flatMap(([sid, s]) => Object.entries(s).filter(([ed]) => M[sid]?.[ed]).map(([, x]) => x.ops)));
  if (drafted === embedded) return;
  banner(t('restore'), [
    [t('restoreYes'), () => { loadDraft(d); render(); }],
    [t('restoreNo'), () => ls.del(KEY)],
  ]);
}

/* ── files ─────────────────────────────────────────────────────────────── */
function download(name, text, type = 'application/json') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
function editsFile(svc, ed) {
  const e = M[svc][ed];
  return {
    version: 1,
    document: e.base.control?.documentId || svc,
    baseHash: e.hash,
    locale: ed,
    createdAt: new Date().toISOString(),
    ops: liveOps(e).map(({ op, path, value, old, from, to, id, at }) => {
      const o = { op, path };
      if (id) o.id = id;
      if (at) o.at = at;
      if (value !== undefined) o.value = value;
      if (old !== undefined) o.old = old;
      if (from !== undefined) o.from = from;
      if (to !== undefined) o.to = to;
      return o;
    }),
  };
}
const bundle = (svcs) => ({ kind: 'bw-edits-bundle', version: 1, createdAt: new Date().toISOString(), files: svcs.flatMap((sid) => Object.keys(M[sid]).map((ed) => editsFile(sid, ed))) });
function saveAll() {
  writeDraft();
  download(`${S.svc}.${S.ed}.edits.json`, JSON.stringify(editsFile(S.svc, S.ed), null, 1));
  S.dirty = false;
  flash(t('saved'));
  emitHook('save');
}
function pickFile(accept) {
  return new Promise((res) => {
    const i = document.createElement('input');
    i.type = 'file';
    i.accept = accept;
    i.onchange = () => res(i.files[0] || null);
    i.click();
  });
}
const readAs = (file, how) => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(r.result);
  r.onerror = rej;
  how === 'url' ? r.readAsDataURL(file) : r.readAsText(file);
});

/** A document JSON opened at run time (Import): it becomes a service of its own, hashed like the build does. */
async function addDocument(raw, doc, name) {
  if (!globalThis.crypto?.subtle) { flash(t('badFile'), true); return; }
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
  const hash = `sha256:${[...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')}`;
  const ed = /\.en\.json$/i.test(name) ? 'en' : /\.ar\.json$/i.test(name) ? 'ar' : /[؀-ۿ]/.test(doc.control?.title || '') ? 'ar' : 'en';
  const id = String(doc.service || name.split('.')[0] || 'document');
  const title = String(doc.control?.title || id);
  let svc = DATA.services.find((s) => s.id === id);
  if (!svc) { svc = { id, editions: {} }; DATA.services.push(svc); M[id] = {}; }
  svc.editions[ed] = { name: title.split(/\s*[:—]\s+/).slice(1).join(': ') || title, raw, hash, ops: [] };
  M[id][ed] = { base: doc, raw, hash, name: svc.editions[ed].name, ops: [], redo: [], status: {}, stale: new Set(), comments: [], versions: [], doc: null };
  rebuild(M[id][ed]);
  S.svc = id; S.ed = ed; S.sel = null;
  buildUi();
  render(false);
  flash(t('docLoaded', { name: svc.editions[ed].name }));
}
/** Import an edits file / bundle / colleague's Save-HTML and merge with conflicts. */
async function importFile(file) {
  const text = await readAs(file, 'text');
  let files = [];
  let extra = null;
  try {
    if (/^\s*</.test(text)) {
      // A Save-HTML file: only its data block is read, as a string; the HTML is never parsed.
      const m = /<script type="application\/json" id="bw-data">([\s\S]*?)<\/script>/.exec(text);
      const data = m ? JSON.parse(m[1]) : null;
      if (!data) throw new Error('no data');
      for (const s of data.services)
        for (const [ed, x] of Object.entries(s.editions)) files.push({ version: 1, baseHash: x.hash, locale: ed, ops: x.ops || [], comments: x.comments });
    } else {
      const j = JSON.parse(text);
      if (j.chapters && j.control) { await addDocument(text, j, file.name || ''); return; }
      if (j.kind === 'bw-edits-bundle') files = j.files.map(migrate);
      else if (j.kind === 'bw-comments') extra = j;
      else files = [migrate(j)];
    }
  } catch { flash(t('badFile'), true); return; }
  if (extra) { mergeComments(extra); return; }
  let n = 0;
  S.conflicts = [];
  for (const f of files) {
    const hit = Object.entries(M).flatMap(([sid, s]) => Object.entries(s).map(([ed, e]) => ({ sid, ed, e }))).find((x) => x.e.hash === f.baseHash && x.ed === f.locale);
    if (!hit) { flash(t('hashMismatch'), true); continue; }
    const { merged, conflicts } = mergeOps(hit.e.base, liveOps(hit.e), f.ops || []);
    const added = merged.length - liveOps(hit.e).length;
    if (added > 0) {
      const group = newGroup();
      merged.slice(liveOps(hit.e).length).forEach((op, k) => { op.id = `${group}.${k}`; hit.e.ops.push(op); });
      rebuild(hit.e);
      n += added;
    }
    if (f.comments) for (const c of f.comments) if (!hit.e.comments.some((x) => x.id === c.id)) hit.e.comments.push(c);
    S.conflicts.push(...conflicts.map((c) => ({ ...c, sid: hit.sid, ed: hit.ed })));
  }
  touched();
  render();
  flash(t('merged', { n }));
  emitHook('import.merged', { merged: n, conflicts: S.conflicts.length });
  if (S.conflicts.length) openDrawer('conflicts');
}
function mergeComments(j) {
  for (const c of j.comments || []) {
    const e = M[c.service]?.[c.locale];
    if (e && !e.comments.some((x) => x.id === c.id)) e.comments.push(c);
  }
  touched();
  render();
}

/** Save HTML: this service only, self-contained, editable by a colleague. No watermark. */
async function saveHtml(embedFonts) {
  const s = DATA.services.find((x) => x.id === S.svc);
  const editions = {};
  for (const [ed, e] of Object.entries(M[S.svc]))
    editions[ed] = { name: e.name, raw: e.raw, hash: e.hash, ops: e.ops, status: e.status, stale: [...e.stale], comments: e.comments, versions: e.versions };
  let fontCss = DATA.fontCss;
  if (embedFonts) fontCss = await inlineFonts(fontCss);
  const data = { ...DATA, setId: `${DATA.setId}:${S.svc}`, services: [{ id: s.id, editions }], theme: S.theme, fontCss, uiLang: S.ui };
  const parts = renderParts(cur().doc, { locale: S.ed, labels: I18N.doc[S.ed], theme: S.theme });
  const html = `<!doctype html>
<html lang="${S.ed}" dir="${S.ed === 'ar' ? 'rtl' : 'ltr'}"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${DATA.csp}">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(cur().doc.control.title)}</title>
<style id="bw-fonts">${fontCss}</style>
<style id="bw-doc-css">${documentCss(S.theme, parts.sheet, cur().doc)}</style>
<style id="bw-editor-css">${document.getElementById('bw-editor-css').textContent}</style>
</head><body>
${documentMain(parts, S.theme.logos, S.ed)}
<script type="application/json" id="bw-data">${JSON.stringify(data).replace(/</g, '\\u003c')}<\/script>
<script id="bw-app">${document.getElementById('bw-app').textContent}<\/script>
</body></html>`;
  download(`${S.svc}.editor.html`, html, 'text/html');
}
async function inlineFonts(css) {
  const urls = [...css.matchAll(/url\((file:[^)]+)\)/g)].map((m) => m[1]);
  for (const u of urls) {
    try {
      const b = await (await fetch(u)).blob();
      css = css.replace(u, await readAs(b, 'url'));
    } catch { flash(t('embedFonts') + ' ✕', true); return css; }
  }
  return css;
}

/** The design pack: this document's design, its chosen uploaded fonts and the edited labels. */
function exportDesignPack() {
  const th = designTheme(S.theme, cur().doc);
  const { css, ...rest } = th;
  const used = [th.fonts.text, th.fonts.display];
  const fontFaces = (cur().doc.design?.fontFaces || []).filter((f) => used.includes(f.family));
  download(`design-pack.json`, JSON.stringify({ kind: 'bw-design-pack', version: 1, ...rest, ...(fontFaces.length ? { fontFaces } : {}), labels: S.theme.labels || {} }, null, 1));
}
/* ── export PDF + DOCX ─────────────────────────────────────────────────── */
async function exportPdfDocx() {
  const e = cur();
  const body = { service: S.svc, locale: S.ed, doc: e.doc, theme: S.theme, embedFonts: S.docxFonts };
  if (location.protocol.startsWith('http')) {
    try {
      const r = await fetch('/api/export', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || r.status);
      flash(t('exportDone', { x: [j.pdf, j.docx].filter(Boolean).join(' · ') }));
      emitHook('export', { pdf: !!j.pdf, docx: !!j.docx });
      for (const u of [j.pdfUrl, j.docxUrl].filter(Boolean)) window.open(u, '_blank', 'noopener');
      return;
    } catch (err) { flash(String(err.message || err), true); return; }
  }
  const name = `${S.svc}.${S.ed}.edited.json`;
  download(name, JSON.stringify(e.doc, null, 1));
  banner(`${t('serverOnly')} node engine/export.mjs --doc ${name} --locale ${S.ed}`, [[t('close'), () => {}]]);
}

/* ── print ─────────────────────────────────────────────────────────────── */
window.addEventListener('beforeprint', () => {
  const main = mainOf(S.ed);
  if (!main) return;
  document.documentElement.classList.add('bw-printing');
  viewsUnpage(); // views.js: print measures the plain sheet, never the paged view (afterprint re-renders it)
  relaxTallGroups(relaxArgs());
});
window.addEventListener('afterprint', () => {
  document.documentElement.classList.remove('bw-printing');
  render();
});

/* ── selection ─────────────────────────────────────────────────────────── */
function selectEl(el) {
  S.selOv = null;
  if (S.dg && !el.closest?.('figure[data-dg]')) dgClear();
  const main = el.closest('main.bw-doc');
  if (!main) return;
  const ed = main.dataset.locale;
  if (ed !== S.ed) { S.ed = ed; document.documentElement.lang = ed; }
  const pEl = el.closest('[data-p]');
  const bEl = el.closest('[data-b]');
  S.sel = { p: pEl?.dataset.p || null, b: bEl?.dataset.b || null, ed };
  paintSel();
  refreshUi();
}
function paintSel() {
  document.querySelectorAll('.bw-sel').forEach((x) => x.classList.remove('bw-sel'));
  if (!S.sel?.b) { overlay.grip.hidden = true; return; }
  const main = mainOf(S.sel.ed);
  const els = main ? [...main.querySelectorAll(`[data-b="${CSS.escape(S.sel.b)}"]`)] : [];
  els.forEach((x) => x.classList.add('bw-sel'));
  placeGrip(els);
}
function restoreSel() {
  if (!S.sel) return;
  const main = mainOf(S.sel.ed);
  if (!main) return;
  if (S.sel.b && !main.querySelector(`[data-b="${CSS.escape(S.sel.b)}"]`)) S.sel.b = null;
  paintSel();
}
function selDesc() {
  if (!S.sel) return t('nothingSelected');
  const b = S.sel.b && get(cur(S.sel.ed).doc, S.sel.b);
  const bits = [];
  if (b?.kind) bits.push(kindName(b.kind));
  const cell = S.sel.p && /\/rows\/(\d+)\/(\d+)$/.exec(S.sel.p);
  if (cell) bits.push(`${kindName('row')} ${+cell[1] + 1} · ${kindName('cell')} ${+cell[2] + 1}`);
  else if (S.sel.p && !b) bits.push(kindName('text'));
  return t('selected', { x: bits.join(' — ') || kindName('text') });
}
const blockOf = (p) => {
  const m = /^(.*\/blocks)\/(\d+)/.exec(p || '');
  return m ? { arr: m[1], i: +m[2], ptr: `${m[1]}/${m[2]}` } : null;
};
function tableCtx() {
  const el = S.sel && document.activeElement?.closest?.('table[data-rows]') || lastCell?.closest('table[data-rows]');
  if (!el) return null;
  const cell = lastCell;
  return { rows: el.dataset.rows, cols: el.dataset.cols || null, w: +el.dataset.w, r: cell ? +cell.dataset.r : -1, c: cell ? +cell.dataset.c : -1 };
}
let lastCell = null;

/* ── Design: every visual property, labels, template parts, per-instance style, advanced CSS ──
 * Document-level design is saved in the document (doc.design, doc.layout, doc.labels) through ops,
 * so undo/redo, the edits JSON, the PDF and the DOCX all carry it; the design pack export bundles it. */
function labelToPack(key, value, ed) {
  const parts = key.split('/');
  const pack = JSON.parse(JSON.stringify(S.theme.labels || {}));
  pack[ed] = pack[ed] || {};
  if (parts.length === 1) pack[ed][parts[0]] = value;
  else { const now = labelsOf(ed)[parts[0]]; const node = pack[ed][parts[0]] ?? (Array.isArray(now) ? [...now] : {}); node[parts[1]] = value; pack[ed][parts[0]] = node; }
  S.theme = { ...S.theme, labels: pack };
  touched();
  toast(t('labelAllDone'), 'ok');
}
const DESIGN = {
  /** a document-level design write: one replace of /design (or /layout), mirrored to the other edition */
  set(root, key, sub, value) {
    const d = cur().doc;
    const next = JSON.parse(JSON.stringify(d[root] || {}));
    if (sub) { next[sub] = { ...(next[sub] || {}) }; if (value === '' || value == null) delete next[sub][key]; else next[sub][key] = value; }
    else if (value === '' || value == null) delete next[key]; else next[key] = value;
    commit([{ op: 'replace', path: `/${root}`, value: next, old: d[root] }], { mirror: root !== 'labels' });
  },
  /** the Design drawer body and the per-element style: editor/design-panel.js */
  panel() { return designPanel(); },
  inspector() { return styleInspector(); },
  setStyle(prop, value) {
    const b = blockOf(S.sel?.b);
    if (!b) return;
    const node = get(cur().doc, b.ptr);
    const st = { ...(node.style || {}) };
    if (value === '' || value == null) delete st[prop]; else st[prop] = value;
    commit([node.style ? { op: 'replace', path: `${b.ptr}/style`, value: st, old: node.style } : { op: 'insert', path: `${b.ptr}/style`, value: st }], { mirror: true });
  },
  toggleHidden() {
    const b = blockOf(S.sel?.b);
    if (!b) return;
    const node = get(cur().doc, b.ptr);
    commit([node.hidden ? { op: 'delete', path: `${b.ptr}/hidden`, old: true } : { op: 'insert', path: `${b.ptr}/hidden`, value: true }], { mirror: true });
    toast(t(node.hidden ? 'hiddenOn' : 'hiddenOff'), 'info');
  },
  moveRow(dir) {
    const x = tableCtx();
    if (!x || x.r < 0) return;
    const rows = get(cur().doc, x.rows);
    const to = x.r + dir;
    if (to < 0 || to >= rows.length) return;
    commit([{ op: 'move', from: `${x.rows}/${x.r}`, path: `${x.rows}/${to}` }], { mirror: true });
  },
  input(el) {
    if (el.dataset.st && el.type === 'color') DESIGN.setStyle(el.dataset.st, el.value);
    if (el.dataset.dv && el.type === 'color') DESIGN.set('design', el.dataset.dv, 'vars', el.value);
  },
  change(el) {
    const f = el.dataset;
    if (f.st && el.type !== 'color') DESIGN.setStyle(f.st, el.value.trim());
    if (f.k === 'sthide') DESIGN.toggleHidden();
    if (f.k === 'laball') S.labelAll = el.checked;
    if (f.lab !== undefined) {
      if (S.labelAll) labelToPack(f.lab, el.value, S.ed), render();
      else setText(`/labels/${f.lab}`, el.value), render();
      S.typingGroup = null;
    }
    if (f.dpart) {
      const hide = new Set(cur().doc.layout?.hide || []);
      el.checked ? hide.delete(f.dpart) : hide.add(f.dpart);
      DESIGN.set('layout', 'hide', null, [...hide]);
    }
    if (f.dch !== undefined) {
      const p = `/chapters/${f.dch}/hidden`;
      commit([el.checked ? { op: 'delete', path: p, old: true } : { op: 'insert', path: p, value: true }], { mirror: true });
    }
  },
  click(x) {
    const d = cur().doc;
    const f = x.dataset;
    const n = d.chapters.length;
    if (f.dmove) {
      const front = [...(d.layout?.front || []), ...['control', 'revisions', 'toc'].filter((k) => !(d.layout?.front || []).includes(k))];
      const i = front.indexOf(f.dmove);
      const j = i + Number(f.d);
      if (j < 0 || j >= front.length) return true;
      [front[i], front[j]] = [front[j], front[i]];
      DESIGN.set('layout', 'front', null, front);
    } else if (f.dchm !== undefined) {
      const i = +f.dchm; const j = i + Number(f.d);
      if (j < 0 || j >= n) return true;
      commit([{ op: 'move', from: `/chapters/${i}`, path: `/chapters/${j}` }], { mirror: true });
    } else if (f.dchd !== undefined) commit([{ op: 'duplicate', path: `/chapters/${f.dchd}` }], { mirror: true });
    else if (f.dchx !== undefined) { if (n > 1) commit([{ op: 'delete', path: `/chapters/${f.dchx}`, old: d.chapters[+f.dchx] }], { mirror: true }); }
    else if (f.k === 'addTable' || f.k === 'addSection') {
      const b = blockOf(S.sel?.b);
      const ch = d.chapters.length - 1;
      if (f.k === 'addTable') {
        const at = b ? `${b.arr}/${b.i + 1}` : `/chapters/${ch}/sections/0/blocks/-`;
        commit([{ op: 'insert', path: at, value: { kind: 'table', columns: ['', ''], rows: [['', '']] } }], { mirror: true });
      } else {
        const c = d.chapters[ch];
        commit([{ op: 'insert', path: `/chapters/${ch}/sections/-`, value: { number: `${c.number}.${c.sections.length + 1}`, title: t('newSection'), blocks: [{ kind: 'prose', paragraphs: [labelsOf().newParagraph] }] } }], { mirror: true });
      }
    } else if (f.k === 'dcssApply') {
      const v = root.querySelector('.drawer textarea[data-dcss]').value;
      DESIGN.set('design', 'css', null, v);
      const rej = sanitizeCss(v).rejected;
      if (rej.length) toast(t('vCss', { x: rej.join(' · ') }), 'warn');
    } else if (f.k === 'stclear') {
      const b = blockOf(S.sel?.b);
      if (b && get(d, `${b.ptr}/style`)) commit([{ op: 'delete', path: `${b.ptr}/style`, old: get(d, `${b.ptr}/style`) }], { mirror: true });
    } else return false;
    openDrawer(S.drawer);
    return true;
  },
};

/* ── block actions ─────────────────────────────────────────────────────── */
const A = {
  duplicate() { const b = blockOf(S.sel?.b); if (b) { commit([{ op: 'duplicate', path: b.ptr }], { mirror: true }); S.sel.b = `${b.arr}/${b.i + 1}`; paintSel(); } },
  delete() {
    const b = blockOf(S.sel?.b);
    if (!b) return;
    commit([{ op: 'delete', path: b.ptr, old: get(cur().doc, b.ptr) }], { mirror: true });
    S.sel = null; paintSel();
  },
  move(d) {
    const b = blockOf(S.sel?.b);
    if (!b) return;
    const n = get(cur().doc, b.arr).length;
    const to = b.i + d;
    if (to < 0 || to >= n) return;
    commit([{ op: 'move', from: b.ptr, path: `${b.arr}/${to}` }], { mirror: true });
    S.sel.b = `${b.arr}/${to}`;
    paintSel();
  },
  addPara() {
    const m = /^(.*\/paragraphs)\/(\d+)$/.exec(S.sel?.p || '');
    const b = blockOf(S.sel?.b);
    if (m) commit([{ op: 'insert', path: `${m[1]}/${+m[2] + 1}`, value: I18N.doc[S.ed].newParagraph }], { mirror: true });
    else if (b) commit([{ op: 'insert', path: `${b.arr}/${b.i + 1}`, value: { kind: 'prose', paragraphs: [I18N.doc[S.ed].newParagraph] } }], { mirror: true });
  },
  rowAdd() {
    const x = tableCtx();
    if (!x) return;
    commit([{ op: 'insert', path: `${x.rows}/${x.r + 1}`, value: Array.from({ length: x.w || 1 }, () => '') }], { mirror: true });
  },
  rowDel() {
    const x = tableCtx();
    if (!x || x.r < 0) return;
    commit([{ op: 'delete', path: `${x.rows}/${x.r}`, old: get(cur().doc, `${x.rows}/${x.r}`) }], { mirror: true });
    lastCell = null;
  },
  colAdd() {
    const x = tableCtx();
    if (!x || !x.cols) return;
    const at = x.c + 1;
    const rows = get(cur().doc, x.rows);
    const L = I18N.doc[S.ed];
    commit([{ op: 'insert', path: `${x.cols}/${at}`, value: '…' }, ...rows.map((_, r) => ({ op: 'insert', path: `${x.rows}/${r}/${at}`, value: L.none }))], { mirror: true });
  },
  colDel() {
    const x = tableCtx();
    if (!x || !x.cols || x.c < 0) return;
    const rows = get(cur().doc, x.rows);
    commit([{ op: 'delete', path: `${x.cols}/${x.c}` }, ...rows.map((_, r) => ({ op: 'delete', path: `${x.rows}/${r}/${x.c}` }))], { mirror: true });
    lastCell = null;
  },
  async image() {
    const img = await pickImage();
    if (!img) return;
    const url = img.src;
    const b = blockOf(S.sel?.b);
    const blk = b && get(cur().doc, b.ptr);
    if (blk?.kind === 'shots') commit([{ op: 'replace', path: `${b.ptr}/images`, value: [url], old: blk.images }]);
    else {
      const arr = b ? b.arr : '/chapters/0/sections/0/blocks';
      const at = b ? b.i + 1 : 0;
      commit([{ op: 'insert', path: `${arr}/${at}`, value: { kind: 'shots', caption: I18N.doc[S.ed].figure, images: [url], width: 80 } }]);
      S.sel = { ...(S.sel || {}), b: `${arr}/${at}`, ed: S.ed };
      paintSel();
    }
  },
  width(v) {
    const b = blockOf(S.sel?.b);
    const blk = b && get(cur().doc, b.ptr);
    if (blk?.kind !== 'shots') return;
    commit([{ op: 'replace', path: `${b.ptr}/width`, value: Math.min(100, Math.max(10, +v)), old: blk.width }]);
  },
  layout(flag) {
    const b = blockOf(S.sel?.b);
    const blk = b && get(cur().doc, b.ptr);
    if (!blk) return;
    const lay = { ...(blk.layout || {}) };
    lay[flag] = !lay[flag];
    commit([{ op: 'replace', path: `${b.ptr}/layout`, value: lay, old: blk.layout }], { mirror: true });
  },
  async comment() {
    const target = S.sel?.b || S.sel?.p;
    if (!target) return;
    const text = await ask(t('commentPrompt'));
    if (!text) return;
    cur().comments.push({ id: `c${Date.now().toString(36)}`, path: target, text, at: new Date().toISOString(), service: S.svc, locale: S.ed });
    touched();
    render();
  },
  renumber() {
    for (const ed of Object.keys(M[S.svc])) {
      const d = cur(ed).doc;
      const ops = [];
      d.chapters.forEach((ch, i) => {
        const n = String(i + 1);
        if (ch.number !== n) ops.push({ op: 'replace', path: `/chapters/${i}/number`, value: n, old: ch.number });
        ch.sections.forEach((s, j) => {
          const sn = `${n}.${j + 1}`;
          if (s.number !== sn) ops.push({ op: 'replace', path: `/chapters/${i}/sections/${j}/number`, value: sn, old: s.number });
          s.blocks.forEach((b, k) => {
            if (b.kind === 'stories' && b.number !== undefined && b.number !== sn) ops.push({ op: 'replace', path: `/chapters/${i}/sections/${j}/blocks/${k}/number`, value: sn, old: b.number });
          });
        });
      });
      if (ops.length) commit(ops, { ed, rerender: false });
    }
    render();
  },
};

/* ── drag to move ──────────────────────────────────────────────────────── */
const overlay = {};
function placeGrip(els) {
  const g = overlay.grip;
  if (!els.length) { g.hidden = true; return; }
  const r = els[0].getBoundingClientRect();
  const main = els[0].closest('main.bw-doc').getBoundingClientRect();
  g.hidden = false;
  const rtl = getComputedStyle(els[0]).direction === 'rtl';
  g.style.top = `${r.top + window.scrollY}px`;
  g.style.left = `${(rtl ? main.right + 6 : main.left - g.offsetWidth - 6) + window.scrollX}px`;
}
function startDrag(ev) {
  const b = blockOf(S.sel?.b);
  if (!b) return;
  ev.preventDefault();
  overlay.grip.setPointerCapture(ev.pointerId);
  host.style.pointerEvents = 'none'; // the floating tools must not hide the drop target from elementFromPoint
  let target = null;
  const move = (e) => {
    // Auto-scroll near the edges so a block can travel past the visible part of the page.
    const barH = host.shadowRoot.querySelector('.bar')?.offsetHeight || 0;
    if (e.clientY > innerHeight - 48) window.scrollBy(0, 36);
    else if (e.clientY < barH + 48) window.scrollBy(0, -36);
    overlay.grip.style.pointerEvents = 'none';
    // The grip sits in the margin: probe the page column at the pointer's height.
    const mr = mainOf(S.ed).getBoundingClientRect();
    const x = (mr.left + mr.right) / 2;
    const el = document.elementFromPoint(x, e.clientY)?.closest?.('main.bw-doc [data-b]');
    overlay.grip.style.pointerEvents = '';
    if (!el || el.closest('main.bw-doc').dataset.locale !== S.ed) { overlay.drop.hidden = true; target = null; return; }
    const tb = blockOf(el.dataset.b);
    if (!tb) return;
    const all = [...mainOf(S.ed).querySelectorAll(`[data-b="${CSS.escape(el.dataset.b)}"]`)];
    const top = Math.min(...all.map((x) => x.getBoundingClientRect().top));
    const bottom = Math.max(...all.map((x) => x.getBoundingClientRect().bottom));
    const after = e.clientY > (top + bottom) / 2;
    target = { arr: tb.arr, at: tb.i + (after ? 1 : 0) };
    const m = mainOf(S.ed).getBoundingClientRect();
    Object.assign(overlay.drop.style, { top: `${(after ? bottom : top) + window.scrollY}px`, left: `${m.left + window.scrollX}px`, width: `${m.width}px` });
    overlay.drop.hidden = false;
  };
  const up = () => {
    host.style.pointerEvents = '';
    overlay.grip.removeEventListener('pointermove', move);
    overlay.grip.removeEventListener('pointerup', up);
    overlay.drop.hidden = true;
    if (!target) return;
    let at = target.at;
    if (target.arr === b.arr) {
      if (at === b.i || at === b.i + 1) return;
      if (at > b.i) at -= 1;
    }
    commit([{ op: 'move', from: b.ptr, path: `${target.arr}/${at}` }], { mirror: true });
    S.sel.b = `${target.arr}/${at}`;
    paintSel();
  };
  overlay.grip.addEventListener('pointermove', move);
  overlay.grip.addEventListener('pointerup', up);
}

/* ── find & replace ────────────────────────────────────────────────────── */
let findAt = -1;
function findHits(q) {
  return textLeaves(cur().doc).filter((x) => findFolded(x.value, q).length);
}
function findNext(q) {
  const hits = findHits(q);
  if (!hits.length) return 0;
  findAt = (findAt + 1) % hits.length;
  const el = mainOf(S.ed)?.querySelector(`[data-p="${CSS.escape(hits[findAt].path)}"]`);
  document.querySelectorAll('.bw-hit').forEach((x) => x.classList.remove('bw-hit'));
  if (el) { el.classList.add('bw-hit'); el.scrollIntoView({ block: 'center', behavior: reduced() ? 'auto' : 'smooth' }); }
  return hits.length;
}
function replaceAll(q, r) {
  const ops = [];
  for (const x of textLeaves(cur().doc)) {
    const res = replaceFolded(x.value, q, r);
    if (res.count) ops.push({ op: 'setText', path: x.path, value: res.text, old: x.value });
  }
  if (ops.length) {
    commit(ops);
    if (hasOther()) ops.forEach((o) => cur(other()).stale.add(o.path));
  }
  return ops.length;
}
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ── validation ────────────────────────────────────────────────────────── */
function validate() {
  const out = [];
  const d = cur().doc;
  d.chapters.forEach((ch, i) => {
    if (ch.number !== String(i + 1)) out.push(['warn', t('vNumbering', { x: `${ch.number} ${ch.title}` })]);
    ch.sections.forEach((s, j) => {
      const empty = !s.blocks.length || s.blocks.every((b) => (b.kind === 'prose' && b.paragraphs.every((p) => !String(p).trim())) || (b.kind === 'table' && !b.rows.length));
      if (empty) out.push(['err', t('vEmptySection', { x: `${s.number} ${s.title}` })]);
      if (ch.sections.length > 1 && s.number !== `${ch.number}.${j + 1}`) out.push(['warn', t('vNumbering', { x: `${s.number} ${s.title}` })]);
    });
  });
  if (hasOther()) {
    const a = shape(cur('ar').doc);
    const b = shape(cur('en').doc);
    const n = Math.max(a.length, b.length);
    for (let i = 0; i < n; i += 1) if (a[i] !== b[i]) out.push(['err', t('vPair', { x: `${i + 1}` })]);
    const st = cur().stale.size;
    if (st) out.push(['warn', t('vStale', { n: st })]);
  }
  const main = mainOf(S.ed);
  main?.querySelectorAll('table').forEach((tb) => {
    if (tb.scrollWidth > tb.parentElement.clientWidth + 2) out.push(['warn', t('vOverflow', { x: tb.querySelector('th,td')?.textContent?.slice(0, 30) || '' })]);
  });
  const fth = designTheme(S.theme, d).fonts;
  for (const f of new Set([fth.text, fth.display])) {
    const src = FONTS.sourceOf(f);
    if (src === 'project' && !document.fonts.check(`16px '${f}'`)) out.push(['err', t('vFont', { x: f })]);
    else if (src === 'local') out.push(['info', t('font.vMachine', { x: f })]);
  }
  for (const k of emptyLabels(labelsOf())) out.push(['err', t('vLabel', { x: k })]);
  const rej = sanitizeCss(d.design?.css).rejected;
  if (rej.length) out.push(['warn', t('vCss', { x: rej.join(' · ') })]);
  // logos are placed freely (overlays) or sit in the design pack's slots: count both, flag only when there are none
  const placed = (d.overlays || []).filter((o) => o.kind === 'logo').length;
  const slotted = ['start', 'center', 'end', 'header'].filter((k) => S.theme.logos?.[k]).length;
  if (placed + slotted) out.push(['ok', t('vLogosPlaced', { n: placed + slotted })]);
  else out.push(['info', t('vLogos', { n: 4 })]);
  return out;
}

/* ── UI (Shadow DOM): a floating island, a selection bar, a command palette ──
 * Design read: an authoring tool for bilingual requirement documents; the
 * island carries the SRS navy and gold so the tool and the document read as one.
 * Motion answers actions (press, open, confirm, count); calm mode and
 * prefers-reduced-motion turn it all to instant cross-fades. */
const host = document.createElement('div');
host.id = 'bw-ui-host';
document.body.prepend(host);
const root = host.attachShadow({ mode: 'open' });
const IC = DATA.icons || {};
const ic = (k) => IC[k] || '';
const RMQ = matchMedia('(prefers-reduced-motion: reduce)');
S.calm = ls.get('bw:calm') === '1';
S.focus = false;
S.snap = ls.get('bw:snap') !== '0';
S.view = false;
const isCalm = () => S.calm || RMQ.matches;
const setRootFlags = () => {
  const d = document.documentElement.dataset;
  d.bwCalm = S.calm ? '1' : '0';
  d.bwFocus = S.focus ? '1' : '0';
  d.bwDark = S.dark ? '1' : '0';
};

/** Every action, in one registry: the island, the selection bar and the palette read from it. */
const CMDS = [
  ['save', 'file', 'Ctrl+S'], ['saveHtml', 'file'], ['import', 'file'], ['exportEdits', 'file'], ['exportAll', 'file'],
  ['image', 'insert'], ['logo', 'insert'], ['addDiagram', 'insert'], ['addPara', 'insert'],
  ['undo', 'edit', 'Ctrl+Z'], ['redo', 'edit', 'Ctrl+Y'], ['find', 'edit', 'Ctrl+F'],
  ['newdoc', 'document'], ['process', 'document'], ['outline', 'document'], ['pages', 'document'], ['check', 'document'], ['history', 'document'], ['renumber', 'document'], ['webhooks', 'document'],
  ['theme', 'design'], ['styleThis', 'design'], ['hideBlock', 'design'],
  ['side', 'view'], ['both', 'view'], ['uiLang', 'view'], ['dir', 'view'], ['dark', 'view'], ['calm', 'view'], ['focus', 'view', 'F'], ['spell', 'view'], ['snap', 'view'], ['zoomOut', 'view'], ['zoomReset', 'view'], ['zoomIn', 'view'], ['zoomFit', 'view'], ['view.continuous', 'view'], ['view.single', 'view'], ['view.spread', 'view'],
  ['print', 'export', 'Ctrl+P'], ['exportPdf', 'export'], ...pcExportIds().map((id) => [id, 'export']),
  ['duplicate', 'text', 'Ctrl+D'], ['delete', 'text', 'Del'], ['moveUp', 'text', 'Alt+↑'], ['moveDown', 'text', 'Alt+↓'], ['comment', 'text'], ['breakBefore', 'text'], ['keepNext', 'text'],
  ['rowAdd', 'table'], ['rowDel', 'table'], ['colAdd', 'table'], ['colDel', 'table'],
  ['dgStaff', 'diagram'], ['dgApplicant', 'diagram'], ['dgStart', 'diagram'], ['dgPayment', 'diagram'], ['dgRework', 'diagram'], ['dgSystem', 'diagram'], ['dgDecision', 'diagram'], ['dgOk', 'diagram'], ['dgStop', 'diagram'],
  ['dgNote', 'diagram'], ['dgGroup', 'diagram'], ['dgText', 'diagram'], ['dgAuto', 'diagram'], ['dgReset', 'diagram'], ['dgFlow', 'diagram'], ['dgLegend', 'diagram'], ['dgMermaidIn', 'diagram'], ['dgMermaidOut', 'diagram'],
  ['dgLabel', 'shape'], ['dgSub', 'shape'], ['dgConnect', 'shape'], ['dgDup', 'shape'], ['dgDel', 'shape', 'Del'], ['dgFront', 'shape'], ['dgBack', 'shape'],
  ['dgAlignL', 'arrange'], ['dgAlignC', 'arrange'], ['dgAlignR', 'arrange'], ['dgAlignT', 'arrange'], ['dgAlignM', 'arrange'], ['dgAlignB', 'arrange'], ['dgDistH', 'arrange'], ['dgDistV', 'arrange'], ['dgWrap', 'arrange'],
  ['dgEdgeLabel', 'arrow'], ['dgBendAdd', 'arrow'], ['dgBendDel', 'arrow'], ['dgRouteAuto', 'arrow'], ['dgReverse', 'arrow'], ['dgFrom', 'arrow'], ['dgTo', 'arrow'],
  ['dgZoomIn', 'diagram', 'Ctrl+wheel'], ['dgZoomOut', 'diagram'], ['dgZoomFit', 'diagram'], ['dgZoom100', 'diagram'],
].map(([id, group, key]) => ({ id, group, key }));

/** A labelled toolbar section: icon + short title, then its tools (the same categories as the palette). */
function sec(cat, tools) {
  const name = t('sec' + cat[0].toUpperCase() + cat.slice(1));
  // the first tool always shows; the rest sit inline while the bar has room and fold into this section's «More» when it has not
  const rest = tools.slice(1);
  const tail = rest.length ? `<div class="more tail"><button type="button" class="b" data-a="more" aria-expanded="false" aria-haspopup="true" title="${esc(t('more'))}: ${esc(name)}" aria-label="${esc(t('more'))}: ${esc(name)}"><span class="i">${ic('more')}</span></button><div class="menu fm" role="group" aria-label="${esc(name)}">${rest.join('')}</div></div>` : '';
  return `<div class="sec" data-cat="${cat}" role="group" aria-label="${esc(name)}"><span class="sc" aria-hidden="true"><span class="i">${ic('sec' + cat[0].toUpperCase() + cat.slice(1))}</span><span class="st" data-alt="${esc(tAlt('sec' + cat[0].toUpperCase() + cat.slice(1)))}">${esc(name)}</span></span><div class="sb">${tools[0] || ''}${tail}</div></div>`;
}
/** A registry command as a toolbar tool: its label, its tooltip (with the shortcut), the shortcut shown in menus. */
const TIPS = { image: 'imageTip', logo: 'logoTip', exportPdf: 'exportPdfTip' };
function tool(c) {
  return btn(c.id, { cls: c.id === 'save' ? 'primary' : '', tip: TIPS[c.id] ? t(TIPS[c.id]) : c.key ? `${t(c.id)} (${c.key})` : '' });
}
function btn(id, { label = t(id), tip = '', pressed, cls = '', extra = '' } = {}) {
  const key = CMDS.find((c) => c.id === id)?.key;
  return `<button type="button" class="b ${cls}" data-a="${id}"${key ? ` data-key="${esc(key)}"` : ''} title="${esc(tip || label)}"${pressed !== undefined ? ` aria-pressed="${pressed}"` : ''}${extra}><span class="i">${ic(id)}</span><span class="w"${label === t(id) ? ` data-alt="${esc(tAlt(id))}"` : ''}>${esc(label)}</span></button>`;
}
const dirOf = (l) => (l === 'ar' ? 'rtl' : 'ltr');
const langWord = (l) => (l === 'ar' ? 'ع' : 'E');
const uiDir = () => S.dir || dirOf(S.ui);
const LAYOUT_DIR = 'rtl'; // the default (Arabic) layout: toolbar, panels, page and watermark never move (0.10.0)

function buildUi() {
  const svcOpts = DATA.services.map((s) => `<option value="${esc(s.id)}" ${s.id === S.svc ? 'selected' : ''}>${esc(s.editions[S.ed]?.name || s.editions.ar?.name || s.id)}</option>`).join('');
  const eds = Object.keys(M[S.svc]);
  const theme = S.dark ? 'dark' : 'light';
  setRootFlags();
  root.innerHTML = `<style>${DATA.uiCss}</style>
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
    ${['file', 'insert', 'edit', 'document', 'design'].map((cat) => sec(cat, CMDS.filter((c) => c.group === cat).map(tool))).join('')}
    ${sec('export', [pcExportMenu(), tool(CMDS.find((c) => c.id === 'print')), tool(CMDS.find((c) => c.id === 'exportPdf'))])}
    <span class="spacer"></span>
    <div class="status" role="status" aria-live="polite">
      <span class="count" aria-label="${esc(t('changes', { n: liveOps(cur()).length }))}"><span class="n">${liveOps(cur()).length}</span><span class="w" data-alt="${esc(tAlt('changesWord'))}">${esc(t('changesWord'))}</span></span>
      <span class="sel vh">${esc(selDesc())}</span><span class="flash vh"></span>
    </div>
    <div class="sec" data-cat="view" role="group" aria-label="${esc(t('secView'))}"><span class="sc" aria-hidden="true"><span class="i">${ic('secView')}</span><span class="st">${esc(t('secView'))}</span></span><div class="sb">
    <div class="seg ui" role="group" data-x="dir" aria-label="${esc(t('direction'))}"><i class="thumb" aria-hidden="true"></i><span class="cap" aria-hidden="true"><span class="i">${ic('dir')}</span><span class="cw" data-alt="${esc(tAlt('direction'))}">${esc(t('direction'))}</span></span>
      ${['rtl', 'ltr'].map((d) => `<button type="button" data-a="dir" data-d="${d}" aria-pressed="${uiDir() === d}" aria-label="${esc(t(d))}: ${esc(t(d === 'rtl' ? 'ux.dirRtl' : 'ux.dirLtr'))}" title="${esc(t(d === 'rtl' ? 'ux.dirRtl' : 'ux.dirLtr'))}"><span class="sw">${esc(t(d))}</span></button>`).join('')}
    </div>
    ${btn('view', { extra: ` aria-expanded="${S.view}" aria-controls="viewpop"` })}
    </div></div>
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
  const shell = root.querySelector('.shell');
  if (!buildUi.done) { buildUi.done = true; setTimeout(() => document.documentElement.classList.add('bw-ready'), 900); }
  shell.addEventListener('click', onBar);
  root.querySelector('[data-a="svc"]').addEventListener('change', (e) => { S.svc = e.target.value; if (!M[S.svc][S.ed]) S.ed = Object.keys(M[S.svc])[0]; S.sel = null; buildUi(); render(false); });
  root.querySelector('.scrim').addEventListener('click', (e) => { if (e.target.classList.contains('scrim')) closePalette(); });
  wirePalette();
  fitBar();
  measureBar();
  if (S.drawer) openDrawer(S.drawer);
  placeCtx();
  viewPopAfterBuild(); // views.js: the View menu in the top layer
  uxAfterBuild(); // shell-ux.js: the selection section survives a rebuild, segment thumbs, explainers
}
// The page never jumps under the reader: the reserved band only grows (wrap, font load), resets only for focus mode.
let barH = 0;
function measureBar() {
  const bar = root.querySelector('.island');
  if (S.focus || !bar) { barH = 0; document.documentElement.style.setProperty('--bw-bar-h', '12px'); return; }
  const h = Math.round(bar.offsetTop + bar.offsetHeight + 12); // layout box: never the entry animation's mid-flight transform
  if (h > barH) { barH = h; document.documentElement.style.setProperty('--bw-bar-h', `${h}px`); }
}
/** The bar never scrolls sideways when it can fold: first each section's extra tools go into its «More»,
 *  then (still too wide) the words of the selection's tools; section titles always stay. */
function fitBar() {
  const bar = root.querySelector('.island');
  if (!bar) return;
  bar.classList.remove('sq0', 'sq1', 'sq2', 'sq3', 'sq4');
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
  for (const step of ['sq2', 'sq3', 'sq4']) { if (!over()) break; bar.classList.add(step); }
  restore();
}
window.addEventListener('resize', () => fitBar());
let lastCount = -1;
function refreshUi() {
  const c = root.querySelector('.count');
  if (!c) return;
  const n = liveOps(cur()).length;
  if (n !== lastCount) {
    const el = c.querySelector('.n');
    el.textContent = String(n);
    c.setAttribute('aria-label', t('changes', { n }));
    if (lastCount >= 0 && !isCalm()) { el.classList.remove('tick'); void el.offsetWidth; el.classList.add('tick'); }
    lastCount = n;
  }
  root.querySelector('.sel').textContent = selDesc();
  const b = blockOf(S.sel?.b);
  const tb = !!tableCtx();
  const dis = { undo: !cur().ops.length, redo: !cur().redo.length };
  root.querySelectorAll('.island button[data-a]').forEach((x) => { if (x.dataset.a in dis) x.disabled = dis[x.dataset.a]; });
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
  if (ov) return { cat: ov.kind === 'logo' ? 'logo' : 'image', label: t(ov.kind === 'logo' ? 'selLogo' : 'selImage'), groups: [['replace', 'caption', ...(ov.kind === 'logo' ? ['every'] : []), 'ovDelete']] };
  const dg = dgContext();
  if (dg) return dg;
  if (!b) return null;
  const blk = get(cur().doc, b.ptr);
  if (tb) return { cat: 'table', label: t('selTable'), groups: [['rowAdd', 'rowDel', 'colAdd', 'colDel', 'rowUp', 'rowDown'], ['duplicate', 'delete', 'moveUp', 'moveDown'], ['comment', 'styleThis', 'hideBlock', 'breakBefore', 'keepNext']] };
  return { cat: 'text', label: t('selText', { x: kindName(blk?.kind || 'text') }), groups: [['duplicate', 'delete', 'moveUp', 'moveDown', 'addPara'], ['comment', 'styleThis', 'hideBlock', 'breakBefore', 'keepNext']] };
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
    ctx.innerHTML = `<span class="sc"><span class="i" aria-hidden="true">${ic('secSel')}</span><span class="st" data-alt="${esc(altLabel)}">${esc(m.label)}</span></span><div class="sb">${first.map((id) => ctxTool(id, ov)).join('')}${kept ? `<span class="keep-tools" role="group" aria-label="${esc(t('zoom'))}">${kept}</span>` : ''}${more.length ? `<div class="more"><button type="button" class="b" data-a="more" aria-expanded="false" aria-haspopup="true" title="${esc(t('more'))}"><span class="i">${ic('more')}</span><span class="w">${esc(t('more'))}</span></button><div class="menu" role="group" aria-label="${esc(t('more'))}" hidden>${more.map((id) => ctxTool(id, ov)).join('')}</div></div>` : ''}</div>`;
    if (!isCalm()) { ctx.classList.remove('swap'); void ctx.offsetWidth; ctx.classList.add('swap'); }
  }
  ctx.hidden = false;
}
function placeCtx() { /* docked in the toolbar since 0.9.0: nothing to position */ }
let ctxRaf = 0;
window.addEventListener('scroll', () => { if (!ctxRaf) ctxRaf = requestAnimationFrame(() => { ctxRaf = 0; placeCtx(); }); }, { passive: true });

/* toasts, banner, progress */
function toast(msg, kind = 'info', { actions = [], persist = false, cls = '' } = {}) {
  const box = root.querySelector('.toasts');
  if (!box) return null;
  const el = document.createElement('div');
  el.className = `toast ${kind} ${cls}`;
  el.setAttribute('role', kind === 'err' ? 'alert' : 'status');
  el.innerHTML = `<span class="i">${ic(kind === 'err' ? 'err' : kind === 'ok' ? 'ok' : kind === 'warn' ? 'warn' : 'info')}</span><span class="m">${esc(msg)}</span>${actions.map(([l], i) => `<button type="button" data-k="${i}">${esc(l)}</button>`).join('')}`;
  el.onclick = (e) => {
    const k = e.target.closest('button')?.dataset.k;
    if (k === undefined) return;
    dismiss(el);
    actions[k][1]();
  };
  box.appendChild(el);
  while (box.children.length > 4) box.firstElementChild.remove();
  if (!persist) setTimeout(() => dismiss(el), 4600);
  return el;
}
function dismiss(el) {
  if (!el.isConnected) return;
  if (isCalm()) { el.remove(); return; }
  el.classList.add('out');
  setTimeout(() => el.remove(), 260);
}
function flash(msg, bad = false) {
  const f = root.querySelector('.flash');
  if (f) f.textContent = msg;
  toast(msg, bad ? 'err' : 'ok');
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

function ask(label, value = '') {
  const d = root.querySelector('.dialog');
  d.hidden = false;
  d.setAttribute('aria-label', label);
  d.innerHTML = `<label>${esc(label)}<textarea rows="3">${esc(value)}</textarea></label><div class="btns"><button type="button" class="b primary" data-k="ok"><span class="w">${esc(t('save'))}</span></button><button type="button" class="b" data-k="no"><span class="w">${esc(t('close'))}</span></button></div>`;
  const ta = d.querySelector('textarea');
  ta.focus();
  return new Promise((res) => {
    d.onclick = (e) => {
      const k = e.target.closest('button')?.dataset.k;
      if (!k) return;
      d.hidden = true;
      res(k === 'ok' ? ta.value.trim() : '');
    };
    d.onkeydown = (e) => { if (e.key === 'Escape') { d.hidden = true; res(''); } };
  });
}

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
  return CMDS.filter((c) => GENERAL_GROUPS.includes(c.group) || here.has(c.id));
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
  s.hidden = false;
  palIdx = 0;
  const input = root.querySelector('.palette input');
  input.value = '';
  fillPalette();
  input.focus();
}
function closePalette() {
  const s = root.querySelector('.scrim');
  if (s) s.hidden = true;
}

async function onBar(e) {
  if (uxSegClick(e)) return; // shell-ux.js: a click anywhere on a segmented field toggles it
  const b = e.target.closest('button[data-a]');
  if (!b || b.closest('.palette')) return;
  const a = b.dataset.a;
  if (a === 'more') { uxMenuToggle(b); return; } // shell-ux.js: the menu opens in the top layer, anchored to its button
  if (b.closest('.menu')) uxMenuClose(b.closest('.menu'));
  if (a === 'ed') { setLang(b.dataset.ed); return; }
  if (a === 'dir') { setDir(b.dataset.d); return; }
  await runAction(a);
}
// Language «ع» / «E»: the interface language and the document edition together.
function setLang(l) {
  const edChange = !!M[S.svc][l] && l !== S.ed;
  if (l === S.ui && !edChange) return;
  S.ui = l;
  ls.set('bw:ui', S.ui);
  if (edChange) { S.ed = l; S.sel = null; S.selOv = null; }
  buildUi();
  render(!edChange);
  window.BW_WM?.relabel();
}
// Layout direction RTL / LTR: independent of the language; once chosen it is remembered.
function setDir(d) {
  S.dir = d;
  ls.set('bw:dir', d);
  buildUi();
  render();
}
async function runAction(a) {
  switch (a) {
    case 'side': S.side = !S.side; buildUi(); render(false); break;
    case 'uiLang': setLang(S.ui === 'ar' ? 'en' : 'ar'); break;
    case 'dir': setDir(uiDir() === 'rtl' ? 'ltr' : 'rtl'); break;
    case 'dark': S.dark = !S.dark; ls.set('bw:dark', S.dark ? '1' : '0'); buildUi(); break;
    case 'calm': S.calm = !S.calm; ls.set('bw:calm', S.calm ? '1' : '0'); buildUi(); toast(t(S.calm ? 'calmOn' : 'calmOff'), 'info'); break;
    case 'focus': S.focus = !S.focus; S.view = false; buildUi(); toast(t(S.focus ? 'focusOn' : 'focusOff'), 'info'); break;
    case 'view': S.view = !S.view; buildUi(); break;
    case 'snap': S.snap = !S.snap; ls.set('bw:snap', S.snap ? '1' : '0'); buildUi(); break;
    case 'palette': openPalette(); break;
    case 'undo': undo(); break;
    case 'redo': redo(); break;
    case 'duplicate': A.duplicate(); pop('duplicate'); break;
    case 'delete': A.delete(); break;
    case 'moveUp': A.move(-1); break;
    case 'moveDown': A.move(1); break;
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
    case 'find': case 'outline': case 'check': case 'history': case 'theme': case 'pages': case 'webhooks': case 'newdoc': case 'process':
      S.drawer === a ? closeDrawer() : openDrawer(a); break;
    case 'save': saveAll(); pop('save'); break;
    case 'saveHtml': await saveHtml(!!S.embedFonts); break;
    case 'import': { const f = await pickFile('.json,.html,application/json,text/html'); if (f) await importFile(f); break; }
    case 'exportEdits': download(`${S.svc}.edits-bundle.json`, JSON.stringify(bundle([S.svc]), null, 1)); emitHook('edits.exported', { scope: 'service' }); break;
    case 'exportAll': download(`all-services.edits-bundle.json`, JSON.stringify(bundle(Object.keys(M)), null, 1)); emitHook('edits.exported', { scope: 'all' }); break;
    case 'exportPdf': busy(true); try { await exportPdfDocx(); } finally { busy(false); } break;
    case 'print': pcOpenPrint(); break;
    case 'both': S.both = !S.both; buildUi(); break;
    case 'zoomReset': S.zoom = 1; render(); viewPct(); break;
    case 'zoomFit': S.zoom = Math.max(0.4, Math.min(2, +((document.documentElement.clientWidth - 96) / (210 * 96 / 25.4)).toFixed(2))); render(); viewPct(); break;
    case 'zoomIn': S.zoom = Math.min(2, +(S.zoom + 0.1).toFixed(2)); render(); viewPct(); break;
    case 'zoomOut': S.zoom = Math.max(0.4, +(S.zoom - 0.1).toFixed(2)); render(); viewPct(); break;
    case 'spell': S.spell[S.ed] = !S.spell[S.ed]; buildUi(); render(); break;
    case 'view.continuous': viewsSet('continuous'); break;
    case 'view.single': viewsSet('single'); break;
    case 'view.spread': viewsSet('spread'); break;
    case 'view.prev': viewsGo(-1); break;
    case 'view.next': viewsGo(1); break;
    default: if (/^export\./.test(a)) await pcAction(a); else await dgAction(a); break;
  }
}

/* ── drawers (slide-over panels) ───────────────────────────────────────── */
function closeDrawer() {
  S.drawer = null;
  const d = root.querySelector('.drawer');
  if (!d || d.hidden) return;
  if (isCalm()) { d.hidden = true; return; }
  d.classList.add('closing');
  setTimeout(() => { d.hidden = true; d.classList.remove('closing'); }, 220);
}
function openDrawer(kind, soft = false) {
  const d = root.querySelector('.drawer');
  if (soft && d.contains(root.activeElement)) return;
  S.drawer = kind;
  d.hidden = false;
  d.classList.remove('closing');
  const head = (title) => `<header><h2>${esc(title)}</h2><button type="button" class="b" data-k="close" aria-label="${esc(t('close'))}"><span class="i">${ic('close')}</span><span class="w">${esc(t('close'))}</span></button></header>`;
  const icon = { err: ic('err'), warn: ic('warn'), info: ic('info'), ok: ic('ok') };
  const word = { err: t('err'), warn: t('warn'), info: t('info'), ok: t('ok') };
  let html = '';
  if (kind === 'check') {
    const v = validate();
    d.setAttribute('aria-label', t('checkTitle'));
    html = head(t('checkTitle')) + (v.length ? `<ul class="list">${v.map(([lv, msg]) => `<li class="${lv}"><span class="i">${icon[lv]}</span> <b>${esc(word[lv])}</b> ${esc(msg)}</li>`).join('')}</ul>` : `<p class="ok"><span class="i">${icon.ok}</span> ${esc(t('vAllGood'))}</p>`);
  } else if (kind === 'pages') {
    d.setAttribute('aria-label', t('pagesTitle'));
    html = head(t('pagesTitle')) + `<p class="hint out" role="status"></p><ol class="thumbs">${Array.from({ length: 6 }, () => '<li class="skel" aria-hidden="true"><i></i></li>').join('')}</ol>`;
    setTimeout(() => loadThumbs(d), 0);
  } else if (kind === 'outline') {
    d.setAttribute('aria-label', t('outline'));
    html = head(t('outline')) + `<ol class="list nav">${cur().doc.chapters.map((ch, i) => `<li><button type="button" data-go="/chapters/${i}/title">${esc(ch.number)} ${esc(ch.title)}</button><ol>${ch.sections.map((s, j) => `<li><button type="button" data-go="/chapters/${i}/sections/${j}/title">${esc(s.number)} ${esc(s.title)}</button></li>`).join('')}</ol></li>`).join('')}</ol>`;
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
  d.onclick = onDrawer;
  d.oninput = (e) => {
    if (DP.input(e)) return;
    DESIGN.input(e.target);
  };
  d.onkeydown = (e) => { DP.keydown(e); };
  d.onbeforeinput = (e) => { DP.beforeinput(e); };
  d.onpaste = (e) => { DP.paste(e); };
  d.onchange = (e) => {
    if (DP.change(e)) return;
    if (e.target.dataset.k === 'embed') S.embedFonts = e.target.checked;
    if (e.target.dataset.k === 'docxFonts') { S.docxFonts = e.target.checked; ls.set('bw:docx-fonts', S.docxFonts ? '1' : '0'); }
    if (e.target.dataset.hook) hooksChange(e.target);
    if (e.target.dataset.pr) processChange(e.target);
    DESIGN.change(e.target);
  };
  if (!soft) d.querySelector('input,button:not([data-k="close"])')?.focus();
}

async function onDrawer(e) {
  if (FONTS.click(e)) return;
  const x = e.target.closest('button');
  if (!x) return;
  const d = root.querySelector('.drawer');
  const k = x.dataset.k;
  if (k === 'close') { closeDrawer(); return; }
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
  if (x.dataset.go) {
    const el = mainOf(S.ed)?.querySelector(`[data-p="${CSS.escape(x.dataset.go)}"],[data-b="${CSS.escape(x.dataset.go)}"]`);
    if (el) { el.scrollIntoView({ block: 'center', behavior: reduced() ? 'auto' : 'smooth' }); el.focus?.(); selectEl(el); }
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
    } catch { flash(t('badFile'), true); }
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

/* ── overlays: logos and images placed freely; positions in mm, saved in the document ── */
const MM = 96 / 25.4;
const mmScale = () => { const m = mainOf(S.ed); return m ? m.getBoundingClientRect().width / 210 : MM; };
const ovList = () => cur().doc.overlays || [];
const ovPtr = (i) => `/overlays/${i}`;
function ovOps(next, old) {
  // the document may not have the array yet: the first overlay creates it
  return cur().doc.overlays ? next : [{ op: 'replace', path: '/overlays', value: [], old: undefined }, ...next];
}
const OVL = {
  async add(kind, img, at) {
    img = img || await pickImage();
    if (!img) return;
    const w = kind === 'logo' ? 36 : 70;
    const o = { id: `ov${Date.now().toString(36)}`, kind, src: img.src, mode: 'cover', x: kind === 'logo' ? 140 : 40, y: kind === 'logo' ? 16 : 120, w };
    if (at) Object.assign(o, at);
    else if (kind !== 'logo' && S.sel?.b) {
      const b = blockOf(S.sel.b);
      if (b) Object.assign(o, { mode: 'anchor', anchor: b.ptr, x: 30, y: 0 });
    }
    commit(ovOps([{ op: 'insert', path: '/overlays/-', value: o }]), { mirror: true });
    S.selOv = ovList().length - 1;
    S.sel = null;
    paintSel();
    refreshUi();
    toast(t(kind === 'logo' ? 'logoAdded' : 'imageAdded'), 'ok');
  },
  async replace() {
    const i = S.selOv;
    if (i == null) return;
    const img = await pickImage();
    if (!img) return;
    commit([{ op: 'replace', path: `${ovPtr(i)}/src`, value: img.src, old: ovList()[i].src }]);
  },
  async caption() {
    const i = S.selOv;
    if (i == null) return;
    const text = await ask(t('captionPrompt'), ovList()[i].caption || '');
    commit([{ op: 'replace', path: `${ovPtr(i)}/caption`, value: text, old: ovList()[i].caption }]);
  },
  every() {
    const i = S.selOv;
    if (i == null) return;
    const o = ovList()[i];
    const mode = o.mode === 'every' ? 'cover' : 'every';
    commit([{ op: 'replace', path: ovPtr(i), value: { ...o, mode, anchor: undefined, y: mode === 'every' ? 2 : o.y }, old: o }], { mirror: true });
  },
  remove() {
    const i = S.selOv;
    if (i == null) return;
    commit([{ op: 'delete', path: ovPtr(i), old: ovList()[i] }], { mirror: true });
    S.selOv = null;
    refreshUi();
  },
};

/** Where a point lands: the cover, the every-page layer, or a block it anchors to (mm coordinates). */
function placeAt(clientX, clientY, kind, wMm) {
  const main = mainOf(S.ed);
  const k = mmScale();
  const mr = main.getBoundingClientRect();
  const cover = main.querySelector('.cover');
  const cr = cover.getBoundingClientRect();
  if (kind !== 'every' && clientY >= cr.top && clientY <= cr.bottom) {
    return { mode: 'cover', x: (clientX - cr.left) / k, y: (clientY - cr.top) / k };
  }
  if (kind === 'every') {
    const ev = main.querySelector('.bw-every') || cover;
    const er = ev === cover ? { left: mr.left, top: cr.bottom } : ev.getBoundingClientRect();
    return { mode: 'every', x: (clientX - er.left) / k, y: Math.max(0, (clientY - er.top) / k) };
  }
  // anchor: the block under the point (probed in the page column), else the nearest one above
  const blocks = [...main.querySelectorAll('.wrap [data-b]')];
  let best = null;
  for (const el of blocks) {
    const r = el.getBoundingClientRect();
    if (r.top <= clientY + 1) best = el; else break;
  }
  best = best || blocks[0];
  const ptr = blockOf(best.dataset.b)?.ptr || best.dataset.b;
  const anchorEl = main.querySelector(`.bw-anchor[data-anchor="${CSS.escape(ptr)}"]`) || best;
  const ar = anchorEl.getBoundingClientRect();
  const wrap = main.querySelector('.wrap').getBoundingClientRect();
  const padL = parseFloat(getComputedStyle(main.querySelector('.wrap')).paddingLeft) || 16 * k;
  const colLeft = viewsActive() ? best.getBoundingClientRect().left : wrap.left + padL;
  return { mode: 'anchor', anchor: ptr, x: (clientX - colLeft) / k, y: (clientY - ar.top) / k, _anchorEl: !!main.querySelector(`.bw-anchor[data-anchor="${CSS.escape(ptr)}"]`) };
}
function snapMm(p, wMm) {
  if (!S.snap) return { p, guides: [] };
  const guides = [];
  const xs = p.mode === 'anchor' ? [0, 89 - wMm / 2, 178 - wMm] : [16, 105 - wMm / 2, 194 - wMm];
  for (const gx of xs) if (Math.abs(p.x - gx) < 3) { p.x = gx; guides.push(['x', gx]); break; }
  p.y = Math.round(p.y / 2.5) * 2.5;
  return { p, guides };
}
function showGuides(main, guides, base) {
  main.querySelectorAll('.bw-guide').forEach((g) => g.remove());
  for (const [axis, v] of guides) {
    const g = document.createElement('div');
    g.className = `bw-guide ${axis}`;
    g.style.setProperty('--at', `${(base + v) * mmScale()}px`);
    main.appendChild(g);
  }
}

/** Move (body) and resize (corner handle) on pointer events; one commit on release, corrected to the drop point. */
function startOvDrag(e, el, resize) {
  const i = +el.dataset.i;
  const o = ovList()[i];
  if (!o) return;
  e.preventDefault();
  try { el.setPointerCapture(e.pointerId); } catch { /* a synthetic pointer: the window listeners below still track it */ }
  el.focus({ preventScroll: true }); // pressing a logo focuses it, so the arrow keys nudge it at once
  if (S.dg) { dgClear(); dgPaint(); } // a logo picked: the arrow keys and tools are the logo's, not a diagram's
  S.selOv = i; S.sel = null; paintSel(); refreshUi();
  const k = mmScale();
  // the page may be zoomed (Zoom, a paged view): a translate inside it is scaled too, so move by screen px / zoom
  const z = k / MM || 1;
  const r0 = el.getBoundingClientRect();
  const sx = e.clientX, sy = e.clientY;
  const main = mainOf(S.ed);
  let last = null;
  el.classList.add('bw-dragging');
  const move = (ev) => {
    const dx = ev.clientX - sx, dy = ev.clientY - sy;
    if (resize) {
      const w = Math.max(6, Math.min(200, o.w + (getComputedStyle(el).direction === 'rtl' && false ? -dx : dx) / k));
      el.style.width = `${w}mm`;
      last = { w };
    } else {
      el.style.transform = `translate(${dx / z}px, ${dy / z}px)`;
      const target = placeAt(r0.left + dx, r0.top + dy, o.mode === 'every' ? 'every' : o.kind, o.w);
      const { p, guides } = snapMm(target, o.w);
      showGuides(main, guides.map((g) => [g[0], g[1]]), p.mode === 'anchor' ? 16 : 0);
      last = { p, dx, dy };
    }
  };
  const up = (ev) => {
    if (ev?.pointerId != null && ev.pointerId !== e.pointerId) return;
    window.removeEventListener('pointermove', move, true);
    window.removeEventListener('pointerup', up, true);
    window.removeEventListener('pointercancel', up, true);
    el.classList.remove('bw-dragging');
    main.querySelectorAll('.bw-guide').forEach((g) => g.remove());
    if (!last) { el.style.transform = ''; return; }
    if (resize) { commit([{ op: 'replace', path: `${ovPtr(i)}/w`, value: +last.w.toFixed(1), old: o.w }]); return; }
    const p = last.p;
    const next = { ...o, mode: p.mode, x: +p.x.toFixed(1), y: +p.y.toFixed(1) };
    if (p.mode === 'anchor') next.anchor = p.anchor; else delete next.anchor;
    const group = newGroup();
    commit([{ op: 'replace', path: ovPtr(i), value: next, old: o }], { group, mirror: false });
    // the anchor box only exists once something is anchored there: measure it and land exactly on the drop point
    if (p.mode === 'anchor') {
      const box = mainOf(S.ed).querySelector(`.bw-ov[data-i="${i}"]`);
      if (box) {
        const br = box.getBoundingClientRect();
        const ddy = (r0.top + last.dy - br.top) / mmScale();
        const ddx = (r0.left + last.dx - br.left) / mmScale();
        if (Math.abs(ddy) > 0.3 || Math.abs(ddx) > 0.3) {
          const fixed = { ...next, x: +(next.x + ddx).toFixed(1), y: +(next.y + ddy).toFixed(1) };
          applyOp(cur().doc, { op: 'replace', path: ovPtr(i), value: fixed });
          cur().ops.at(-1).value = fixed;
          render();
        }
      }
    }
  };
  // window listeners: a drag survives a lost capture or the pointer leaving the logo; cancel ends it where it is
  window.addEventListener('pointermove', move, true);
  window.addEventListener('pointerup', up, true);
  window.addEventListener('pointercancel', up, true);
}
function decorateOverlays(main) {
  main.querySelectorAll('.bw-ov').forEach((el) => {
    el.tabIndex = 0;
    el.setAttribute('role', 'button');
    el.setAttribute('aria-label', t(el.dataset.kind === 'logo' ? 'logoItem' : 'imageItem'));
    if (+el.dataset.i === S.selOv) el.classList.add('bw-ov-sel');
    if (!el.querySelector('.bw-ov-handle')) {
      const h = document.createElement('span');
      h.className = 'bw-ov-handle';
      h.setAttribute('aria-hidden', 'true');
      el.appendChild(h);
    }
  });
}
document.addEventListener('pointerdown', (e) => {
  const el = e.target.closest?.('#bw-pair .bw-ov');
  if (!el || e.target.closest('[data-p]')) return;
  startOvDrag(e, el, e.target.classList.contains('bw-ov-handle'));
});
document.addEventListener('keydown', (e) => {
  const el = e.target.closest?.('#bw-pair .bw-ov');
  if (!el) return;
  const i = +el.dataset.i;
  const o = ovList()[i];
  const step = e.shiftKey ? 5 : 1;
  const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
  if (d && o) { e.preventDefault(); commit([{ op: 'replace', path: ovPtr(i), value: { ...o, x: o.x + d[0], y: o.y + d[1] }, old: o }]); mainOf(S.ed)?.querySelector(`.bw-ov[data-i="${i}"]`)?.focus(); }
  if ((e.key === 'Delete' || e.key === 'Backspace') && o) { e.preventDefault(); S.selOv = i; OVL.remove(); }
});
document.addEventListener('focusin', (e) => {
  const el = e.target.closest?.('#bw-pair .bw-ov');
  if (el) { if (S.dg) { dgClear(); dgPaint(); } S.selOv = +el.dataset.i; S.sel = null; paintSel(); refreshUi(); }
});

/* drag-drop and paste of image files: drop = free position at the point, paste = after the block */
document.addEventListener('dragover', (e) => { if ([...(e.dataTransfer?.items || [])].some((x) => x.kind === 'file')) { e.preventDefault(); document.documentElement.classList.add('bw-drop'); } });
document.addEventListener('dragleave', (e) => { if (!e.relatedTarget) document.documentElement.classList.remove('bw-drop'); });
document.addEventListener('drop', async (e) => {
  document.documentElement.classList.remove('bw-drop');
  const f = [...(e.dataTransfer?.files || [])].find((x) => /^image\//.test(x.type));
  if (!f || !e.target.closest?.('#bw-pair main.bw-doc')) return;
  e.preventDefault();
  let img;
  try { img = await reencode(f); } catch { flash(t('badFile'), true); return; }
  const p = placeAt(e.clientX, e.clientY, 'image', 70);
  delete p._anchorEl;
  await OVL.add('image', img, { ...p, w: 70 });
});
async function pasteImage(f) {
  let img;
  try { img = await reencode(f); } catch { flash(t('badFile'), true); return true; }
  const b = blockOf(S.sel?.b);
  const arr = b ? b.arr : '/chapters/0/sections/0/blocks';
  const at = b ? b.i + 1 : 0;
  commit([{ op: 'insert', path: `${arr}/${at}`, value: { kind: 'shots', caption: I18N.doc[S.ed].figure, images: [img.src], width: 80 } }]);
  toast(t('imageAdded'), 'ok');
  return true;
}

/* ── webhooks: off by default, no default URLs, sent only through the local server ── */
const HOOK_EVENTS = ['save', 'export', 'edits.exported', 'import.merged', 'validation.failed'];
const H = (() => {
  try { return JSON.parse(ls.get('bw:hooks') || 'null') || { enabled: false, full: false, urls: [], log: [] }; } catch { return { enabled: false, full: false, urls: [], log: [] }; }
})();
const saveHooks = () => ls.set('bw:hooks', JSON.stringify(H));
function hookPayload(event, extra = {}) {
  const e = cur();
  const ops = liveOps(e);
  return {
    schema: 'bw-webhook', version: 1, event,
    service: S.svc, edition: S.ed, timestamp: new Date().toISOString(),
    summary: {
      changes: ops.length,
      text: ops.filter((o) => o.op === 'setText').length,
      structural: ops.filter((o) => ['move', 'delete', 'insert', 'duplicate'].includes(o.op)).length,
      rejected: e.ops.filter((o) => e.status[o.id] === 'rejected').length,
      ...extra,
    },
    ...(H.full ? { document: e.doc } : {}),
  };
}
async function sendHook(url, payload) {
  const t0 = performance.now();
  try {
    const r = await fetch('/api/webhook', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url, payload }) });
    const j = await r.json().catch(() => ({}));
    return { ok: r.ok && j.ok, status: j.status || r.status, ms: Math.round(performance.now() - t0), error: j.error };
  } catch (err) { return { ok: false, status: 0, ms: Math.round(performance.now() - t0), error: String(err.message || err) }; }
}
async function emitHook(event, extra) {
  if (!H.enabled || !H.urls.length) return;
  if (!location.protocol.startsWith('http')) return; // file:// cannot deliver: the panel explains why
  const payload = hookPayload(event, extra);
  for (const h of H.urls.filter((x) => x.events?.includes(event))) {
    const r = await sendHook(h.url, payload);
    logHook(event, h.url, r);
  }
}
function logHook(event, url, r) {
  let host = url;
  try { host = new URL(url).host; } catch { /* keep the text */ }
  H.log.unshift({ at: new Date().toISOString(), event, host, ok: r.ok, status: r.status, ms: r.ms, error: r.error });
  H.log = H.log.slice(0, 30);
  saveHooks();
  if (S.drawer === 'webhooks') openDrawer('webhooks', true);
}
function hooksPanel() {
  const served = location.protocol.startsWith('http');
  return `<p class="hint">${esc(t(served ? 'hooksHint' : 'hooksNeedServer'))}</p>
<label class="chk"><input type="checkbox" data-hook="enabled" ${H.enabled ? 'checked' : ''} ${served ? '' : 'disabled'}> ${esc(t('hooksEnable'))}</label>
<label class="chk"><input type="checkbox" data-hook="full" ${H.full ? 'checked' : ''}> ${esc(t('hooksFull'))}</label>
<ul class="list hooks">${H.urls.map((h, i) => `<li><span class="path">${esc(h.url)}</span><div class="evs">${HOOK_EVENTS.map((ev) => `<label class="chk"><input type="checkbox" data-hook="ev" data-i="${i}" data-ev="${ev}" ${h.events?.includes(ev) ? 'checked' : ''}> ${esc(t('ev_' + ev))}</label>`).join('')}</div><div class="btns"><button type="button" class="b" data-hk="test" data-i="${i}" ${served ? '' : 'disabled'}><span class="i">${ic('send')}</span><span class="w">${esc(t('hooksTest'))}</span></button><button type="button" class="b" data-hk="del" data-i="${i}"><span class="i">${ic('delete')}</span><span class="w">${esc(t('delete'))}</span></button></div></li>`).join('')}</ul>
<label>${esc(t('hooksUrl'))}<input type="url" data-hook="url" placeholder="https://"></label>
<div class="btns"><button type="button" class="b primary" data-hk="add"><span class="i">${ic('webhooks')}</span><span class="w">${esc(t('hooksAdd'))}</span></button></div>
<h3>${esc(t('hooksLog'))}</h3><ol class="list log">${H.log.map((l) => `<li class="${l.ok ? 'approved' : 'rejected'}"><span class="i">${ic(l.ok ? 'ok' : 'err')}</span> <b>${esc(t('ev_' + l.event) || l.event)}</b> ${esc(l.host)} · ${esc(String(l.status))} · ${l.ms} ms${l.error ? ` · ${esc(l.error)}` : ''}</li>`).join('') || `<li class="hint">${esc(t('hooksNone'))}</li>`}</ol>`;
}
function hooksChange(el) {
  const k = el.dataset.hook;
  if (k === 'enabled') H.enabled = el.checked;
  if (k === 'full') H.full = el.checked;
  if (k === 'ev') {
    const h = H.urls[+el.dataset.i];
    const ev = el.dataset.ev;
    h.events = el.checked ? [...new Set([...(h.events || []), ev])] : (h.events || []).filter((x) => x !== ev);
  }
  saveHooks();
}
async function hooksClick(x) {
  const a = x.dataset.hk;
  if (a === 'add') {
    const v = root.querySelector('.drawer [data-hook="url"]').value.trim();
    let u;
    try { u = new URL(v); } catch { flash(t('hooksBadUrl'), true); return; }
    if (!/^https?:$/.test(u.protocol)) { flash(t('hooksBadUrl'), true); return; }
    H.urls.push({ url: u.href, events: [...HOOK_EVENTS] });
    saveHooks();
    openDrawer('webhooks');
  }
  if (a === 'del') { H.urls.splice(+x.dataset.i, 1); saveHooks(); openDrawer('webhooks'); }
  if (a === 'test') {
    const h = H.urls[+x.dataset.i];
    const r = await sendHook(h.url, hookPayload('test', { test: true }));
    logHook('test', h.url, r);
    toast(r.ok ? t('hooksSent', { s: r.status }) : t('hooksFailed', { s: r.status || r.error }), r.ok ? 'ok' : 'err');
  }
}

/* ── New document wizard: harvest a process model (in the page) or walk the live service (server) ── */
const HL = (ed) => I18N.harvest[ed];
async function sha256Hex(text) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
const inflateRawBrowser = async (bin) => {
  const ds = new DecompressionStream('deflate-raw');
  const buf = await new Response(new Blob([bin]).stream().pipeThrough(ds)).arrayBuffer();
  return [...new Uint8Array(buf)].map((c) => String.fromCharCode(c)).join('');
};
/** A new service from two editions; it opens at once and is saved like any other. */
async function addService(docs) {
  let id = docs.en.service || docs.ar.service || 'service';
  while (M[id]) id = `${id}-2`;
  const editions = {};
  M[id] = {};
  for (const [ed, doc] of Object.entries(docs)) {
    doc.service = id;
    const raw = JSON.stringify(doc, null, 1) + '\n';
    const hash = `sha256:${await sha256Hex(raw)}`;
    const name = doc.control.title.split(/\s*[:—]\s+/).slice(1).join(': ') || doc.control.title;
    editions[ed] = { name, raw, hash, ops: [] };
    M[id][ed] = { base: JSON.parse(raw), raw, hash, name, ops: [], redo: [], status: {}, stale: new Set(), comments: [], versions: [], doc: null };
    rebuild(M[id][ed]);
  }
  DATA.services.push({ id, editions });
  S.svc = id;
  S.sel = null;
  closeDrawer();
  buildUi();
  render(false);
  window.scrollTo(0, 0);
  toast(t('newdocDone'), 'ok');
  return id;
}
async function newFromModel(file) {
  busy(true);
  try {
    const text = await readAs(file, 'text');
    const ir = await HV.parseModel(text, { inflateRaw: inflateRawBrowser });
    if (!ir.name || ir.name === 'Process') ir.name = file.name.replace(/\.[^.]+$/, '');
    return await addService({ ar: HV.modelToDocument(ir, { locale: 'ar', L: HL('ar') }), en: HV.modelToDocument(ir, { locale: 'en', L: HL('en') }) });
  } catch (err) { toast(`${t('newdocFailed')} ${err.message || err}`, 'err', { persist: true }); return null; } finally { busy(false); }
}
/** The documented union of a crawl harvest and a process model, in the page: two files, one document. */
async function newFromMerge() {
  const crawlFile = await pickFile('.json,application/json');
  if (!crawlFile) return null;
  const modelFile = await pickFile('.json,.bpmn,.bpmn20.xml,.xml,.drawio,.yaml,.yml');
  if (!modelFile) return null;
  busy(true);
  try {
    const raw = JSON.parse(await readAs(crawlFile, 'text'));
    if (raw.kind !== 'bw-harvest') throw new Error('harvest.json expected first');
    const text = await readAs(modelFile, 'text');
    const ir = /"kind"\s*:\s*"bw-process"/.test(text) ? JSON.parse(text) : await HV.parseModel(text, { inflateRaw: inflateRawBrowser });
    const docs = { ar: HV.mergeToDocument(ir, raw, { locale: 'ar', L: HL('ar') }), en: HV.mergeToDocument(ir, raw, { locale: 'en', L: HL('en') }) };
    const r = await addService(docs);
    for (const [ed, d] of Object.entries(docs)) for (const c of d.harvestConflicts || []) S.conflicts.push({ ed, path: c.path, mine: c.kept, theirs: c.other, kind: 'text' });
    if (S.conflicts.length) toast(t('reharvestConflicts', { n: S.conflicts.length }), 'warn', { actions: [[t('show'), () => openDrawer('conflicts')]], persist: true });
    return r;
  } catch (err) { toast(`${t('newdocFailed')} ${err.message || err}`, 'err', { persist: true }); return null; } finally { busy(false); }
}
async function newFromCrawl(configText) {
  if (!location.protocol.startsWith('http')) { toast(t('crawlNeedServer'), 'warn', { persist: true }); return null; }
  let cfg;
  try { cfg = JSON.parse(configText); } catch { toast(t('crawlBadConfig'), 'err'); return null; }
  busy(true);
  toast(t('crawlRunning'), 'info');
  try {
    const r = await fetch('/api/harvest/crawl', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(cfg) });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || r.status);
    return await addService(j.documents);
  } catch (err) { toast(`${t('newdocFailed')} ${err.message || err}`, 'err', { persist: true }); return null; } finally { busy(false); }
}
const CRAWL_TEMPLATE = JSON.stringify({
  name: 'Service name',
  languages: [{ code: 'ar', startUrl: 'https://example.org/ar/service' }, { code: 'en', startUrl: 'https://example.org/en/service' }],
  openForm: '#start',
  login: { when: '#username', steps: [{ fill: '#username', value: '$env:BW_HARVEST_USER' }, { fill: '#password', value: '$env:BW_HARVEST_PASS' }, { press: 'button[type=submit]' }] },
  pause: [{ selector: '#otp', until: 'gone', message: 'Type the one-time code in the browser' }],
  next: 'button[type=submit]',
  delayMs: 600,
}, null, 2);
function newdocPanel() {
  const served = location.protocol.startsWith('http');
  return `<p class="hint">${esc(t('newdocHint'))}</p>
<section class="card"><h3><span class="i">${ic('process')}</span> ${esc(t('newdocModel'))}</h3><p class="hint">${esc(t('newdocModelHint'))}</p>
<div class="btns"><button type="button" class="b primary" data-k="nd-model"><span class="i">${ic('import')}</span><span class="w">${esc(t('newdocPick'))}</span></button></div></section>
<section class="card"><h3><span class="i">${ic('crawl')}</span> ${esc(t('newdocCrawl'))}</h3><p class="hint">${esc(t(served ? 'newdocCrawlHint' : 'crawlNeedServer'))}</p>
<label>${esc(t('crawlConfig'))}<textarea data-f="crawl" rows="12" spellcheck="false" dir="ltr">${esc(CRAWL_TEMPLATE)}</textarea></label>
<div class="btns"><button type="button" class="b primary" data-k="nd-crawl" ${served ? '' : 'disabled'}><span class="i">${ic('crawl')}</span><span class="w">${esc(t('newdocRun'))}</span></button></div></section>
<section class="card"><h3><span class="i">${ic('connect')}</span> ${esc(t('ndMerge'))}</h3><p class="hint">${esc(t('ndMergeHint'))}</p>
<div class="btns"><button type="button" class="b primary" data-k="nd-merge"><span class="i">${ic('import')}</span><span class="w">${esc(t('ndMergeCrawl'))} + ${esc(t('ndMergeModel'))}</span></button></div></section>`;
}

/* ── Process panel: edit the steps as a flowchart; regenerate the sections from it ── */
function procOf() { return cur().doc.process || null; }
function processPanel() {
  const ir = procOf();
  if (!ir) return `<p class="hint">${esc(t('procNone'))}</p><div class="btns"><button type="button" class="b primary" data-k="pr-new"><span class="i">${ic('add')}</span><span class="w">${esc(t('procStart'))}</span></button></div>`;
  const actorOpts = (sel) => `<option value="">${esc(t('procNoActor'))}</option>` + ir.actors.map((a) => `<option value="${esc(a.id)}" ${a.id === sel ? 'selected' : ''}>${esc(a.name)}</option>`).join('');
  const stepOpts = (sel) => ir.steps.map((s) => `<option value="${esc(s.id)}" ${s.id === sel ? 'selected' : ''}>${esc(s.name || t('kind_' + s.type))}</option>`).join('');
  const kindOf = (s) => t('kind_' + s.type);
  return `<div class="proc-fig" aria-label="${esc(t('procPreview'))}">${DIAGRAM.render(DIAGRAM.fromGraph(HV.humanGraph(ir), { actors: ir.actors, locale: S.ed }), { theme: S.theme, locale: S.ed })}</div>
<h3>${esc(t('procActors'))}</h3><ul class="list">${ir.actors.map((a, i) => `<li><input type="text" data-pr="actor" data-i="${i}" value="${esc(a.names?.[S.ed] || a.name)}" aria-label="${esc(t('procActorName'))}${a.unresolved ? `: ${esc(t('procUnresolved'))}` : ''}"${a.unresolved ? ' aria-invalid="true"' : ''}>${a.unresolved ? ` <small class="warn">${esc(t('procUnresolved'))}: <code>${esc(a.raw || '')}</code></small>` : ''}</li>`).join('')}</ul>
<div class="btns"><button type="button" class="b" data-k="pr-actor"><span class="i">${ic('add')}</span><span class="w">${esc(t('procAddActor'))}</span></button></div>
<h3>${esc(t('procSteps'))}</h3><ul class="list">${ir.steps.filter((s) => ['task', 'decision', 'end', 'start', 'system'].includes(s.type)).map((s) => { const i = ir.steps.indexOf(s); return `<li><span class="badge">${esc(kindOf(s))}</span> <input type="text" data-pr="name" data-i="${i}" value="${esc(s.name)}" aria-label="${esc(t('procStepName'))}"> ${['task', 'decision'].includes(s.type) ? `<select data-pr="actorOf" data-i="${i}" aria-label="${esc(t('colActorUi'))}">${actorOpts(s.actor)}</select>` : ''} <button type="button" data-pr-del="${i}" aria-label="${esc(t('delete'))}">${ic('close')}</button></li>`; }).join('')}</ul>
<div class="btns"><button type="button" class="b" data-k="pr-step"><span class="i">${ic('add')}</span><span class="w">${esc(t('procAddStep'))}</span></button><button type="button" class="b" data-k="pr-decision"><span class="i">${ic('add')}</span><span class="w">${esc(t('procAddDecision'))}</span></button><button type="button" class="b" data-k="pr-end"><span class="i">${ic('add')}</span><span class="w">${esc(t('procAddEnd'))}</span></button></div>
<h3>${esc(t('procConnect'))}</h3><ul class="list">${ir.flows.map((f, i) => `<li>${esc(ir.steps.find((s) => s.id === f.from)?.name || f.from)} → ${esc(ir.steps.find((s) => s.id === f.to)?.name || f.to)}${f.label ? ` (${esc(f.label)})` : ''} <button type="button" data-pr-unlink="${i}" aria-label="${esc(t('delete'))}">${ic('close')}</button></li>`).join('')}</ul>
<div class="row3"><label>${esc(t('procFrom'))}<select data-f="pr-from">${stepOpts()}</select></label><label>${esc(t('procTo'))}<select data-f="pr-to">${stepOpts()}</select></label><label>${esc(t('procLabel'))}<input type="text" data-f="pr-label"></label></div>
<div class="btns"><button type="button" class="b" data-k="pr-link"><span class="i">${ic('connect')}</span><span class="w">${esc(t('procLink'))}</span></button></div>
<div class="btns"><button type="button" class="b primary" data-k="pr-regen"><span class="i">${ic('replace')}</span><span class="w">${esc(t('procRegen'))}</span></button></div><p class="hint">${esc(t('procRegenHint'))}</p>`;
}
/** Process edits are ordinary ops on /process, mirrored to the other edition. */
function setProcess(next) {
  const old = procOf();
  commit([{ op: 'replace', path: '/process', value: next, old }], { mirror: true, rerender: false });
  openDrawer('process');
}
async function processClick(x) {
  const ir = procOf() ? JSON.parse(JSON.stringify(procOf())) : null;
  const k = x.dataset.k;
  const nid = (p) => `${p}${Date.now().toString(36)}${Math.floor(Math.random() * 99)}`;
  if (k === 'pr-new') {
    const fresh = { kind: 'bw-process', version: 1, name: cur().doc.control.title.split(/\s*[:—]\s+/).slice(1).join(': ') || cur().doc.control.title, source: 'editor', actors: [{ id: 'a1', name: t('procFirstActor') }], steps: [{ id: 'start', type: 'start', name: '' }, { id: 's1', type: 'task', name: t('procFirstStep'), actor: 'a1' }, { id: 'end1', type: 'end', name: t('procFirstEnd') }], flows: [{ from: 'start', to: 's1' }, { from: 's1', to: 'end1' }] };
    commit([{ op: 'replace', path: '/process', value: fresh, old: undefined }], { mirror: true, rerender: false });
    openDrawer('process');
    return true;
  }
  if (!ir) return false;
  if (k === 'pr-actor') { ir.actors.push({ id: nid('a'), name: t('procNewActor') }); setProcess(ir); return true; }
  if (k === 'pr-step' || k === 'pr-decision' || k === 'pr-end') {
    const type = { 'pr-step': 'task', 'pr-decision': 'decision', 'pr-end': 'end' }[k];
    ir.steps.push({ id: nid(type[0]), type, name: t({ task: 'procNewStep', decision: 'procNewDecision', end: 'procNewEnd' }[type]), actor: type === 'end' ? undefined : ir.actors[0]?.id });
    setProcess(ir);
    return true;
  }
  if (x.dataset.prDel !== undefined) { const s = ir.steps[+x.dataset.prDel]; ir.steps.splice(+x.dataset.prDel, 1); ir.flows = ir.flows.filter((f) => f.from !== s.id && f.to !== s.id); setProcess(ir); return true; }
  if (x.dataset.prUnlink !== undefined) { ir.flows.splice(+x.dataset.prUnlink, 1); setProcess(ir); return true; }
  if (k === 'pr-link') {
    const d = root.querySelector('.drawer');
    const from = d.querySelector('[data-f="pr-from"]').value, to = d.querySelector('[data-f="pr-to"]').value, label = d.querySelector('[data-f="pr-label"]').value.trim();
    if (!from || !to || from === to) return true;
    ir.flows.push({ from, to, ...(label ? { label } : {}) });
    setProcess(ir);
    return true;
  }
  if (k === 'pr-regen') {
    // the sections that come from the process are rebuilt in both editions; control data, revisions and logos stay
    for (const ed of Object.keys(M[S.svc])) {
      const e = cur(ed);
      const gen = HV.modelToDocument(e.doc.process || ir, { locale: ed, L: HL(ed) });
      commit([{ op: 'replace', path: '/chapters', value: gen.chapters, old: e.doc.chapters }, { op: 'replace', path: '/openQuestions', value: gen.openQuestions, old: e.doc.openQuestions }], { ed, rerender: false });
    }
    render();
    toast(t('procRegenDone'), 'ok');
    return true;
  }
  return false;
}
function processChange(el) {
  const ir = JSON.parse(JSON.stringify(procOf()));
  const i = +el.dataset.i;
  if (el.dataset.pr === 'actor') { const a = ir.actors[i]; a.name = el.value; if (a.names) a.names = { ...a.names, [S.ed]: el.value }; delete a.unresolved; }
  if (el.dataset.pr === 'name') ir.steps[i].name = el.value;
  if (el.dataset.pr === 'actorOf') ir.steps[i].actor = el.value || undefined;
  setProcess(ir);
}

/* ── document events ───────────────────────────────────────────────────── */
const pair = () => document.getElementById('bw-pair');
document.addEventListener('focusin', (e) => {
  const el = e.target.closest?.('#bw-pair [data-p]');
  if (!el) return;
  if (el.closest('td[data-r]')) lastCell = el.closest('td[data-r]');
  else if (el.matches('td[data-r],th[data-c]')) lastCell = el;
  if (!el.isContentEditable) {
    el.contentEditable = 'plaintext-only';
    // keyboard focus (Tab) leaves no caret: put it at the end so typing works at once
    const sel = getSelection();
    if (!sel.rangeCount || !el.contains(sel.anchorNode)) {
      const r = document.createRange();
      r.selectNodeContents(el);
      r.collapse(false);
      sel.removeAllRanges();
      sel.addRange(r);
    }
  }
  S.typingGroup = null;
  selectEl(el);
});
document.addEventListener('click', (e) => {
  const el = e.target.closest?.('#bw-pair main.bw-doc [data-b], #bw-pair main.bw-doc [data-p]');
  if (el) {
    const cell = e.target.closest('td[data-r]');
    if (cell) lastCell = cell;
    selectEl(e.target);
  } else if (uxIsEmptySpace(e.target)) {
    // a click on empty page or background: the general tools come back
    if (S.sel || S.selOv != null || S.dg) { S.sel = null; S.selOv = null; dgClear(); paintSel(); refreshUi(); }
  }
});
document.addEventListener('input', (e) => {
  const el = e.target.closest?.('#bw-pair [data-p]');
  if (!el) return;
  const ed = el.closest('main.bw-doc').dataset.locale;
  const text = (el.dataset.pfx || '') + el.innerText.replace(/\n+/g, ' ').trim();
  setText(el.dataset.p, text, ed);
});
document.addEventListener('focusout', (e) => {
  const el = e.target.closest?.('#bw-pair [data-p]');
  if (el && el.isContentEditable) el.removeAttribute('contenteditable');
  S.typingGroup = null;
  const le = S.labelEdit;
  if (le) { S.labelEdit = null; toast(t('labelEdited'), 'info', { actions: [[t('labelAll'), () => labelToPack(le.path.slice(8), le.value, le.ed)]] }); }
});
// Pasted HTML never enters the document: text only, scripts and handlers cannot survive.
document.addEventListener('paste', (e) => {
  const imgFile = [...(e.clipboardData?.files || [])].find((x) => /^image\//.test(x.type));
  if (imgFile && e.target.closest?.('#bw-pair')) { e.preventDefault(); pasteImage(imgFile); return; }
  const el = e.target.closest?.('#bw-pair [data-p]');
  if (!el) return;
  e.preventDefault();
  const text = sanitizePaste(e.clipboardData.getData('text/plain') || e.clipboardData.getData('text/html'));
  document.execCommand('insertText', false, text);
});
// Pasted HTML is reduced to text by string work only: it never reaches an HTML
// parser, so no element (and no on*= handler in it) is ever created. On Linux
// Chrome a DOMParser document still tried the payload's inline handler, which the
// page CSP then blocked and reported as a console error (CI run 40532044817).
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
function sanitizePaste(s) {
  return String(s ?? '')
    .replace(/<(script|style|iframe|object|embed|template|svg|math)\b[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]*>/g, '')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
      if (e[0] === '#') {
        const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : '';
      }
      return ENTITIES[e.toLowerCase()] ?? m;
    })
    .replace(/[<>]/g, '')
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '')
    .replace(/\s+/g, ' ');
}
document.addEventListener('keydown', (e) => {
  const mod = e.ctrlKey || e.metaKey;
  const inText = e.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName || '') || e.composedPath?.().some((x) => x === host);
  if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); saveAll(); return; }
  if (mod && e.key.toLowerCase() === 'f') { e.preventDefault(); openDrawer('find'); return; }
  if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); openPalette(); return; }
  if (mod && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'p') { e.preventDefault(); pcOpenPrint(); return; } // the Print panel (print-center.js)
  if (e.composedPath?.().some((x) => x === host)) { if (e.key === 'Escape') uxEscape(); return; }
  if (!inText && !mod && !e.altKey && e.key.toLowerCase() === 'f') { e.preventDefault(); runAction('focus'); return; }
  if (e.key === 'Escape' && S.focus) { runAction('focus'); return; }
  if (mod && !e.shiftKey && e.key.toLowerCase() === 'z' && !e.target.isContentEditable) { e.preventDefault(); undo(); return; }
  if (mod && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z')) && !e.target.isContentEditable) { e.preventDefault(); redo(); return; }
  if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); A.duplicate(); return; }
  if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) { e.preventDefault(); A.move(e.key === 'ArrowUp' ? -1 : 1); return; }
  if (e.key === 'Escape') { if (e.target.isContentEditable) e.target.blur(); S.sel = null; S.selOv = null; dgClear(); paintSel(); refreshUi(); return; }
  if ((e.key === 'Delete') && !inText && S.sel?.b) { e.preventDefault(); A.delete(); }
  if (e.key === 'Enter' && e.target.isContentEditable) { e.preventDefault(); e.target.blur(); }
});
window.addEventListener('resize', () => paintSel());
// leaving, hiding or closing the tab flushes a pending draft at once (a debounce must never lose the last edit)
const flushDraft = () => { if (S.pending || S.dirty) writeDraft(); };
window.addEventListener('pagehide', flushDraft);
window.addEventListener('beforeunload', flushDraft);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushDraft(); });

/* ── tool watermark: the NJ role mark, behaving as on the owner's portfolio ──────
 * Copied from NJ-Burrito.github.io index.html: roles in the order tester → teacher →
 * volunteer → professional (PER, l.1042-1043); click / Enter / Space = next role
 * (nextPersona + listeners, l.1082-1087); the role word rises letter by letter, 560 ms,
 * 40 ms stagger, cubic-bezier(.2,.8,.2,1) (setTag, l.1076-1081); the colour change runs
 * .96s on --e-move cubic-bezier(.76,0,.24,1) (l.68, l.130); idle float sin(t·.9)·6px and
 * a pointer tilt on a spring k=90 c=16 (frame, l.1094-1112), paused when the tab is hidden
 * (l.1116); the intro plays once per browser and a click skips it (l.58, l.1197);
 * reduced motion: no float, no tilt, no letter motion, transitions .2s (l.375, l.1040).
 * Here it is a watermark: UI only, print-hidden, never written into an export. */
function mountWatermark() {
  const RMm = matchMedia('(prefers-reduced-motion: reduce)');
  const RM = { get matches() { return RMm.matches || document.documentElement.dataset.bwCalm === '1'; }, addEventListener: (...a) => RMm.addEventListener(...a) };
  const roles = WATERMARK.filter((w) => !w.intro);
  const intro = WATERMARK.find((w) => w.intro);
  if (!roles.length && !intro) return;
  const wm = document.createElement('div');
  wm.id = 'bw-watermark';
  wm.innerHTML = `<div class="bw-wm-stage" role="button" tabindex="0"><div class="bw-wm-mark">${[...roles, ...(intro ? [intro] : [])]
    .map((w, i) => `<img alt="" draggable="false" data-i="${i}" ${w.intro ? 'data-intro="1"' : ''} src="${esc(w.src)}">`).join('')}</div></div><span class="bw-wm-tag" aria-hidden="true"></span><span class="bw-wm-live" aria-live="polite"></span>`;
  document.body.appendChild(wm);
  const stage = wm.querySelector('.bw-wm-stage');
  const mark = wm.querySelector('.bw-wm-mark');
  const imgs = [...mark.querySelectorAll('img')];
  const tag = wm.querySelector('.bw-wm-tag');
  const live = wm.querySelector('.bw-wm-live');
  let pi = 0;
  const roleName = () => { const r = roles[pi]?.role; return r ? t(`role_${r}`) : ''; };
  const show = (img) => imgs.forEach((x) => x.classList.toggle('on', x === img));
  const setTag = (animate) => {
    const word = roleName();
    const parts = S.ui === 'ar' ? [word] : [...word];
    tag.innerHTML = parts.map((ch) => `<span><i>${esc(ch)}</i></span>`).join('');
    if (!animate || RM.matches) return;
    [...tag.querySelectorAll('i')].forEach((el, k) => el.animate([{ transform: 'translateY(110%)' }, { transform: 'translateY(-8%)', offset: 0.7 }, { transform: 'translateY(0)' }],
      { duration: 560, delay: k * 40, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' }));
  };
  const label = () => {
    wm.dir = S.ui === 'ar' ? 'rtl' : 'ltr';
    wm.lang = S.ui;
    stage.setAttribute('aria-label', t('wmLabel', { r: roleName() }));
  };
  const settle = () => { wm.dataset.intro = 'done'; show(imgs[pi]); setTag(false); label(); };
  const next = (e) => {
    e?.preventDefault?.();
    if (wm.dataset.intro === 'playing') { settle(); return; } // a click skips the intro, as on the portfolio
    if (!roles.length) return;
    pi = (pi + 1) % roles.length;
    show(imgs[pi]);
    wm.dataset.role = roles[pi].role || String(pi);
    S2.vy += RM.matches ? 0 : 5;
    setTag(true);
    label();
    live.textContent = t('wmLive', { r: roleName() });
  };
  stage.addEventListener('click', next);
  stage.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') next(e); });
  wm.dataset.role = roles[0]?.role || '0';

  // the intro plays once per browser, never under reduced motion
  let seen = false;
  try { seen = localStorage.getItem('bw:wm-intro') === '1'; } catch { /* storage unavailable */ }
  if (intro && !seen && !RM.matches) {
    wm.dataset.intro = 'playing';
    show(imgs[imgs.length - 1]);
    try { localStorage.setItem('bw:wm-intro', '1'); } catch { /* storage unavailable */ }
    setTimeout(() => { if (wm.dataset.intro === 'playing') settle(); }, 8000); // the animation's own length
    label();
  } else settle();

  // idle float + pointer tilt on a spring (the portfolio's frame loop)
  const S2 = { rx: 0, ry: 0, vx: 0, vy: 0 };
  let pointer = null, last = 0, raf = 0;
  const t0 = performance.now();
  const spring = (v, target, vel, k, c, dt) => { const a = k * (target - v) - c * vel; vel += a * dt; return [v + vel * dt, vel]; };
  wm.addEventListener('pointermove', (e) => { if (e.pointerType === 'touch') return; const r = stage.getBoundingClientRect(); pointer = { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height }; });
  wm.addEventListener('pointerleave', () => { pointer = null; });
  const frame = (now) => {
    raf = 0;
    const dt = Math.min(0.033, (now - (last || now)) / 1000);
    last = now;
    const tt = (now - t0) / 1000;
    const rm = RM.matches;
    const p = pointer && !rm ? pointer : null;
    const tx = p ? (p.y - 0.5) * -18 : rm ? 0 : Math.sin(tt * 0.55) * 4;
    const ty = p ? (p.x - 0.5) * 22 : rm ? 0 : Math.sin(tt * 0.37 + 1) * 6;
    [S2.rx, S2.vx] = spring(S2.rx, tx, S2.vx, 90, 16, dt);
    [S2.ry, S2.vy] = spring(S2.ry, ty, S2.vy, 90, 16, dt);
    const floatY = rm || p ? 0 : Math.sin(tt * 0.9) * 6;
    mark.style.transform = `translateY(${floatY.toFixed(2)}px) rotateX(${S2.rx.toFixed(3)}deg) rotateY(${S2.ry.toFixed(3)}deg)`;
    if (!document.hidden && !rm) raf = requestAnimationFrame(frame);
  };
  const start = () => { if (!raf && !document.hidden && !RM.matches) { last = 0; raf = requestAnimationFrame(frame); } };
  document.addEventListener('visibilitychange', start);
  RM.addEventListener?.('change', () => { mark.style.transform = ''; start(); });
  start();
  window.BW_WM = { next, roles: () => roles.map((r) => r.role), current: () => wm.dataset.role, relabel: () => { setTag(false); label(); } };
}

/* ── boot ──────────────────────────────────────────────────────────────── */
function boot() {
  const ov = document.createElement('div');
  ov.id = 'bw-overlay';
  ov.innerHTML = `<button type="button" class="bw-grip" hidden aria-label="${esc(t('drag'))}"><span aria-hidden="true">✥</span> ${esc(t('drag'))}</button><div class="bw-drop" hidden></div>`;
  document.body.appendChild(ov);
  overlay.grip = ov.querySelector('.bw-grip');
  overlay.drop = ov.querySelector('.bw-drop');
  overlay.grip.addEventListener('pointerdown', startDrag);
  if (WATERMARK.length) mountWatermark();
  document.documentElement.dataset.bwDark = S.dark ? '1' : '0';
  buildUi();
  render(false);
  offerRecovery();
  window.BW.ready = true; // booted and rendered with the remembered state
}
// a re-harvest that met a hand edit: the person's text was kept; show the source's new text beside it
for (const [svc, eds] of Object.entries(M)) for (const [ed, e] of Object.entries(eds)) for (const c of e.doc.harvestConflicts || []) if (svc === S.svc) S.conflicts.push({ ed, path: c.path, mine: c.manual, theirs: c.harvested, kind: 'text' });
if (S.conflicts.length) toast(t('reharvestConflicts', { n: S.conflicts.length }), 'warn', { actions: [[t('show'), () => openDrawer('conflicts')]], persist: true });
{ const n = (cur().doc.process?.actors || []).filter((a) => a.unresolved).length; if (n) toast(t('rolesUnresolved', { n }), 'warn', { actions: [[t('show'), () => openDrawer('process')]], persist: true }); }
window.BW = { flushDraft, S, M, commit, runAction, DIAGRAM, setText, undo, redo, render, editsFile, bundle, importFile, saveHtml, validate, applyOps, A, selectEl, sanitizePaste, snapshotState, KEY, findNext, replaceAll };
boot();
