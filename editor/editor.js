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
    main.querySelectorAll('.bw-logo-slot').forEach((el) => {
      el.setAttribute('role', 'button');
      el.tabIndex = 0;
      el.setAttribute('aria-label', `${t('emptySlot')}: ${t(slotKey(el.dataset.logo))}`);
      el.textContent = `＋ ${t(slotKey(el.dataset.logo))}`;
    });
  }
}
const slotKey = (s) => ({ start: 'logoStart', center: 'logoCenter', end: 'logoEnd', header: 'logoHeader' })[s];

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
    const f = await pickFile('image/png,image/jpeg,image/svg+xml');
    if (!f) return;
    const url = await readAs(f, 'url');
    if (!/^data:image\/(png|jpeg|svg\+xml);/.test(url)) { flash(t('badFile'), true); return; }
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

/* ── UI (Shadow DOM) ───────────────────────────────────────────────────── */
const host = document.createElement('div');
host.id = 'bw-ui-host';
document.body.prepend(host);
const root = host.attachShadow({ mode: 'open' });
const ICON = {
  undo: '↶', redo: '↷', duplicate: '⧉', delete: '✕', moveUp: '↑', moveDown: '↓', drag: '✥', addPara: '¶',
  rowAdd: '⊞', rowDel: '⊟', colAdd: '⊞', colDel: '⊟', image: '▣', comment: '✎', renumber: '#', breakBefore: '⤓', keepNext: '⛓',
  find: '⌕', outline: '☰', pages: '▤', check: '✓', history: '⟲', theme: '◐', save: '⬇', saveHtml: '⎘', import: '⬆', exportEdits: '{ }', exportAll: '{ }',
  exportPdf: '⎙', print: '⎙', zoomIn: '+', zoomOut: '−', spell: 'ab', dark: '☾', side: '◫', uiLang: '⇄',
};
function btn(id, action, { label = t(id), tip = '', pressed } = {}) {
  return `<button type="button" data-a="${id}" ${action ? '' : ''} title="${esc(tip || label)}" ${pressed !== undefined ? `aria-pressed="${pressed}"` : ''}><span class="i" aria-hidden="true">${ICON[id] || '•'}</span><span class="w">${esc(label)}</span></button>`;
}
function buildUi() {
  const svcOpts = DATA.services.map((s) => `<option value="${esc(s.id)}" ${s.id === S.svc ? 'selected' : ''}>${esc(s.editions[S.ed]?.name || s.editions.ar?.name || s.id)}</option>`).join('');
  const eds = Object.keys(M[S.svc]);
  root.innerHTML = `<style>${DATA.uiCss}</style>
<section aria-label="${esc(t('appName'))}"><div class="bar" role="toolbar" aria-label="${esc(t('toolbar'))}" dir="${S.ui === 'ar' ? 'rtl' : 'ltr'}" lang="${S.ui}" data-theme="${S.dark ? 'dark' : 'light'}">
  <div class="row top">
    <strong class="app">${esc(t('appName'))}</strong>
    <label class="field">${esc(t('service'))} <select data-a="svc" aria-label="${esc(t('service'))}">${svcOpts}</select></label>
    <span class="seg" role="group" aria-label="${esc(t('edition'))}">
      ${eds.map((ed) => `<button type="button" data-a="ed" data-ed="${ed}" aria-pressed="${ed === S.ed}">${esc(t(ed === 'ar' ? 'editionAr' : 'editionEn'))}</button>`).join('')}
    </span>
    ${eds.length > 1 ? btn('side', true, { label: t('sideBySide'), pressed: S.side }) : ''}
    <label class="chk"><input type="checkbox" data-a="both" ${S.both ? 'checked' : ''}> ${esc(t('bothEditions'))}</label>
    <span class="status" role="status" aria-live="polite"><span class="count">${esc(t('changes', { n: liveOps(cur()).length }))}</span> · <span class="sel">${esc(selDesc())}</span> · <span class="flash"></span></span>
    <span class="spacer"></span>
    ${btn('uiLang', true, { label: t('uiLang'), tip: t('uiLangTip') })}
    ${btn('dark', true, { label: t('dark'), pressed: S.dark })}
  </div>
  <div class="row">
    <span class="grp">${btn('undo')}${btn('redo')}</span>
    <span class="grp">${btn('duplicate')}${btn('delete')}${btn('moveUp')}${btn('moveDown')}${btn('addPara')}</span>
    <span class="grp">${btn('rowAdd')}${btn('rowDel')}${btn('colAdd')}${btn('colDel')}</span>
    <span class="grp">${btn('image', true, { tip: t('imageTip') })}${btn('comment')}${btn('breakBefore')}${btn('keepNext')}${btn('renumber')}</span>
    <span class="grp">${btn('find')}${btn('outline')}${btn('pages')}${btn('check')}${btn('history')}${btn('theme')}</span>
    <span class="grp">${btn('save')}${btn('saveHtml', true, { tip: t('saveHtmlTip') })}${btn('import', true, { tip: t('importTip') })}${btn('exportEdits')}${btn('exportAll', true, { label: t('exportAll') })}${btn('exportPdf', true, { tip: t('exportPdfTip') })}${btn('print')}</span>
    <span class="grp">${btn('zoomOut', true, { label: t('zoom') + ' −' })}${btn('zoomIn', true, { label: t('zoom') + ' +' })}${btn('spell', true, { label: t('spell'), pressed: S.spell[S.ed] })}</span>
  </div>
  <div class="banner" hidden></div>
</div></header>
<div class="drawer" role="dialog" aria-modal="false" hidden dir="${S.ui === 'ar' ? 'rtl' : 'ltr'}" lang="${S.ui}" data-theme="${S.dark ? 'dark' : 'light'}"></div>
<div class="dialog" role="dialog" aria-modal="true" hidden dir="${S.ui === 'ar' ? 'rtl' : 'ltr'}" data-theme="${S.dark ? 'dark' : 'light'}"></div>`;
  root.querySelector('.bar').addEventListener('click', onBar);
  root.querySelector('[data-a="svc"]').addEventListener('change', (e) => { S.svc = e.target.value; if (!M[S.svc][S.ed]) S.ed = Object.keys(M[S.svc])[0]; S.sel = null; buildUi(); render(false); });
  root.querySelector('[data-a="both"]').addEventListener('change', (e) => { S.both = e.target.checked; });
  document.documentElement.style.setProperty('--bw-bar-h', `${root.querySelector('.bar').offsetHeight + 8}px`);
  if (S.drawer) openDrawer(S.drawer);
}
function refreshUi() {
  const c = root.querySelector('.count');
  if (!c) return;
  c.textContent = t('changes', { n: liveOps(cur()).length });
  root.querySelector('.sel').textContent = selDesc();
  const b = blockOf(S.sel?.b);
  const tb = !!tableCtx();
  const dis = { duplicate: !b, delete: !b, moveUp: !b, moveDown: !b, drag: !b, breakBefore: !b, keepNext: !b, rowAdd: !tb, rowDel: !tb, colAdd: !tb, colDel: !tb, comment: !S.sel, undo: !cur().ops.length, redo: !cur().redo.length };
  root.querySelectorAll('button[data-a]').forEach((x) => { if (x.dataset.a in dis) x.disabled = dis[x.dataset.a]; });
  const v = validate();
  const chk = root.querySelector('[data-a="check"] .i');
  if (chk) chk.textContent = v.some((x) => x[0] === 'err') ? '⚠' : '✓';
  if (S.drawer && S.drawer !== 'find' && S.drawer !== 'theme') openDrawer(S.drawer, true);
  document.documentElement.style.setProperty('--bw-bar-h', `${root.querySelector('.bar').offsetHeight + 8}px`);
}
function flash(msg, bad = false) {
  const f = root.querySelector('.flash');
  if (!f) return;
  f.textContent = msg;
  f.className = `flash ${bad ? 'bad' : ''}`;
}
function banner(msg, actions) {
  const b = root.querySelector('.banner');
  b.hidden = false;
  b.innerHTML = `<span>${esc(msg)}</span>${actions.map(([l], i) => `<button type="button" data-k="${i}">${esc(l)}</button>`).join('')}`;
  b.onclick = (e) => {
    const k = e.target.closest('button')?.dataset.k;
    if (k === undefined) return;
    b.hidden = true;
    actions[k][1]();
  };
  b.querySelector('button')?.focus();
}
function ask(label) {
  const d = root.querySelector('.dialog');
  d.hidden = false;
  d.setAttribute('aria-label', label);
  d.innerHTML = `<label>${esc(label)}<textarea rows="3"></textarea></label><div><button type="button" data-k="ok">${esc(t('save'))}</button><button type="button" data-k="no">${esc(t('close'))}</button></div>`;
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
async function onBar(e) {
  const b = e.target.closest('button[data-a]');
  if (!b) return;
  const a = b.dataset.a;
  switch (a) {
    case 'ed': S.ed = b.dataset.ed; S.sel = null; buildUi(); render(false); break;
    case 'side': S.side = !S.side; buildUi(); render(false); break;
    case 'uiLang': S.ui = S.ui === 'ar' ? 'en' : 'ar'; ls.set('bw:ui', S.ui); buildUi(); render(); break;
    case 'dark': S.dark = !S.dark; ls.set('bw:dark', S.dark ? '1' : '0'); document.documentElement.dataset.bwDark = S.dark ? '1' : '0'; buildUi(); break;
    case 'undo': undo(); break;
    case 'redo': redo(); break;
    case 'duplicate': A.duplicate(); break;
    case 'delete': A.delete(); break;
    case 'moveUp': A.move(-1); break;
    case 'moveDown': A.move(1); break;
    case 'addPara': A.addPara(); break;
    case 'rowAdd': A.rowAdd(); break;
    case 'rowDel': A.rowDel(); break;
    case 'colAdd': A.colAdd(); break;
    case 'colDel': A.colDel(); break;
    case 'image': await A.image(); break;
    case 'comment': await A.comment(); break;
    case 'breakBefore': A.layout('breakBefore'); break;
    case 'keepNext': A.layout('keepNext'); break;
    case 'renumber': A.renumber(); break;
    case 'find': case 'outline': case 'check': case 'history': case 'theme': case 'pages':
      S.drawer === a ? closeDrawer() : openDrawer(a); break;
    case 'save': saveAll(); break;
    case 'saveHtml': await saveHtml(!!S.embedFonts); break;
    case 'import': { const f = await pickFile('.json,.html,application/json,text/html'); if (f) await importFile(f); break; }
    case 'exportEdits': download(`${S.svc}.edits-bundle.json`, JSON.stringify(bundle([S.svc]), null, 1)); break;
    case 'exportAll': download(`all-services.edits-bundle.json`, JSON.stringify(bundle(Object.keys(M)), null, 1)); break;
    case 'exportPdf': await exportPdfDocx(); break;
    case 'print': window.print(); break;
    case 'zoomIn': S.zoom = Math.min(2, +(S.zoom + 0.1).toFixed(2)); render(); break;
    case 'zoomOut': S.zoom = Math.max(0.4, +(S.zoom - 0.1).toFixed(2)); render(); break;
    case 'spell': S.spell[S.ed] = !S.spell[S.ed]; buildUi(); render(); break;
    default: break;
  }
}

/* ── drawers ───────────────────────────────────────────────────────────── */
function closeDrawer() { S.drawer = null; root.querySelector('.drawer').hidden = true; }
function openDrawer(kind, soft = false) {
  const d = root.querySelector('.drawer');
  if (soft && d.contains(root.activeElement)) return;
  S.drawer = kind;
  d.hidden = false;
  const head = (title) => `<header><h2>${esc(title)}</h2><button type="button" data-k="close" aria-label="${esc(t('close'))}">✕ ${esc(t('close'))}</button></header>`;
  const icon = { err: '⛔', warn: '⚠', info: 'ℹ', ok: '✓' };
  const word = { err: t('err'), warn: t('warn'), info: t('info'), ok: t('ok') };
  let html = '';
  if (kind === 'check') {
    const v = validate();
    d.setAttribute('aria-label', t('checkTitle'));
    html = head(t('checkTitle')) + (v.length ? `<ul class="list">${v.map(([lv, msg]) => `<li class="${lv}"><span class="i">${icon[lv]}</span> <b>${esc(word[lv])}</b> ${esc(msg)}</li>`).join('')}</ul>` : `<p class="ok">✓ ${esc(t('vAllGood'))}</p>`);
  } else if (kind === 'pages') {
    d.setAttribute('aria-label', t('pagesTitle'));
    html = head(t('pagesTitle')) + `<p class="hint out" role="status"></p><ol class="thumbs"></ol>`;
    setTimeout(() => loadThumbs(d), 0);
  } else if (kind === 'outline') {
    d.setAttribute('aria-label', t('outline'));
    html = head(t('outline')) + `<ol class="list nav">${cur().doc.chapters.map((ch, i) => `<li><button type="button" data-go="/chapters/${i}/title">${esc(ch.number)} ${esc(ch.title)}</button><ol>${ch.sections.map((s, j) => `<li><button type="button" data-go="/chapters/${i}/sections/${j}/title">${esc(s.number)} ${esc(s.title)}</button></li>`).join('')}</ol></li>`).join('')}</ol>`;
  } else if (kind === 'find') {
    d.setAttribute('aria-label', t('find'));
    html = head(t('find')) + `<label>${esc(t('findLabel'))}<input data-f="q" type="search"></label><label>${esc(t('replaceLabel'))}<input data-f="r" type="text"></label><p class="hint">${esc(t('foldHint'))}</p><div class="btns"><button type="button" data-k="next">${esc(t('findNext'))}</button><button type="button" data-k="all">${esc(t('replaceAll'))}</button></div><p class="out" role="status"></p>`;
  } else if (kind === 'history') {
    d.setAttribute('aria-label', t('historyTitle'));
    const e = cur();
    const st = (o) => e.status[o.id] || 'pending';
    html = head(t('historyTitle')) + `<div class="btns"><button type="button" data-k="snap">${esc(t('snapshot'))}</button><button type="button" data-k="log">${esc(t('exportLog'))}</button></div>
<ol class="list log">${e.ops.map((o, i) => `<li class="${st(o)}"><code>${esc(o.op)}</code> <span class="path">${esc(o.path)}</span>${o.op === 'setText' ? `<div class="diff"><del>${esc(o.old ?? '')}</del><ins>${esc(o.value)}</ins></div>` : ''}<div class="btns"><span class="badge">${esc(t(st(o)))}</span><button type="button" data-ok="${i}" aria-pressed="${st(o) === 'approved'}">✓ ${esc(t('approve'))}</button><button type="button" data-no="${i}" aria-pressed="${st(o) === 'rejected'}">✕ ${esc(t('reject'))}</button></div></li>`).reverse().join('')}</ol>
<h3>${esc(t('snapshot'))}</h3><ul class="list">${e.versions.map((v, i) => `<li>${esc(v.name)} <small>${esc(v.at)}</small> <button type="button" data-diff="${i}">${esc(t('diff'))}</button></li>`).join('')}</ul><div class="difftable"></div>
${e.comments.length ? `<h3>${esc(t('comment'))}</h3><ul class="list">${e.comments.map((c, i) => `<li><button type="button" data-go="${esc(c.path)}">${esc(c.text)}</button> <button type="button" data-delc="${i}" aria-label="${esc(t('delete'))}">✕</button></li>`).join('')}</ul><div class="btns"><button type="button" data-k="cexp">${esc(t('comment'))} ⬇</button></div>` : ''}`;
  } else if (kind === 'theme') {
    d.setAttribute('aria-label', t('theme'));
    const fam = DATA.fontFamilies;
    const sel = (key, val) => `<select data-font="${key}">${fam.map((f) => `<option ${f === val ? 'selected' : ''}>${esc(f)}</option>`).join('')}</select>`;
    html = head(t('theme')) + `<h3>${esc(t('font'))}</h3><label>${esc(t('fontText'))} ${sel('text', S.theme.fonts.text)}</label><label>${esc(t('fontDisplay'))} ${sel('display', S.theme.fonts.display)}</label>
<h3>${esc(t('logos'))}</h3><ul class="list">${['start', 'center', 'end', 'header'].map((k) => `<li>${S.theme.logos?.[k] ? `<img alt="" src="${esc(S.theme.logos[k])}" class="thumb">` : '<span class="thumb empty">—</span>'} ${esc(t(slotKey(k)))} <button type="button" data-logo="${k}">⬆ ${esc(t('upload'))}</button><button type="button" data-logoclr="${k}" ${S.theme.logos?.[k] ? '' : 'disabled'}>✕ ${esc(t('clear'))}</button></li>`).join('')}</ul>
<h3>${esc(t('imgWidth'))}</h3><input type="range" min="10" max="100" step="5" data-k="width" aria-label="${esc(t('imgWidth'))}" value="${(() => { const b = blockOf(S.sel?.b); return (b && get(cur().doc, b.ptr)?.width) || 100; })()}">
<label class="chk"><input type="checkbox" data-k="embed" ${S.embedFonts ? 'checked' : ''}> ${esc(t('embedFonts'))}</label>
<div class="btns"><button type="button" data-k="texp">⬇ ${esc(t('themeExport'))}</button><button type="button" data-k="timp">⬆ ${esc(t('themeImport'))}</button></div>
<h3>${esc(t('shortcuts'))}</h3><p class="hint">${esc(t('shortcutsText'))}</p>`;
  } else if (kind === 'conflicts') {
    d.setAttribute('aria-label', t('conflictTitle'));
    const opText = (o) => `${o.op} ${o.from ? `${o.from} → ` : ''}${o.path}`;
    const side = (c, k) => (c.kind === 'structure' ? c[k].map(opText).join(' · ') : JSON.stringify(c[k]));
    html = head(t('conflictTitle')) + `<ul class="list">${S.conflicts.map((c, i) => `<li data-kind="${c.kind || 'text'}"><span class="path">${esc(c.ed)} ${esc(c.path)}${c.kind === 'structure' ? ` — ${esc(t('structConflict'))}` : ''}</span><div class="diff"><div><b>${esc(t('mine'))}</b> ${esc(side(c, 'mine'))}</div><div><b>${esc(t('theirs'))}</b> ${esc(side(c, 'theirs'))}</div></div><div class="btns"><button type="button" data-mine="${i}">${esc(t('keepMine'))}</button><button type="button" data-theirs="${i}">${esc(t('keepTheirs'))}</button></div></li>`).join('')}</ul>`;
  }
  d.innerHTML = html;
  d.onclick = onDrawer;
  d.oninput = (e) => {
    if (e.target.dataset.k === 'width') A.width(e.target.value);
  };
  d.onchange = (e) => {
    if (e.target.dataset.font) { S.theme = { ...S.theme, fonts: { ...S.theme.fonts, [e.target.dataset.font]: e.target.value } }; touched(); render(); }
    if (e.target.dataset.k === 'embed') S.embedFonts = e.target.checked;
  };
  if (!soft) d.querySelector('input,button')?.focus();
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
  if (x.dataset.logo) {
    const f = await pickFile('image/png,image/jpeg,image/svg+xml');
    if (!f) return;
    const url = await readAs(f, 'url');
    if (!/^data:image\/(png|jpeg|svg\+xml);/.test(url)) { flash(t('badFile'), true); return; }
    S.theme = { ...S.theme, logos: { ...S.theme.logos, [x.dataset.logo]: url } };
    touched(); render(); openDrawer('theme');
  }
  if (x.dataset.logoclr) { S.theme = { ...S.theme, logos: { ...S.theme.logos, [x.dataset.logoclr]: '' } }; touched(); render(); openDrawer('theme'); }
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
  const slot = e.target.closest?.('#bw-pair .bw-logo-slot');
  if (slot) { openDrawer('theme'); return; }
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
  if (e.composedPath?.().some((x) => x === host)) { if (e.key === 'Escape') closeDrawer(); return; }
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

/* ── boot ──────────────────────────────────────────────────────────────── */
function boot() {
  const ov = document.createElement('div');
  ov.id = 'bw-overlay';
  ov.innerHTML = `<button type="button" class="bw-grip" hidden aria-label="${esc(t('drag'))}"><span aria-hidden="true">✥</span> ${esc(t('drag'))}</button><div class="bw-drop" hidden></div>`;
  document.body.appendChild(ov);
  overlay.grip = ov.querySelector('.bw-grip');
  overlay.drop = ov.querySelector('.bw-drop');
  overlay.grip.addEventListener('pointerdown', startDrag);
  if (WATERMARK.length) {
    const wm = document.createElement('div');
    wm.id = 'bw-watermark';
    wm.setAttribute('aria-hidden', 'true');
    wm.innerHTML = WATERMARK.map((src) => `<img alt="" src="${esc(src)}">`).join('');
    document.body.prepend(wm);
  }
  document.documentElement.dataset.bwDark = S.dark ? '1' : '0';
  buildUi();
  render(false);
  offerRecovery();
}
window.BW = { S, M, commit, setText, undo, redo, render, editsFile, bundle, importFile, saveHtml, validate, applyOps, A, selectEl, sanitizePaste, snapshotState, KEY, findNext, replaceAll };
boot();
