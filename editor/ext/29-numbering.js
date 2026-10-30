/* List numbering (0.14.0, E2) — «Renumber list» for numbered lists, in paragraphs and in table cells (not only the contents table).
 * Restart at 1 · continue the previous numbered list · start at a value. The choice is the paragraph's (or the cell's) own
 * `style.start` (a whole number, or 'continue'): render.mjs prints it as <ol start>, build_docx.py as a w:startOverride, so the
 * editor, the PDF and the DOCX number the same. The other edition's list at the same place follows in the same undo step.
 * Additive only: no start = 1, exactly as before. */
IC.renumList = IC.renumList || IC.fmtNumbers || IC.renumber;
const NUMB = { open: false };
/** The numbered leaf the tool acts on: the highlighted paragraph(s), else the selected paragraph / cell. */
function numbTarget() {
  const ed = S.ed;
  const tg = typeof W2F !== 'undefined' && typeof W2F.targets === 'function' ? W2F.targets() : [];
  const paths = [...tg.map((x) => x.path), S.sel?.p].filter(Boolean);
  for (const p of paths) {
    const leaf = get(cur(ed).doc, p);
    if (isNumbered(leaf)) return { path: p, ed, leaf };
  }
  return null;
}
/** Applies one choice. mode: 'restart' · 'continue' · 'set' (value). Returns true when a list was changed. */
function numbApply(mode, value, at = null) {
  const hit = at || numbTarget();
  if (!hit) { toast(t('num.pick'), 'info'); return false; }
  const ed = hit.ed || S.ed;
  const ops = renumberOps(cur(ed).doc, hit.path, mode, value);
  if (!ops.length) { if (mode === 'set' && !validStart(value)) toast(t('num.bad'), 'warn'); return false; }
  const o = other(ed);
  const mirror = S.both && hasOther() && isNumbered(get(cur(o).doc, hit.path));
  if (mirror) ops[0].mirrorValue = renumberOps(cur(o).doc, hit.path, mode, value)[0]?.value ?? get(cur(o).doc, hit.path);
  W2F.keep = true;
  commit(ops, { ed, mirror: !!mirror });
  return true;
}
function numbMenu(cur0) {
  const d = root.querySelector('.dialog');
  if (!d.hidden && d.bwDirty?.()) { dlgNudge(d); return Promise.resolve(null); }
  d.bwCancel?.();
  arriveEl(d);
  d.hidden = false;
  d.setAttribute('aria-label', t('num.title'));
  const now = Number.isInteger(cur0) ? cur0 : 1;
  d.innerHTML = `<div class="num-menu" role="group" aria-label="${esc(t('num.title'))}" style="display:flex;flex-direction:column;gap:6px;min-width:260px"><strong>${esc(t('num.title'))}</strong>
<button type="button" class="b" data-num="restart"><span class="i" aria-hidden="true">${ic('renumList')}</span><span class="w">${esc(t('num.restart'))}</span></button>
<button type="button" class="b" data-num="continue"><span class="i" aria-hidden="true">${ic('renumList')}</span><span class="w">${esc(t('num.continue'))}</span></button>
<label>${esc(t('num.set'))} <input type="number" inputmode="numeric" min="0" max="9999" step="1" value="${now}" data-num-val /></label>
<button type="button" class="b primary" data-num="set"><span class="w">${esc(t('num.setBtn'))}</span></button></div><div class="btns"><button type="button" class="b" data-k="no"><span class="w">${esc(t('close'))}</span></button></div>`;
  const val = d.querySelector('[data-num-val]');
  d.querySelector('[data-num="restart"]').focus();
  return new Promise((res) => {
    const done = (v) => { d.bwDirty = null; d.bwCancel = null; NUMB.open = false; leaveEl(d, () => { d.hidden = true; }); res(v); };
    d.bwCancel = () => done(null);
    NUMB.open = true;
    d.onclick = (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      const m = b.dataset.num;
      done(m ? { mode: m, value: m === 'set' ? val.value : undefined } : null);
    };
    d.onkeydown = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); done(null); } else if (e.key === 'Enter' && e.target === val) { e.preventDefault(); done({ mode: 'set', value: val.value }); }
    };
  });
}
async function numbAction() {
  const hit = numbTarget();
  if (!hit) { toast(t('num.pick'), 'info'); return; }
  const st = hit.leaf.style.start;
  const pick = await numbMenu(Number.isInteger(st) ? st : 1);
  if (pick) numbApply(pick.mode, pick.value, hit);
}
bwExt({
  cmds: [{ id: 'renumList', group: 'format', edit: true }],
  actions: { renumList: numbAction },
  expose: { numbering: { apply: numbApply, open: numbAction, target: numbTarget, isOpen: () => NUMB.open } },
});
