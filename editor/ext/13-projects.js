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
  const blank = () => ({ v: 1, savedAt: new Date(0).toISOString(), projects: [], of: {}, ofAt: {} });
  const read = () => { try { const s = JSON.parse(ls.get(KEY) || 'null'); if (s?.v === 1 && Array.isArray(s.projects) && s.of) return s; } catch { /* not ours */ } return blank(); };
  let st = read();
  let filter = ''; // '' every project, '-' no project, else a project id
  let target = null; // New / Import pressed while the filter shows a project: {pid, at}
  // the host MERGES per key (engine/routes/projects.mjs mergeStates: projects by id, a document's assignment by `ofAt`); this is the same rule,
  // so what comes back from the host joins what this tab has done since the request left (a newer local decision wins, nothing is replaced whole)
  const stamp = (p) => p.updatedAt || p.createdAt;
  function merge(a, b) {
    const byId = new Map();
    for (const p of [...a.projects, ...b.projects]) {
      const q = byId.get(p.id);
      if (!q) { byId.set(p.id, p); continue; }
      const win = stamp(p) >= stamp(q) ? p : q, purgedAt = p.purgedAt || q.purgedAt;
      byId.set(p.id, { ...win, ...(purgedAt ? { purgedAt } : {}) });
    }
    const of = {}, ofAt = {};
    const view = (s, d) => (d in s.of || (s.ofAt && d in s.ofAt) ? { pid: s.of[d] || null, at: s.ofAt?.[d] || s.savedAt } : null);
    for (const d of new Set([...Object.keys(a.of), ...Object.keys(b.of), ...Object.keys(a.ofAt || {}), ...Object.keys(b.ofAt || {})])) {
      const x = view(a, d), y = view(b, d), w = !x ? y : !y ? x : y.at >= x.at ? y : x;
      ofAt[d] = w.at;
      if (w.pid && byId.has(w.pid) && !byId.get(w.pid).purgedAt) of[d] = w.pid;
    }
    return { v: 1, savedAt: a.savedAt > b.savedAt ? a.savedAt : b.savedAt, projects: [...byId.values()], of, ofAt };
  }
  const take = (s) => {
    if (s?.v !== 1 || !Array.isArray(s.projects) || !s.of) return false;
    const m = merge(st, s);
    if (JSON.stringify(m) === JSON.stringify(st)) return false;
    st = m; ls.set(KEY, JSON.stringify(st)); repaint();
    return true;
  };
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
      take(j.state);
      if (st.projects.length && JSON.stringify(st) !== JSON.stringify(j.state)) await post(); // this tab holds something the host does not: the host merges it
    } catch { /* offline: browser storage only */ }
  }
  const uuid = () => globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  const byId = (id) => st.projects.find((p) => p.id === id);
  const live = () => st.projects.filter((p) => !p.deletedAt && !p.purgedAt);
  const trashed = () => st.projects.filter((p) => p.deletedAt && !p.purgedAt);
  /** The project a document sits in (a deleted project counts as none until it is restored). */
  const of = (doc) => { const p = byId(st.of[doc]); return p && !p.deletedAt && !p.purgedAt ? p.id : null; };
  const clean = (name) => String(name || '').normalize('NFC').replace(/\s+/g, ' ').trim().slice(0, 120);
  const taken = (name, except) => live().some((p) => p.id !== except && p.name.toLowerCase() === name.toLowerCase());
  function create(name) {
    const n = clean(name);
    if (!n) return null;
    if (taken(n)) { toast(t('pjTaken', { name: n }), 'warn'); return null; }
    const p = { id: `pj-${uuid()}`, name: n, createdAt: now(), updatedAt: now() };
    st.projects.push(p);
    save();
    return p;
  }
  function rename(id, name) {
    const p = byId(id), n = clean(name);
    if (!p || !n || taken(n, id)) { if (n && p) toast(t('pjTaken', { name: n }), 'warn'); return false; }
    p.name = n;
    p.updatedAt = now();
    save();
    return true;
  }
  function remove(id) { const p = byId(id); if (!p || p.deletedAt) return false; p.deletedAt = now(); p.updatedAt = p.deletedAt; if (filter === id) filter = ''; save(); return true; }
  function restore(id) { const p = byId(id); if (!p?.deletedAt) return false; delete p.deletedAt; p.updatedAt = now(); save(); return true; }
  /** For good: the project goes; its documents stay in the library, in no project. */
  function purge(id) {
    const p = byId(id);
    if (!p) return false;
    p.purgedAt = now(); // kept as a mark, so the host's merge never brings the project back from another tab
    st.ofAt = st.ofAt || {};
    for (const [d, q] of Object.entries(st.of)) if (q === id) { delete st.of[d]; st.ofAt[d] = p.purgedAt; }
    save();
    return true;
  }
  /** One project per document; null = no project. */
  function assign(doc, pid) {
    if (!/^doc-/.test(String(doc)) || (pid && !byId(pid))) return false;
    if (pid) st.of[doc] = pid; else delete st.of[doc];
    (st.ofAt ||= {})[doc] = now(); // when this document's assignment was decided: the host's per-key merge compares it
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
  const bar = () => `<div class="pj-bar" role="group" aria-label="${esc(t('pjTitle'))}"><label class="pj-f"><span>${esc(t('pjTitle'))}</span><select data-pj-filter>${opts(filter, true)}</select></label>${btn('new', 'pjNew', t('pjNew'))}${btn('import', 'pjImport', t('pxImport'))}${btn('export', 'pjExport', t('pxExport'))}</div>`;
  const grp = (pid, name, n) => `<li class="pj-g" data-pj-g="${esc(pid)}"><details open><summary><b class="pj-n">${esc(name)}</b> · <span class="pj-c">${n}</span></summary>${pid !== '-' ? `<div class="btns pj-acts">${EXT.bulk ? btn('bulk', 'bulkEdit', t('bulkEdit')) : ''}${btn('rename', 'pjRename', t('pjRename'))}${btn('export', 'pjExport', t('pxExport'))}${btn('import', 'pjImport', t('pxImport'))}${btn('del', 'pjDelete', t('pjDelete'))}</div>` : ''}<ol class="list pj-docs"></ol></details></li>`;
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
      else if (k === 'export') PX.exportDialog(pid && pid !== '-' ? pid : filter && filter !== '-' ? filter : null);
      else if (k === 'import') PX.importDialog(pid && pid !== '-' ? pid : filter && filter !== '-' ? filter : null);
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
IC.pjExport = '<svg aria-hidden="true" focusable="false" class="ic" data-ic="pjExport" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/><path d="M12 10v6"/><path d="m9 13 3-3 3 3"/></svg>';
IC.pjImport = '<svg aria-hidden="true" focusable="false" class="ic" data-ic="pjImport" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/><path d="M12 10v6"/><path d="m15 13-3 3-3-3"/></svg>';
/* 0.15.0 note 18 · project export and import. Export: the project's documents as HTML / PDF / DOCX / JSON edits, in Arabic, English or both,
 * one zip (the default) or one folder, with an index (engine/project-export.mjs, /api/project/export). Import: a zip, a folder or several
 * files at once become one project (engine/project-import.mjs, /api/project/upload + /import). Both show a determinate bar (n / total ·
 * document · format) with Stop, then a summary that stays until closed: done / failed / skipped, each failure with its reason, Retry failed
 * only, Open folder or Download zip, Copy report. Offline (file://): only the JSON edits go out (a zip built here) and Save-HTML / JSON
 * files come in one by one; PDF and DOCX say they need the local server. */
const PX = (() => {
  const served = location.protocol.startsWith('http');
  const api = async (u, o) => { const r = await fetch(u, o); const b = await r.json().catch(() => ({})); if (!r.ok) throw Object.assign(new Error(b.error || `HTTP ${r.status}`), { body: b, status: r.status }); return b; };
  const post = (u, b) => api(u, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const kb = (n) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
  const safe = (s) => String(s || 'document').normalize('NFC').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 80) || 'document';
  /** One dialog whose body is rebuilt in place: ask(html, [[key, label, primary]]) resolves the pressed key ('cancel' when it is dismissed). */
  function stage(title) {
    let m = null, waiter = null;
    const p = bwModal({ title, html: '<div class="px-body"></div>', buttons: [], cls: 'px-modal', mount: (el) => { m = el; } });
    p.then(() => { m = null; const w = waiter; waiter = null; w?.('cancel'); });
    m.addEventListener('click', (e) => { const b = e.target.closest('[data-px-act]'); if (b && waiter && !b.disabled) { const w = waiter; waiter = null; w(b.dataset.pxAct); } });
    const btns = (a) => `<div class="btns px-btns">${(a || []).map(([k, l, primary, extra]) => `<button type="button" class="b${primary ? ' primary' : ''}" data-px-act="${esc(k)}"${extra || ''}>${esc(l)}</button>`).join('')}</div>`;
    return {
      get alive() { return !!m; },
      el: () => m,
      ask: (html, a) => new Promise((res) => { if (!m) { res('cancel'); return; } m.querySelector('.px-body').innerHTML = `${html}${btns(a)}`; waiter = res; m.querySelector('.px-btns .primary, .px-btns button')?.focus(); }),
      show: (html, a) => { if (m) m.querySelector('.px-body').innerHTML = `${html}${btns(a)}`; },
      q: (sel) => m?.querySelector(sel),
      close: () => { m?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); },
    };
  }
  const bar = (done, total) => `<div class="px-bar" role="progressbar" aria-valuemin="0" aria-valuemax="${total || 0}" aria-valuenow="${done || 0}"><i style="inline-size:${total ? Math.min(100, Math.round(100 * done / total)) : 0}%"></i></div>`;
  const paintProgress = (st, done, total, text) => {
    const b = st.q('.px-bar');
    if (b) { b.setAttribute('aria-valuemax', String(total || 0)); b.setAttribute('aria-valuenow', String(done || 0)); b.firstElementChild.style.inlineSize = `${total ? Math.min(100, Math.round(100 * done / total)) : 0}%`; }
    const n = st.q('.px-now');
    if (n) n.textContent = text;
  };
  const tiles = (a) => `<div class="px-tiles">${a.map(([n, l, k]) => `<div class="px-t ${k}"><b>${n}</b><span>${esc(l)}</span></div>`).join('')}</div>`;
  const list = (title, rows) => (rows.length ? `<details class="px-list" open><summary>${esc(title)} (${rows.length})</summary><ul>${rows.slice(0, 200).map((r) => `<li>${r}</li>`).join('')}${rows.length > 200 ? `<li>${esc(t('pxMore', { n: rows.length - 200 }))}</li>` : ''}</ul></details>` : '');
  /** The watermark's reactions (34-watermark.js plays them; this only says what happened): W02 = an export finished, W09 = a project import finished. */
  const wm = (id) => { try { window.dispatchEvent(new CustomEvent('bw:wm', { detail: { id } })); } catch { /* no watermark */ } };
  const copy = async (text) => { try { await navigator.clipboard.writeText(text); toast(t('pxCopied'), 'ok'); } catch { toast(t('pxCopyFail'), 'warn'); } };
  /** Polls a job until it stops; `onTick(job)` each time. */
  async function watch(job, onTick) {
    for (;;) {
      const j = await api(`/api/project/job?id=${encodeURIComponent(job)}`);
      onTick(j);
      if (j.state !== 'running') return j;
      await sleep(300);
    }
  }
  const progressBody = (total) => `<p class="px-now" role="status" aria-live="polite">${esc(t('pxStarting'))}</p>${bar(0, total)}<p class="hint">${esc(t('pxStopNote'))}</p>`;

  /* ── a store-only zip built here (offline export) ── */
  const CRC = (() => { const T = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; T[n] = c >>> 0; } return T; })();
  const crc32 = (b) => { let c = ~0; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return ~c >>> 0; };
  function zipStore(files) {
    const enc = new TextEncoder(), parts = [], cd = [];
    let pos = 0;
    const d = new Date(), time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), date = ((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    for (const f of files) {
      const nb = enc.encode(f.name), data = typeof f.data === 'string' ? enc.encode(f.data) : f.data, crc = crc32(data);
      const h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x800, true); h.setUint16(10, time, true); h.setUint16(12, date, true);
      h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, nb.length, true);
      parts.push(new Uint8Array(h.buffer), nb, data);
      const c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 0x031e, true); c.setUint16(6, 20, true); c.setUint16(8, 0x800, true); c.setUint16(12, time, true); c.setUint16(14, date, true);
      c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, nb.length, true); c.setUint32(38, 0x81a40000, true); c.setUint32(42, pos, true);
      cd.push(new Uint8Array(c.buffer), nb);
      pos += 30 + nb.length + data.length;
    }
    const cdLen = cd.reduce((n, x) => n + x.length, 0);
    const e = new DataView(new ArrayBuffer(22));
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, cdLen, true); e.setUint32(16, pos, true);
    return new Blob([...parts, ...cd, new Uint8Array(e.buffer)], { type: 'application/zip' });
  }
  const sha256 = async (s) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(s).replace(/\r\n/g, '\n'))))].map((b) => b.toString(16).padStart(2, '0')).join('');

  /* ── export ── */
  const FMT = ['html', 'pdf', 'docx', 'edits'];
  async function exportDialog(pid) {
    const projects = PJ.live();
    if (!projects.length) { toast(t('pxNoProjects'), 'warn'); return null; }
    const counts = new Map(await Promise.all(projects.map(async (p) => [p.id, (await PJ.members(p.id)).length])));
    const o = { pid: pid && counts.has(pid) ? pid : [...counts].find(([, n]) => n)?.[0] || projects[0].id, html: served, pdf: served, docx: served, edits: true, locales: 'both', layout: 'zip' };
    const st = stage(t('pxExportTitle'));
    const countText = () => {
      const n = counts.get(o.pid) || 0, per = o.locales === 'both' ? 2 : 1;
      const nf = FMT.filter((f) => o[f]).length * per + (o.edits ? per : 0); // edits also carry the document file they replay onto
      return `${t('pxCount', { docs: n, files: n * nf })}${served ? '' : ` · ${t('pxOfflineNote')}`}`;
    };
    const form = () => {
      const cb = (k, label, hostOnly) => `<label class="px-ck"><input type="checkbox" data-px-f="${k}"${o[k] ? ' checked' : ''}${hostOnly && !served ? ' disabled' : ''}><span>${esc(label)}</span>${hostOnly && !served ? `<small>${esc(t('pxNeedsServer'))}</small>` : ''}</label>`;
      const rd = (name, v, label, dis) => `<label class="px-rd"><input type="radio" name="${name}" value="${v}" data-px-${name === 'px-loc' ? 'loc' : 'lay'}${(name === 'px-loc' ? o.locales : o.layout) === v ? ' checked' : ''}${dis ? ' disabled' : ''}><span>${esc(label)}</span></label>`;
      return `<label class="pj-ask">${esc(t('pjTitle'))}<select data-px-pj>${projects.map((p) => `<option value="${esc(p.id)}"${p.id === o.pid ? ' selected' : ''}>${esc(p.name)} · ${counts.get(p.id)}</option>`).join('')}</select></label>
<fieldset class="px-fs"><legend>${esc(t('pxFormats'))}</legend>${cb('html', 'HTML', true)}${cb('pdf', 'PDF', true)}${cb('docx', 'DOCX', true)}${cb('edits', t('pxEdits'), false)}</fieldset>
<fieldset class="px-fs"><legend>${esc(t('pxLangs'))}</legend>${rd('px-loc', 'ar', t('pxAr'))}${rd('px-loc', 'en', t('pxEn'))}${rd('px-loc', 'both', t('pxBoth'))}</fieldset>
<fieldset class="px-fs"><legend>${esc(t('pxLayout'))}</legend>${rd('px-lay', 'zip', t('pxZip'))}${rd('px-lay', 'folder', t('pxFolder'), !served)}</fieldset>
<p class="hint px-count" role="status">${esc(countText())}</p>`;
    };
    st.el().addEventListener('change', (e) => {
      const f = e.target.closest('[data-px-f]'), l = e.target.closest('[data-px-loc]'), y = e.target.closest('[data-px-lay]'), s = e.target.closest('[data-px-pj]');
      if (f) o[f.dataset.pxF] = f.checked; else if (l) o.locales = l.value; else if (y) o.layout = y.value; else if (s) o.pid = s.value; else return;
      const c = st.q('.px-count');
      if (c) c.textContent = countText();
    });
    for (;;) {
      const k = await st.ask(form(), [['cancel', t('pvCancel')], ['go', t('pxExportGo'), true]]);
      if (k === 'cancel') return null;
      if (!FMT.some((f) => o[f])) { toast(t('pxPickFormat'), 'warn'); continue; }
      if (!(counts.get(o.pid) > 0)) { toast(t('pxEmptyProject'), 'warn'); continue; }
      break;
    }
    const members = await PJ.members(o.pid);
    const name = projects.find((p) => p.id === o.pid)?.name || '';
    const formats = FMT.filter((f) => o[f] && (served || f === 'edits'));
    let result = served ? await serverExport(st, name, members, formats, o) : await offlineExport(name, members, o);
    if (!result.cancelled && result.items.some((x) => x.ok)) wm('W02');
    for (;;) {
      if (!st.alive) return result;
      const failed = result.items.filter((x) => !x.ok);
      const where = result.zip || result.root || '';
      const body = `<p class="px-sum" role="status">${esc(result.cancelled ? t('pxCancelled') : t('pxExportDone', { name }))}</p>${result.cancelled ? '' : tiles([[result.items.length - failed.length, t('pxDone'), 'ok'], [failed.length, t('pxFailed'), failed.length ? 'bad' : ''], [0, t('pxSkipped'), '']])}${list(t('pxFailed'), failed.map((x) => `<b>${esc(x.title)}</b>: ${esc(x.error)}`))}${where ? `<p class="hint px-where" dir="ltr">${esc(where)}</p>` : ''}${result.blob ? `<p><a class="b" download="${esc(result.blob.name)}" href="${result.blob.url}">${esc(t('pxDownload'))}</a></p>` : ''}${served && result.zip && result.job ? `<p><a class="b" download href="/api/project/file?job=${encodeURIComponent(result.job)}">${esc(t('pxDownload'))}</a></p>` : ''}`;
      const k = await st.ask(body, [...(failed.length && !result.cancelled && served ? [['retry', t('pxRetry'), false]] : []), ...(served && where && !result.cancelled ? [['open', t('pxOpenFolder'), false]] : []), ['copy', t('pxCopy'), false], ['close', t('pxClose'), true]]);
      if (k === 'copy') { await copy([name, ...result.items.map((x) => `${x.ok ? 'OK    ' : 'FAILED'} ${x.title}${x.error ? ` — ${x.error}` : ''}`), where].filter(Boolean).join('\n')); continue; }
      if (k === 'open') { post('/api/project/reveal', { job: result.job }).catch(() => toast(t('pxOpenFail'), 'warn')); continue; }
      if (k === 'retry') { const ids = new Set(failed.map((x) => x.doc)); result = await serverExport(st, name, members.filter((e) => ids.has(e.id)), formats, o); if (!result.cancelled && result.items.some((x) => x.ok)) wm('W02'); continue; }
      st.close();
      return result;
    }
  }
  const slim = (e) => ({ id: e.id, title: e.title, editions: Object.fromEntries(Object.entries(e.editions).map(([ed, x]) => [ed, { raw: x.raw, hash: x.hash, ops: x.ops || [] }])) });
  async function serverExport(st, name, members, formats, o) {
    let job;
    try { job = (await post('/api/project/export', { project: name, docs: members.map(slim), formats, locales: o.locales, layout: o.layout })).job; } catch (e) { return { items: members.map((m) => ({ doc: m.id, title: m.title, ok: false, error: String(e.message) })), cancelled: false }; }
    let stopped = false;
    st.ask(progressBody(0), [['stop', t('pxStop'), false]]).then((k) => { if (k === 'stop' || k === 'cancel') { stopped = true; post('/api/project/job/cancel', { id: job }).catch(() => {}); } });
    const j = await watch(job, (x) => paintProgress(st, x.done, x.total, stopped ? t('pxStopping') : `${x.done} / ${x.total} · ${x.file || ''}`));
    if (j.state === 'failed') return { job, items: members.map((m) => ({ doc: m.id, title: m.title, ok: false, error: j.error })), cancelled: false };
    return { job, ...j.result };
  }
  async function offlineExport(name, members, o) {
    const files = [], items = [];
    const locs = o.locales === 'both' ? ['ar', 'en'] : [o.locales];
    const index = { v: 1, project: name, exportedAt: new Date().toISOString(), appVersion: '', documents: [] };
    for (const [i, e] of members.entries()) {
      const folder = `${String(i + 1).padStart(2, '0')} ${safe(e.title)}`, rec = { id: e.id, title: e.title, editions: [], status: 'ok', files: [] };
      for (const l of locs) {
        const ed = e.editions[l];
        if (!ed) continue;
        rec.editions.push(l);
        const edits = { version: 1, document: e.id, baseHash: `sha256:${await sha256(ed.raw)}`, locale: l, createdAt: new Date().toISOString(), ops: ed.ops || [] };
        for (const [n, data, kind] of [[`document.${l}.json`, ed.raw, 'document'], [`edits.${l}.json`, JSON.stringify(edits, null, 1), 'edits']]) { files.push({ name: `${safe(name)}/${folder}/${n}`, data }); rec.files.push({ path: `${folder}/${n}`, kind, locale: l, bytes: new TextEncoder().encode(data).length }); }
      }
      index.documents.push(rec);
      items.push({ doc: e.id, title: e.title, ok: true, files: rec.files.map((f) => f.path) });
    }
    files.push({ name: `${safe(name)}/index.json`, data: JSON.stringify(index, null, 1) });
    const blob = zipStore(files);
    return { items, cancelled: false, blob: { name: `${safe(name)}.zip`, url: URL.createObjectURL(blob) } };
  }

  /* ── import ── */
  const ACCEPT_EXT = ['pdf', 'docx', 'html', 'htm', 'json', 'zip'];
  const extOf = (n) => (/\.([a-z0-9]+)$/i.exec(n)?.[1] || '').toLowerCase();
  const editionOf = (n) => (/\.en\.[a-z]+$/i.test(n) || /[ _-]en\.[a-z]+$/i.test(n) ? 'EN' : /\.ar\.[a-z]+$/i.test(n) || /[ _-]ar\.[a-z]+$/i.test(n) || /[؀-ۿ]/.test(n) ? 'AR' : '—');
  const relOf = (f) => (f.webkitRelativePath || f.__rel || f.name).replace(/\\/g, '/');
  async function walkEntry(entry, prefix, out) {
    if (entry.isFile) { const f = await new Promise((res, rej) => entry.file(res, rej)); f.__rel = `${prefix}${entry.name}`; out.push(f); }
    else if (entry.isDirectory) {
      const r = entry.createReader();
      for (;;) { const batch = await new Promise((res, rej) => r.readEntries(res, rej)); if (!batch.length) break; for (const c of batch) await walkEntry(c, `${prefix}${entry.name}/`, out); }
    }
  }
  async function importDialog(pid) {
    const projects = PJ.live();
    let picked = [];
    const o = { mode: pid && projects.some((p) => p.id === pid) ? pid : 'new', name: '', guess: '', conflict: 'skip' };
    const st = stage(t('pxImportTitle'));
    const guess = () => { const first = picked[0]; if (!first) return ''; const rel = relOf(first); if (rel.includes('/')) return rel.split('/')[0]; return picked.length === 1 && extOf(first.name) === 'zip' ? first.name.replace(/\.zip$/i, '').replace(/ - \d{4}-\d\d-\d\d \d\d-\d\d( \(\d+\))?$/, '') : ''; };
    const rows = () => picked.slice(0, 100).map((f) => { const e = extOf(f.name), ok = ACCEPT_EXT.includes(e); return `<tr class="${ok ? '' : 'px-ign'}"><td dir="ltr">${esc(relOf(f))}</td><td>${esc(ok ? (e === 'zip' ? t('pxTypeZip') : e === 'json' ? t('pxTypeJson') : e.toUpperCase()) : t('pxIgnored'))}</td><td>${ok && e !== 'zip' ? editionOf(f.name) : '—'}</td><td>${kb(f.size)}</td></tr>`; }).join('');
    const usable = () => picked.filter((f) => ACCEPT_EXT.includes(extOf(f.name)));
    const form = () => `<div class="px-drop" tabindex="0" data-px-drop><p>${esc(t('pxDrop'))}</p><div class="btns"><button type="button" class="b" data-px-act="files">${esc(t('pxPickFiles'))}</button><button type="button" class="b" data-px-act="dir">${esc(t('pxPickFolder'))}</button></div></div>
${picked.length ? `<table class="px-tbl"><thead><tr><th>${esc(t('pxFile'))}</th><th>${esc(t('pxType'))}</th><th>${esc(t('pxEdition'))}</th><th>${esc(t('pxSize'))}</th></tr></thead><tbody>${rows()}</tbody></table>${picked.length > 100 ? `<p class="hint">${esc(t('pxMore', { n: picked.length - 100 }))}</p>` : ''}
<label class="pj-ask">${esc(t('pxTarget'))}<select data-px-target><option value="new"${o.mode === 'new' ? ' selected' : ''}>${esc(t('pxNewProject'))}</option>${projects.map((p) => `<option value="${esc(p.id)}"${o.mode === p.id ? ' selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>
<label class="pj-ask"${o.mode === 'new' ? '' : ' hidden'} data-px-namebox>${esc(t('pjName'))}<input type="text" data-px-name maxlength="120" value="${esc(o.name)}"></label>
<label class="pj-ask">${esc(t('pxConflict'))}<select data-px-conf><option value="skip"${o.conflict === 'skip' ? ' selected' : ''}>${esc(t('pxSkipDup'))}</option><option value="keep"${o.conflict === 'keep' ? ' selected' : ''}>${esc(t('pxKeepBoth'))}</option></select></label>
<p class="hint">${esc(t('pxPreviewCount', { n: usable().length, mb: kb(usable().reduce((n, f) => n + f.size, 0)) }))}${served ? '' : ` · ${esc(t('pxOfflineImport'))}`}</p>` : ''}`;
    const actions = () => [['cancel', t('pvCancel')], ['go', t('pxImportGo'), true, usable().length ? '' : ' disabled']];
    const take = (files) => { picked = [...picked, ...files]; if (!o.name || o.name === o.guess) { o.guess = guess(); o.name = o.guess || o.name; } };
    const pick = (dir) => new Promise((res) => { const i = document.createElement('input'); i.type = 'file'; i.multiple = true; if (dir) i.webkitdirectory = true; else i.accept = ACCEPT_EXT.map((x) => `.${x}`).join(','); i.onchange = () => res([...i.files]); i.click(); });
    st.el().addEventListener('change', (e) => {
      if (e.target.closest('[data-px-target]')) { o.mode = e.target.value; const b = st.q('[data-px-namebox]'); if (b) b.hidden = o.mode !== 'new'; }
      else if (e.target.closest('[data-px-conf]')) o.conflict = e.target.value;
    });
    st.el().addEventListener('input', (e) => { if (e.target.closest('[data-px-name]')) o.name = e.target.value; });
    st.el().addEventListener('dragover', (e) => { if (e.target.closest('[data-px-drop]')) e.preventDefault(); });
    st.el().addEventListener('drop', async (e) => {
      if (!e.target.closest('[data-px-drop]')) return;
      e.preventDefault();
      const files = [];
      const items = [...(e.dataTransfer?.items || [])].map((i) => i.webkitGetAsEntry?.()).filter(Boolean);
      if (items.length) for (const en of items) await walkEntry(en, '', files); else files.push(...(e.dataTransfer?.files || []));
      take(files);
      st.show(form(), actions());
    });
    for (;;) {
      const k = await st.ask(form(), actions());
      if (k === 'cancel') return null;
      if (k === 'files') { take(await pick(false)); continue; }
      if (k === 'dir') { take(await pick(true)); continue; }
      if (k === 'go') break;
    }
    const files = usable();
    const target = o.mode === 'new' ? (o.name || guess() || `${t('pxImported')} ${new Date().toISOString().slice(0, 10)}`).trim() : PJ.state().projects.find((p) => p.id === o.mode)?.name;
    const r = served ? await serverImport(st, files, target, o.conflict) : await offlineImport(st, files, target);
    if (!r.cancelled && r.came_in.length) wm('W09');
    for (;;) {
      if (!st.alive) return r;
      await PJ.sync();
      const pj = PJ.live().find((p) => p.name.toLowerCase() === String(r.project || target).toLowerCase());
      const body = `<p class="px-sum" role="status">${esc(r.cancelled ? t('pxCancelled') : r.error ? r.error : t('pxImportDone', { name: r.project || target }))}</p>${r.cancelled ? '' : tiles([[r.came_in.length, t('pxCameIn'), 'ok'], [r.skipped.length, t('pxSkipped'), ''], [r.failed.length, t('pxFailed'), r.failed.length ? 'bad' : '']])}${list(t('pxCameIn'), r.came_in.map((c) => `<b>${esc(c.title || c.file)}</b> <small dir="ltr">${esc(c.file)}</small>${c.doc_id ? ` <button type="button" class="b px-open" data-px-act="open:${esc(c.doc_id)}">${esc(t('libOpen'))}</button>` : ''}`))}${list(t('pxFailed'), r.failed.map((x) => `<span dir="ltr">${esc(x.file)}</span>: ${esc(x.reason)}`))}${list(t('pxSkipped'), r.skipped.map((x) => `<span dir="ltr">${esc(x.file)}</span>: ${esc(x.reason)}`))}${list(t('pxWarnings'), (r.warnings || []).map((x) => `<span dir="ltr">${esc(x.file)}</span>: ${esc(x.reason)}`))}`;
      const k = await st.ask(body, [...(pj && r.came_in.length ? [['project', t('pxOpenProject'), false]] : []), ...(r.came_in.some((c) => c.doc_id) ? [['undo', t('pxUndo'), false]] : []), ['copy', t('pxCopy'), false], ['close', t('pxClose'), true]]);
      if (k === 'copy') { await copy([r.project, ...r.came_in.map((c) => `IN      ${c.title} (${c.file})`), ...r.skipped.map((x) => `SKIPPED ${x.file} — ${x.reason}`), ...r.failed.map((x) => `FAILED  ${x.file} — ${x.reason}`)].join('\n')); continue; }
      if (k === 'project') { PJ.setFilter(pj.id); st.close(); openDrawer('library'); return r; }
      if (k.startsWith('open:')) { st.close(); await EXT.library.open(k.slice(5)); return r; }
      if (k === 'undo') { for (const c of r.came_in) if (c.doc_id) await EXT.library.remove(c.doc_id); toast(t('pxUndone', { n: r.came_in.length }), 'ok'); st.close(); return r; }
      st.close();
      return r;
    }
  }
  async function serverImport(st, files, project, conflict) {
    const up = `up-${(globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`).replace(/[^a-f0-9-]/gi, '').slice(0, 36)}`;
    let stopped = false;
    st.ask(progressBody(files.length), [['stop', t('pxStop'), false]]).then((k) => { if (k === 'stop' || k === 'cancel') stopped = true; });
    const failedUp = [];
    for (const [i, f] of files.entries()) {
      if (stopped) break;
      paintProgress(st, i, files.length, t('pxUploading', { i: i + 1, n: files.length, file: relOf(f) }));
      try { await api(`/api/project/upload?job=${up}&name=${encodeURIComponent(relOf(f))}`, { method: 'POST', body: f }); } catch (e) { failedUp.push({ file: relOf(f), reason: `${t('pxUploadFail')}: ${e.message}` }); }
    }
    if (stopped) return { project, came_in: [], skipped: [], failed: [], cancelled: true };
    let job;
    try { job = (await post('/api/project/import', { job: up, project, onConflict: conflict })).job; } catch (e) { return { project, came_in: [], skipped: [], failed: failedUp, error: e.message }; }
    st.ask(progressBody(0), [['stop', t('pxStop'), false]]).then((k) => { if (k === 'stop' || k === 'cancel') { stopped = true; post('/api/project/job/cancel', { id: job }).catch(() => {}); } });
    const j = await watch(job, (x) => paintProgress(st, x.done, x.total, stopped ? t('pxStopping') : `${x.done} / ${x.total} · ${x.file || ''}`));
    if (j.state === 'failed') return { project, came_in: [], skipped: [], failed: failedUp, error: j.error };
    const res = j.result || { project, came_in: [], skipped: [], failed: [] };
    await EXT.library.ingestMirror?.().catch(() => {});
    return { ...res, failed: [...(res.failed || []), ...failedUp], cancelled: j.state === 'cancelled' };
  }
  async function offlineImport(st, files, project) {
    const r = { project, came_in: [], skipped: [], failed: [], warnings: [] };
    const pid = PJ.live().find((p) => p.name.toLowerCase() === project.toLowerCase())?.id || PJ.create(project)?.id;
    st.show(`<p class="px-now" role="status">${esc(t('pxStarting'))}</p>${bar(0, files.length)}`, []);
    for (const [i, f] of files.entries()) {
      paintProgress(st, i, files.length, `${i + 1} / ${files.length} · ${relOf(f)}`);
      if (!['json', 'html', 'htm'].includes(extOf(f.name))) { r.failed.push({ file: relOf(f), reason: t('libNeedsServer') }); continue; }
      const e = await PJ.importInto(pid, f).catch(() => null);
      if (e) r.came_in.push({ file: relOf(f), doc_id: e.id, title: e.title, kind: extOf(f.name) }); else r.failed.push({ file: relOf(f), reason: t('pxNotImported') });
    }
    return r;
  }
  return { exportDialog, importDialog, zipStore };
})();
/* 0.13.3 the tree: a Settings card shows the save folder's root and opens it (the file manager) with «افتح المجلد / Open folder». */
const TREE_CARD = {
  id: 'tree', title: 'مجلد الملفات · Files folder', icon: 'prefs',
  html: () => `<p class="hint">المستندات - Documents · كل مستند في مجلده: Exports · Sources · Versions<br dir="ltr">Documents · one folder per document: Exports · Sources · Versions</p><p><code class="tree-root" dir="ltr">…</code></p><div class="btns"><button type="button" class="b" data-tree="open"><span class="i">${ic('secFile')}</span><span class="w">افتح المجلد / Open folder</span></button></div>`,
  mount: (el) => {
    if (!el || !location.protocol.startsWith('http')) { el?.querySelector('[data-tree]')?.setAttribute('hidden', ''); return; }
    fetch('/api/workspace').then((r) => r.json()).then((w) => { const c = el.querySelector('.tree-root'); if (c) c.textContent = w.root || ''; }).catch(() => {});
    el.querySelector('[data-tree="open"]')?.addEventListener('click', () => fetch('/api/workspace/open', { method: 'POST' }).catch(() => {}));
  },
};
bwExt({
  expose: { projects: Object.assign(PJ, { exportDialog: PX.exportDialog, importDialog: PX.importDialog, zipStore: PX.zipStore }) },
  // the commands projExport / projImport are registered by editor.js (core lane); these are what they run
  actions: { projExport: () => PX.exportDialog(), projImport: () => PX.importDialog() },
  settings: [TREE_CARD],
  on: {
    boot: () => { PJ.watch(); PJ.sync(); },
    open: (svc) => { PJ.onOpen(svc); },
  },
});
