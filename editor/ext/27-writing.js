/* Lane B (0.13.2) — writing and layout: Enter, user-story blocks, page-gap tools.
 * Enter: in a paragraph or an acceptance point it splits the leaf at the caret into a NEW paragraph / point (the other
 *        edition gets an empty placeholder, so the pair keeps its shape); in a table cell, a list item or any other
 *        text it types a line break ("\n", printed as <br> by render.mjs makeBidi). Shift+Enter is always a line break.
 * Insert → «قصة مستخدم»: a `stories` block (the house layout the SRS prints) with empty placeholders, columns cloned
 *        from the document's own first story; «نقطة قبول» adds a point; «قصة أخرى» adds a story card to the block.
 * Page gaps: explicit add/remove of the page break at the selected section, «اسحب ما بعده لأعلى», «حذف القسم»,
 *        «إزالة الصفحات الفارغة»; deleting a block that held the section's page size hands it to the next block.
 * Additive only: no new schema, no change to the save format. */
const W2W = { focus: null };
// UI-CHROME-11: the header / footer delete tools get their own page glyph (a band at the top, or at the foot, and a cross), not the shared bin;
// rowUp, rowDown and keepNext have theirs in icons.json
{ const pg = (band, x) => `<svg aria-hidden="true" focusable="false" class="ic" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" > <rect x="4" y="3" width="16" height="18" rx="2" /> <path d="${band}" /> <path d="${x[0]}" /> <path d="${x[1]}" /> </svg>`;
  IC.hdrDelete = pg('M4 8h16', ['m9.5 12.5 5 5', 'm14.5 12.5-5 5']);
  IC.ftrDelete = pg('M4 16h16', ['m9.5 6.5 5 5', 'm14.5 6.5-5 5']); }
// icons: the house set's own glyphs, by what each tool does (tests/ux.test.mjs fails an icon-less tool)
{ const alias = { addStory: 'addPara', storyPoint: 'rowAdd', storyCard: 'duplicate', pgBreakAdd: 'pgBreak', pgBreakDel: 'pgBreak', pgPullUp: 'moveUp', secDel: 'delete', pgEmpty: 'delete', secGaps: 'pages' };
  for (const [k, v] of Object.entries(alias)) IC[k] = IC[k] || IC[v] || IC.pages; }
