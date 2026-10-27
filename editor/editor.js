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
const kindName = (k) => (I18N.ui[S.ui].kinds || {})[k] || k;

/* ── rendering ─────────────────────────────────────────────────────────── */
const docCssEl = document.getElementById('bw-doc-css');
const fontsEl = document.getElementById('bw-fonts');
function renderOne(ed) {
  const e = cur(ed);
  const parts = renderParts(e.doc, { locale: ed, labels: I18N.doc[ed] });
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
  docCssEl.textContent = documentCss(S.theme, sheet);
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
  document.documentElement.lang = S.ed;
  document.documentElement.dir = S.ed === 'ar' ? 'rtl' : 'ltr';
  document.documentElement.style.setProperty('--bw-zoom', String(S.zoom));
  decorate();
  if (keepScroll) window.scrollTo(0, y);
  restoreSel();
  refreshUi();
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
function setText(path, value, ed = S.ed) {
  const e = cur(ed);
  const old = get(e.doc, path);
  if (old === value) return;
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
function touched() {
  S.dirty = true;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    if (ls.set(KEY, JSON.stringify(snapshotState()))) { S.savedAt = new Date(); flash(t('autosaved')); }
  }, 400);
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
  ls.set(KEY, JSON.stringify(snapshotState()));
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
  const parts = renderParts(cur().doc, { locale: S.ed, labels: I18N.doc[S.ed] });
  const html = `<!doctype html>
<html lang="${S.ed}" dir="${S.ed === 'ar' ? 'rtl' : 'ltr'}"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${DATA.csp}">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(cur().doc.control.title)}</title>
<style id="bw-fonts">${fontCss}</style>
<style id="bw-doc-css">${documentCss(S.theme, parts.sheet)}</style>
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

/* ── export PDF + DOCX ─────────────────────────────────────────────────── */
async function exportPdfDocx() {
  const e = cur();
  const body = { service: S.svc, locale: S.ed, doc: e.doc, theme: S.theme };
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
  relaxTallGroups(relaxArgs());
});
window.addEventListener('afterprint', () => {
  document.documentElement.classList.remove('bw-printing');
  render();
});

/* ── selection ─────────────────────────────────────────────────────────── */
function selectEl(el) {
  S.selOv = null;
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
  for (const f of [S.theme.fonts.text, S.theme.fonts.display])
    if (!document.fonts.check(`16px '${f}'`) || !DATA.fontFamilies.includes(f)) out.push(['err', t('vFont', { x: f })]);
  const emptyLogos = ['start', 'center', 'end', 'header'].filter((k) => !S.theme.logos?.[k]).length;
  if (emptyLogos) out.push(['info', t('vLogos', { n: emptyLogos })]);
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
  ['undo', 'edit', 'Ctrl+Z'], ['redo', 'edit', 'Ctrl+Y'],
  ['duplicate', 'block', 'Ctrl+D'], ['delete', 'block', 'Del'], ['moveUp', 'block', 'Alt+↑'], ['moveDown', 'block', 'Alt+↓'],
  ['addPara', 'block'], ['rowAdd', 'table'], ['rowDel', 'table'], ['colAdd', 'table'], ['colDel', 'table'],
  ['comment', 'block'], ['breakBefore', 'block'], ['keepNext', 'block'], ['renumber', 'document'],
  ['image', 'insert'], ['logo', 'insert'],
  ['find', 'panels', 'Ctrl+F'], ['outline', 'panels'], ['pages', 'panels'], ['check', 'panels'], ['history', 'panels'], ['theme', 'panels'], ['webhooks', 'panels'],
  ['save', 'file', 'Ctrl+S'], ['saveHtml', 'file'], ['import', 'file'], ['exportEdits', 'file'], ['exportAll', 'file'], ['exportPdf', 'file'], ['print', 'file', 'Ctrl+P'],
  ['side', 'view'], ['uiLang', 'view'], ['dark', 'view'], ['calm', 'view'], ['focus', 'view', 'F'], ['spell', 'view'], ['snap', 'view'], ['zoomOut', 'view'], ['zoomIn', 'view'],
].map(([id, group, key]) => ({ id, group, key }));

function btn(id, { label = t(id), tip = '', pressed, cls = '', extra = '' } = {}) {
  return `<button type="button" class="b ${cls}" data-a="${id}" title="${esc(tip || label)}"${pressed !== undefined ? ` aria-pressed="${pressed}"` : ''}${extra}><span class="i">${ic(id)}</span><span class="w">${esc(label)}</span></button>`;
}
const dirOf = (l) => (l === 'ar' ? 'rtl' : 'ltr');
const dirWord = (l) => (l === 'ar' ? t('rtl') : t('ltr'));

function buildUi() {
  const svcOpts = DATA.services.map((s) => `<option value="${esc(s.id)}" ${s.id === S.svc ? 'selected' : ''}>${esc(s.editions[S.ed]?.name || s.editions.ar?.name || s.id)}</option>`).join('');
  const eds = Object.keys(M[S.svc]);
  const theme = S.dark ? 'dark' : 'light';
  setRootFlags();
  root.innerHTML = `<style>${DATA.uiCss}</style>
<section class="shell" aria-label="${esc(t('appName'))}" dir="${dirOf(S.ui)}" lang="${S.ui}" data-theme="${theme}" data-calm="${isCalm() ? '1' : '0'}">
  <div class="island bar" role="toolbar" aria-label="${esc(t('toolbar'))}">
    <span class="brand" role="img" aria-label="${esc(t('appName'))}">${DATA.brand?.mark || ''}</span>
    <div class="grp doc">
      <label class="pick"><span class="vh">${esc(t('service'))}</span><select data-a="svc" aria-label="${esc(t('service'))}">${svcOpts}</select></label>
      <div class="seg" role="group" aria-label="${esc(t('edition'))}"><span class="cap" aria-hidden="true">${esc(t('edition'))}</span>
        ${eds.map((ed) => `<button type="button" data-a="ed" data-ed="${ed}" aria-pressed="${ed === S.ed}" aria-label="${esc(t(ed === 'ar' ? 'editionAr' : 'editionEn'))} (${esc(dirWord(ed))})" title="${esc(t(ed === 'ar' ? 'editionAr' : 'editionEn'))}">${esc(dirWord(ed))}</button>`).join('')}
      </div>
    </div>
    <div class="grp">${btn('undo')}${btn('redo')}</div>
    <div class="grp">${btn('image', { tip: t('imageTip') })}${btn('logo', { tip: t('logoTip') })}</div>
    <div class="grp">${btn('find')}${btn('pages')}</div>
    <div class="grp">${btn('save', { cls: 'primary' })}${btn('exportPdf', { tip: t('exportPdfTip') })}</div>
    <span class="spacer"></span>
    <div class="status" role="status" aria-live="polite">
      <span class="count" aria-label="${esc(t('changes', { n: liveOps(cur()).length }))}"><span class="n">${liveOps(cur()).length}</span><span class="w">${esc(t('changesWord'))}</span></span>
      <span class="sel vh">${esc(selDesc())}</span><span class="flash vh"></span>
    </div>
    <div class="seg ui" role="group" aria-label="${esc(t('uiDir'))}"><span class="cap" aria-hidden="true">${esc(t('uiDir'))}</span>
      <button type="button" data-a="uiLang" data-l="ar" aria-pressed="${S.ui === 'ar'}" aria-label="${esc(t('uiAr'))}" title="${esc(t('uiAr'))}">${esc(t('rtl'))}</button>
      <button type="button" data-a="uiLang" data-l="en" aria-pressed="${S.ui === 'en'}" aria-label="${esc(t('uiEn'))}" title="${esc(t('uiEn'))}">${esc(t('ltr'))}</button>
    </div>
    ${btn('view', { extra: ` aria-expanded="${S.view}" aria-controls="viewpop"` })}
    ${btn('palette', { cls: 'cmd', label: t('palette'), extra: ' aria-keyshortcuts="Control+K"' })}
    <div class="progress" hidden aria-hidden="true"><i></i></div>
  </div>
  <div class="pop" id="viewpop" role="group" aria-label="${esc(t('view'))}" ${S.view ? '' : 'hidden'}>
    ${eds.length > 1 ? btn('side', { label: t('sideBySide'), pressed: S.side }) : ''}
    <label class="chk"><input type="checkbox" data-a="both" ${S.both ? 'checked' : ''}> <span class="i">${ic('both')}</span>${esc(t('bothEditions'))}</label>
    ${btn('dark', { pressed: S.dark })}${btn('calm', { pressed: S.calm })}${btn('focus', { pressed: S.focus })}
    ${btn('spell', { pressed: S.spell[S.ed] })}${btn('snap', { pressed: S.snap })}
    ${btn('zoomOut', { label: t('zoom') + ' −' })}${btn('zoomIn', { label: t('zoom') + ' +' })}
  </div>
  <div class="ctx" role="toolbar" aria-label="${esc(t('ctxToolbar'))}" hidden></div>
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
  shell.addEventListener('click', onBar);
  root.querySelector('[data-a="svc"]').addEventListener('change', (e) => { S.svc = e.target.value; if (!M[S.svc][S.ed]) S.ed = Object.keys(M[S.svc])[0]; S.sel = null; buildUi(); render(false); });
  root.querySelector('[data-a="both"]').addEventListener('change', (e) => { S.both = e.target.checked; });
  root.querySelector('.scrim').addEventListener('click', (e) => { if (e.target.classList.contains('scrim')) closePalette(); });
  wirePalette();
  measureBar();
  if (S.drawer) openDrawer(S.drawer);
  placeCtx();
}
function measureBar() {
  const bar = root.querySelector('.island');
  const h = S.focus || !bar ? 12 : bar.getBoundingClientRect().bottom + 12;
  document.documentElement.style.setProperty('--bw-bar-h', `${Math.round(h)}px`);
}
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
  if (S.drawer && !['find', 'theme', 'pages', 'webhooks'].includes(S.drawer)) openDrawer(S.drawer, true);
  buildCtx(b, tb);
  measureBar();
}

