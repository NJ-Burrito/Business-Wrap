/* A9 «تغييرات» timeline (0.13.0). The op list is the history; each edition also keeps
 *   marks: [{at, n, kind: checkpoint|save|saveHtml|export, label?}]   n = ops length at that moment
 *   epochIds: the live op ids at the last Save-to-HTML
 * The toolbar counter = how far the document is from the last Save HTML (ops added since + ops undone since), so it
 * resets on Save HTML only; Save and PDF/DOCX export add a mark and keep the count. Checkpoints: automatic after
 * 2 minutes idle or 25 ops since the last mark, and by hand. Drawer: ◀ / ▶ one action group (undo/redo), a click on a
 * row travels to that point, «ارجع إلى هنا» on a mark. Travel never deletes: the future stays on the redo stack.
 */
const TL = (() => {
  const KEYS = `bw:tl:${DATA.setId}`;
  const IDLE = 120000, EVERY = 25;
  let stored = {};
  try { stored = JSON.parse(ls.get(KEYS) || '{}') || {}; } catch { /* none */ }
  for (const s of DATA.services) for (const [ed, x] of Object.entries(s.editions)) {
    const e = M[s.id]?.[ed];
    if (!e) continue;
    const st = stored[s.id]?.[ed]?.hash === e.hash ? stored[s.id][ed] : {};
    e.marks = x.marks || st.marks || [];
    e.epochIds = x.epochIds || st.epochIds || [];
  }
  const ids = (e) => liveOps(e).map((o) => o.id);
  function count(e = cur()) {
    const a = ids(e), b = e.epochIds || [];
    let k = 0;
    while (k < a.length && k < b.length && a[k] === b[k]) k++;
    return a.length - k + (b.length - k);
  }
  function persist() {
    const out = {};
    for (const [sid, s] of Object.entries(M)) for (const [ed, e] of Object.entries(s)) if (e.marks?.length || e.epochIds?.length) (out[sid] ||= {})[ed] = { hash: e.hash, marks: e.marks, epochIds: e.epochIds };
    ls.set(KEYS, JSON.stringify(out));
  }
  const refresh = () => { refreshUi(); };
  function mark(kind, label = '', e = cur()) {
    (e.marks ||= []).push({ at: new Date().toISOString(), n: e.ops.length, kind, ...(label ? { label } : {}) });
    persist();
    refresh();
  }
  let idle = 0;
  function onCommit(ops, ed, kind) {
    const e = cur(ed);
    if (!e) return;
    if (kind === 'commit' || kind === 'type') {
      if (e.ops.length - (e.marks?.at(-1)?.n ?? 0) >= EVERY) mark('checkpoint', '', e);
      clearTimeout(idle);
      idle = setTimeout(() => { if (e.ops.length !== (e.marks?.at(-1)?.n ?? 0)) mark('checkpoint', '', e); }, IDLE);
    }
  }
  /** Action groups: the past (e.ops) then the future (the redo stack, next redo first). */
  function groups(e = cur()) {
    const past = [];
    for (const o of e.ops) { const g = o.id.split('.')[0]; if (past.at(-1)?.g === g) past.at(-1).ops.push(o); else past.push({ g, ops: [o] }); }
    return [...past, ...[...e.redo].reverse().map((ops) => ({ g: ops[0]?.id.split('.')[0], ops, future: true }))];
  }
  const pastCount = (e = cur()) => groups(e).filter((x) => !x.future).length;
  /** Undo / redo until `target` action groups are in the past. */
  function travel(target) {
    const e = cur();
    for (let n = 0; n < 100000 && pastCount(e) > target && e.ops.length; n++) undo();
    for (let n = 0; n < 100000 && pastCount(e) < target && e.redo.length; n++) redo();
  }
  /** Undo / redo until the edition holds `n` ops (a mark's point). */
  function travelOps(n) {
    const e = cur();
    for (let k = 0; k < 100000 && e.ops.length > n; k++) undo();
    for (let k = 0; k < 100000 && e.ops.length < n && e.redo.length; k++) redo();
  }
  const when = (iso) => { try { return new Date(iso).toLocaleTimeString(S.ui === 'ar' ? 'ar' : 'en', { hour: '2-digit', minute: '2-digit' }); } catch { return ''; } };
  const field = (p) => String(p || '').split('/').filter(Boolean).slice(-2).join(' › ');
  function label(g) {
    const o = g.ops.find((x) => !x.path?.startsWith('/manual') && !x.path?.startsWith('/labels')) || g.ops[0];
    const verb = t(`tl_${o.op}`) === `tl_${o.op}` ? o.op : t(`tl_${o.op}`);
    const v = o.op === 'setText' && typeof o.value === 'string' ? ` «${o.value.slice(0, 40)}${o.value.length > 40 ? '…' : ''}»` : '';
    return `${verb} · ${field(o.path)}${v}`;
  }
  function drawer() {
    const e = cur();
    const gs = groups(e);
    const now = pastCount(e);
    const author = (g) => EXT.ledger?.authorOf?.(g.ops[0].id) || '';
    const markLi = (m) => `<li class="tl-mark" data-kind="${esc(m.kind)}"><span>${esc(t(`tlMark_${m.kind}`))}${m.label ? ` · ${esc(m.label)}` : ''}</span> <small>${esc(when(m.at))}</small>${m.kind === 'checkpoint' ? ` <button type="button" data-tl="here" data-n="${m.n}">${esc(t('tlHere'))}</button>` : ''}</li>`;
    const marksAt = (n) => (e.marks || []).filter((m) => m.n === n).map(markLi).join('');
    let cum = 0;
    const rows = gs.map((g, i) => {
      cum += g.ops.length;
      return `<li class="tl-row${g.future ? ' future' : ''}${i + 1 === now ? ' now' : ''}" data-tl-row="${i + 1}"><button type="button" data-tl="go" data-i="${i + 1}">${esc(label(g))}</button> <small>${esc(when(g.ops.at(-1).at))}${author(g) ? ` · ${esc(author(g))}` : ''}</small></li>${g.future ? '' : marksAt(cum)}`;
    }).join('');
    return {
      title: t('timeline'),
      html: `<div class="tl-wrap"><div class="btns"><button type="button" class="b" data-tl="back"${now ? '' : ' disabled'} aria-label="${esc(t('tlBack'))}"><span class="w">◀ ${esc(t('tlBack'))}</span></button><button type="button" class="b" data-tl="fwd"${e.redo.length ? '' : ' disabled'} aria-label="${esc(t('tlFwd'))}"><span class="w">${esc(t('tlFwd'))} ▶</span></button><button type="button" class="b" data-tl="cp"><span class="w">${esc(t('tlCheckpoint'))}</span></button></div>
<p class="hint tl-count" role="status">${esc(t('tlCount', { n: count(e) }))}</p><ol class="list tl">${marksAt(0)}${rows || `<li class="hint">${esc(t('tlEmpty'))}</li>`}</ol></div>`,
      mount: (d) => d.querySelector('.tl-wrap').addEventListener('click', (ev) => {
        const b = ev.target.closest('[data-tl]');
        if (!b) return;
        const k = b.dataset.tl;
        if (k === 'back') undo();
        else if (k === 'fwd') redo();
        else if (k === 'cp') mark('checkpoint', '');
        else if (k === 'go') travel(Number(b.dataset.i));
        else if (k === 'here') travelOps(Number(b.dataset.n));
        if (S.drawer === 'timeline') openDrawer('timeline');
      }),
    };
  }
  return { count, mark, groups, travel, travelOps, persist, drawer, onCommit, IDLE, EVERY };
})();

