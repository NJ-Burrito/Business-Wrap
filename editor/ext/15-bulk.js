/* H1 bulk edit «تعديل جماعي» (0.13.1). One change — add, delete or edit a field (table row), a section, or any text —
 * on a whole project (13-projects) or on documents picked by hand, across projects. Each document is matched by a stable
 * anchor (section number or heading, field label), never by position (BULK in engine/bulk.mjs, concatenated before the
 * extensions); the AR and EN editions change in step or not at all. Preview first (per document: will change, already
 * so, not found, conflict, locked); Apply = one commit group per document (its own provenance + timeline entries through
 * the normal commit event, its library entry saved), one undo per document. Documents not picked are never opened;
 * locked ones are skipped and listed. */
const BK = { last: {}, rows: [], picked: new Set(), form: { op: 'addField' }, key: '', busy: false };
const BK_FIELDS = {
  addField: ['section', 'after', 'labelAr', 'labelEn', 'valueAr', 'valueEn'],
  deleteField: ['field', 'section'],
  editField: ['field', 'section', 'valueAr', 'valueEn', 'labelAr', 'labelEn'],
  addSection: ['chapter', 'after', 'titleAr', 'titleEn', 'textAr', 'textEn'],
  deleteSection: ['section'],
  editSection: ['section', 'titleAr', 'titleEn'],
  replaceText: ['findAr', 'findEn', 'replaceAr', 'replaceEn', 'section'],
};
const bkPair = (f, k) => { const ar = String(f[`${k}Ar`] ?? '').trim(), en = String(f[`${k}En`] ?? '').trim(); return ar || en ? { ar: ar || en, en: en || ar } : undefined; };
/** The form → a BULK spec. */
function bkSpec(f = BK.form) {
  const s = (k) => { const v = String(f[k] ?? '').trim(); return v || undefined; };
  const want = new Set(BK_FIELDS[f.op] || []);
  const spec = { op: f.op };
  for (const k of ['section', 'field', 'chapter', 'after']) if (want.has(k) && s(k)) spec[k] = s(k);
  for (const k of ['label', 'value', 'title', 'text', 'find', 'replace']) if (want.has(`${k}Ar`) && bkPair(f, k)) spec[k] = bkPair(f, k);
  return spec;
}
const bkLocked = (id, e) => !!(EXT.lock?.of?.(id)?.locked || e?.lock?.locked);
/** A document's editions as they are now: the open session's, else its library entry replayed. */
async function bkState(id) {
  if (M[id]) return Object.fromEntries(Object.entries(M[id]).map(([ed, e]) => [ed, e.doc]));
  const e = await EXT.library.get(id);
  if (!e?.editions) return null;
  return Object.fromEntries(Object.entries(e.editions).map(([ed, x]) => [ed, applyOps(JSON.parse(x.raw), (x.ops || []).filter((o) => x.status?.[o.id] !== 'rejected'))]));
}
/** Per document: {id, title, status, reason, where}; nothing is changed. */
async function bkPreview(ids, spec = bkSpec()) {
  const rows = [];
  for (const id of ids) {
    const e = await EXT.library.get(id);
    const base = { id, title: e?.title || id, project: EXT.projects?.of(id) || null };
    if (!e || e.deletedAt) { rows.push({ ...base, status: 'notfound', reason: 'doc' }); continue; }
    if (bkLocked(id, e)) { rows.push({ ...base, status: 'locked' }); continue; }
    const eds = await bkState(id);
    const p = eds ? BULK.plan(eds, spec) : { status: 'notfound', reason: 'doc' };
    rows.push({ ...base, status: p.status, reason: p.reason || '', where: p.where || '', n: Object.values(p.ops || {}).reduce((a, o) => a + o.length, 0) });
  }
  return rows;
}
/** Back to the document that was on screen before the run (a template has no library entry to open). */
async function bkBack(o) {
  if (S.svc === o.svc) return;
  if (EXT.library.isDoc(o.svc)) { await EXT.library.open(o.svc, o.ed); return; }
  if (!M[o.svc]) return;
  S.svc = o.svc; S.ed = M[o.svc][o.ed] ? o.ed : Object.keys(M[o.svc])[0]; S.sel = null; S.doc = null;
  document.documentElement.dataset.bwDoc = '';
  if (/[#&]doc=/.test(location.hash)) history.replaceState(history.state, '', location.pathname + location.search);
  buildUi(); render(false); emit('open', S.svc, S.ed);
}
/** Applies the spec to each document: one commit group per document (primary edition g, the other g.m: one undo takes both). */
async function bkApply(ids, spec = bkSpec()) {
  if (BK.busy) return null;
  BK.busy = true;
  const o = { svc: S.svc, ed: S.ed };
  const rows = [];
  try {
    for (const id of ids) {
      const [pre] = await bkPreview([id], spec);
      if (pre.status !== 'change') { rows.push(pre); continue; }
      try {
        await EXT.library.open(id);
        const p = BULK.plan(Object.fromEntries(Object.entries(M[id]).map(([ed, e]) => [ed, e.doc])), spec);
        if (p.status !== 'change') { rows.push({ ...pre, status: p.status, reason: p.reason || '' }); continue; }
        const eds = Object.keys(p.ops).filter((ed) => p.ops[ed].length);
        const g = newGroup();
        commit(p.ops[eds[0]], { ed: eds[0], group: g, mirror: false, rerender: false });
        try { for (const ed of eds.slice(1)) commit(p.ops[ed], { ed, group: `${g}.m`, mirror: false, rerender: false }); }
        catch (err) { undo(eds[0]); throw err; } // never one edition without the other
        EXT.timeline?.mark?.('bulk', `${t('bulkEdit')}: ${t(`bkOp_${spec.op}`)}`, M[id][eds[0]]); // «التغييرات» shows where it came from
        document.documentElement.dataset.bwParity = pairShape() ? 'ok' : 'drift';
        render(false);
        BK.last[id] = { g, ed: eds[0], at: new Date().toISOString(), op: spec.op };
        await EXT.library.persist(id);
        rows.push({ ...pre, status: 'done' });
      } catch (err) {
        if (!err?.refused) console.error('bulk', id, err);
        rows.push({ ...pre, status: err?.refused ? 'locked' : 'error', reason: String(err?.message || err).slice(0, 120) });
      }
    }
  } finally {
    await bkBack(o).catch(() => {});
    await EXT.ledger?.ready?.();
    BK.busy = false;
  }
  const n = (st) => rows.filter((r) => r.status === st).length;
  toast(t('bkDone', { done: n('done'), skip: rows.length - n('done') }), n('done') ? 'ok' : 'warn');
  document.documentElement.dataset.bwBulk = String((+document.documentElement.dataset.bwBulk || 0) + 1);
  return rows;
}
/** Undoes one document's bulk change (and only while it is still that document's newest change). */
async function bkUndo(id) {
  const r = BK.last[id];
  if (!r || BK.busy) return false;
  const o = { svc: S.svc, ed: S.ed };
  let ok = false;
  try {
    if (!(await EXT.library.open(id))) return false;
    const e = M[id]?.[r.ed];
    if (e?.ops.at(-1)?.id.split('.')[0] !== r.g) { toast(t('bkUndoLater'), 'warn'); return false; }
    undo(r.ed);
    delete BK.last[id];
    await EXT.library.persist(id);
    ok = true;
  } catch (err) { if (!err?.refused) console.error('bulk undo', err); } finally { await bkBack(o).catch(() => {}); await EXT.ledger?.ready?.(); }
  return ok;
}

/* the drawer */
const bkIn = (k, label, wide = false) => `<label class="bk-fld${wide ? ' wide' : ''}" data-for="${esc(k)}"><span>${esc(t(label))}</span><input type="text" data-bk-f="${esc(k)}" value="${esc(BK.form[k] || '')}" dir="${/Ar$/.test(k) ? 'rtl' : /En$/.test(k) ? 'ltr' : 'auto'}"></label>`;
function bkForm() {
  return `<label class="bk-fld wide"><span>${esc(t('bkOp'))}</span><select data-bk-f="op">${BULK.OPS.map((k) => `<option value="${k}"${BK.form.op === k ? ' selected' : ''}>${esc(t(`bkOp_${k}`))}</option>`).join('')}</select></label>
${bkIn('section', 'bkSection', true)}${bkIn('chapter', 'bkChapter', true)}${bkIn('field', 'bkField', true)}${bkIn('after', 'bkAfter', true)}
${bkIn('labelAr', 'bkLabelAr')}${bkIn('labelEn', 'bkLabelEn')}${bkIn('valueAr', 'bkValueAr')}${bkIn('valueEn', 'bkValueEn')}
${bkIn('titleAr', 'bkTitleAr')}${bkIn('titleEn', 'bkTitleEn')}${bkIn('textAr', 'bkTextAr')}${bkIn('textEn', 'bkTextEn')}
${bkIn('findAr', 'bkFindAr')}${bkIn('findEn', 'bkFindEn')}${bkIn('replaceAr', 'bkReplaceAr')}${bkIn('replaceEn', 'bkReplaceEn')}`;
}
function bkShowFields(d) {
  const want = new Set(BK_FIELDS[BK.form.op] || []);
  d.querySelectorAll('[data-for]').forEach((el) => { el.hidden = !want.has(el.dataset.for); });
}
async function bkFillList(d) {
  const box = d.querySelector('.bk-list');
  if (!box) return;
  const all = ((await EXT.library.all()) || []).filter((e) => e.kind !== 'template' && !e.deletedAt).sort((a, b) => String(a.title).localeCompare(String(b.title)));
  const P = EXT.projects;
  const groups = [...(P ? P.live().map((p) => [p.id, p.name]) : []), ['-', t('pjNone')]];
  const ids = new Set(all.map((e) => e.id));
  for (const id of [...BK.picked]) if (!ids.has(id)) BK.picked.delete(id);
  box.innerHTML = groups.map(([pid, name]) => {
    const docs = all.filter((e) => (P?.of(e.id) || '-') === pid);
    if (!docs.length) return '';
    return `<details class="bk-g" open data-bk-g="${esc(pid)}"><summary><label><input type="checkbox" data-bk-pj="${esc(pid)}"> <b>${esc(name)}</b> · ${docs.length}</label></summary><ul class="bk-docs">${docs.map((e) => `<li><label><input type="checkbox" data-bk-doc="${esc(e.id)}"${BK.picked.has(e.id) ? ' checked' : ''}> ${esc(e.title)}${bkLocked(e.id, e) ? ` <small class="bk-lk">${esc(t('bkSt_locked'))}</small>` : ''}</label></li>`).join('')}</ul></details>`;
  }).join('') || `<p class="hint">${esc(t('libEmpty'))}</p>`;
  bkTicks(d);
}
function bkTicks(d) {
  d.querySelectorAll('[data-bk-pj]').forEach((c) => {
    const docs = [...c.closest('.bk-g').querySelectorAll('[data-bk-doc]')];
    const n = docs.filter((x) => x.checked).length;
    c.checked = n > 0 && n === docs.length;
    c.indeterminate = n > 0 && n < docs.length;
  });
  const n = BK.picked.size;
  const c = d.querySelector('.bk-n');
  if (c) c.textContent = t('bkPicked', { n });
  d.dataset.bkPicked = String(n);
  const apply = d.querySelector('[data-bk="apply"]');
  if (apply) apply.disabled = !BK.rows.length || BK.key !== bkKey() || !BK.rows.some((r) => r.status === 'change');
}
const bkKey = () => JSON.stringify([bkSpec(), [...BK.picked].sort()]);
function bkTable(d) {
  const out = d.querySelector('.bk-out');
  if (!out) return;
  const names = Object.fromEntries((EXT.projects?.live() || []).map((p) => [p.id, p.name]));
  const count = (st) => BK.rows.filter((r) => r.status === st).length;
  for (const st of ['change', 'same', 'notfound', 'conflict', 'locked', 'done', 'error']) d.dataset[`bk${st[0].toUpperCase()}${st.slice(1)}`] = String(count(st));
  out.innerHTML = BK.rows.length ? `<p class="bk-sum">${['change', 'done', 'same', 'notfound', 'conflict', 'locked', 'error'].filter(count).map((st) => `<span class="bk-st" data-st="${st}">${esc(t(`bkSt_${st}`))} · ${count(st)}</span>`).join(' ')}</p>
<table class="bk-res"><thead><tr><th>${esc(t('bkDoc'))}</th><th>${esc(t('pjTitle'))}</th><th>${esc(t('bkStatus'))}</th><th>${esc(t('bkWhere'))}</th><th></th></tr></thead><tbody>${BK.rows.map((r) => `<tr data-id="${esc(r.id)}" data-st="${esc(r.status)}"><td>${esc(r.title)}</td><td>${esc(names[r.project] || t('pjNone'))}</td><td><span class="bk-st" data-st="${esc(r.status)}">${esc(t(`bkSt_${r.status}`))}</span></td><td>${esc(r.reason && r.status !== 'change' && r.status !== 'done' ? t(`bkR_${r.reason}`) === `bkR_${r.reason}` ? r.reason : t(`bkR_${r.reason}`) : r.where || '')}</td><td>${r.status === 'done' && BK.last[r.id] ? `<button type="button" class="b" data-bk="undo"><span class="i">${ic('undo')}</span><span class="w">${esc(t('bkUndo'))}</span></button>` : ''}</td></tr>`).join('')}</tbody></table>` : '';
  bkTicks(d);
}
function bkDrawer() {
  return {
    title: t('bkTitle'),
    html: `<div class="bk"><fieldset class="bk-targets"><legend>${esc(t('bkTargets'))}</legend><p class="hint bk-n"></p><div class="bk-list"></div></fieldset>
<fieldset class="bk-op"><legend>${esc(t('bkChange'))}</legend><div class="bk-grid">${bkForm()}</div><p class="hint">${esc(t('bkHint'))}</p></fieldset>
<div class="btns"><button type="button" class="b" data-bk="preview"><span class="i">${ic('bkPreview')}</span><span class="w">${esc(t('bkPreview'))}</span></button><button type="button" class="b primary" data-bk="apply" disabled><span class="i">${ic('bulkEdit')}</span><span class="w">${esc(t('bkApply'))}</span></button></div>
<div class="bk-out" aria-live="polite"></div></div>`,
    mount: (d) => {
      bkShowFields(d);
      bkFillList(d);
      bkTable(d);
      d.addEventListener('input', (ev) => { const k = ev.target.dataset?.bkF; if (k) { BK.form[k] = ev.target.value; if (k === 'op') bkShowFields(d); bkTicks(d); } });
      d.addEventListener('change', (ev) => {
        const x = ev.target;
        if (x.dataset?.bkF === 'op') { BK.form.op = x.value; bkShowFields(d); bkTicks(d); return; }
        if (x.dataset?.bkPj) { x.closest('.bk-g').querySelectorAll('[data-bk-doc]').forEach((c) => { c.checked = x.checked; if (x.checked) BK.picked.add(c.dataset.bkDoc); else BK.picked.delete(c.dataset.bkDoc); }); bkTicks(d); return; }
        if (x.dataset?.bkDoc) { if (x.checked) BK.picked.add(x.dataset.bkDoc); else BK.picked.delete(x.dataset.bkDoc); bkTicks(d); }
      });
      d.addEventListener('click', async (ev) => {
        const k = ev.target.closest('[data-bk]')?.dataset.bk;
        if (!k) return;
        if (k === 'preview') { BK.key = bkKey(); BK.rows = await bkPreview([...BK.picked]); bkTable(d); }
        else if (k === 'apply') {
          if (BK.key !== bkKey()) return;
          const ids = BK.rows.filter((r) => r.status === 'change').map((r) => r.id);
          const skipped = BK.rows.filter((r) => r.status !== 'change');
          const done = await bkApply(ids);
          if (!done) return;
          BK.rows = [...done, ...skipped];
          BK.key = '';
          const dd = root.querySelector('.drawer');
          if (S.drawer === 'bulk' && dd) bkTable(dd);
        } else if (k === 'undo') {
          const id = ev.target.closest('tr[data-id]')?.dataset.id;
          if (id && (await bkUndo(id))) { const r = BK.rows.find((x) => x.id === id); if (r) r.status = 'undone'; const dd = root.querySelector('.drawer'); if (S.drawer === 'bulk' && dd) bkTable(dd); }
        }
      });
    },
  };
}
/** Opens the panel with one project's documents picked (the «تعديل جماعي» button of a project in the documents list). */
async function bkOpenFor(pid) {
  BK.picked = new Set((await EXT.projects?.members(pid) || []).map((e) => e.id));
  BK.rows = []; BK.key = '';
  openDrawer('bulk');
}
const bkRepaint = () => { const d = root.querySelector('.drawer'); if (S.drawer === 'bulk' && d) bkFillList(d); };

IC.bulkEdit = '<svg aria-hidden="true" focusable="false" class="ic" data-ic="bulkEdit" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z"/><path d="M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12"/><path d="M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17"/></svg>';
IC.bkPreview = '<svg aria-hidden="true" focusable="false" class="ic" data-ic="bkPreview" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/></svg>';
bwExt({
  cmds: [{ id: 'bulkEdit', group: 'document', edit: false }],
  actions: { bulkEdit: () => openDrawer('bulk') },
  drawers: { bulk: bkDrawer },
  expose: { bulk: { preview: bkPreview, apply: bkApply, undo: bkUndo, spec: bkSpec, openFor: bkOpenFor, repaint: bkRepaint, last: () => JSON.parse(JSON.stringify(BK.last)), pick: (ids) => { BK.picked = new Set(ids); bkRepaint(); } } },
});
