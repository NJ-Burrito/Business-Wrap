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
{ const alias = { addStory: 'addPara', addOutputStory: 'addPara', addOutputsChapter: 'insChapter', storyPoint: 'rowAdd', storyCard: 'duplicate', pgBreakAdd: 'pgBreak', pgBreakDel: 'pgBreak', pgPullUp: 'moveUp', secDel: 'delete', pgEmpty: 'delete', secGaps: 'pages' };
  for (const [k, v] of Object.entries(alias)) IC[k] = IC[k] || IC[v] || IC.pages; }
const w2wBlank = (v) => !textOf(v ?? '').trim();
/** The widths (percent, summing to 100) of the house data dictionary (7 columns) and actions table (2): the constraints column is the widest and no
 *  column is narrower than its longest header word, so a typed sentence never turns into a one-word-per-line tower (UAT H2). Any other
 *  column count shares the width equally (the document's own design wins, S2). */
const W2S_WIDTHS = { 7: [16, 8.5, 14, 12.5, 16.5, 12, 20.5], 2: [34, 66] };
const w2sWidths = (n) => (W2S_WIDTHS[n] ? [...W2S_WIDTHS[n]] : null);
/** Print-order ids: when every story id of the document follows the house pattern US-nn, they read 01, 02, 03 … in print order (UAT M1). */
function w2sIdOps(doc) {
  const items = [];
  (doc.chapters || []).forEach((c, ci) => (c.sections || []).forEach((sc, si) => (sc.blocks || []).forEach((b, bi) => {
    if (b.kind === 'stories') (b.items || []).forEach((it, k) => items.push({ path: `/chapters/${ci}/sections/${si}/blocks/${bi}/items/${k}/id`, id: it.id }));
  })));
  if (!items.length || !items.every((x) => /^US-\d+$/.test(String(x.id)))) return [];
  const w = Math.max(2, String(items.length).length);
  return items.map((x, k) => ({ path: x.path, id: x.id, want: `US-${String(k + 1).padStart(w, '0')}` })).filter((x) => x.id !== x.want)
    .map((x) => ({ op: 'replace', path: x.path, value: x.want, old: x.id }));
}
/** After a structural add: the stored section numbers (an auto-numbered document) and the story ids follow the print order, in every edition,
 *  and join the add's undo step (UAT L3, M1). */
