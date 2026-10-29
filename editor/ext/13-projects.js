/* H1 projects «المشاريع» (0.13.1). Library documents (10-library) grouped by project: «Project A · 23». A document sits in
 * one project or in none. Projects are created, renamed, deleted to their own Trash (restore / delete for good: the
 * documents stay, in no project). State: localStorage `bw:projects`, and served, <workspace>\HISTORY\projects.json
 * (engine/routes/projects.mjs); the newer copy wins, so a reload or a resumed host finds the same groups.
 * The documents drawer is decorated in place (a MutationObserver, as 31-provenance does for the Changes tab):
 * groups, a project filter, a per-row «move to project» select, and New / Import go into the project the filter shows. */
const PJ = (() => {
  const KEY = 'bw:projects';
  const served = location.protocol.startsWith('http');
  const now = () => new Date().toISOString();
  const blank = () => ({ v: 1, savedAt: new Date(0).toISOString(), projects: [], of: {} });
  const read = () => { try { const s = JSON.parse(ls.get(KEY) || 'null'); if (s?.v === 1 && Array.isArray(s.projects) && s.of) return s; } catch { /* not ours */ } return blank(); };
  let st = read();
  let filter = ''; // '' every project, '-' no project, else a project id
  let target = null; // New / Import pressed while the filter shows a project: {pid, at}
  const take = (s) => { if (s?.v === 1 && s.savedAt > st.savedAt) { st = s; ls.set(KEY, JSON.stringify(st)); repaint(); return true; } return false; };
  const post = () => fetch('/api/projects', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ state: st }) }).then((r) => r.json()).then((j) => take(j.state)).catch(() => false);
  let posting = Promise.resolve();
  function save() {
    st.savedAt = now();
    ls.set(KEY, JSON.stringify(st));
    if (served) posting = posting.then(post);
    repaint();
    document.documentElement.dataset.bwProjects = String(st.projects.length);
  }
  async function sync() {
    if (!served) return;
    try {
      const j = await (await fetch('/api/projects')).json();
      if (!take(j.state) && st.projects.length && (!j.state || st.savedAt > j.state.savedAt)) await post();
    } catch { /* offline: browser storage only */ }
  }
  const uuid = () => globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  const byId = (id) => st.projects.find((p) => p.id === id);
  const live = () => st.projects.filter((p) => !p.deletedAt);
  const trashed = () => st.projects.filter((p) => p.deletedAt);
  /** The project a document sits in (a deleted project counts as none until it is restored). */
  const of = (doc) => { const p = byId(st.of[doc]); return p && !p.deletedAt ? p.id : null; };
  const clean = (name) => String(name || '').normalize('NFC').replace(/\s+/g, ' ').trim().slice(0, 120);
  const taken = (name, except) => live().some((p) => p.id !== except && p.name.toLowerCase() === name.toLowerCase());
  function create(name) {
    const n = clean(name);
    if (!n) return null;
    if (taken(n)) { toast(t('pjTaken', { name: n }), 'warn'); return null; }
    const p = { id: `pj-${uuid()}`, name: n, createdAt: now() };
    st.projects.push(p);
    save();
    return p;
  }
  function rename(id, name) {
    const p = byId(id), n = clean(name);
    if (!p || !n || taken(n, id)) { if (n && p) toast(t('pjTaken', { name: n }), 'warn'); return false; }
    p.name = n;
    save();
    return true;
  }
  function remove(id) { const p = byId(id); if (!p || p.deletedAt) return false; p.deletedAt = now(); if (filter === id) filter = ''; save(); return true; }
  function restore(id) { const p = byId(id); if (!p?.deletedAt) return false; delete p.deletedAt; save(); return true; }
  /** For good: the project goes; its documents stay in the library, in no project. */
  function purge(id) { if (!byId(id)) return false; st.projects = st.projects.filter((p) => p.id !== id); for (const [d, p] of Object.entries(st.of)) if (p === id) delete st.of[d]; save(); return true; }
  /** One project per document; null = no project. */
  function assign(doc, pid) {
    if (!/^doc-/.test(String(doc)) || (pid && !byId(pid))) return false;
    if (pid) st.of[doc] = pid; else delete st.of[doc];
    save();
    return true;
  }
  /** The library documents of a project ('-' = no project), live ones only (not in the Trash, not templates). */
  async function members(pid) {
    const all = (await EXT.library.all()) || [];
    return all.filter((e) => e.kind !== 'template' && !e.deletedAt && (pid === '-' ? !of(e.id) : of(e.id) === pid));
  }
  /** New document / import straight into a project. */
  async function newIn(pid) { const e = await EXT.library.newDocument(); if (e && pid) assign(e.id, pid); return e; }
  async function importInto(pid, file) { const e = await EXT.library.importAny(file); if (e && pid) assign(e.id, pid); return e; }
  /** A document opened right after New / Import was pressed under a project filter joins that project. */
  async function onOpen(svc) {
    if (!target || !/^doc-/.test(String(svc)) || st.of[svc]) return;
    const e = await EXT.library.get(svc);
    if (!e || Date.parse(e.createdAt) >= target.at - 1000) { const { pid } = target; target = null; assign(svc, pid); }
  }

  /* the documents drawer */
  const ask = async (title, value = '') => {
    let v = value;
    const k = await bwModal({ title, html: `<label class="pj-ask">${esc(t('pjName'))}<input data-pj-name type="text" maxlength="120" value="${esc(value)}"></label>`, buttons: [['cancel', t('pvCancel')], ['ok', t('pjOk'), true]], mount: (m) => { const i = m.querySelector('[data-pj-name]'); i.addEventListener('input', () => { v = i.value; }); i.addEventListener('keydown', (e) => { if (e.key === 'Enter') m.querySelector('[data-mk="ok"]').click(); }); } });
    return k === 'ok' ? clean(v) : null;
  };
  const btn = (k, icon, label, extra = '') => `<button type="button" class="b pj-b" data-pj="${k}"${extra} title="${esc(label)}"><span class="i">${ic(icon)}</span><span class="w">${esc(label)}</span></button>`;
  const opts = (sel, withAll) => `${withAll ? `<option value=""${sel === '' ? ' selected' : ''}>${esc(t('pjAll'))}</option>` : ''}<option value="-"${sel === '-' ? ' selected' : ''}>${esc(t('pjNone'))}</option>${live().map((p) => `<option value="${esc(p.id)}"${sel === p.id ? ' selected' : ''}>${esc(p.name)}</option>`).join('')}`;
  const bar = () => `<div class="pj-bar" role="group" aria-label="${esc(t('pjTitle'))}"><label class="pj-f"><span>${esc(t('pjTitle'))}</span><select data-pj-filter>${opts(filter, true)}</select></label>${btn('new', 'pjNew', t('pjNew'))}</div>`;
  const grp = (pid, name, n) => `<li class="pj-g" data-pj-g="${esc(pid)}"><details open><summary><b class="pj-n">${esc(name)}</b> · <span class="pj-c">${n}</span></summary>${pid !== '-' ? `<div class="btns pj-acts">${EXT.bulk ? btn('bulk', 'bulkEdit', t('bulkEdit')) : ''}${btn('rename', 'pjRename', t('pjRename'))}${btn('del', 'pjDelete', t('pjDelete'))}</div>` : ''}<ol class="list pj-docs"></ol></details></li>`;
  function decorate(d) {
    const ol = d.querySelector('.lib ol.lib-docs');
    if (!ol) return;
    ol.dataset.pj = '1';
    const old = d.querySelector('.pj-bar');
    if (old) old.outerHTML = bar(); else (d.querySelector('.lib-q') || d.querySelector('.lib')).insertAdjacentHTML(d.querySelector('.lib-q') ? 'afterend' : 'beforebegin', bar());
    const rows = [...ol.querySelectorAll('li[data-id]')];
    const hint = ol.querySelector(':scope > li.hint');
    const q = !!String(d.querySelector('[data-lib-q]')?.value || '').trim();
    const groups = [...live().map((p) => [p.id, p.name]), ['-', t('pjNone')]];
    ol.textContent = '';
    for (const [pid, name] of groups) {
      const mine = rows.filter((li) => (of(li.dataset.id) || '-') === pid);
      ol.insertAdjacentHTML('beforeend', grp(pid, name, mine.length));
      const g = ol.lastElementChild;
      // the filter hides the other groups (their rows stay, for the next filter); an empty project still shows, so a new
      // one is seen; «no project» only when it holds some; a search hides empty groups
      g.hidden = (filter && filter !== pid) || (!mine.length && (q || (pid === '-' && filter !== '-')));
      const box = g.querySelector('.pj-docs');
      for (const li of mine) {
        if (!li.querySelector('[data-pj-move]')) li.querySelector('.btns')?.insertAdjacentHTML('beforeend', `<label class="pj-mv"><span class="vh">${esc(t('pjMove'))}</span><select data-pj-move title="${esc(t('pjMove'))}"></select></label>`);
        const s = li.querySelector('[data-pj-move]');
        if (s) s.innerHTML = opts(of(li.dataset.id) || '-', false);
        box.appendChild(li);
      }
    }
    if (!rows.length && hint) ol.appendChild(hint);
    const tr = trashed();
    d.querySelector('.pj-trash')?.remove();
    if (tr.length) d.querySelector('.lib').insertAdjacentHTML('beforeend', `<details class="pj-trash"><summary>${esc(t('pjTrash'))} (${tr.length})</summary><ol class="list">${tr.map((p) => `<li data-pj-id="${esc(p.id)}"><b>${esc(p.name)}</b><div class="btns">${btn('restore', 'pjNew', t('libUndelete'))}${btn('purge', 'pjDelete', t('libPurge'))}</div></li>`).join('')}</ol></details>`);
    d.dataset.pjGroups = String(ol.querySelectorAll('.pj-g:not([hidden])').length);
    d.dataset.pjSeq = String((+d.dataset.pjSeq || 0) + 1);
    if (!d.__pj) wire(d);
  }
  function wire(d) {
    d.__pj = true;
    d.addEventListener('change', (ev) => {
      const f = ev.target.closest('[data-pj-filter]');
      if (f) { filter = f.value; decorate(d); return; }
      const m = ev.target.closest('[data-pj-move]');
      if (m) { const id = m.closest('li[data-id]')?.dataset.id; if (id) assign(id, m.value === '-' ? null : m.value); }
    });
    // capture: before 10-library's own handler starts the new document (its open event can come within the same click)
    d.addEventListener('click', (ev) => { if (ev.target.closest('[data-lib="new"], [data-lib="import"]')) target = filter && filter !== '-' ? { pid: filter, at: Date.now() } : null; }, true);
    d.addEventListener('click', async (ev) => {
      const b = ev.target.closest('[data-pj]');
      if (!b) return;
      const k = b.dataset.pj, pid = b.closest('[data-pj-g]')?.dataset.pjG || b.closest('[data-pj-id]')?.dataset.pjId;
      if (k === 'new') { const n = await ask(t('pjNew')); if (n && create(n)) toast(t('pjMade', { name: n }), 'ok'); }
      else if (k === 'rename') { const p = byId(pid); const n = p && (await ask(t('pjRename'), p.name)); if (n) rename(pid, n); }
      else if (k === 'del') { const p = byId(pid); if (p && remove(pid)) toast(t('pjDeleted', { name: p.name }), 'info', { actions: [[t('libUndelete'), () => restore(pid)]] }); }
      else if (k === 'bulk') EXT.bulk?.openFor(pid);
      else if (k === 'restore') restore(pid);
      else if (k === 'purge') purge(pid);
    });
  }
  function repaint() {
    const d = root.querySelector('.drawer');
    if (d && !d.hidden && S.drawer === 'library') decorate(d);
    EXT.bulk?.repaint?.();
  }
  const watch = () => new MutationObserver(() => {
    if (S.drawer !== 'library') return;
    const d = root.querySelector('.drawer');
    const ol = d?.querySelector('.lib ol.lib-docs');
    if (ol && !ol.dataset.pj) decorate(d);
  }).observe(root, { childList: true, subtree: true });
  return { state: () => JSON.parse(JSON.stringify(st)), live, trashed, of, create, rename, remove, restore, purge, assign, members, newIn, importInto, onOpen, sync, watch, setFilter: (f) => { filter = f; repaint(); } };
})();

IC.pjNew = '<svg aria-hidden="true" focusable="false" class="ic" data-ic="pjNew" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/><path d="M12 10v6"/><path d="M9 13h6"/></svg>';
IC.pjRename = '<svg aria-hidden="true" focusable="false" class="ic" data-ic="pjRename" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 11.5V5a2 2 0 0 1 2-2h3.9c.7 0 1.3.3 1.7.9l.8 1.2c.4.6 1 .9 1.7.9H20a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-9.5"/><path d="M11.378 13.626a1 1 0 1 0-3.004-3.004l-5.01 5.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506z"/></svg>';
IC.pjDelete = '<svg aria-hidden="true" focusable="false" class="ic" data-ic="pjDelete" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/><path d="m9.5 10.5 5 5"/><path d="m14.5 10.5-5 5"/></svg>';
bwExt({
  expose: { projects: PJ },
  on: {
    boot: () => { PJ.watch(); PJ.sync(); },
    open: (svc) => { PJ.onOpen(svc); },
  },
});