// the toolbar's change counter («n تغييرات») opens the timeline on a click; from the keyboard: Ctrl+Shift+H
// (the counter keeps its own accessible name, set by editor.js; making it a button would rename it)
root.addEventListener('click', (ev) => { if (ev.target.closest?.('.count')) openDrawer('timeline'); });
bwExt({
  drawers: { timeline: TL.drawer },
  expose: { timeline: TL },
  on: {
    // the counter is registered at boot, not at load: a status counter at load makes the seam redraw the whole bar
    // once more (editor.js boot), which drops the recovery banner it has just shown
    boot: () => { bwExt({ status: { count: () => TL.count() } }); refreshUi(); },
    keydown: (e) => { if ((e.ctrlKey || e.metaKey) && e.shiftKey && !e.altKey && e.key.toLowerCase() === 'h') { e.preventDefault(); openDrawer('timeline'); return true; } return false; },
    commit: (ops, ed, kind) => TL.onCommit(ops, ed, kind),
    save: () => TL.mark('save'),
    export: () => TL.mark('export'),
    saveHtml: (data) => {
      // Save HTML is the epoch: the counter starts again from here; the marks travel inside the file
      for (const [ed, x] of Object.entries(data.services[0]?.editions || {})) {
        const e = M[S.svc][ed];
        if (!e) continue;
        e.epochIds = liveOps(e).map((o) => o.id);
        (e.marks ||= []).push({ at: new Date().toISOString(), n: e.ops.length, kind: 'saveHtml' });
        x.marks = e.marks;
        x.epochIds = e.epochIds;
      }
      TL.persist();
      refreshUi();
    },
  },
});