/* selection bar: the block, table and image actions, next to what is selected */
function buildCtx(b, tb) {
  const ctx = root.querySelector('.ctx');
  if (!ctx) return;
  const ov = S.selOv != null ? (cur().doc.overlays || [])[S.selOv] : null;
  if (!b && !ov) { ctx.hidden = true; return; }
  const groups = ov
    ? [['replace', 'caption', ...(ov.kind === 'logo' ? ['every'] : []), 'delete']]
    : [['duplicate', 'delete', 'moveUp', 'moveDown'], ['addPara', 'comment', 'breakBefore', 'keepNext'], ...(tb ? [['rowAdd', 'rowDel', 'colAdd', 'colDel']] : [])];
  const key = JSON.stringify([groups, ov ? `ov${S.selOv}${ov.mode}` : b?.ptr]);
  if (ctx.dataset.key !== key) {
    ctx.dataset.key = key;
    ctx.innerHTML = groups.map((g) => `<div class="grp">${g.map((id) => (id === 'every' ? btn('every', { pressed: ov.mode === 'every' }) : id === 'delete' && ov ? btn('ovDelete', { label: t('delete') }) : btn(id))).join('')}</div>`).join('');
    ctx.querySelectorAll('[data-a="ovDelete"] .i').forEach((x) => { x.innerHTML = ic('delete'); });
    ctx.querySelectorAll('[data-a="replace"] .i,[data-a="caption"] .i').forEach(() => {});
  }
  ctx.hidden = false;
  placeCtx();
}
function placeCtx() {
  const ctx = root.querySelector('.ctx');
  if (!ctx || ctx.hidden) return;
  const main = mainOf(S.ed);
  let anchor = null;
  if (S.selOv != null) anchor = main?.querySelector(`.bw-ov[data-i="${S.selOv}"]`);
  else if (S.sel?.b) anchor = main?.querySelector(`[data-b="${CSS.escape(S.sel.b)}"]`);
  if (!anchor || !main) { ctx.hidden = true; return; }
  const r = anchor.getBoundingClientRect();
  const m = main.getBoundingClientRect();
  const top0 = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--bw-bar-h')) || 80;
  const h = ctx.offsetHeight || 48;
  let top = r.top - h - 10;
  if (top < top0) top = Math.min(innerHeight - h - 12, r.bottom + 10);
  ctx.style.top = `${Math.max(top0, top)}px`;
  ctx.style.left = `${Math.max(8, Math.min(innerWidth - ctx.offsetWidth - 8, m.left + m.width / 2 - ctx.offsetWidth / 2))}px`;
}
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
function fillPalette() {
  const q = fold(root.querySelector('.palette input').value.trim());
  const list = root.querySelector('#cmdlist');
  const hits = CMDS.filter((c) => !q || fold(`${t(c.id)} ${t('grp_' + c.group)} ${c.id}`).includes(q));
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
  const b = e.target.closest('button[data-a]');
  if (!b || b.closest('.palette')) return;
  const a = b.dataset.a;
  if (a === 'ed') { S.ed = b.dataset.ed; S.sel = null; S.selOv = null; buildUi(); render(false); return; }
  if (a === 'uiLang') { setUi(b.dataset.l || (S.ui === 'ar' ? 'en' : 'ar')); return; }
  await runAction(a);
}
function setUi(l) {
  if (l === S.ui) return;
  S.ui = l;
  ls.set('bw:ui', S.ui);
  buildUi();
  render();
  window.BW_WM?.relabel();
}
async function runAction(a) {
  switch (a) {
    case 'side': S.side = !S.side; buildUi(); render(false); break;
    case 'uiLang': setUi(S.ui === 'ar' ? 'en' : 'ar'); break;
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
    case 'renumber': A.renumber(); break;
    case 'find': case 'outline': case 'check': case 'history': case 'theme': case 'pages': case 'webhooks':
      S.drawer === a ? closeDrawer() : openDrawer(a); break;
    case 'save': saveAll(); pop('save'); break;
    case 'saveHtml': await saveHtml(!!S.embedFonts); break;
    case 'import': { const f = await pickFile('.json,.html,application/json,text/html'); if (f) await importFile(f); break; }
    case 'exportEdits': download(`${S.svc}.edits-bundle.json`, JSON.stringify(bundle([S.svc]), null, 1)); emitHook('edits.exported', { scope: 'service' }); break;
    case 'exportAll': download(`all-services.edits-bundle.json`, JSON.stringify(bundle(Object.keys(M)), null, 1)); emitHook('edits.exported', { scope: 'all' }); break;
    case 'exportPdf': busy(true); try { await exportPdfDocx(); } finally { busy(false); } break;
    case 'print': window.print(); break;
    case 'zoomIn': S.zoom = Math.min(2, +(S.zoom + 0.1).toFixed(2)); render(); break;
    case 'zoomOut': S.zoom = Math.max(0.4, +(S.zoom - 0.1).toFixed(2)); render(); break;
    case 'spell': S.spell[S.ed] = !S.spell[S.ed]; buildUi(); render(); break;
    default: break;
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
    const fam = DATA.fontFamilies;
    const sel = (key, val) => `<select data-font="${key}">${fam.map((f) => `<option ${f === val ? 'selected' : ''}>${esc(f)}</option>`).join('')}</select>`;
    const ovs = cur().doc.overlays || [];
    html = head(t('theme')) + `<h3>${esc(t('font'))}</h3><label>${esc(t('fontText'))} ${sel('text', S.theme.fonts.text)}</label><label>${esc(t('fontDisplay'))} ${sel('display', S.theme.fonts.display)}</label>
<h3>${esc(t('logos'))}</h3><p class="hint">${esc(t('logosHint'))}</p><ul class="list">${ovs.map((o, i) => (o.kind === 'logo' ? `<li><img alt="" src="${esc(o.src)}" class="thumb"> ${esc(t('mode_' + o.mode))} <button type="button" data-ovgo="${i}">${esc(t('show'))}</button></li>` : '')).join('')}</ul>
<div class="btns"><button type="button" class="b primary" data-k="logoAdd"><span class="i">${ic('logo')}</span><span class="w">${esc(t('logo'))}</span></button></div>
<h3>${esc(t('imgWidth'))}</h3><input type="range" min="10" max="100" step="5" data-k="width" aria-label="${esc(t('imgWidth'))}" value="${(() => { const b = blockOf(S.sel?.b); return (b && get(cur().doc, b.ptr)?.width) || 100; })()}">
<label class="chk"><input type="checkbox" data-k="embed" ${S.embedFonts ? 'checked' : ''}> ${esc(t('embedFonts'))}</label>
<div class="btns"><button type="button" class="b" data-k="texp"><span class="w">${esc(t('themeExport'))}</span></button><button type="button" class="b" data-k="timp"><span class="w">${esc(t('themeImport'))}</span></button></div>
<h3>${esc(t('shortcuts'))}</h3><p class="hint">${esc(t('shortcutsText'))}</p>`;
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
    if (e.target.dataset.k === 'width') A.width(e.target.value);
  };
  d.onchange = (e) => {
    if (e.target.dataset.font) { S.theme = { ...S.theme, fonts: { ...S.theme.fonts, [e.target.dataset.font]: e.target.value } }; touched(); render(); }
    if (e.target.dataset.k === 'embed') S.embedFonts = e.target.checked;
    if (e.target.dataset.hook) hooksChange(e.target);
  };
  if (!soft) d.querySelector('input,button:not([data-k="close"])')?.focus();
}

