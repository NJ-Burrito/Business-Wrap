/* WP2 · A18 A19 A25 — page layout «الصفحة» and the front matter made editable (0.13.0).
 * A18: doc.layout.page = {size, orientation} for the whole document, or block.layout.page on the first block of the
 *      selected section ("this section only" also resets the section after it, so only it turns).
 * A19: layout.breakBefore on the selected section (or chapter): «صفحة جديدة قبل هذا القسم»; shown as a dashed separator.
 * A25: TOC rows edit their headings (render.mjs gives them the headings' pointers); «حذف من الفهرس» = tocHidden
 *      (the section stays: Lead decision); «إضافة» = a new section after the row's section. The document control table
 *      is materialised as doc.controlTable (cells; a {bind: key} cell keeps editing /control/<key>) before its first
 *      structural edit — WP1's table toolbar calls BW.EXT.w2layout.materialiseControl() for that. */
IC.secFront = IC.secFront || IC.pages; // the front-matter section's icon
const W2L = { cell: null }; // last front-matter cell clicked: {table: 'toc'|'control'|'revisions'|'questions', r, c, sec}
const w2sectionOf = (p) => { const m = /^(\/chapters\/\d+)(\/sections\/\d+)?/.exec(p || ''); return m ? { ch: m[1], sec: m[2] ? m[1] + m[2] : null } : null; };

const W2_LAYOUT = {
  sizes: Object.keys(PAPER),
  /** A18: whole document (scope 'all') or the section holding `ptr` ('section'). */
  page(size, orientation, scope = 'all', ptr) {
    const d = w2doc();
    const value = { size, orientation };
    if (scope === 'all') {
      const lay = { ...(d.layout || {}), page: value };
      commit([{ op: 'replace', path: '/layout', value: lay, old: d.layout }], { mirror: true });
      return true;
    }
    const s = w2sectionOf(ptr || S.sel?.b || S.sel?.p);
    if (!s) { toast(t('w2.needBlock'), 'warn'); return false; }
    const secPtr = s.sec || `${s.ch}/sections/0`;
    const ops = [];
    const first = get(d, `${secPtr}/blocks/0`);
    if (!first) { toast(t('w2.needBlock'), 'warn'); return false; }
    ops.push({ op: 'replace', path: `${secPtr}/blocks/0/layout`, value: { ...(first.layout || {}), page: value }, old: first.layout });
    // the section after it goes back to the document's own page
    const order = blocksInOrder(d);
    const lastOfSec = order.filter((x) => x.ptr.startsWith(secPtr + '/')).at(-1);
    const after = order[order.indexOf(lastOfSec) + 1];
    if (after && !after.block.layout?.page) ops.push({ op: 'replace', path: `${after.ptr}/layout`, value: { ...(after.block.layout || {}), page: { ...(d.layout?.page || { size: 'A4', orientation: 'portrait' }) } }, old: after.block.layout });
    commit(ops, { mirror: true });
    return true;
  },
  /** A19: toggles a page break before the section (or chapter) holding `ptr`. */
  breakBefore(ptr, level = 'section') {
    const s = w2sectionOf(ptr || S.sel?.b || S.sel?.p);
    if (!s) { toast(t('w2.needBlock'), 'warn'); return false; }
    const at = level === 'chapter' || !s.sec ? s.ch : s.sec;
    const node = get(w2doc(), at);
    const lay = { ...(node.layout || {}) };
    if (lay.breakBefore) delete lay.breakBefore; else lay.breakBefore = true;
    commit([{ op: 'replace', path: `${at}/layout`, value: lay, old: node.layout }], { mirror: true });
    return true;
  },
  /** A25: hide a TOC entry (the section stays in the body). */
  tocHide(secPtr) {
    const node = get(w2doc(), secPtr);
    if (!node) return false;
    commit([{ op: 'replace', path: `${secPtr}/tocHidden`, value: !node.tocHidden, old: node.tocHidden }], { mirror: true });
    return true;
  },
  /** A25: a new section after the row's section (a TOC entry always has a section behind it). */
  tocAdd(secPtr) {
    const m = /^(\/chapters\/\d+)(?:\/sections\/(\d+))?/.exec(secPtr || '');
    if (!m) return false;
    const ch = get(w2doc(), m[1]);
    const at = m[2] != null ? +m[2] + 1 : ch.sections.length;
    const L = I18N.doc[S.ed];
    commit([{ op: 'insert', path: `${m[1]}/sections/${at}`, value: { number: `${ch.number}.${at + 1}`, title: L.newSection || t('w2.newSection'), blocks: [{ kind: 'prose', paragraphs: [L.newParagraph] }] } }], { mirror: true });
    return true;
  },
  /** A25: doc.controlTable from the ten fixed keys (one op); a no-op once it exists. Returns true when it made it. */
  materialiseControl(ed = S.ed) {
    const d = cur(ed).doc;
    if (d.controlTable) return false;
    const L = labelsOf(ed);
    const keys = ['documentId', 'title', 'preparedBy', 'documentType', 'classification', 'owner', 'issuedOn', 'version', 'status', 'reviewCycle'];
    commit([{ op: 'replace', path: '/controlTable', value: { columns: ['', ''], rows: keys.map((k) => [L.control[k], { bind: k }]) }, old: undefined }], { ed });
    return true;
  },
  rowAdd(table, r, cells) {
    if (table === 'control') { this.materialiseControl(); const T = w2doc().controlTable; const w = T.columns.length; commit([{ op: 'insert', path: `/controlTable/rows/${r + 1}`, value: cells || Array.from({ length: w }, () => '') }]); return true; }
    if (table === 'revisions') { commit([{ op: 'insert', path: `/revisions/${r + 1}`, value: cells || ['', ''] }], { mirror: true }); return true; }
    if (table === 'questions') { const d = w2doc(); const pre = d.openQuestions ? [] : [{ op: 'replace', path: '/openQuestions', value: [] }]; commit([...pre, { op: 'insert', path: `/openQuestions/${r + 1}`, value: { id: `Q${(d.openQuestions || []).length + 1}`, question: '…', owner: '…', blocks: '…' } }]); return true; }
    return false;
  },
  rowDel(table, r) {
    const p = { control: '/controlTable/rows', revisions: '/revisions', questions: '/openQuestions' }[table];
    if (!p) return false;
    if (table === 'control') this.materialiseControl();
    const old = get(w2doc(), `${p}/${r}`);
    if (old === undefined) return false;
    commit([{ op: 'delete', path: `${p}/${r}`, old }], { mirror: table !== 'control' });
    return true;
  },
  colAdd(table, c) {
    if (table !== 'control') return false;
    this.materialiseControl();
    const T = w2doc().controlTable;
    commit([{ op: 'insert', path: `/controlTable/columns/${c + 1}`, value: '' }, ...T.rows.map((_, r) => ({ op: 'insert', path: `/controlTable/rows/${r}/${c + 1}`, value: '' }))]);
    return true;
  },
  colDel(table, c) {
    if (table !== 'control' || c < 1) return false; // the label column stays
    this.materialiseControl();
    const T = w2doc().controlTable;
    commit([{ op: 'delete', path: `/controlTable/columns/${c}` }, ...T.rows.map((row, r) => (row.length > c ? { op: 'delete', path: `/controlTable/rows/${r}/${c}`, old: row[c] } : null)).filter(Boolean)]);
    return true;
  },
};

