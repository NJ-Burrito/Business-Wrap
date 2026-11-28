/* Business-Wrap editor — runs on top of the print markup from engine/render.mjs.
 * Concatenated by engine/build-editor.mjs after engine/edits.mjs and
 * engine/render.mjs (exports stripped) inside one IIFE; uses their functions.
 * The editor layer lives in a Shadow DOM host (#bw-ui-host) and an overlay
 * (#bw-overlay): both are print-hidden and never written into an export.
 */
const DATA = JSON.parse(document.getElementById('bw-data').textContent);
/* 0.15.0 automation-safe start: `?automation=1` (or BW_AUTOMATION from the host-launched tab) marks the page before anything else runs,
 * so the extensions (resume dialog, first-launch card) read data-bw-automation and stay out of the way of a tool-driven tab. */
const AUTOMATION = (() => { try { return new URLSearchParams(location.search).get('automation') === '1'; } catch { return false; } })();
if (AUTOMATION) document.documentElement.dataset.bwAutomation = '1';
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
  // Save HTML carries the fonts when the page is served: its font files are server-relative (/font/…), which a saved copy cannot reach (TSYS-01)
  embedFonts: /^https?:$/.test(location.protocol),
  ui: ls.get('bw:ui') || DATA.uiLang || 'ar',
  // review2 · 34: the RTL/LTR choice is per edition (bw:dir:ar / bw:dir:en); none = the edition's own direction
  dirs: { ar: ls.get('bw:dir:ar') || null, en: ls.get('bw:dir:en') || null },
  docxFonts: ls.get('bw:docx-fonts') !== '0', // DOCX carries the fonts unless turned off // layout direction override; null = follows the language
  dark: ls.get('bw:dark') === '1',
  svc: DATA.services[0].id,
  ed: DATA.services[0].editions.ar ? 'ar' : 'en',
  side: false,
  both: true,
  zoom: 1,
  spell: { ar: ls.get('bw:spell:ar') === '1', en: ls.get('bw:spell:en') === '1' }, // per edition, remembered (0.15.0)
  theme: DATA.theme,
  sel: null, // {p, b, el}
  drawer: null,
  conflicts: [],
  dirty: false,
  savedAt: null,
};
/** S.dir = the direction chosen for the edition in view (null = its own). */
Object.defineProperty(S, 'dir', { get: () => S.dirs[S.ed] || null, set: (d) => { S.dirs[S.ed] = d || null; }, enumerable: false });
let gseq = 0;
const newGroup = () => `g${Date.now().toString(36)}${(gseq++).toString(36)}`;