async function onDrawer(e) {
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
  if (k === 'texp') download(`design-pack.json`, JSON.stringify({ kind: 'bw-design-pack', version: 1, ...S.theme }, null, 1));
  if (k === 'timp') {
    const f = await pickFile('.json,application/json');
    if (!f) return;
    try {
      const p = JSON.parse(await readAs(f, 'text'));
      if (p.kind !== 'bw-design-pack') throw new Error();
      const { kind, version, ...rest } = p;
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
  return { mode: 'anchor', anchor: ptr, x: (clientX - (wrap.left + padL)) / k, y: (clientY - ar.top) / k, _anchorEl: !!main.querySelector(`.bw-anchor[data-anchor="${CSS.escape(ptr)}"]`) };
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
  el.setPointerCapture(e.pointerId);
  S.selOv = i; S.sel = null; paintSel(); refreshUi();
  const k = mmScale();
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
      el.style.transform = `translate(${dx}px, ${dy}px)`;
      const target = placeAt(r0.left + dx, r0.top + dy, o.mode === 'every' ? 'every' : o.kind, o.w);
      const { p, guides } = snapMm(target, o.w);
      showGuides(main, guides.map((g) => [g[0], g[1]]), p.mode === 'anchor' ? 16 : 0);
      last = { p, dx, dy };
    }
  };
  const up = () => {
    el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerup', up);
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
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', up);
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
  if (el) { S.selOv = +el.dataset.i; S.sel = null; paintSel(); refreshUi(); }
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
  if (e.composedPath?.().some((x) => x === host)) { if (e.key === 'Escape') { if (S.view) { S.view = false; buildUi(); } else closeDrawer(); } return; }
  if (!inText && !mod && !e.altKey && e.key.toLowerCase() === 'f') { e.preventDefault(); runAction('focus'); return; }
  if (e.key === 'Escape' && S.focus) { runAction('focus'); return; }
  if (mod && !e.shiftKey && e.key.toLowerCase() === 'z' && !e.target.isContentEditable) { e.preventDefault(); undo(); return; }
  if (mod && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z')) && !e.target.isContentEditable) { e.preventDefault(); redo(); return; }
  if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); A.duplicate(); return; }
  if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) { e.preventDefault(); A.move(e.key === 'ArrowUp' ? -1 : 1); return; }
  if (e.key === 'Escape') { if (e.target.isContentEditable) e.target.blur(); S.sel = null; paintSel(); refreshUi(); return; }
  if ((e.key === 'Delete') && !inText && S.sel?.b) { e.preventDefault(); A.delete(); }
  if (e.key === 'Enter' && e.target.isContentEditable) { e.preventDefault(); e.target.blur(); }
});
window.addEventListener('resize', () => paintSel());
window.addEventListener('beforeunload', () => { if (S.dirty) ls.set(KEY, JSON.stringify(snapshotState())); });

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
}
window.BW = { S, M, commit, setText, undo, redo, render, editsFile, bundle, importFile, saveHtml, validate, applyOps, A, selectEl, sanitizePaste, snapshotState, KEY, findNext, replaceAll };
boot();