const w2wBlank = (v) => !textOf(v ?? '').trim();
const w2wNextId = () => [...JSON.stringify(w2doc().chapters).matchAll(/"id":"US-(\d+)"/g)].reduce((a, x) => Math.max(a, +x[1]), 0) + 1;
/** A leaf cut at n: head keeps marks up to n, tail the rest from e (default n; e > n drops the characters between), shifted; a string is just sliced. */
function w2wSplit(leaf, n, e = n) {
  if (!isRich(leaf)) { const s = textOf(leaf); return [s.slice(0, n), s.slice(e)]; }
  const m = leaf.marks || [];
  return [
    { ...leaf, text: leaf.text.slice(0, n), marks: m.map(([a, b, ...r]) => [a, Math.min(b, n), ...r]).filter(([a, b]) => b > a) },
    { ...leaf, text: leaf.text.slice(e), marks: m.map(([a, b, ...r]) => [Math.max(0, a - e), b - e, ...r]).filter(([a, b]) => b > a) },
  ];
}
const W2_WRITE = {
  /** Enter inside the leaf at `path` (caret at character n): a new paragraph / acceptance point after it. `to` = {path, n}: the
   *  highlighted range ends there (same leaf, or a later leaf of the same list): the range is removed first (TW-03). The
   *  placeholder for the other edition and the split are ONE undo step (TW-05). */
  splitAt(path, n, ed = S.ed, to = null) {
    const m = /^(.*\/(?:paragraphs|acceptance))\/(\d+)$/.exec(path);
    if (!m) return false;
    const leaf = get(cur(ed).doc, path);
    if (leaf == null || (typeof leaf === 'object' && !isRich(leaf))) return false;
    const i = +m[2];
    const tm = to && to.path !== path ? /^(.*\/(?:paragraphs|acceptance))\/(\d+)$/.exec(to.path) : null;
    const j = tm && tm[1] === m[1] && +tm[2] > i ? +tm[2] : i;
    const leaf2 = j > i ? get(cur(ed).doc, to.path) : leaf;
    if (leaf2 == null || (typeof leaf2 === 'object' && !isRich(leaf2))) return false;
    const head = w2wSplit(leaf, n)[0];
    const tail = w2wSplit(leaf2, j > i ? to.n : to?.path === path ? to.n : n)[1];
    const next = `${m[1]}/${i + 1}`;
    S.typingGroup = null;
    const group = newGroup();
    const o = other(ed);
    const both = S.both && hasOther() && Array.isArray(get(cur(o).doc, m[1]));
    // the paragraphs between the two ends go from both editions, so the pair keeps its shape
    const drop = (doc) => { const out = []; for (let k = j - 1; k > i; k -= 1) out.push({ op: 'delete', path: `${m[1]}/${k}`, old: get(doc, `${m[1]}/${k}`) }); return out; };
    W2W.focus = { path: next, ed };
    if (j > i) {
      if (both && j - i > 1) commit(drop(cur(o).doc), { ed: o, mirror: false, rerender: false, group });
      commit([{ op: 'replace', path, value: head, old: leaf }, { op: 'replace', path: to.path, value: tail, old: leaf2 }, ...drop(cur(ed).doc)], { ed, mirror: false, group });
      return true;
    }
    // the other edition keeps the same shape: an empty placeholder of its own language (silently; the render below shows both)
    if (both) commit([{ op: 'insert', path: next, value: I18N.doc[o].newParagraph }], { ed: o, mirror: false, rerender: false, group });
    commit([{ op: 'replace', path, value: head, old: leaf }, { op: 'insert', path: next, value: tail }], { ed, mirror: false, group });
    return true;
  },
  /** A new `stories` block after the selection (house layout, placeholders only). */
  addStory(where = w2after()) {
    const d = w2doc();
    let ref = null;
    (function find(o) { if (ref || !o || typeof o !== 'object') return; if (o.kind === 'stories') { ref = o; return; } for (const k in o) find(o[k]); })(d.chapters);
    const sec = get(d, where.arr.replace(/\/blocks$/, ''));
    const value = { kind: 'stories', number: sec?.number || '', items: [W2_WRITE.emptyStory(ref?.items?.[0], `US-${String(w2wNextId()).padStart(2, '0')}`)] };
    commit([{ op: 'insert', path: `${where.arr}/${where.at}`, value }], { mirror: true });
    S.sel = { b: `${where.arr}/${where.at}`, p: null, ed: S.ed };
    paintSel();
    return `${where.arr}/${where.at}`;
  },
  /** One empty story card; the tables keep the columns of `ref` (a story already in the document), rows are one placeholder row. */
  emptyStory(ref, id) {
    const sub = (t0) => (t0?.columns ? { columns: [...t0.columns], rows: [t0.columns.map(() => '…')] } : null);
    const it = { id, name: '…', as: '…', want: '…', so: '…', acceptance: ['…'] };
    const a = sub(ref?.actions), dd = sub(ref?.dictionary);
    if (a) it.actions = a;
    if (dd) it.dictionary = dd;
    return it;
  },
  /** The story item (pointer) the selection is in: from the text pointer, the selected story card, or a stories block's last item. */
  storyItem() {
    const p = S.sel?.p || '';
    const m = /^(.*\/blocks\/\d+\/items\/\d+)(?:\/|$)/.exec(p);
    if (m) return m[1];
    const el = mainOf(S.sel?.ed || S.ed)?.querySelector(`[data-p="${CSS.escape(p)}"]`)?.closest('[data-item]');
    if (el) return el.dataset.item;
    const b = S.sel?.b && get(w2doc(), S.sel.b);
    return b?.kind === 'stories' && b.items?.length ? `${S.sel.b}/items/${b.items.length - 1}` : null;
  },
  /** Item 3: one more acceptance point — after the selected one, else at the end of the story's list. */
  addPoint(item = W2_WRITE.storyItem()) {
    if (!item) { toast(t('w2w.pickStory'), 'info'); return false; }
    const st = get(w2doc(), item);
    if (!st) return false;
    if (!st.acceptance) { commit([{ op: 'replace', path: `${item}/acceptance`, value: ['…'], old: undefined }], { mirror: true }); return true; }
    const m = /\/acceptance\/(\d+)$/.exec(S.sel?.p || '');
    const at = m && (S.sel.p || '').startsWith(`${item}/`) ? +m[1] + 1 : st.acceptance.length;
    W2W.focus = { path: `${item}/acceptance/${at}`, ed: S.ed };
    commit([{ op: 'insert', path: `${item}/acceptance/${at}`, value: '…' }], { mirror: true });
    return true;
  },
  /** Item 3: another story card inside the selected stories block, after the selected one. */
  addCard() {
    const item = W2_WRITE.storyItem();
    const m = /^(.*\/blocks\/\d+)\/items\/(\d+)$/.exec(item || '');
    if (!m) { toast(t('w2w.pickStory'), 'info'); return false; }
    const b = get(w2doc(), m[1]);
    commit([{ op: 'insert', path: `${m[1]}/items/${+m[2] + 1}`, value: W2_WRITE.emptyStory(b.items[+m[2]], `US-${String(w2wNextId()).padStart(2, '0')}`) }], { mirror: true });
    return true;
  },
  /** Item 4: the page break before the selected section on / off, explicitly. */
  setBreak(on, ptr) {
    const s = w2sectionOf(ptr || S.sel?.b || S.sel?.p);
    if (!s) { toast(t('w2.needBlock'), 'warn'); return false; }
    let at = s.sec || s.ch;
    // the dashed line above a chapter's first section is the chapter's own break (DOCS-05): removing it there removes that one
    if (!on && s.sec && /\/sections\/0$/.test(s.sec) && !get(w2doc(), s.sec).layout?.breakBefore && get(w2doc(), s.ch).layout?.breakBefore) at = s.ch;
    const node = get(w2doc(), at);
    if (!!node.layout?.breakBefore === on) { toast(t(on ? 'w2w.breakHas' : 'w2w.breakNone'), 'info'); return false; }
    const lay = { ...(node.layout || {}) };
    if (on) lay.breakBefore = true; else delete lay.breakBefore;
    commit([{ op: 'replace', path: `${at}/layout`, value: lay, old: node.layout }], { mirror: true });
    return true;
  },
  /** Item 4: «pull the next content up» — the section after the selected one loses its page break (and its first block's). */
  pullUp(ptr) {
    const s = w2sectionOf(ptr || S.sel?.b || S.sel?.p);
    if (!s) { toast(t('w2.needBlock'), 'warn'); return false; }
    const d = w2doc();
    const ch = get(d, s.ch);
    const si = s.sec ? +s.sec.split('/').pop() : 0;
    let nextSec = si + 1 < ch.sections.length ? `${s.ch}/sections/${si + 1}` : null;
    const ci = +s.ch.split('/').pop();
    const nextCh = !nextSec && d.chapters[ci + 1] ? `/chapters/${ci + 1}` : null;
    if (nextCh) nextSec = `${nextCh}/sections/0`;
    if (!nextSec) { toast(t('w2w.pullNone'), 'info'); return false; }
    const ops = [];
    for (const p of [nextCh, nextSec, `${nextSec}/blocks/0`].filter(Boolean)) {
      const n = get(d, p);
      if (n?.layout?.breakBefore) { const lay = { ...n.layout }; delete lay.breakBefore; ops.push({ op: 'replace', path: `${p}/layout`, value: lay, old: n.layout }); }
    }
    if (!ops.length) return !!W2_WRITE.emptyPages(); // no break to drop: the gap is an empty page — clear what makes it
    commit(ops, { mirror: true });
    return true;
  },
  /** Item 4: «delete the section» (heading and blocks); its page size passes to the next block, the gap closes, undo restores it. */
  delSection(ptr) {
    const s = w2sectionOf(ptr || S.sel?.b || S.sel?.p);
    if (!s?.sec) { toast(t('w2w.pickSection'), 'info'); return false; }
    const d = w2doc();
    const ch = get(d, s.ch);
    if (ch.sections.length < 2) { toast(t('w2w.lastSection'), 'warn'); return false; }
    const old = get(d, s.sec);
    commit([{ op: 'delete', path: s.sec, old }], { mirror: true });
    S.sel = null; paintSel();
    undoToast(t('w2w.secDeleted'), () => commit([{ op: 'insert', path: s.sec, value: old }]));
    return true;
  },
  /** Item 4: the empty pages' makers go: blank prose / sub-heading blocks, and a page break before a section left with nothing. */
  emptyPages() {
    const d = w2doc();
    const ops = [];
    // blank prose / sub-heading, and a table with no visible text (content that is only height: empty rows, spacer cells)
    const blank = (b) => (b.kind === 'prose' && (b.paragraphs || []).every(w2wBlank)) || (b.kind === 'subhead' && w2wBlank(b.text ?? b.title))
      || (b.kind === 'table' && (b.rows || []).every((r) => r.every(w2wBlank)) && (b.columns || []).every(w2wBlank));
    d.chapters.forEach((c, ci) => c.sections.forEach((s, si) => {
      const sp = `/chapters/${ci}/sections/${si}`;
      const dead = (s.blocks || []).map((b, i) => (blank(b) ? i : -1)).filter((i) => i >= 0);
      // a section left with no blocks at all (after a delete) still starts a page: its break goes too
      if ((s.blocks || []).length === dead.length && s.layout?.breakBefore) { const lay = { ...s.layout }; delete lay.breakBefore; ops.push({ op: 'replace', path: `${sp}/layout`, value: lay, old: s.layout }); }
      for (const i of dead.reverse()) ops.push({ op: 'delete', path: `${sp}/blocks/${i}`, old: s.blocks[i] });
      // a page empty only by spacing: blank paragraphs left inside a prose block that has words (they spill onto a page of their own).
      // Gone only where the other edition's paragraph is blank too (or absent), so a mirrored delete never takes real words.
      (s.blocks || []).forEach((b, i) => {
        if (b.kind !== 'prose' || dead.includes(i)) return;
        const mirrored = S.both && hasOther(), other = mirrored ? get(cur(S.ed === 'ar' ? 'en' : 'ar').doc, `${sp}/blocks/${i}`) : null;
        const ps = b.paragraphs || [];
        for (let j = ps.length - 1; j >= 0; j -= 1) {
          if (w2wBlank(ps[j]) && (!mirrored || (other?.kind === 'prose' && w2wBlank(other.paragraphs?.[j])))) ops.push({ op: 'delete', path: `${sp}/blocks/${i}/paragraphs/${j}`, old: ps[j] });
        }
      });
    }));
    if (!ops.length) { toast(t('w2w.noEmpty'), 'info'); return 0; }
    commit(ops, { mirror: true });
    toast(t('w2w.emptyDone', { n: ops.length }), 'ok');
    return ops.length;
  },
};
const W2W_CMDS = { addStory: 'insert', storyPoint: 'insert', storyCard: 'insert', pgBreakAdd: 'gaps', pgBreakDel: 'gaps', pgPullUp: 'gaps', secDel: 'gaps', pgEmpty: 'gaps' };
bwExt({
  sections: [{ cat: 'gaps' }],
  cmds: Object.entries(W2W_CMDS).map(([id, group]) => ({ id, group, edit: true })),
  actions: {
    addStory: () => { W2_WRITE.addStory(); },
    storyPoint: () => { W2_WRITE.addPoint(); },
    storyCard: () => { W2_WRITE.addCard(); },
    pgBreakAdd: () => { W2_WRITE.setBreak(true); },
    pgBreakDel: () => { W2_WRITE.setBreak(false); },
    pgPullUp: () => { W2_WRITE.pullUp(); },
    secDel: () => { W2_WRITE.delSection(); },
    pgEmpty: () => { W2_WRITE.emptyPages(); },
  },
  expose: { w2write: W2_WRITE },
  on: {
    // a typed line break shows in the page at once (the print path has <br>; the editor's leaf keeps its newline until its next render)
    boot: () => w2docCss('w2w-css', 'html.bw-ed #bw-pair :is(span, td, th, p, li, h1, h2, h3, h4, caption, bdi)[data-p] { white-space: pre-line !important; }'),
    keydown: (e) => {
      if (e.key !== 'Enter' || e.isComposing || e.ctrlKey || e.metaKey || e.altKey) return false;
      const el = w2leafEl(e.target);
      if (!el || !el.isContentEditable) return false;
      const ed = el.closest('main.bw-doc').dataset.locale;
      const lineBreak = () => { e.preventDefault(); document.execCommand('insertText', false, '\n'); return true; };
      if (e.shiftKey) return lineBreak();
      const s = getSelection();
      if (/\/(paragraphs|acceptance)\/\d+$/.test(el.dataset.p) && s.rangeCount && el.contains(s.anchorNode)) {
        e.preventDefault();
        // the range is read BEFORE anything is removed: the document drops it (TW-03), the DOM is redrawn by the commit
        const r = s.getRangeAt(0);
        const aEl = w2leafEl(r.startContainer), zEl = w2leafEl(r.endContainer);
        const isPara = (x) => x && /\/(paragraphs|acceptance)\/\d+$/.test(x.dataset.p) && x.closest('main.bw-doc').dataset.locale === ed;
        const from = isPara(aEl) ? aEl : el;
        const at = w2offset(from, from === aEl ? r.startContainer : s.anchorNode, from === aEl ? r.startOffset : s.anchorOffset);
        const to = s.isCollapsed || !isPara(zEl) ? null : { path: zEl.dataset.p, n: w2offset(zEl, r.endContainer, r.endOffset) };
        return W2_WRITE.splitAt(from.dataset.p, at, ed, to) || true;
      }
      if (el.closest('td, th, li')) return /^\s*=/.test(el.textContent) && !el.closest('li') ? false : lineBreak(); // a formula typed in a cell (lane A) still commits on Enter
      return false; // titles and other one-line leaves: Enter still commits and leaves
    },
    render: () => {
      const f = W2W.focus;
      W2W.focus = null;
      const el = f && mainOf(f.ed)?.querySelector(`[data-p="${CSS.escape(f.path)}"]`);
      if (!el) return;
      el.contentEditable = 'plaintext-only';
      el.focus({ preventScroll: true });
      const r = document.createRange();
      r.selectNodeContents(el); r.collapse(true);
      getSelection().removeAllRanges(); getSelection().addRange(r);
      el.scrollIntoView({ block: 'nearest' });
    },
    // a deleted block or section that held the page size of its pages: the block that FOLLOWS it in reading order takes it, in both
    // editions, so the following pages do not turn (DOCS-01); the hand-over joins the delete's undo step
    commit: (ops, ed, kind) => {
      if (kind !== 'commit' || ops.length !== 1 || ops[0].op !== 'delete') return;
      const [op] = ops;
      const page = op.old?.layout?.page || op.old?.blocks?.[0]?.layout?.page;
      const m = page && /^\/chapters\/(\d+)\/sections\/(\d+)(?:\/blocks\/(\d+))?$/.exec(op.path);
      if (!m) return;
      const key = [+m[1], +m[2], m[3] == null ? 0 : +m[3]];
      const g = String(op.id).split('.')[0];
      const after = (x) => x.ci - key[0] || x.si - key[1] || x.bi - key[2]; // first block at or behind the deleted position
      for (const e2 of [ed, ...(S.both && hasOther() ? [other(ed)] : [])]) {
        const nx = blocksInOrder(cur(e2).doc).find((x) => after(x) >= 0);
        if (!nx || nx.block.layout?.page) continue;
        const n0 = cur(e2).ops.length;
        commit([{ op: 'replace', path: `${nx.ptr}/layout`, value: { ...(nx.block.layout || {}), page }, old: nx.block.layout }], { ed: e2, mirror: false, rerender: e2 === ed });
        cur(e2).ops.slice(n0).forEach((o, k) => { o.id = `${g}.${e2 === ed ? 'f' : 'mf'}${k}`; });
      }
    },
  },
});
