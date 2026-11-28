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
    if (!x || x.r < 0 || x.rows === '/toc' || !rowsReady(x)) return;
    const rows = get(cur().doc, x.rows);
    const to = x.r + dir;
    if (to < 0 || to >= rows.length) return;
    const was = S.sel && { ...S.sel };
    commit([{ op: 'move', from: `${x.rows}/${x.r}`, path: `${x.rows}/${to}` }], { mirror: true });
    selFollow(`${x.rows}/${x.r}`, `${x.rows}/${to}`, was); // R4: the selection (and the row the next move uses) follows
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
        commit([{ op: 'insert', path: `/chapters/${ch}/sections/-`, value: { number: `${docNumbers(cur().doc).ch[ch]}.${c.sections.length + 1}`, title: t('newSection'), blocks: [{ kind: 'prose', paragraphs: [labelsOf().newParagraph] }] } }], { mirror: true });
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

/** R4: after a move from → to, every selection pointer under `from` is rebased onto `to`; the moved part is
 *  scrolled into view and keeps the focus ring. */
function selFollow(from, to, was) {
  if (!was) return;
  const re = (p) => (p === from ? to : p?.startsWith(`${from}/`) ? to + p.slice(from.length) : p);
  S.sel = { ...was, p: re(was.p), b: re(was.b) }; // from the selection before the commit (a render may drop a pointer that moved)
  paintSel();
  refreshUi();
  const main = mainOf(S.sel.ed);
  const el = main && (main.querySelector(`[data-b="${CSS.escape(S.sel.b || '')}"]`) || main.querySelector(`[data-p="${CSS.escape(S.sel.p || '')}"]`));
  el?.scrollIntoView({ block: 'nearest', behavior: isCalm() ? 'auto' : 'smooth' });
  const cell = S.sel.p && main?.querySelector(`[data-p="${CSS.escape(S.sel.p)}"]`)?.closest('td[data-r]');
  if (cell) lastCell = cell;
  if (S.sel.p && document.activeElement?.closest?.('#bw-pair')) main?.querySelector(`[data-p="${CSS.escape(S.sel.p)}"]`)?.focus?.({ preventScroll: true }); // a keyboard move from the page keeps the caret there
}
/* ── block actions ─────────────────────────────────────────────────────── */
const A = {
  duplicate() { const b = blockOf(S.sel?.b); if (b) { commit([{ op: 'duplicate', path: b.ptr }], { mirror: true }); S.sel.b = `${b.arr}/${b.i + 1}`; paintSel(); } },
  delete() {
    const b = blockOf(S.sel?.b);
    if (!b) return;
    const old = get(cur().doc, b.ptr);
    commit([{ op: 'delete', path: b.ptr, old }], { mirror: true });
    S.sel = null; paintSel();
    undoToast(t('ux.deletedBlock'), () => commit([{ op: 'insert', path: b.ptr, value: old }]));
  },
  /** A21: a block moves within its section, and at the first/last block into the previous/next section;
   *  a selected section heading moves the section within its chapter. R4: the selection follows the move. */
  move(d) {
    const doc = cur().doc;
    const b = blockOf(S.sel?.b);
    const sec = !b && /^\/chapters\/(\d+)\/sections\/(\d+)\/(title|number)$/.exec(S.sel?.p || '');
    const chap = !b && !sec && /^\/chapters\/(\d+)\/(title|number)$/.exec(S.sel?.p || '');
    let from = null;
    let to = null;
    if (b) {
      const n = get(doc, b.arr).length;
      from = b.ptr;
      if (b.i + d >= 0 && b.i + d < n) to = `${b.arr}/${b.i + d}`;
      else {
        const m = /^\/chapters\/(\d+)\/sections\/(\d+)\/blocks$/.exec(b.arr);
        if (!m) return;
        const flat = doc.chapters.flatMap((ch, i) => ch.sections.map((_, j) => [i, j]));
        const k = flat.findIndex(([i, j]) => i === +m[1] && j === +m[2]) + d;
        if (k < 0 || k >= flat.length) return;
        const [ci, sj] = flat[k];
        const arr = `/chapters/${ci}/sections/${sj}/blocks`;
        to = `${arr}/${d > 0 ? 0 : get(doc, arr).length}`;
      }
    } else if (sec) {
      const n = doc.chapters[+sec[1]].sections.length;
      const j = +sec[2] + d;
      if (j < 0 || j >= n) return;
      from = `/chapters/${sec[1]}/sections/${sec[2]}`;
      to = `/chapters/${sec[1]}/sections/${j}`;
    } else if (chap) {
      const j = +chap[1] + d;
      if (j < 0 || j >= doc.chapters.length) return;
      from = `/chapters/${chap[1]}`;
      to = `/chapters/${j}`;
    } else return;
    const was = S.sel && { ...S.sel };
    commit([{ op: 'move', from, path: to }], { mirror: true });
    selFollow(from, to, was);
  },
  /** Alt+↑/↓: the smallest selected unit moves: a table row, a paragraph inside its prose block, else the block. */
  moveKey(d) {
    const x = tableCtx();
    if (x && x.r >= 0 && S.sel?.p && x.rows && S.sel.p.startsWith(`${x.rows}/`)) {
      const n = get(cur().doc, x.rows)?.length || 0;
      if (x.r + d < 0 || x.r + d >= n) return;
      DESIGN.moveRow(d);
      return;
    }
    const m = /^(.*\/paragraphs)\/(\d+)$/.exec(S.sel?.p || '');
    const n = m ? get(cur().doc, m[1])?.length || 0 : 0;
    if (m && +m[2] + d >= 0 && +m[2] + d < n) {
      const from = `${m[1]}/${m[2]}`;
      const to = `${m[1]}/${+m[2] + d}`;
      const was = S.sel && { ...S.sel };
      commit([{ op: 'move', from, path: to }], { mirror: true });
      selFollow(from, to, was);
      return;
    }
    A.move(d);
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
    if (x.rows === '/toc') { A.tocAdd(x); return; }
    if (!rowsReady(x)) return;
    commit([{ op: 'insert', path: `${x.rows}/${x.r + 1}`, value: Array.from({ length: x.w || 1 }, () => '') }], { mirror: true });
  },
  rowDel() {
    const x = tableCtx();
    if (!x || x.r < 0) return;
    if (x.rows === '/toc') { A.tocHide(x); return; }
    if (!rowsReady(x)) return;
    commit([{ op: 'delete', path: `${x.rows}/${x.r}`, old: get(cur().doc, `${x.rows}/${x.r}`) }], { mirror: true });
    lastCell = null;
  },
  colAdd() {
    const x = tableCtx();
    if (!x || !x.cols || !rowsReady(x)) return;
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
  /** A25 TOC: «إضافة» inserts a new section after the row's section (a TOC entry with no section would be a lie). */
  tocAdd(x) {
    const m = /^\/chapters\/(\d+)\/sections\/(\d+)$/.exec(x.sec || '');
    if (!m) return;
    const c = cur().doc.chapters[+m[1]];
    commit([{ op: 'insert', path: `/chapters/${m[1]}/sections/${+m[2] + 1}`, value: { number: `${docNumbers(cur().doc).ch[+m[1]]}.${c.sections.length + 1}`, title: t('newSection'), blocks: [{ kind: 'prose', paragraphs: [labelsOf().newParagraph] }] } }], { mirror: true });
  },
  /** A25 TOC: «حذف من الفهرس» hides the entry only (tocHidden); the section stays in the body. */
  tocHide(x) {
    if (!/^\/chapters\/\d+\/sections\/\d+$/.test(x.sec || '')) return;
    commit([{ op: 'insert', path: `${x.sec}/tocHidden`, value: true }], { mirror: true });
  },
  async image() {
    const img = await pickImage();
    if (!img) return;
    const url = img.src;
    const b = blockOf(S.sel?.b);
    const blk = b && get(cur().doc, b.ptr);
    if (blk?.kind === 'shots') { commit([{ op: 'replace', path: `${b.ptr}/images`, value: [url], old: blk.images }]); return; }
    await OVL.add('image', img, imageAt(b)); // F2 · 18: one insert path with the dropped image, so the same seven wraps
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
    // 0.15.3 (T5): what prints is always computed from position (docNumbers). Renumber also writes those numbers into the document, in every edition,
    // so the JSON an agent reads, the outline and a manual-numbering document hold the same numbers the PDF shows (one undo step)
    const group = newGroup();
    for (const ed of Object.keys(M[S.svc])) {
      const ops = numberingOps(cur(ed).doc);
      if (ops.length) commit(ops, { ed, rerender: false, group, mirror: false });
    }
    render();
  },
};

/* ── 0.15.3 · doc lane: one-click fixes of the Check panel, also reachable through the bridge (MCP) ───────────────────────── */
const DOC153 = {
  /** T12: strip tashkeel from every edition's visible text, one undo group. @returns {number} leaves changed */
  fixTashkeel() {
    const group = newGroup();
    let n = 0;
    for (const ed of Object.keys(M[S.svc])) {
      const ops = tashkeelOps(cur(ed).doc);
      if (!ops.length) continue;
      n += ops.length;
      commit(ops, { ed, rerender: false, group, mirror: false });
    }
    if (n) render();
    return n;
  },
  /** T6: `control.editions`: 'ar' | 'en' = one language only, 'both' = a pair again. */
  singleEdition(lang) {
    const docs = Object.fromEntries(Object.keys(M[S.svc]).map((ed) => [ed, cur(ed).doc]));
    const list = singleEditionOps(docs, lang === 'ar' || lang === 'en' ? lang : 'both');
    const group = newGroup();
    for (const { ed, op } of list) commit([op], { ed, rerender: false, group, mirror: false });
    if (list.length) render();
    return list.length;
  },
  /** T7: the diagram at `ptr` (a block pointer) becomes the fewest figures that print at 7 pt or more, cut on phase / role boundaries,
   *  with «يتبع» / "continued" stubs at each cut. The other edition is cut the same way (same boundaries) so the pair keeps its shape. */
  splitFigure(ptr) {
    const m = /^(\/chapters\/\d+\/sections\/\d+)\/blocks\/(\d+)$/.exec(ptr || '');
    const bl = m && get(cur().doc, ptr);
    if (!bl || bl.kind !== 'diagram' || !bl.model) return { figures: 0, reason: 'not a diagram' };
    const mk = (ed) => ({ theme: designTheme(S.theme, cur(ed).doc), locale: ed === 'en' ? 'en' : 'ar' });
    const res = DIAGRAM.splitForLegibility(bl.model, { ...mk(S.ed), ...(bl.frame?.wMm > 0 && bl.frame?.hMm > 0 ? { frameMm: [bl.frame.wMm, bl.frame.hMm] } : {}) });
    if (!res || res.figures.length < 2) return { figures: 1, reason: 'already legible or too small to cut' };
    const group = newGroup();
    const cap = res.cap;
    const N = res.figures.length;
    const doEd = (ed, figs) => {
      const blk = get(cur(ed).doc, ptr);
      if (!blk || blk.kind !== 'diagram') return false;
      const part = (i) => (tIn('doc153.partOf', ed) || '').replace('{a}', i + 1).replace('{b}', N);
      const cap0 = textOf(blk.caption);
      const ops = [{ op: 'replace', path: ptr, value: { ...blk, caption: `${cap0} ${part(0)}`.trim(), model: figs[0].model }, old: blk }];
      for (let i = 1; i < N; i += 1) ops.push({ op: 'insert', path: `${m[1]}/blocks/${+m[2] + i}`, value: { ...blk, caption: `${cap0} ${part(i)}`.trim(), model: figs[i].model } });
      commit(ops, { ed, rerender: false, group, mirror: false });
      return true;
    };
    doEd(S.ed, res.figures);
    if (hasOther()) {
      const oe = other();
      const ob = get(cur(oe).doc, ptr);
      if (ob?.kind === 'diagram' && ob.model) {
        const figs = DIAGRAM.splitByPhase(DIAGRAM.ensure(ob.model), { maxNodes: cap, locale: mk(oe).locale, aspect: 1.5, byRole: true });
        if (figs.length === N) doEd(oe, figs);
      }
    }
    render();
    return { figures: N, minPtPrinted: res.minPtPrinted };
  },
  async fix(id, arg) {
    if (id === 'renumber') return A.renumber();
    if (id === 'fixTashkeel') return DOC153.fixTashkeel();
    if (id === 'singleEdition') return DOC153.singleEdition(arg);
    if (id === 'splitFigure') return DOC153.splitFigure(arg);
    return null;
  },
};
/** The Check panel's «one language only» control (T6): shown at the foot of the panel, AR + EN. */
function singleEditionPanel() {
  const now = editionsOf(cur().doc);
  const cur1 = now && now.length === 1 ? now[0] : 'both';
  const b = (arg, key) => `<button type="button" class="b${cur1 === arg ? ' primary' : ''}" data-fix="singleEdition" data-fix-arg="${arg}" aria-pressed="${cur1 === arg}"><span class="w">${esc(t(key))}</span></button>`;
  return `<section class="doc153-ed"><h3>${esc(t('doc153.editions'))}</h3><p class="hint">${esc(t('doc153.editionsHint'))}</p><div class="btns">${b('both', 'doc153.edBoth')}${b('ar', 'doc153.edAr')}${b('en', 'doc153.edEn')}</div></section>`;
}

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
  const right = main.right + 6, left = main.left - g.offsetWidth - 6;
  g.style.left = `${(rtl ? right : left) + window.scrollX}px`;
  // 0.15.3: a side panel (explanation, spelling) floats over the pages' right edge; a grip under it cannot be grabbed, so it takes the page's other margin
  const under = (x) => [...(host.shadowRoot?.querySelectorAll('.bw-sidepanel:not([data-slide="out"])') || [])].some((p) => { const q = p.getBoundingClientRect(); return q.width && x + g.offsetWidth > q.left && x < q.right && r.top < q.bottom && r.top + g.offsetHeight > q.top; });
  if (under(rtl ? right : left) && !under(rtl ? left : right)) g.style.left = `${(rtl ? left : right) + window.scrollX}px`;
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
const reduced = () => S.calm === true; // only the Calm button reduces motion (owner 2026-10-31); the OS setting is not read

/* ── validation ────────────────────────────────────────────────────────── */
/* 0.15.0 perf: the table-overflow check reads scrollWidth, which forces a layout; validate() runs on every refreshUi, i.e. every key.
 * The answer only changes when a table (or the page around it) changes, so it is cached and recomputed after: another main node
 * (a render), a mutation inside or around a table, a window resize or a zoom step. Typing in a paragraph no longer forces a layout. */
const TBL = { main: null, dirty: true, list: [], mo: null, zoom: 0 };
const tblTouch = (n) => { const e = n?.nodeType === 1 ? n : n?.parentElement; return !!e && (!!e.closest?.('table') || !!e.querySelector?.('table')); };
window.addEventListener('resize', () => { TBL.dirty = true; });
document.fonts?.addEventListener?.('loadingdone', () => { TBL.dirty = true; }); // a face arriving can reflow a table
function tableOverflow(main) {
  if (!main) return [];
  if (TBL.main !== main) {
    TBL.mo?.disconnect();
    TBL.main = main; TBL.dirty = true;
    TBL.mo = new MutationObserver((recs) => { if (!TBL.dirty && recs.some((r) => tblTouch(r.target) || [...r.addedNodes, ...r.removedNodes].some(tblTouch))) TBL.dirty = true; });
    TBL.mo.observe(main, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['style', 'class', 'colspan', 'rowspan', 'dir'] });
  }
  if (TBL.zoom !== S.zoom) { TBL.zoom = S.zoom; TBL.dirty = true; }
  if (!TBL.dirty) { TBL.mo.takeRecords().some((r) => tblTouch(r.target) || [...r.addedNodes, ...r.removedNodes].some(tblTouch)) && (TBL.dirty = true); }
  if (TBL.dirty) {
    TBL.dirty = false;
    TBL.list = [...main.querySelectorAll('table')].filter((tb) => tb.scrollWidth > tb.parentElement.clientWidth + 2)
      .map((tb) => ({ x: tb.querySelector('th,td')?.textContent?.slice(0, 30) || '', path: tb.dataset.b || tb.querySelector('[data-p]')?.dataset.p }));
    TBL.mo.takeRecords(); // the read itself changed nothing
  }
  return TBL.list;
}
/** Legibility of one diagram, cached by the model object (an edit replaces the model) and the theme / edition it was measured for. */
const LEG = new WeakMap();
function diagramLegibility(model, d, frame) {
  const key = `${S.ed}|${S.theme?.id || S.theme?.name || ''}|${frame ? JSON.stringify(frame) : ''}`;
  const hit = LEG.get(model);
  if (hit && hit.key === key && hit.theme === S.theme && hit.fn === DIAGRAM.legibility) return hit.r;
  let r = null;
  try { r = DIAGRAM.legibility(model, { theme: designTheme(S.theme, d), locale: S.ed, ...(frame ? { frame } : {}) }); } catch { r = null; }
  LEG.set(model, { key, theme: S.theme, fn: DIAGRAM.legibility, r });
  return r;
}
function validate() {
  const out = [];
  const d = cur().doc;
  const NUM = docNumbers(d); // 0.15.3 (T5): the numbers that print (position), never the stored ones: an auto-numbered document is never out of sequence
  d.chapters.forEach((ch, i) => {
    // only a manual-numbering document has stored numbers to get wrong
    if (NUM.manual && ch.number !== String(i + 1)) out.push(['warn', t('vNumbering', { x: `${ch.number} ${ch.title}` }), `/chapters/${i}/title`, { id: 'renumber', label: t('doc153.fixRenumber') }]);
    ch.sections.forEach((s, j) => {
      const empty = !s.blocks.length || s.blocks.every((b) => (b.kind === 'prose' && b.paragraphs.every((p) => !String(p).trim())) || (b.kind === 'table' && !b.rows.length));
      if (empty) out.push(['err', t('vEmptySection', { x: `${NUM.sec[i][j]} ${s.title}` }), `/chapters/${i}/sections/${j}/title`]);
      if (NUM.manual && ch.sections.length > 1 && s.number !== `${ch.number}.${j + 1}`) out.push(['warn', t('vNumbering', { x: `${s.number} ${s.title}` }), `/chapters/${i}/sections/${j}/title`, { id: 'renumber', label: t('doc153.fixRenumber') }]);
    });
  });
  // 0.15.3 (T12): tashkeel (U+064B to U+0652) in visible text is a warning with a one-click fix
  { const tk = tashkeelLeaves(d); if (tk.length) out.push(['warn', t('doc153.vTashkeel', { n: tk.length }), tk[0].path, { id: 'fixTashkeel', label: t('doc153.fixTashkeel') }]); }
  if (hasOther()) {
    const a = shape(cur('ar').doc);
    const b = shape(cur('en').doc);
    const n = Math.max(a.length, b.length);
    for (let i = 0; i < n; i += 1) if (a[i] !== b[i]) out.push(['err', t('vPair', { x: `${i + 1}` }), `/chapters/${Math.min(i, d.chapters.length - 1)}/title`]);
    const st = cur().stale.size;
    if (st) out.push(['warn', t('vStale', { n: st }), [...cur().stale][0]]);
  }
  for (const o of tableOverflow(mainOf(S.ed))) out.push(['warn', t('vOverflow', { x: o.x }), o.path]);
  // 0.15.0 F5: a diagram whose lettering would print too small, or overlap, once fitted into its frame (a warning, never a block)
  d.chapters.forEach((ch, ci) => ch.sections.forEach((sec, si) => sec.blocks.forEach((bl, bi) => {
    if (bl.kind !== 'diagram' || !bl.model || typeof DIAGRAM.legibility !== 'function') return;
    const r = diagramLegibility(bl.model, d);
    if (r && !r.ok) out.push(['warn', t('vLegibility', { p: `${ci + 1}.${si + 1}`, pt: r.minPtPrinted, min: r.minPt, n: r.overlaps.length }), `/chapters/${ci}/sections/${si}/blocks/${bi}`, ...(r.small.length && bl.model.nodes.length >= 6 ? [{ id: 'splitFigure', arg: `/chapters/${ci}/sections/${si}/blocks/${bi}`, label: t('doc153.fixSplit') }] : [])]);
  })));
  const fth = designTheme(S.theme, d).fonts;
  for (const f of new Set([fth.text, fth.display])) {
    const src = FONTS.sourceOf(f);
    if (src === 'project' && !document.fonts.check(`16px '${f}'`)) out.push(['err', t('vFont', { x: f }), '#design:fonts']);
    else if (src === 'local') out.push(['info', t('font.vMachine', { x: f }), '#design:fonts']);
  }
  // a label that does not print in the body is edited in the Design panel's labels group: the jump goes there
  for (const k of emptyLabels(labelsOf())) out.push(['err', t('vLabel', { x: k }), `/labels/${k}`]);
  const rej = sanitizeCss(d.design?.css).rejected;
  if (rej.length) out.push(['warn', t('vCss', { x: rej.join(' · ') }), '#design:css']);
  out.push(...reqIdCheck(d));
  // logos are placed freely (overlays) or sit in the design pack's slots: count both, flag only when there are none
  const placed = (d.overlays || []).filter((o) => o.kind === 'logo').length;
  const slotted = ['start', 'center', 'end', 'header'].filter((k) => S.theme.logos?.[k]).length;
  if (placed + slotted) out.push(['ok', t('vLogosPlaced', { n: placed + slotted }), '#logos']);
  else out.push(['info', t('vLogos', { n: 4 }), '#logos']);
  return out;
}
/** F2 · extra 9: FR- and BR- codes are unique and run 1, 2, 3 … in document order; a user story has acceptance criteria. */
/** A story has acceptance criteria in its own field or in a nested block (prose, list, table) kept under it (0.16.0). */
function storyHasCriteria(it) {
  const words = (v) => (v == null ? false : Array.isArray(v) ? v.some(words) : typeof v === 'object' ? (isRich(v) ? !!v.text.trim() : Object.entries(v).some(([k, x]) => k !== 'kind' && words(x))) : typeof v === 'string' && !!v.trim());
  return words(it.acceptance) || words(it.criteria) || words(it.blocks);
}
function reqIdCheck(d) {
  const out = [];
  const seen = { FR: new Map(), BR: new Map() };
  const want = { FR: 1, BR: 1 };
  for (const { path, value } of textLeaves(d)) {
    const m = /^\s*(FR|BR)-0*(\d{1,4})\s*$/.exec(textOf(value));
    if (!m) continue;
    const [, pre, num] = m;
    const code = `${pre}-${num.padStart(2, '0')}`;
    if (seen[pre].has(+num)) { out.push(['err', t('vReqDup', { x: code }), path]); continue; }
    seen[pre].set(+num, path);
    if (+num !== want[pre]) out.push(['warn', t('vReqSeq', { x: code, y: `${pre}-${String(want[pre]).padStart(2, '0')}` }), path]);
    want[pre] = +num + 1;
  }
  const all = blocksInOrder(d);
  for (const [bn, b] of all.entries()) {
    if (b.block?.kind !== 'stories') continue;
    // a prose or list block right after the cards, in the same section, with words, is the criteria of the last story (field notes 14)
    const nx = all[bn + 1];
    const nextHasWords = !!nx && nx.ci === b.ci && nx.si === b.si && (nx.block?.kind === 'prose' || nx.block?.kind === 'list') && storyHasCriteria({ blocks: [nx.block] });
    const n = (b.block.items || []).length;
    (b.block.items || []).forEach((it, i) => {
      if (!storyHasCriteria(it) && !(i === n - 1 && nextHasWords)) out.push(['warn', t('vNoAc', { x: it.id || it.name || `${i + 1}` }), `${b.ptr}/items/${i}/name`]);
    });
  }
  return out;
}