function w2sFollow(group) {
  for (const ed of Object.keys(M[S.svc])) {
    const d = cur(ed).doc;
    const ops = [...(isManualNumbering(d) ? [] : numberingOps(d)), ...w2sIdOps(d)];
    if (!ops.length) continue;
    const n0 = cur(ed).ops.length;
    commit(ops, { ed, group, mirror: false, rerender: false });
    cur(ed).ops.slice(n0).forEach((o, k) => { o.id = `${group}.n${k}`; });
  }
}
/** A placeholder title no section of this edition already has: the second one reads «… 2», the third «… 3» (UAT L4). */
function w2sFreshTitle(base, ed) {
  const have = new Set((cur(ed).doc.chapters || []).flatMap((c) => (c.sections || []).map((x) => textOf(x.title))));
  let n = 1;
  let title = base;
  while (have.has(title)) { n += 1; title = `${base} ${n}`; }
  return title;
}
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
/** 0.15.6: the house words of the story tables (editor/ext/27-writing.i18n.json; tests/story-template-0156 compares them with templates/e-service/pack.json). */
const w2sWords = (key, ed) => String(tIn(key, ed)).split('|');
/** The first `actions` / `dictionary` table (with columns) that a story of this document carries: the design the document already has. */
const w2sTables = (doc) => {
  const out = {};
  for (const c of doc.chapters || []) for (const sc of c.sections || []) for (const b of sc.blocks || []) {
    if (b.kind !== 'stories') continue;
    for (const it of b.items || []) for (const k of ['actions', 'dictionary']) if (!out[k] && Array.isArray(it[k]?.columns) && it[k].columns.length) out[k] = it[k];
  }
  return out;
};
/** A section that holds the output story: a stories block whose items have no tables, followed by a table block. */
const w2sIsOutput = (sec) => {
  const bl = sec?.blocks || [];
  const i = bl.findIndex((b) => b.kind === 'stories');
  return i >= 0 && bl.slice(i + 1).some((b) => b.kind === 'table') && bl[i].items.every((it) => !it.actions && !it.dictionary);
};
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
    // an acceptance point gets the house placeholder (…), never the prose default «New paragraph» (UAT M3)
    if (both) commit([{ op: 'insert', path: next, value: /\/acceptance\/\d+$/.test(path) ? '…' : I18N.doc[o].newParagraph }], { ed: o, mirror: false, rerender: false, group });
    commit([{ op: 'replace', path, value: head, old: leaf }, { op: 'insert', path: next, value: tail }], { ed, mirror: false, group });
    return true;
  },
  /** 0.15.6 (S1): a new user story is a numbered section of its own, in the user-stories chapter (the chapter that holds the document's
   *  `stories` blocks; one is made at the end when there is none, whatever the selection). After the selected section when the selection
   *  is inside that chapter, else at its end (ahead of a closing output story). ONE op, both editions, each in its own language.
   *  @param build (ed, number, first) => {title, blocks}; @returns the pointer of the section's `stories` block. */
  placeSection(build) {
    const d = w2doc();
    const s = w2sectionOf(S.sel?.b || S.sel?.p);
    const selCi = s ? +s.ch.split('/')[2] : -1;
    const selSi = s?.sec ? +s.sec.split('/')[4] : -1;
    const has = (c) => (c.sections || []).some((x) => (x.blocks || []).some((b) => b.kind === 'stories'));
    let ci = selCi >= 0 && d.chapters[selCi] && has(d.chapters[selCi]) ? selCi : d.chapters.findIndex(has);
    const o = other(S.ed);
    const pair = S.both && hasOther() && !!M[S.svc][o];
    let op;
    let ptr;
    if (ci < 0) {
      const at = d.chapters.length;
      const mk = (ed) => ({ number: String(at + 1), title: tIn('w2s.chapter', ed), sections: [{ number: `${at + 1}.1`, ...build(ed, `${at + 1}.1`, true) }] });
      op = { op: 'insert', path: `/chapters/${at}`, value: mk(S.ed) };
      if (pair) op.mirrorValue = mk(o);
      ptr = `/chapters/${at}/sections/0/blocks/0`;
    } else {
      const ch = d.chapters[ci];
      const secs = ch.sections || [];
      let at = selCi === ci && selSi >= 0 ? selSi + 1 : secs.length;
      if (at === secs.length && at > 0 && w2sIsOutput(secs[at - 1]) && !build.output) at -= 1; // an ordinary story goes ahead of the closing output story
      const num = `${ch.number}.${at + 1}`;
      const mk = (ed) => ({ number: num, ...build(ed, num, false) });
      op = { op: 'insert', path: `/chapters/${ci}/sections/${at}`, value: mk(S.ed) };
      if (pair) op.mirrorValue = mk(o);
      ptr = `/chapters/${ci}/sections/${at}/blocks/0`;
    }
    const group = newGroup();
    commit([op], { mirror: true, group, rerender: false });
    w2sFollow(group);
    render();
    S.sel = { b: ptr, p: null, ed: S.ed };
    paintSel();
    return ptr;
  },
  /** A new user story: ID card, acceptance list, actions table (2 house columns) and data dictionary (7), unless the document's own stories
   *  carry other columns (S2). Placeholders only. */
  addStory() {
    const id = `US-${String(w2wNextId()).padStart(2, '0')}`;
    const build = (ed, num, first) => ({
      title: w2sFreshTitle(tIn('w2s.storyTitle', ed), ed),
      blocks: [{ kind: 'stories', number: num, ...(first ? { lead: tIn('w2s.storyLead', ed) } : {}), items: [W2_WRITE.emptyStory(null, id, ed, cur(ed).doc)] }],
    });
    return W2_WRITE.placeSection(build);
  },
  /** S3: the OUTPUT story: ID card + acceptance, then an «item | value» table (output name, when issued, who receives it); no actions, no dictionary. */
  addOutputStory() {
    const id = `US-${String(w2wNextId()).padStart(2, '0')}`;
    const build = (ed, num, first) => {
      const rows = w2sWords('w2s.outputRows', ed).map((l) => [l, '…']);
      return {
        title: w2sFreshTitle(tIn('w2s.outputTitle', ed), ed),
        blocks: [
          { kind: 'stories', number: num, ...(first ? { lead: tIn('w2s.storyLead', ed) } : {}), items: [{ id, name: '…', as: '…', want: '…', so: '…', acceptance: [tIn('w2o.descText', ed), '…'] }] },
          { kind: 'table', columns: w2sWords('w2s.cols.outputCard', ed), rows },
        ],
      };
    };
    build.output = true;
    return W2_WRITE.placeSection(build);
  },
  /** 0.16.0 (spec O): the «المخرجات» / Outputs chapter, added to an older document in ONE undo step (the insert, the renumbering of any annex after it, both
   *  editions): the types and cases (one row), then the fixed and the changing part. Placeholders only; an existing chapter of that title is left alone.
   *  It goes last, ahead of a closing annex. */
  addOutputsChapter() {
    const d = w2doc();
    const head = (ed) => tIn('w2o.chapter', ed);
    if ((d.chapters || []).some((c) => textOf(c.title) === head(S.ed))) { toast(t('w2o.exists'), 'info'); return null; }
    const isAnnex = (c) => /^\s*(annex|appendix|ملحق)/i.test(textOf(c.title));
    let at = d.chapters.length;
    if (!isManualNumbering(d)) while (at > 0 && isAnnex(d.chapters[at - 1])) at -= 1;
    const mk = (ed) => {
      const n = at + 1;
      const row = (cells) => cells.map((c) => (c === null ? '…' : c));
      return {
        number: String(n),
        title: head(ed),
        sections: [
          { number: `${n}.1`, title: tIn('w2o.types', ed), blocks: [{ kind: 'table', columns: w2sWords('w2o.cols.types', ed), rows: [row([null, null, null, tIn('w2o.oneStyle', ed)])] }] },
          { number: `${n}.2`, title: tIn('w2o.fixed', ed), blocks: [{ kind: 'table', columns: w2sWords('w2o.cols.fixed', ed), rows: [row([null, null])] }] },
          { number: `${n}.3`, title: tIn('w2o.changing', ed), blocks: [{ kind: 'table', columns: w2sWords('w2o.cols.changing', ed), rows: [row([null, null, null, tIn('w2o.example', ed)])] }] },
        ],
      };
    };
    const o = other(S.ed);
    const pair = S.both && hasOther() && !!M[S.svc][o];
    const op = { op: 'insert', path: `/chapters/${at}`, value: mk(S.ed) };
    if (pair) op.mirrorValue = mk(o);
    const group = newGroup();
    commit([op], { mirror: true, group, rerender: false });
    w2sFollow(group);
    render();
    toast(t('w2o.added'), 'ok');
    return `/chapters/${at}`;
  },
  /** 0.15.1: a story's ID card is a table. One with no `card` yet prints the default (render.mjs storyCardDefault); before its first
   *  table edit it is stored: labels as plain text, `{bind}` cells that keep reading and editing the story's own fields. One op. */
  materialiseCard(ptr, ed = S.ed) {
    const sp = String(ptr).replace(/\/card(\/rows)?$/, '');
    const it = get(cur(ed).doc, sp);
    if (!it || typeof it !== 'object' || it.card) return false;
    const L = labelsOf(ed);
    const rows = storyCardDefault(it).map((r) => r.map((v) => (v.label ? textOf(L[v.label] ?? '') : { ...v })));
    commit([{ op: 'replace', path: `${sp}/card`, value: { rows, colWidths: [22, 78] }, old: undefined }], { ed, rerender: false });
    return true;
  },
  /** One empty story card. Tables: the columns of `ref` (a story the caller points at) when it has them, else those of the first story of the
   *  document that has them (S2), else the house columns, so a story never lacks a table; rows are one placeholder row (S1). */
  emptyStory(ref, id, ed = S.ed, doc = cur(ed).doc) {
    const it = { id, name: '…', as: '…', want: '…', so: '…', acceptance: ['…'] };
    const own = w2sTables(doc);
    for (const k of ['actions', 'dictionary']) {
      const c = ref?.[k]?.columns;
      const cols = Array.isArray(c) && c.length ? c : own[k]?.columns || w2sWords(`w2s.cols.${k}`, ed);
      it[k] = { columns: [...cols], rows: [cols.map(() => '…')], ...(w2sWidths(cols.length) ? { colWidths: w2sWidths(cols.length) } : {}) };
    }
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
    // the output story has no tables and its item/value table follows it: an ordinary story never goes INSIDE it; it is a section of its own ahead of it (UAT M2)
    const secPtr = m[1].replace(/\/blocks\/\d+$/, '');
    if (w2sIsOutput(get(w2doc(), secPtr))) { S.sel = { b: m[1], p: null, ed: S.ed }; return W2_WRITE.addStory(); }
    const id = `US-${String(w2wNextId()).padStart(2, '0')}`;
    const o = other(S.ed);
    const op = { op: 'insert', path: `${m[1]}/items/${+m[2] + 1}`, value: W2_WRITE.emptyStory(b.items[+m[2]], id) };
    // the other edition's card is its own: its words, the columns of its own document (S1)
    if (S.both && hasOther() && M[S.svc][o]) op.mirrorValue = W2_WRITE.emptyStory(get(cur(o).doc, `${m[1]}/items/${+m[2]}`), id, o, cur(o).doc);
    commit([op], { mirror: true });
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
const W2W_CMDS = { addStory: 'insert', addOutputStory: 'insert', addOutputsChapter: 'insert', storyPoint: 'insert', storyCard: 'insert', pgBreakAdd: 'gaps', pgBreakDel: 'gaps', pgPullUp: 'gaps', secDel: 'gaps', pgEmpty: 'gaps' };
bwExt({
  sections: [{ cat: 'gaps' }],
  cmds: Object.entries(W2W_CMDS).map(([id, group]) => ({ id, group, edit: true })),
  actions: {
    materialiseStoryCard: (ptr) => W2_WRITE.materialiseCard(ptr),
    addStory: () => { W2_WRITE.addStory(); },
    addOutputStory: () => { W2_WRITE.addOutputStory(); },
    addOutputsChapter: () => { W2_WRITE.addOutputsChapter(); },
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
      // 0.17.0 · Backspace / Delete on a clicked blank line removes that line, as in Word: the line caret (26-lines) takes its place and deletes it,
      // so both editions and one undo step come from the same code as the line caret's own Backspace / Delete (an other edition with words there is kept)
      if ((e.key === 'Backspace' || e.key === 'Delete') && !e.isComposing && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && EXT.w2lines) {
        const el = w2leafEl(e.target);
        const m = el?.isContentEditable && /^(.*\/blocks)\/(\d+)\/paragraphs\/0$/.exec(el.dataset.p || '');
        if (m && !el.textContent.trim()) {
          const ed = el.closest('main.bw-doc')?.dataset.locale || S.ed;
          const blk = get(cur(ed).doc, `${m[1]}/${m[2]}`);
          if (blk?.kind === 'prose' && !blk.id && !blk.layout && blk.paragraphs?.length === 1 && typeof blk.paragraphs[0] === 'string' && !blk.paragraphs[0].trim()) {
            e.preventDefault();
            EXT.w2lines.place(m[1], +m[2], ed);
            EXT.w2lines.del();
            return true;
          }
        }
      }
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

/* 0.15.3 (doc lane): the words of the Check panel's new findings and fixes (set at load: the base string files belong to other lanes) */
Object.assign(I18N.ui.ar, {
  'doc153.fixRenumber': 'إعادة الترقيم',
  'doc153.vTashkeel': 'تشكيل ظاهر في {n} موضع من النص (لا تشكيل في النص المرئي)',
  'doc153.fixTashkeel': 'إزالة التشكيل',
  'doc153.fixSplit': 'تقسيم هذا الرسم',
  'doc153.partOf': '(الجزء {a} من {b})',
  'doc153.editions': 'لغات الوثيقة',
  'doc153.editionsHint': 'وثيقة بلغة واحدة لا تحتاج نسخة ثانية: يتجاوز الفحص مقارنة النسختين ويحذف التصدير النسخة الفارغة.',
  'doc153.edBoth': 'نسختان (عربي وإنجليزي)',
  'doc153.edAr': 'عربي فقط',
  'doc153.edEn': 'إنجليزي فقط',
});
Object.assign(I18N.ui.en, {
  'doc153.fixRenumber': 'Renumber',
  'doc153.vTashkeel': 'Visible tashkeel (vowel marks) in {n} place(s): visible text carries none',
  'doc153.fixTashkeel': 'Remove tashkeel',
  'doc153.fixSplit': 'Split this figure',
  'doc153.partOf': '(part {a} of {b})',
  'doc153.editions': 'Document languages',
  'doc153.editionsHint': 'A document in one language needs no second edition: Check skips the pair comparison and exports leave the empty edition out.',
  'doc153.edBoth': 'Two editions (Arabic and English)',
  'doc153.edAr': 'Arabic only',
  'doc153.edEn': 'English only',
});
