/* Edit scope (0.14.0, E1) — Delete says WHAT it deletes.
 * The Delete tool opens a short menu of the scopes that apply to the selection, each with its own label:
 *   this line / paragraph · this cell's content · this row · this column · this part (a story card) · this element (picture,
 *   diagram, box) · the whole block (the entity, everything in it) · the whole section.
 * Each scope is ONE undo step in both editions (a structural delete is mirrored, a cell's words are not). The Delete key on a
 * selected block still takes the whole block at once. Row / column / section / overlay are done by the editor's own tools
 * (cells ext 24, writing ext 27, OVL), so merges, widths and page sizes follow exactly as they do there.
 * Additive only: no new schema, nothing changes in the save format. */
const SCOPE = { open: null };
const SCOPE_BLOCK = A.delete; // the original whole-block delete (Del on a selected block)
const SCOPE_IC = { line: 'delete', cell: 'delete', row: 'rowDel', column: 'colDel', part: 'delete', element: 'delete', block: 'delete', section: 'secDel' };
/** What is selected, as scopesAt() reads it: the leaf, the block, an overlay, or the table cell the table tools point at. */
function scopeSel() {
  const x = typeof tableCtx === 'function' ? tableCtx() : null;
  let p = S.sel?.p || null;
  if (x && x.r >= 0 && x.c >= 0 && x.rows && (!p || !/\/rows\/\d+\/\d+$/.test(p))) p = `${x.rows}/${x.r}/${x.c}`;
  const ov = S.selOv != null && S.selOv !== false ? S.selOv : null;
  return { p, b: S.sel?.b || null, ov };
}
function scopeList() { return scopesAt(cur().doc, scopeSel()); }
/** The menu: the dialog the editor already owns, one button per scope; resolves with the scope id, or '' when dismissed. */
function scopeMenu(items) {
  const d = root.querySelector('.dialog');
  if (!d.hidden && d.bwDirty?.()) { dlgNudge(d); return Promise.resolve(''); }
  d.bwCancel?.();
  arriveEl(d);
  d.hidden = false;
  d.setAttribute('aria-label', t('scope.title'));
  d.innerHTML = `<div class="scope-menu" role="menu" aria-label="${esc(t('scope.title'))}" style="display:flex;flex-direction:column;gap:6px;min-width:260px"><strong>${esc(t('scope.title'))}</strong>${items.map((x) => `<button type="button" class="b" role="menuitem" data-scope="${x.scope}"><span class="i" aria-hidden="true">${ic(SCOPE_IC[x.scope] || 'delete')}</span><span class="w">${esc(t('scope.' + x.scope))}</span></button>`).join('')}</div><div class="btns"><button type="button" class="b" data-k="no"><span class="w">${esc(t('close'))}</span></button></div>`;
  const btns = [...d.querySelectorAll('[data-scope]')];
  btns[0]?.focus();
  return new Promise((res) => {
    const done = (v) => { d.bwDirty = null; d.bwCancel = null; leaveEl(d, () => { d.hidden = true; }); SCOPE.open = null; res(v); };
    d.bwCancel = () => done('');
    SCOPE.open = items.map((x) => x.scope);
    d.onclick = (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      done(b.dataset.scope || '');
    };
    d.onkeydown = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); done(''); return; }
      const i = btns.indexOf(document.activeElement) >= 0 ? btns.indexOf(document.activeElement) : btns.indexOf(root.activeElement);
      if (e.key === 'ArrowDown') { e.preventDefault(); btns[Math.min(btns.length - 1, i + 1)]?.focus(); }
      if (e.key === 'ArrowUp') { e.preventDefault(); btns[Math.max(0, i - 1)]?.focus(); }
    };
  });
}
/** Does one scope. Returns true when something was deleted. */
function scopeRun(scope) {
  const sel = scopeSel();
  const hit = scopesAt(cur().doc, sel).find((x) => x.scope === scope);
  if (!hit) { toast(t('scope.pick'), 'info'); return false; }
  const done = () => { toast(t('scope.done', { x: t('scope.' + scope) }), 'info'); return true; };
  if (scope === 'row') { const n = cur().ops.length; A.rowDel(); return cur().ops.length > n; }
  if (scope === 'column') { const n = cur().ops.length; A.colDel(); return cur().ops.length > n; }
  if (scope === 'section') return !!EXT.w2write?.delSection(hit.path);
  if (scope === 'element' && hit.overlay) { OVL.remove(); return true; }
  const ops = deleteOps(cur().doc, scope, sel);
  if (!ops?.length) return false;
  const was = ops.map((o) => ({ ...o }));
  commit(ops, { mirror: ops[0].op === 'delete' }); // a deleted line / part / block leaves the pair in shape; a cell's words are this edition's
  lastCell = null;
  S.sel = scope === 'line' || scope === 'cell' ? null : null;
  paintSel();
  undoToast(t('scope.done', { x: t('scope.' + scope) }), () => commit(was.map((o) => (o.op === 'delete' ? { op: 'insert', path: o.path, value: o.old } : { op: 'replace', path: o.path, value: o.old }))));
  return true;
}
/** The Delete tool: asks which scope when more than one applies. */
async function scopeDelete(force) {
  const items = scopeList();
  if (!items.length) { toast(t('scope.pick'), 'info'); return false; }
  const pick = force || (await scopeMenu(items));
  return pick ? scopeRun(pick) : false;
}
A.delete = () => { scopeDelete(); };
bwExt({
  expose: { scope: { list: scopeList, run: scopeRun, open: scopeDelete, menu: () => SCOPE.open, whole: () => SCOPE_BLOCK() } },
  on: {
    keydown: (e) => {
      if (e.key !== 'Delete' || e.ctrlKey || e.metaKey || e.altKey) return false;
      const t0 = e.composedPath?.()[0] || e.target;
      const inUi = !!e.composedPath?.().some((x) => x === host);
      const inText = !!t0.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t0.tagName || '');
      if (inText || inUi || !S.sel?.b) return false;
      e.preventDefault();
      SCOPE_BLOCK(); // Del on a selected block: the block, at once (the Delete tool and the menu ask for the smaller scopes)
      return true;
    },
  },
});