/** A18 on the canvas: the sheet is as wide as the paper set for it, as in the PDF and the DOCX. The whole document's paper
 *  sizes the page (and the page views' sheets, views.js); a section with its own paper (a page segment, engine/render.mjs
 *  pageModel) is drawn as its own sheet of that width, labelled with its size, in the continuous view. Screen only. */
function w2pageCss() {
  const rules = [];
  for (const ed of Object.keys(M[S.svc] || {})) {
    const d = cur(ed)?.doc;
    if (!d) continue;
    const segs = pageModel(d).segments;
    const base = segs[0].page;
    const m = `#bw-pair main.bw-doc[data-locale="${ed}"]`;
    if (d.layout?.page) rules.push(`${m}{width:${base.w}mm}`);
    for (const x of segs.slice(1)) {
      if (x.page.w === base.w && x.page.h === base.h) continue;
      const sel = `#bw-pair:not([data-pages="single"]):not([data-pages="spread"]) main.bw-doc[data-locale="${ed}"] [style="page:bw-seg-${x.n}"]`;
      const name = `${x.page.size === 'custom' ? `${x.page.w}×${x.page.h} mm` : x.page.size} · ${t(x.page.orientation === 'landscape' ? 'w2.landscape' : 'w2.portrait')}`;
      rules.push(`${sel}{box-sizing:border-box;width:${x.page.w}mm;margin-inline:calc((100% - ${x.page.w}mm) / 2);padding-inline:var(--page-side,16mm);padding-block:6mm 4mm;background:var(--paper,#fff);box-shadow:0 0 0 1px var(--rule-strong),0 12px 30px -18px rgba(0,30,61,.45);position:relative}`,
        `${sel}::after{content:${JSON.stringify(name)};position:absolute;top:1mm;inset-inline-end:3mm;font-size:7.5pt;color:var(--muted)}`);
    }
  }
  w2docCss('w2-page-css', rules.length ? `@media screen{${rules.join('')}}` : '');
}
async function w2layoutAction(id) {
  if (id === 'pgSetup') { openDrawer('w2page'); return; }
  if (id === 'pgBreak') { W2_LAYOUT.breakBefore(); return; }
  const c = W2L.cell;
  if (!c) { toast(t('w2.pickRow'), 'info'); return; }
  if (id === 'tocHide' && c.table === 'toc') W2_LAYOUT.tocHide(c.sec);
  else if (id === 'tocAdd' && c.table === 'toc') W2_LAYOUT.tocAdd(c.sec);
  else if (id === 'fmRowAdd') W2_LAYOUT.rowAdd(c.table, c.r);
  else if (id === 'fmRowDel') W2_LAYOUT.rowDel(c.table, c.r);
  else if (id === 'fmColAdd') W2_LAYOUT.colAdd(c.table, c.c);
  else if (id === 'fmColDel') W2_LAYOUT.colDel(c.table, c.c);
  else toast(t('w2.pickRow'), 'info');
}
bwExt({
  // page setup and breaks join Document; the front-matter tools are a section of their own while a front-matter cell is picked
  cmds: ['pgSetup', 'pgBreak', 'tocHide', 'tocAdd', 'fmRowAdd', 'fmRowDel', 'fmColAdd', 'fmColDel'].map((id) => ({ id, group: id.startsWith('pg') ? 'document' : 'front', edit: id !== 'pgSetup' })),
  // materialiseControl: WP1's table toolbar (editor.js tableCtx) asks it before the first structural op on the control table
  actions: { ...Object.fromEntries(['pgSetup', 'pgBreak', 'tocHide', 'tocAdd', 'fmRowAdd', 'fmRowDel', 'fmColAdd', 'fmColDel'].map((id) => [id, w2layoutAction])), materialiseControl: () => W2_LAYOUT.materialiseControl() },
  drawers: {
    w2page: () => {
      const now = w2doc().layout?.page || {};
      return {
        title: t('secPage'),
        html: `<label>${esc(t('w2.size'))} <select data-w2="size">${PAPER && Object.keys(PAPER).map((k) => `<option value="${k}"${(now.size || 'A4') === k ? ' selected' : ''}>${k}</option>`).join('')}</select></label>
<label>${esc(t('w2.orient'))} <select data-w2="orient"><option value="portrait">${esc(t('w2.portrait'))}</option><option value="landscape"${now.orientation === 'landscape' ? ' selected' : ''}>${esc(t('w2.landscape'))}</option></select></label>
<div class="btns"><button type="button" class="b primary" data-w2a="all"><span class="w">${esc(t('w2.wholeDoc'))}</span></button><button type="button" class="b" data-w2a="section"><span class="w">${esc(t('w2.thisSection'))}</span></button></div>`,
        mount: (el) => el.addEventListener('click', (e) => {
          const b = e.target.closest('[data-w2a]');
          if (!b) return;
          W2_LAYOUT.page(el.querySelector('[data-w2="size"]').value, el.querySelector('[data-w2="orient"]').value, b.dataset.w2a);
          closeDrawer();
        }),
      };
    },
  },
  expose: { w2layout: W2_LAYOUT },
  on: {
    boot: () => w2docCss('w2-layout-css', `@media screen{html.bw-ed section.bw-brk{border-top:2px dashed var(--accent-rule);padding-top:3mm;position:relative}
html.bw-ed section.bw-brk::before{content:attr(data-w2brk);position:absolute;top:-3.2mm;inset-inline-start:0;font-size:8pt;color:var(--accent);background:var(--paper,#fff);padding:0 2mm}}
@media print{html.bw-ed section.bw-brk::before{display:none}}`),
    render: () => { document.querySelectorAll('#bw-pair section.bw-brk').forEach((x) => { x.dataset.w2brk = t('w2.pageBreak'); }); w2pageCss(); },
  },
});
document.addEventListener('click', (e) => {
  const cell = e.target.closest?.('#bw-pair [data-part] td[data-r], #bw-pair [data-part] th[data-r]');
  if (!cell) return;
  const part = cell.closest('[data-part]').dataset.part;
  const table = { toc: 'toc', control: 'control', revisions: 'revisions', questions: 'questions' }[part];
  if (!table) return;
  W2L.cell = { table, r: +cell.dataset.r, c: +cell.dataset.c, sec: cell.closest('tr')?.dataset.sec || null };
  w2showSection('front', true);
});
document.addEventListener('click', (e) => {
  if (e.target.closest?.('#bw-pair main.bw-doc') && !e.target.closest('#bw-pair [data-part] td[data-r], #bw-pair [data-part] th[data-r]')) { W2L.cell = null; w2showSection('front', false); }
}, true);
