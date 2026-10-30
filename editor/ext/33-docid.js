/* Document id, one value (0.14.0, E3) — the id is the same in every place that has it, and changing any one changes all.
 * The places: the cover and the control table (they read /control/documentId), the running header (a field of it), and every
 * text instance of the id elsewhere (cells of the front matter, a revision row, a text item of the header or footer, a sentence).
 * An edit of ANY instance (or the «Document ID» tool) rewrites the others in the SAME undo step and in both editions (when the
 * other edition held the same id), and it follows every keystroke while the person types. Whole-token matches only: BW-1 is
 * not found inside BW-12. Additive only: no new schema; the PDF / DOCX read the same /control/documentId. */
const DOCID = { known: {}, grp: null, dirty: false };
const docidOf = (ed) => { const e = M[S.svc]?.[ed]; return e ? textOf(get(e.doc, '/control/documentId') ?? '').trim() : ''; };
function docidRefresh() { for (const ed of ['ar', 'en']) { const v = docidOf(ed); if (v) DOCID.known[ed] = v; } }
const docidOwn = (op) => /\.m?d\d+$/.test(String(op.id));
/** Puts an op's value on the screen at once (no re-render while typing): every shown instance of that path. */
function docidPaint(ed, op) {
  const main = mainOf(ed);
  const el = main?.querySelector(`[data-p="${CSS.escape(op.path)}"]`);
  if (el && el !== document.activeElement && !el.contains(document.activeElement) && !el.children.length) el.textContent = textOf(op.value);
}
function docidOnCommit(ops, ed, kind) {
  if (kind === 'undo' || kind === 'redo') { DOCID.grp = null; docidRefresh(); return; }
  const e = cur(ed);
  if (!e) return;
  for (const op of ops) {
    if (!op || (op.op !== 'setText' && op.op !== 'replace') || typeof op.path !== 'string' || docidOwn(op) || /^\/(labels|manual)(\/|$)/.test(op.path)) continue;
    const g = String(op.id).split('.')[0];
    const ctl = op.path === '/control/documentId';
    const grp = DOCID.grp && DOCID.grp.g === g && DOCID.grp.ed === ed ? DOCID.grp : null;
    const oldId = grp ? grp.oldId : (ctl && op.old !== undefined ? textOf(op.old).trim() : DOCID.known[ed]);
    if (!oldId) continue;
    const newId = ctl ? textOf(op.value).trim() : docIdFromEdit(textOf(op.old), textOf(op.value), oldId);
    if (!newId || (newId === oldId && !grp)) continue;
    if (grp) { // the next keystroke of the same typing: the rewritten instances follow in place (one undo step)
      for (const it of grp.items) { it.op.value = replaceId(textOf(it.op.old), oldId, newId); applyOp(cur(it.ed).doc, it.op); docidPaint(it.ed, it.op); }
      DOCID.known[ed] = newId; if (grp.other) DOCID.known[grp.other] = newId;
      DOCID.dirty = true;
      return;
    }
    const items = [];
    const mine = docIdOps(e.doc, oldId, newId, op.path).map((o, k) => Object.assign(o, { id: `${g}.d${k}`, at: new Date().toISOString() }));
    const at = e.ops.indexOf(op); // before the typed op, so the typing merge (it looks at the LAST op) keeps working
    mine.forEach((o) => { applyOp(e.doc, o); items.push({ ed, op: o }); });
    if (mine.length) e.ops.splice(at < 0 ? e.ops.length : at, 0, ...mine);
    let o2 = null;
    if (S.both && hasOther()) {
      const od = other(ed);
      if (docidOf(od) === oldId) {
        const oe = cur(od);
        const theirs = docIdOps(oe.doc, oldId, newId).map((o, k) => Object.assign(o, { id: `${g}.md${k}`, at: new Date().toISOString() }));
        theirs.forEach((o) => { applyOp(oe.doc, o); oe.ops.push(o); items.push({ ed: od, op: o }); });
        if (theirs.length) { oe.redo = []; o2 = od; }
      }
    }
    DOCID.grp = { g, ed, oldId, items, other: o2 };
    DOCID.known[ed] = newId; if (o2) DOCID.known[o2] = newId;
    DOCID.dirty = true;
    // typing (the typing group is open): paint the other places in place, the page is drawn again when the focus leaves; any other edit draws now
    if (S.typingGroup === g) items.forEach((it) => docidPaint(it.ed, it.op));
    else { DOCID.dirty = false; render(); }
    touched();
    return;
  }
}
/** «Document ID»: one prompt, one value, everywhere. */
async function docidAsk() {
  const now = docidOf(S.ed);
  const v = await ask(t('docid.prompt'), now);
  if (!v || v === now) return;
  const n = docIdInstances(cur().doc, now).length;
  setText('/control/documentId', v);
  S.typingGroup = null;
  render();
  toast(t('docid.done', { n: Math.max(1, n) }), 'ok');
}
IC.docId = IC.docId || IC.renumber || IC.pages;
bwExt({
  cmds: [{ id: 'docId', group: 'document', edit: true }],
  actions: { docId: docidAsk },
  expose: { docid: { ask: docidAsk, places: () => docIdInstances(cur().doc, docidOf(S.ed)).map((x) => x.path), id: docidOf } },
  on: {
    boot: () => {
      docidRefresh();
      // the typing is over (focus left): the page is drawn again so the header and the cover show the same id
      document.addEventListener('focusout', () => { if (DOCID.dirty) { DOCID.dirty = false; DOCID.grp = null; setTimeout(() => render(), 0); } }, true);
    },
    open: docidRefresh,
    render: docidRefresh,
    commit: docidOnCommit,
  },
});