/* ── model ─────────────────────────────────────────────────────────────── */
const M = {}; // M[svc][ed] = {base, raw, hash, ops, redo, status, stale:Set, comments:[], versions:[], doc}
for (const s of DATA.services) {
  M[s.id] = {};
  for (const [ed, e0] of Object.entries(s.editions)) {
    const e = migrateEdition(e0); // a saved editor HTML from an older build (0.9.x, 0.10.0): its stored fields → this schema, the file itself untouched
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
const hasOther = () => !!M[S.svc][other()] && !isSingleEdition(cur().doc); // 0.15.3: a single-edition document (control.editions: ['ar']) has no pair to mirror, shape-check or stale-mark
const liveOps = (e) => e.ops.filter((o) => e.status[o.id] !== 'rejected');
function rebuild(e) { e.doc = applyOps(e.base, liveOps(e)); return e.doc; }
for (const s of Object.values(M)) for (const e of Object.values(s)) rebuild(e);

/* ── i18n ──────────────────────────────────────────────────────────────── */
const t = (k, vars = {}) => {
  let s = I18N.ui[S.ui][k] ?? I18N.ui.en[k] ?? k;
  for (const [a, b] of Object.entries(vars)) s = s.replace(`{${a}}`, b);
  return s;
};
/** A UI string in the language of edition `ed` (what a placeholder written into that edition says, whatever the UI language is). */
const tIn = (k, ed) => I18N.ui[ed]?.[k] ?? I18N.ui.en[k] ?? k;
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
/** 0.16.0 (field notes item 3): the page is rebuilt on a change; a person typing in a block when an agent's op arrives keeps the caret (and the block stays editable), where it was in the text. */
function holdCaret() {
  const a = document.activeElement;
  const m = a && a.closest ? a.closest('#bw-pair [data-p]') : null;
  const sel = window.getSelection();
  if (!m || !sel || !sel.rangeCount) return null;
  const r = sel.getRangeAt(0);
  if (!m.contains(r.startContainer)) return null;
  const off = (node, o) => { const pre = document.createRange(); pre.selectNodeContents(m); pre.setEnd(node, o); return pre.toString().length; };
  return { p: m.dataset.p, ed: m.closest('main.bw-doc')?.dataset.locale, ce: m.getAttribute('contenteditable'), s: off(r.startContainer, r.startOffset), e: off(r.endContainer, r.endOffset) };
}
function giveCaret(c) {
  if (!c) return;
  const m = mainOf(c.ed)?.querySelector(`[data-p="${CSS.escape(c.p)}"]`);
  if (!m) return;
  if (c.ce !== null && !m.hasAttribute('contenteditable')) m.setAttribute('contenteditable', c.ce);
  try {
    m.focus({ preventScroll: true });
    const at = (n) => { const w = document.createTreeWalker(m, NodeFilter.SHOW_TEXT); let left = n, node; while ((node = w.nextNode())) { if (left <= node.length) return [node, left]; left -= node.length; } return [m, m.childNodes.length]; };
    const [a, ao] = at(Math.min(c.s, m.textContent.length));
    const [b, bo] = at(Math.min(c.e, m.textContent.length));
    const r = document.createRange(); r.setStart(a, ao); r.setEnd(b, bo);
    const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
  } catch { /* the block is gone: nothing to hold */ }
}
/** 0.16.0 (D1): the page is rebuilt in steps (innerHTML, then the zoom, the views, the pages), and between two steps the height above the viewport differs for a moment. Chrome's scroll anchoring answers each step by moving the scroll, and the moves do not cancel (+93 px on the sample, no change in the final heights). The page holds its place itself (keepScroll, S.dg, the agent hold), so anchoring is off while a render settles. */
let anchorOff = 0;
function render(keepScroll = true) {
  const rootEl = document.documentElement;
  const aoff = ++anchorOff;
  rootEl.style.overflowAnchor = 'none';
  requestAnimationFrame(() => requestAnimationFrame(() => { if (aoff === anchorOff) rootEl.style.removeProperty('overflow-anchor'); }));
  const y = window.scrollY;
  const caret = holdCaret();
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
  pair.querySelectorAll('main.bw-doc').forEach((m) => { const d = S.dirs[m.dataset.locale]; if (d) m.dir = d; }); // view only, per edition; exports keep the edition's direction
  document.documentElement.lang = S.ed;
  document.documentElement.dir = LAYOUT_DIR; // the layout never flips (0.10.0): only the words' direction follows S.dir / the language
  document.documentElement.style.setProperty('--bw-zoom', String(S.zoom));
  decorate();
  if (keepScroll) window.scrollTo(0, y);
  giveCaret(caret);
  if (keepScroll) window.scrollTo(0, y); // focusing a block must not move the page
  restoreSel();
  refreshUi();
  dgZoomAll();
  if (S.dg) dgPaint();
  viewsApply();
  zoomPillSync();
  viewPct();
  emit('render');
}
function mainOf(ed) {
  return document.querySelector(`#bw-pair main.bw-doc[data-locale="${ed}"]`);
}
function decorate() {
  for (const ed of ['ar', 'en']) {
    const main = mainOf(ed);
    if (!main) continue;
    const e = cur(ed);
    // 0.15.0 seam: the spelling extension (35-spell.js) exposes EXT.spell = { owns(ed) } when its own checker is marking this edition, so the browser's red lines do not double it
    main.setAttribute('spellcheck', S.spell[ed] && !EXT.spell?.owns?.(ed) ? 'true' : 'false');
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

/* ── extension seam (0.13.0): editor/ext/*.js register through bwExt; the contract is editor/ext/README.md ── */
const EXT = { cmds: [], sections: [], actions: {}, drawers: {}, settings: [], status: null, guards: [],
  on: { boot: [], commit: [], render: [], save: [], saveHtml: [], beforeExport: [], export: [], pagehide: [], open: [], keydown: [], spell: [] } };
function bwExt(def = {}) {
  for (const c of def.cmds || []) { const x = { group: 'document', edit: false, ...c }; EXT.cmds.push(x); CMDS.push(x); }
  for (const x of def.sections || []) { EXT.sections.push(x); if (!GENERAL_GROUPS.includes(x.cat)) GENERAL_GROUPS.push(x.cat); }
  Object.assign(EXT.actions, def.actions);
  Object.assign(EXT.drawers, def.drawers);
  EXT.settings.push(...(def.settings || []));
  EXT.guards.push(...(def.guards || []));
  if (def.status) EXT.status = def.status;
  for (const [ev, f] of Object.entries(def.on || {})) {
    if (!EXT.on[ev]) throw new Error(`bwExt: unknown event "${ev}"`);
    EXT.on[ev].push(...[].concat(f));
  }
  Object.assign(EXT, def.expose); // named services for other extensions, e.g. EXT.ledger
  if (window.BW?.ready && (def.cmds?.length || def.sections?.length || def.status)) buildUi(); // registered after boot: patched in place
}
const emit = (ev, ...a) => EXT.on[ev].forEach((f) => { try { f(...a); } catch (e) { console.error(e); } });
/** Awaited before a server export (PDF/DOCX/print): e.g. the first export asks for the save folder (A11). */
const beforeExport = async () => { for (const f of EXT.on.beforeExport) { try { await f(); } catch (e) { console.error(e); } } };
/** Every guard is asked before a change; false or a reason string refuses it: nothing changes, the reason is toasted, the caller stops (throws). */
function guard(what, info) {
  for (const g of EXT.guards) {
    let r;
    try { r = g(what, info); } catch (e) { console.error(e); continue; }
    if (r === false || typeof r === 'string') {
      const msg = typeof r === 'string' ? r : t('ext.refused');
      toast(msg, 'warn');
      throw Object.assign(new Error(msg), { refused: true });
    }
  }
}

/* ── ops ───────────────────────────────────────────────────────────────── */
/** A structural op (the body's chapters, sections, blocks, paragraphs, rows, or the overlays) changes the pair's shape:
 *  it goes to both editions unless the caller says otherwise (mirror: false), so the editions never drift (F2 · 24). */
const STRUCT_OPS = new Set(['insert', 'delete', 'move', 'duplicate']);
const isStructural = (op) => STRUCT_OPS.has(op.op) && /^\/(chapters|overlays)(\/|$)/.test(op.from || op.path);
/** What a source pointer holds, enough to tell that the other edition holds the same thing there (kind, id). */
const sigAt = (doc, op) => {
  const p = op.op === 'move' ? op.from : op.op === 'insert' ? null : op.path;
  if (!p) return null;
  const v = get(doc, p);
  return v === undefined ? 'none' : v && typeof v === 'object' && !Array.isArray(v) ? `o:${v.kind || ''}` : Array.isArray(v) ? 'a' : 'v';
};
const pairShape = () => (hasOther() ? JSON.stringify(shape(cur('ar').doc)) === JSON.stringify(shape(cur('en').doc)) : true);
function commit(ops, { ed = S.ed, rerender = true, group = newGroup(), mirror = 'auto', k0 = 0 } = {}) { // k0: the first op's number in its group (a batch applied op by op keeps g.0 g.1 …)
  guard('commit', { ops, ed });
  const e = cur(ed);
  const paired = ops.some(isStructural) && hasOther() && pairShape(); // only a structural op can change the pair's shape
  const sigs = [];
  // an op may carry `mirrorValue`: what the OTHER edition gets instead of a verbatim copy (a placeholder in its own language, DOCS-02); it never enters the history
  const alt = ops.map((op) => { const v = op.mirrorValue; delete op.mirrorValue; return v; });
  ops.forEach((op, k) => {
    op.id = `${group}.${k0 + k}`;
    op.at = new Date().toISOString();
    sigs.push(sigAt(e.doc, op));
    applyOp(e.doc, op); // throws before anything is recorded if a pointer is wrong
    e.ops.push(op);
  });
  e.redo = [];
  if (mirror === 'auto') mirror = ops.some(isStructural);
  if (mirror && S.both && hasOther()) {
    const o = cur(other(ed));
    const copy = ops.map((op, k) => ({ ...JSON.parse(JSON.stringify(op)), ...(alt[k] !== undefined ? { value: JSON.parse(JSON.stringify(alt[k])) } : {}) }));
    try {
      const test = JSON.parse(JSON.stringify(o.doc));
      // the other edition must hold the same kind of thing at every source pointer: a move from a hole is refused
      copy.forEach((op, k) => { if (sigs[k] && sigAt(test, op) !== sigs[k]) throw new Error(`pair differs at ${op.from || op.path}`); applyOp(test, op); });
      copy.forEach((op, k) => { op.id = `${group}.m${k0 + k}`; applyOp(o.doc, op); o.ops.push(op); });
      o.redo = [];
    } catch { /* other edition does not have this shape — the check panel reports the pair */ }
  }
  // structural parity: a pair that matched before this commit still matches after it, or it is reported, never silent
  if (paired) {
    const ok = pairShape();
    document.documentElement.dataset.bwParity = ok ? 'ok' : 'drift';
    if (!ok) console.warn('business-wrap: the AR/EN pair drifted apart at', ops.map((x) => x.from || x.path).join(', '));
  }
  touched();
  if (rerender) render();
  emit('commit', ops, ed, 'commit');
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
  guard('setText', { path, value, ed });
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
    emit('commit', [last], ed, 'type');
  } else {
    const bg = S.batchGroup; // a multi-edit action (spelling «fix all»): every setText of it joins ONE undo group, ops g.0, g.1 …
    S.typingGroup = bg ? bg.g : newGroup();
    commit([{ op: 'setText', path, value, old }], { ed, rerender: false, group: S.typingGroup });
    if (bg) e.ops.at(-1).id = `${bg.g}.${bg.n++}`;
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
  guard('undo', { ed });
  const g = last.id.split('.')[0];
  const grp = [];
  while (e.ops.length && e.ops.at(-1).id.split('.')[0] === g) grp.unshift(e.ops.pop());
  e.redo.push(grp);
  rebuild(e);
  // a structural edit was mirrored into the other edition (ids g.m0 …): it goes with it, or the pair drifts apart
  const o = mirrorOf(ed, g, (x) => x.ops.at(-1));
  if (o) { const m = []; while (o.ops.length && o.ops.at(-1).id.split('.')[0] === g) m.unshift(o.ops.pop()); o.redo.push(m); rebuild(o); }
  touched();
  render();
  emit('commit', grp, ed, 'undo');
}
/** The other edition when its newest op (or redo group) is the mirror of group g, else null. */
function mirrorOf(ed, g, last) {
  if (!hasOther()) return null;
  const o = cur(other(ed));
  const x = o && last(o);
  return x && String(x.id).split('.')[0] === g ? o : null; // the same action's op in the other edition (a mirror g.m0, or a paired placeholder)
}
function redo(ed = S.ed) {
  const e = cur(ed);
  if (!e.redo.length) return;
  guard('redo', { ed });
  const grp = e.redo.pop();
  e.ops.push(...grp);
  rebuild(e);
  const g = grp[0]?.id.split('.')[0];
  const o = g && mirrorOf(ed, g, (x) => x.redo.at(-1)?.[0]);
  if (o) { o.ops.push(...o.redo.pop()); rebuild(o); }
  touched();
  render();
  emit('commit', grp, ed, 'redo');
}

/* ── autosave + recovery ───────────────────────────────────────────────── */
let saveTimer;
function snapshotState() {
  const out = { v: STATE_SCHEMA, at: new Date().toISOString(), theme: S.theme, svc: {} };
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
/**
 * The stored draft, migrated forward to STATE_SCHEMA (engine/edits.mjs migrateState). Before the first
 * migration the stored text is copied, byte for byte, to `bw:draft-backup:<set>:v<old>` (never overwritten),
 * then the migrated draft replaces it. A draft from a newer build is left alone and not loaded.
 */
function readDraft() {
  const raw = ls.get(KEY);
  if (!raw) return null;
  let d;
  try { d = JSON.parse(raw); } catch { return null; }
  let m;
  try { m = migrateState(d); } catch { return null; }
  if (m.from < STATE_SCHEMA || m.changed) {
    const bk = `bw:draft-backup:${DATA.setId}:v${m.from}`;
    if (ls.get(bk) == null && !ls.set(bk, raw)) return m.state; // no room for the backup: use the migrated copy in memory, keep the stored one
    ls.set(KEY, JSON.stringify(m.state));
  }
  return m.state;
}
function offerRecovery() {
  const d = readDraft();
  if (resumeAfterUpdate(d)) return; // update.js: reopened by the updater, the draft loads without asking
  if (!d) return;
  const embedded = JSON.stringify(Object.values(M).flatMap((s) => Object.values(s).map((e) => e.ops)));
  const drafted = JSON.stringify(Object.entries(d.svc || {}).flatMap(([sid, s]) => Object.entries(s).filter(([ed]) => M[sid]?.[ed]).map(([, x]) => x.ops)));
  if (drafted === embedded) return;
  document.documentElement.dataset.bwDraft = '1'; // 50-start: a reloaded tab with a draft on offer keeps the editor in view
  banner(t('restore'), [
    [t('restoreYes'), () => { loadDraft(d); render(); EXT.start?.close?.(true); }], // the banner sits above the start page: the restored draft shows
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
  emit('save');
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
  emit('open', S.svc, S.ed);
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
  const only = editionsOf(cur().doc)?.length === 1 ? editionsOf(cur().doc)[0] : null; // 0.15.3: a single-edition document saves without its empty edition
  for (const [ed, e] of Object.entries(M[S.svc]))
    if (!only || ed === only || ed === S.ed) editions[ed] = { ...s.editions[ed], name: e.name, raw: e.raw, hash: e.hash, ops: e.ops, status: e.status, stale: [...e.stale], comments: e.comments, versions: e.versions }; // ...first: an edition attribute this build does not know travels on (engine/format.mjs)
  let fontCss = DATA.fontCss;
  if (embedFonts) fontCss = await inlineFonts(fontCss);
  else fontCss = fontCss.replace(/url\(\/font\/([^)]+)\)/g, (m, enc) => `url(${decodeURIComponent(enc)})`); // not embedded: back to the file:// paths, never a dead server-relative one
  const data = { ...DATA, setId: `${DATA.setId}:${S.svc}`, services: [{ id: s.id, editions }], theme: S.theme, fontCss, uiLang: S.ui };
  emit('saveHtml', data); // an extension may add its own keys to the embedded data
  const parts = renderParts(cur().doc, { locale: S.ed, labels: I18N.doc[S.ed], theme: S.theme });
  const html = `<!doctype html>
<html lang="${S.ed}" dir="${S.ed === 'ar' ? 'rtl' : 'ltr'}"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${DATA.csp}">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(cur().doc.control.title)}</title>
${document.head.querySelector('link[rel~="icon"]')?.outerHTML || ''}
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
  // file:// (a file opened from disk) and /font/<file url> (the same fonts as engine/serve.mjs hands them to a served page, TSYS-01)
  const urls = [...css.matchAll(/url\(((?:file:|\/font\/)[^)]+)\)/g)].map((m) => m[1]);
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
  const body = { service: S.svc, locale: S.ed, folderTitle: pcFolderTitle(), doc: e.doc, theme: S.theme, embedFonts: S.docxFonts };
  if (location.protocol.startsWith('http')) {
    await beforeExport();
    try {
      const r = await fetch('/api/export', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || r.status);
      flash(t('exportDone', { x: [j.pdf, j.docx].filter(Boolean).join(' · ') }));
      emitHook('export', { pdf: !!j.pdf, docx: !!j.docx });
      emit('export', { pdf: !!j.pdf, docx: !!j.docx });
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
  S.selAt = performance.now();
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
  // the picked picture or box shows it, the free ones (.bw-ov) and the in-flow ones (.bw-ovf) alike (DOCS-06)
  // a text box counts as picked while its words hold the caret too, so a bare click shows the same look as a drag or an insert
  document.querySelectorAll('#bw-pair .bw-ov, #bw-pair .bw-ovf').forEach((x) => x.classList.toggle('bw-ov-sel', (S.selOv != null && +x.dataset.i === S.selOv) || (x.classList.contains('bw-tb') && x.contains(document.activeElement))));
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
  const cell = el.contains(lastCell) ? lastCell : document.activeElement?.closest?.('td, th') || lastCell;
  const rows = el.dataset.rows;
  // only while the selection is in this table (a cell clicked earlier must not keep the table tools on a paragraph)
  const p = S.sel?.p;
  if (!p || !(p.startsWith(`${rows}/`) || p === cell?.dataset.p || (el.contains(cell) && el.querySelector(`[data-p="${CSS.escape(p)}"]`)))) return null;
  // front matter (no block pointer): TOC rows (virtual /toc) carry the section they mirror in data-sec (render.mjs, WP2)
  const tr = cell?.closest('tr');
  const r = cell?.dataset.r != null ? +cell.dataset.r : tr ? [...tr.parentElement.children].indexOf(tr) : -1;
  return { rows, cols: el.dataset.cols || null, w: +el.dataset.w, r, c: cell?.dataset.c != null ? +cell.dataset.c : -1, b: el.dataset.b || null, sec: tr?.dataset.sec || null };
}
/** A25: a front-matter table whose rows are virtual until first edited (control table) is materialised by its owner first. */
function rowsReady(x) {
  if (Array.isArray(get(cur().doc, x.rows))) return true;
  if (x.rows === '/controlTable/rows' && EXT.actions.materialiseControl) EXT.actions.materialiseControl();
  if (/\/items\/\d+\/card\/rows$/.test(x.rows) && EXT.actions.materialiseStoryCard) EXT.actions.materialiseStoryCard(x.rows); // 0.15.1: a story's ID card is stored before its first table edit
  return Array.isArray(get(cur().doc, x.rows));
}
let lastCell = null;
