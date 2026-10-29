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
  /* «مقارنة بآخر حفظ HTML»: the document at the last Save HTML (its live op ids, the epoch) against now, text by text */
  let cmp = false;
  function epochDoc(e = cur()) {
    const byId = new Map([...e.ops, ...e.redo.flat()].map((o) => [o.id, o]));
    return applyOps(e.base, (e.epochIds || []).map((id) => byId.get(id)).filter(Boolean));
  }
  const esc1 = (k) => String(k).replace(/~/g, '~0').replace(/\//g, '~1');
  function leaves(x, p = '', out = {}) {
    if (typeof x === 'string') out[p] = x;
    else if (x && typeof x === 'object') for (const [k, v] of Object.entries(x)) leaves(v, `${p}/${esc1(k)}`, out);
    return out;
  }
  // ponytail: compares string leaves by path; an inserted or deleted block shifts the paths after it (shown as changes, no
  // per-change restore for those). A structural diff (LCS over blocks) when reviewers need it.
  function diff(e = cur()) {
    const a = leaves(epochDoc(e)), b = leaves(e.doc);
    return [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => a[k] !== b[k] && !/^\/(manual|composedAt)(\/|$)/.test(k)).map((path) => ({ path, was: a[path], now: b[path] }));
  }
  /** Back to the last Save HTML for one text only: one setText, the other changes stay. */
  function restoreOne(path) {
    const d = diff().find((x) => x.path === path);
    if (!d || d.was === undefined || d.now === undefined) return false;
    S.typingGroup = null;
    setText(path, d.was);
    render();
    return true;
  }
  function cmpHtml(e) {
    const ds = diff(e);
    const li = (d) => `<li class="tl-diff" data-path="${esc(d.path)}"><small>${esc(field(d.path))}</small><div><del>${esc(d.was ?? '—')}</del> → <ins>${esc(d.now ?? '—')}</ins></div>${d.was !== undefined && d.now !== undefined ? `<button type="button" data-tl="one" data-p="${esc(encodeURIComponent(d.path))}">${esc(t('tlRestoreOne'))}</button>` : ''}</li>`;
    return `<p class="hint" role="status">${esc(t('tlCmpLead', { n: ds.length }))}</p><ol class="list tl-cmp" data-n="${ds.length}">${ds.map(li).join('') || `<li class="hint">${esc(t('tlCmpNone'))}</li>`}</ol>`;
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
      html: `<div class="tl-wrap"><div class="btns"><button type="button" class="b" data-tl="back"${now ? '' : ' disabled'} aria-label="${esc(t('tlBack'))}"><span class="w">◀ ${esc(t('tlBack'))}</span></button><button type="button" class="b" data-tl="fwd"${e.redo.length ? '' : ' disabled'} aria-label="${esc(t('tlFwd'))}"><span class="w">${esc(t('tlFwd'))} ▶</span></button><button type="button" class="b" data-tl="cp"><span class="w">${esc(t('tlCheckpoint'))}</span></button><button type="button" class="b" data-tl="cmp" aria-pressed="${cmp}"><span class="w">${esc(t(cmp ? 'tlCmpBack' : 'tlCmp'))}</span></button></div>
${cmp ? cmpHtml(e) : `<p class="hint tl-count" role="status">${esc(t('tlCount', { n: count(e) }))}</p><ol class="list tl">${marksAt(0)}${rows || `<li class="hint">${esc(t('tlEmpty'))}</li>`}</ol>`}</div>`,
      mount: (d) => d.querySelector('.tl-wrap').addEventListener('click', (ev) => {
        const b = ev.target.closest('[data-tl]');
        if (!b) return;
        const k = b.dataset.tl;
        if (k === 'back') undo();
        else if (k === 'fwd') redo();
        else if (k === 'cp') mark('checkpoint', '');
        else if (k === 'go') travel(Number(b.dataset.i));
        else if (k === 'here') travelOps(Number(b.dataset.n));
        else if (k === 'cmp') cmp = !cmp;
        else if (k === 'one') restoreOne(decodeURIComponent(b.dataset.p));
        if (S.drawer === 'timeline') openDrawer('timeline');
      }),
    };
  }
  return { count, mark, groups, travel, travelOps, persist, drawer, onCommit, diff, restoreOne, compare: (on = true) => { cmp = on; }, IDLE, EVERY };
})();

// the toolbar's change counter («n تغييرات») opens the timeline on a click; from the keyboard: Ctrl+Shift+H
// (the counter keeps its own accessible name, set by editor.js; making it a button would rename it)
root.addEventListener('click', (ev) => { if (ev.target.closest?.('.count')) openDrawer('timeline'); });
IC.timeline = '<svg aria-hidden="true" focusable="false" class="ic" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" > <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /> <path d="M3 3v5h5" /> <path d="M12 7v5l4 2" /> </svg>';
bwExt({
  cmds: [{ id: 'timeline', group: 'document', key: 'Ctrl+Shift+H', edit: false }],
  actions: { timeline: () => openDrawer('timeline') },
  drawers: { timeline: TL.drawer },
  expose: { timeline: TL },
  status: { count: () => TL.count() },
  on: {
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
