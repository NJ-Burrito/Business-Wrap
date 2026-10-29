/* A2 document library «المستندات» (0.13.0). The services built into this HTML (DATA.services) are templates and
 * stay read-only: the first Save of a template (or of a new blank document) creates a library entry and switches the
 * session to it; later Saves update that entry. Entries live in IndexedDB `bw-library` (served: mirrored to the save
 * folder's HISTORY\library). Drawer: search, open here, open in a new tab (#doc=<id>), duplicate, delete → Trash →
 * restore / delete for good, new document, import (Save-HTML here; DOCX and PDF through the local server).
 */
const LIB = (() => {
  const TEMPLATES = new Set(DATA.services.map((s) => s.id));
  const served = location.protocol.startsWith('http');
  const HF = {}; // id → {ar, en}: the document's own HTML file per edition (Save in place)
  const pending = {}; // unsaved entries (a new blank document, before its first Save): id → {origin, createdAt}
  const mem = new Map(); // IndexedDB unavailable (private window, blocked storage): this session only
  let dbp = null;
  const idb = () => (dbp ||= new Promise((ok, no) => {
    try {
      const r = indexedDB.open('bw-library', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('docs', { keyPath: 'id' });
      r.onsuccess = () => ok(r.result);
      r.onerror = () => no(r.error);
    } catch (e) { no(e); }
  }).catch(() => null));
  const req = async (mode, f) => {
    const db = await idb();
    if (!db) return f(null);
    return new Promise((ok, no) => {
      const tx = db.transaction('docs', mode);
      const r = f(tx.objectStore('docs'));
      tx.oncomplete = () => ok(r?.result);
      tx.onerror = () => no(tx.error);
    });
  };
  const all = () => req('readonly', (st) => (st ? st.getAll() : { result: [...mem.values()] }));
  const get = (id) => req('readonly', (st) => (st ? st.get(id) : { result: mem.get(id) }));
  const put = (e) => req('readwrite', (st) => (st ? st.put(e) : (mem.set(e.id, e), null)));
  const drop = (id) => req('readwrite', (st) => (st ? st.delete(id) : (mem.delete(id), null)));
  const mirror = (entry) => { if (served) fetch('/api/library/mirror', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ entry }) }).catch(() => {}); };

  const uuid = () => globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  const isDoc = (id) => /^doc-/.test(String(id || ''));
  async function hashOf(raw) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
    return `sha256:${[...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')}`;
  }
  /* One title (review 2 row 2): the cover title («عنوان الغلاف», /control/coverTitle) and the document title
   * («عنوان الوثيقة», /control/title = "<kind>: <service name>") say the same service name. Editing the cover
   * updates «عنوان الوثيقة», and an edition still on the placeholder («خدمة جديدة» / "New service") takes the new name too,
   * so the list, the share file, the report, the PDF Title, an import and every saved file name follow it. */
  const PLACEHOLDER = new Set(['خدمة جديدة', 'New service']);
  const KIND = /^(.*?)\s*[:—]\s+/;
  const nameOf = (c = {}) => String(c.coverTitle || String(c.title || '').split(/\s*[:—]\s+/).slice(1).join(': ') || c.title || '').trim();
  /** The service title: control.coverTitle, else the service-name part of control.title; an edition still on the
   *  placeholder borrows the other edition's name (the EN file is named like the AR one until it gets its own). */
  function titleOf(svc = S.svc, ed = S.ed) {
    const eds = M[svc] || {};
    const own = nameOf((eds[ed] || Object.values(eds)[0])?.doc?.control);
    if (own && !PLACEHOLDER.has(own)) return own;
    return Object.values(eds).map((e) => nameOf(e.doc?.control)).find((x) => x && !PLACEHOLDER.has(x)) || own || svc;
  }
  let syncing = false;
  function setName(ed, name, svc = S.svc) {
    const c = M[svc]?.[ed]?.doc?.control || {};
    const kind = KIND.exec(String(c.title || ''))?.[1];
    const title = kind ? `${kind}: ${name}` : name;
    if (c.coverTitle != null && c.coverTitle !== name) setText('/control/coverTitle', name, ed);
    if (c.title !== title) setText('/control/title', title, ed);
  }
  /** After an edit of the cover or the document title in `ed`: the other field and the placeholder editions follow. */
  function syncTitle(ed = S.ed, from = '/control/coverTitle', svc = S.svc) {
    const c = M[svc]?.[ed]?.doc?.control;
    if (syncing || !c || EXT.lock?.of?.(svc)?.locked) return;
    const name = String(from === '/control/title' ? String(c.title || '').split(/\s*[:—]\s+/).slice(1).join(': ') || c.title || '' : c.coverTitle || '').trim();
    if (!name) return;
    syncing = true;
    try {
      if (from === '/control/coverTitle') setName(ed, name, svc); // the cover drives «عنوان الوثيقة»; a hand edit of that row stays as typed
      for (const [o, e] of Object.entries(M[svc])) if (o !== ed && PLACEHOLDER.has(nameOf(e.doc?.control))) setName(o, name, svc);
    } catch { /* a refused edit (a lock) leaves the titles as they are */ } finally { syncing = false; }
  }
  /** A commit that touched a title: synced now, or (while the owner is still typing in it) when the field loses focus. */
  function onCommit(ops, ed) {
    if (syncing) return;
    const op = (ops || []).find((o) => /^\/control\/(coverTitle|title)$/.test(o?.path || ''));
    if (!op) return;
    const a = document.activeElement;
    if (a?.isContentEditable && a.dataset?.p === op.path) return; // focusout below
    queueMicrotask(() => syncTitle(ed, op.path));
  }
  document.addEventListener('focusout', (ev) => {
    const el = ev.target.closest?.('#bw-pair [data-p="/control/coverTitle"], #bw-pair [data-p="/control/title"]');
    if (el) syncTitle(el.closest('main.bw-doc')?.dataset.locale || S.ed, el.dataset.p);
  });
  const syncAll = () => { for (const ed of Object.keys(M[S.svc] || {})) { const c = M[S.svc][ed].doc?.control; if (c && !PLACEHOLDER.has(nameOf(c))) { syncTitle(ed, c.coverTitle != null ? '/control/coverTitle' : '/control/title'); break; } } };
  const snapEd = (e) => ({ name: e.name, raw: e.raw, hash: e.hash, ops: e.ops, status: e.status, stale: [...e.stale], comments: e.comments, versions: e.versions, marks: e.marks || [], epochIds: e.epochIds || [] });
  /** The open service as a library entry (not stored). */
  function entryOf(id = S.svc, extra = {}) {
    const now = new Date().toISOString();
    const editions = {};
    for (const [ed, e] of Object.entries(M[id])) editions[ed] = snapEd(e);
    // A16: the lock state travels with the entry (32-lock exposes EXT.lock), so a locked document opens locked
    return { id, title: titleOf(id), service: id, origin: 'template', createdAt: now, savedAt: now, editions, theme: S.theme, lock: EXT.lock?.of(id) || null, bwlog: 1, ...extra };
  }
  /** An entry into the session (DATA.services + M), replacing what was there. */
  function mount(entry) {
    let s = DATA.services.find((x) => x.id === entry.id);
    if (!s) { s = { id: entry.id, editions: {} }; DATA.services.push(s); }
    M[entry.id] = {};
    for (const [ed, x] of Object.entries(entry.editions)) {
      s.editions[ed] = { name: entry.title, raw: x.raw, hash: x.hash, ops: [] };
      const e = M[entry.id][ed] = { base: JSON.parse(x.raw), raw: x.raw, hash: x.hash, name: entry.title, ops: x.ops || [], redo: [], status: x.status || {}, stale: new Set(x.stale || []), comments: x.comments || [], versions: x.versions || [], marks: x.marks || [], epochIds: x.epochIds || [], doc: null };
      rebuild(e);
    }
    EXT.lock?.set(entry.id, entry.lock || null);
    if (!pending[entry.id]) savedAt[entry.id] = entry.savedAt;
  }
  function show(id, ed) {
    persistNow(); // a change still waiting for its autosave goes to its own document first
    S.svc = id;
    S.ed = ed && M[id][ed] ? ed : M[id][S.ed] ? S.ed : Object.keys(M[id])[0];
    S.sel = null;
    S.doc = isDoc(id) ? id : null;
    document.documentElement.dataset.bwDoc = S.doc || '';
    address(id);
    buildUi();
    render(false);
    emit('open', S.svc, S.ed);
  }
  /** #doc=<id> in the address for a stored document (a reload reopens it), nothing for a template or an unsaved one. */
  function address(id) {
    const h = isDoc(id) && !pending[id] ? `#doc=${encodeURIComponent(id)}` : '';
    if (location.hash !== h && (h || /[#&]doc=/.test(location.hash))) history.replaceState(history.state, '', location.pathname + location.search + h);
  }
  async function open(id, ed) {
    if (!M[id] || !isDoc(id)) { const e = await get(id); if (!e) { toast(t('libMissing'), 'warn'); return false; } mount(e); }
    show(id, ed);
    return true;
  }
  /** A library entry handed over whole (a resumed tab): stored, then opened. */
  async function adopt(entry) { await put(entry); mount(entry); show(entry.id); }

  /** Save (Ctrl+S): a template or an unsaved document → a NEW entry; a library document → its entry updated. */
  async function save() {
    const id = S.svc;
    if (TEMPLATES.has(id) && !isDoc(id)) {
      const entry = entryOf(id, { id: `doc-${uuid()}`, service: id, origin: id === 'blank' ? 'blank' : 'template' });
      await put(entry);
      mirror(entry);
      // the template goes back to how it was built: its edits now belong to the entry
      for (const e of Object.values(M[id])) { Object.assign(e, { ops: [], redo: [], status: {}, stale: new Set(), comments: [], versions: [], marks: [], epochIds: [] }); rebuild(e); }
      mount(entry);
      show(entry.id);
      writeDraft();
      toast(t('libCreated', { name: entry.title }), 'ok');
      return entry;
    }
    return isDoc(id) ? persist(id) : null;
  }
  /** The Save-HTML text of the open document, captured instead of downloaded. */
  async function captureHtml() {
    let cap = null;
    const dl0 = download;
    download = (name, text) => { cap = { name, text }; };
    try { await saveHtml(!!S.embedFonts); } finally { download = dl0; }
    return cap;
  }
  /** H3 Save in place (Ctrl+S, the yellow Save): the document itself, not a copy. The list entry is saved, then the
   *  document's own HTML file in the save folder's HTML\ is overwritten (same name every time; the first Save of a new
   *  document asks for the folder once and names it «<title>-<date>-<AR|ENG>.html»). The Save-HTML capture is the A9
   *  epoch: the change counter starts again and the log entry is sealed into the file. Export HTML stays a separate copy. */
  async function saveInPlace() {
    syncAll();
    const entry = await save();
    const sess = EXT.session;
    if (!entry || !served || !sess?.info) return entry;
    if (!(await sess.ensureFolder())) { toast(t('libSaveNoFolder'), 'warn'); return entry; }
    const id = entry.id, ed = S.ed;
    const cap = await captureHtml();
    if (!cap) return entry;
    const r = await fetch('/api/library/html', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, title: titleOf(id, ed), locale: ed, html: cap.text, file: entry.htmlFiles?.[ed] || '' }) }).then((x) => x.json()).catch((e) => ({ error: String(e.message || e) }));
    if (!r.ok) { toast(t('libSaveHtmlFailed', { why: r.error || '' }), 'err'); return entry; }
    const e = (await get(id)) || entry;
    HF[id] = { ...HF[id], [ed]: r.file }; // an autosave already on its way keeps it too
    e.htmlFiles = { ...(e.htmlFiles || {}), ...HF[id] };
    await put(e);
    mirror(e);
    stamp();
    document.documentElement.dataset.bwSavedFile = r.file;
    toast(t('libSavedInPlace', { file: r.file.split(/[\\/]/).pop() }), 'ok');
    return e;
  }
  /** The open document → its list entry (Save, and the autosave after every change): the list copy is always the latest. */
  async function persist(id = S.svc) {
    if (soonId === id) { clearTimeout(soonT); soonT = 0; soonId = null; }
    if (!isDoc(id) || !M[id]) return null;
    const old = (await get(id)) || {};
    if (old.deletedAt) return null; // a document in the Trash is not brought back by an autosave
    const entry = entryOf(id, { origin: old.origin || pending[id]?.origin || 'blank', createdAt: old.createdAt || pending[id]?.createdAt || new Date().toISOString(), service: old.service || id, ...(old.prov ? { prov: old.prov } : {}), ...(old.from ? { from: old.from } : {}), ...(old.htmlFiles || HF[id] ? { htmlFiles: { ...old.htmlFiles, ...HF[id] } } : {}) });
    const fresh = !!pending[id];
    delete pending[id];
    await put(entry);
    mirror(entry);
    savedAt[id] = entry.savedAt;
    if (fresh && S.svc === id) address(id);
    stamp();
    document.documentElement.dataset.bwLibSaved = String(++seq);
    return entry;
  }
  let soonT = 0, soonId = null, seq = 0;
  const savedAt = {};
  const persistSoon = () => { if (!isDoc(S.svc)) { stamp(); return; } if (soonId && soonId !== S.svc) persistNow(); clearTimeout(soonT); soonId = S.svc; soonT = setTimeout(() => persist(soonId), 600); };
  const persistNow = () => (soonId ? persist(soonId) : null);

  /* «آخر حفظ» beside the change counter: the list copy (a document) or the draft (a template), and the last Save HTML */
  const hhmm = (d) => { try { return d ? new Date(d).toLocaleTimeString(S.ui === 'ar' ? 'ar' : 'en', { hour: '2-digit', minute: '2-digit' }) : '—'; } catch { return '—'; } };
  function stamp() {
    const c = root.querySelector('.count');
    if (!c) return;
    let el = c.querySelector('.bw-stamp');
    if (!el) { el = document.createElement('span'); el.className = 'bw-stamp'; el.setAttribute('role', 'status'); c.appendChild(el); }
    const html = Object.values(M[S.svc] || {}).flatMap((e) => (e.marks || []).filter((m) => m.kind === 'saveHtml')).map((m) => m.at).sort().at(-1);
    const doc = isDoc(S.svc) && !pending[S.svc];
    const list = doc ? savedAt[S.svc] : S.savedAt;
    el.textContent = t(doc ? 'libStamp' : 'libStampDraft', { list: hhmm(list), html: hhmm(html) });
    el.dataset.list = list ? new Date(list).toISOString() : '';
    el.dataset.html = html || '';
  }
  const titleFromRaw = (raw, id) => { const c = JSON.parse(raw).control || {}; return String(c.coverTitle || String(c.title || '').split(/\s*[:—]\s+/).slice(1).join(': ') || c.title || id); };
  const makeEntry = (editions, origin, service, theme = S.theme) => {
    const now = new Date().toISOString(), id = `doc-${uuid()}`;
    return { id, title: titleFromRaw(Object.values(editions)[0].raw, id), service, origin, createdAt: now, savedAt: now, editions, theme, bwlog: 1 };
  };
  /** A document JSON as a new entry (import, new document): `store` false = unsaved until the first Save. */
  async function fromDocs(docs, origin, store = true) {
    const editions = {};
    for (const [ed, raw] of Object.entries(docs)) editions[ed] = { name: '', raw, hash: await hashOf(raw), ops: [], status: {}, stale: [], comments: [], versions: [], marks: [], epochIds: [] };
    const entry = makeEntry(editions, origin, JSON.parse(Object.values(docs)[0]).service || 'document');
    if (store) { await put(entry); mirror(entry); } else pending[entry.id] = { origin, createdAt: entry.createdAt };
    mount(entry);
    show(entry.id);
    return entry;
  }
  async function newDocument() {
    let docs = null;
    const blank = M.blank;
    if (blank) docs = Object.fromEntries(Object.entries(blank).map(([ed, e]) => [ed, e.raw]));
    else if (served) docs = await fetch('/api/library/blank').then((r) => (r.ok ? r.json() : null)).catch(() => null);
    if (!docs) { toast(t('libNeedsServer'), 'warn'); return null; }
    return fromDocs(docs, 'blank', false);
  }
  /** The file types an import takes (the list's «استيراد» and File › Import alike). */
  const ACCEPT = '.html,.htm,.pdf,.docx,.json';
  /** H3: one import for the documents list and the File category: a Business-Wrap Save-HTML or share (its editions,
   *  edits, log, lock and signatures kept), a document JSON, any other HTML / a DOCX / a PDF (read by the local server);
   *  an edits file or bundle still merges into the document it was made from. Progress, then the imported document
   *  opens with a result message; a failure says what to do in plain words. */
  async function importAny(file) {
    if (!file) return null;
    const name = file.name || '';
    const ext = (/\.([a-z0-9]+)$/i.exec(name)?.[1] || '').toLowerCase();
    if (!['html', 'htm', 'pdf', 'docx', 'json'].includes(ext)) { toast(t('libImpBadType', { name }), 'err'); return null; }
    const busy = toast(t('libImporting', { name }), 'info', { persist: true });
    const done = () => { if (busy) dismiss(busy); };
    try {
      if (ext === 'json') {
        let j;
        try { j = JSON.parse(await readAs(file, 'text')); } catch { done(); toast(t('libImpBadJson', { name }), 'err'); return null; }
        if (!(j?.chapters && j?.control)) { done(); await importFile(file); return null; } // an edits file, a bundle, comments: merged as before
        const raw = JSON.stringify(j, null, 1);
        const ed = /\.en\.json$/i.test(name) ? 'en' : /\.ar\.json$/i.test(name) ? 'ar' : /[؀-ۿ]/.test(j.control.title || '') ? 'ar' : 'en';
        const entry = await fromDocs({ [ed]: raw }, 'import');
        done();
        toast(t('libImported', { name: entry.title }), 'ok');
        return entry;
      }
      const html = ext === 'html' || ext === 'htm';
      let data = null;
      if (html) {
        const m = /<script type="application\/json" id="bw-data">([\s\S]*?)<\/script>/.exec(await readAs(file, 'text'));
        try { data = m && JSON.parse(m[1]); } catch { /* not ours */ }
      }
      if (data?.services?.length) { // a Save-HTML or a share of this editor: its editions and edits as they are
        let last = null;
        for (const s of data.services) {
          const editions = {};
          for (const [ed, x] of Object.entries(s.editions)) editions[ed] = { name: x.name, raw: x.raw, hash: x.hash, ops: x.ops || [], status: x.status || {}, stale: x.stale || [], comments: x.comments || [], versions: x.versions || [], marks: x.marks || [], epochIds: x.epochIds || [] };
          last = makeEntry(editions, 'import', s.id, data.theme || S.theme);
          if (!data.bwlog) delete last.bwlog; // a Save-HTML made before 0.13: no Business-Wrap log ever (31-provenance: «made before 0.13»)
          if (data.prov?.[s.id]?.log) last.prov = { doc: data.prov[s.id].doc, log: data.prov[s.id].log }; // the file's log travels on (31-provenance reads entry.prov)
          if (data.lock?.[s.id]) last.lock = data.lock[s.id]; // a locked share opens locked
          await put(last);
          mirror(last);
          mount(last);
        }
        last.title = titleOf(last.id); // the title as edited (the ops), not the base the file started from
        await put(last);
        mirror(last);
        show(last.id);
        done();
        toast(t('libImported', { name: last.title }), 'ok');
        return last;
      }
      // any other HTML, a DOCX or a PDF: the server reads its headings, tables and title (engine/import)
      if (!served) { done(); toast(t('libNeedsServer'), 'warn'); return null; }
      const b64 = (await readAs(file, 'url')).split(',')[1];
      const r = await fetch('/api/import', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, data: b64 }) }).catch(() => null);
      const j = await r?.json().catch(() => ({}));
      if (!r?.ok || !j?.doc) { done(); toast(t('libImpFailed', { name, why: r ? (j?.error || r.status) : t('libImpNoServer') }), 'err'); return null; }
      const entry = await fromDocs({ [j.locale]: JSON.stringify(j.doc, null, 1) }, 'import');
      done();
      toast(t('libImported', { name: entry.title }), 'ok');
      return entry;
    } catch (e) {
      done();
      toast(t('libImpFailed', { name, why: String(e.message || e).slice(0, 200) }), 'err');
      return null;
    }
  }
  async function remove(id) {
    const e = await get(id);
    if (!e) return;
    e.deletedAt = new Date().toISOString();
    await put(e);
    mirror(e);
    if (S.svc === id) show([...TEMPLATES][0]);
  }
  async function restore(id) { const e = await get(id); if (!e) return; delete e.deletedAt; await put(e); mirror(e); }
  async function purge(id) { await drop(id); mirror({ id, purge: true }); }
  async function duplicate(id) {
    const e = await get(id);
    if (!e) return null;
    const now = new Date().toISOString();
    const copy = { ...JSON.parse(JSON.stringify(e)), id: `doc-${uuid()}`, origin: 'copy', createdAt: now, savedAt: now, from: id };
    delete copy.deletedAt;
    delete copy.htmlFiles; // the copy gets its own file at its first Save, never the source's
    delete copy.prov; // the copy forks the source's live log (31-provenance follows copy.from), not the source's import-time log
    await put(copy);
    mirror(copy);
    mount(copy);
    show(copy.id);
    return copy;
  }

  /* «نسخ كقالب»: a document's design, header/footer items, logos, page setup and chapter/section titles, with empty bodies */
  const isTpl = (e) => e?.kind === 'template';
  function emptied(doc) {
    const x = JSON.parse(JSON.stringify(doc));
    for (const c of x.chapters || []) for (const s of c.sections || []) s.blocks = [{ kind: 'prose', paragraphs: [''] }];
    Object.assign(x, { revisions: [], approvals: [], openQuestions: [] });
    delete x.harvest; delete x.manual;
    if (x.overlays) x.overlays = x.overlays.filter((o) => o.kind === 'logo');
    if (x.control) Object.assign(x.control, { documentId: '', issuedOn: '' });
    return x;
  }
  async function saveTemplate(id = S.svc) {
    if (!M[id]) { const e = await get(id); if (!e) return null; mount(e); }
    const now = new Date().toISOString();
    const editions = {};
    for (const [ed, e] of Object.entries(M[id])) editions[ed] = { raw: JSON.stringify(emptied(e.doc), null, 1) };
    const tpl = { id: `tpl-${uuid()}`, kind: 'template', title: titleOf(id), from: id, createdAt: now, savedAt: now, theme: JSON.parse(JSON.stringify(S.theme)), editions };
    await put(tpl);
    toast(t('libTplSaved', { name: tpl.title }), 'ok');
    return tpl;
  }
  async function fromTemplate(id) {
    const tpl = await get(id);
    if (!isTpl(tpl)) return null;
    if (tpl.theme) S.theme = JSON.parse(JSON.stringify(tpl.theme));
    return fromDocs(Object.fromEntries(Object.entries(tpl.editions).map(([ed, x]) => [ed, x.raw])), 'template', false);
  }

  /* per-document metrics (A12), read from the document's provenance log through BWLOG1 (read only) */
  async function metricsOf(e) {
    const doc = DATA.prov?.[e.id]?.doc || ls.get(`bw:prov-doc:${DATA.setId}:${e.id}`);
    let entries = EXT.ledger?.log?.(e.id)?.entries;
    if (!entries?.length && doc && typeof BWLOG1 !== 'undefined') {
      try {
        const mir = served ? await (await fetch(`/api/history?doc=${encodeURIComponent(doc)}`)).json() : typeof MIRROR !== 'undefined' ? await MIRROR.get(doc) : {};
        if (mir?.log) entries = (await BWLOG1.unseal(mir.log, doc)).entries;
      } catch { /* no log here */ }
    }
    const by = typeof BWLOG1 !== 'undefined' ? BWLOG1.metrics(entries || []) : {};
    const ps = Object.values(by);
    return {
      edits: ps.reduce((a, p) => a + p.edits, 0),
      minutes: Math.round(ps.reduce((a, p) => a + p.activeMs, 0) / 60000),
      who: [...new Set(ps.map((p) => p.name).filter(Boolean))],
      signer: (entries || []).filter((x) => x.kind === 'sign').at(-1)?.actor?.name || '',
      locked: !!e.lock?.locked,
    };
  }
  async function paintMetrics(d) {
    for (const li of d.querySelectorAll('.lib-docs li[data-id]')) {
      const e = await get(li.dataset.id);
      if (!e) continue;
      const m = await metricsOf(e);
      const el = li.querySelector('.lib-m');
      if (!el) continue;
      Object.assign(el.dataset, { edits: m.edits, minutes: m.minutes, who: m.who.join('|'), signer: m.signer, locked: m.locked ? '1' : '0' });
      el.textContent = [t('libMEdits', { n: m.edits }), t('libMMinutes', { n: m.minutes }), m.who.length ? t('libMWho', { who: m.who.join(S.ui === 'ar' ? '، ' : ', ') }) : '', m.signer ? t('libMSigner', { name: m.signer }) : '', m.locked ? t('libMLocked') : ''].filter(Boolean).join(' · ');
    }
    d.dataset.libMetrics = String(++seq);
  }

  /* drawer */
  const when = (iso) => { try { return new Date(iso).toLocaleString(S.ui === 'ar' ? 'ar' : 'en', { dateStyle: 'medium', timeStyle: 'short' }); } catch { return iso; } };
  const row = (e, trash) => `<li data-id="${esc(e.id)}"${e.id === S.svc ? ' aria-current="true"' : ''}><b class="lib-t">${esc(e.title)}</b> <small>${esc(when(e.savedAt))}</small>${trash ? '' : '<small class="lib-m"></small>'}<div class="btns">${trash
    ? `<button type="button" data-lib="restore">${esc(t('libUndelete'))}</button><button type="button" data-lib="purge">${esc(t('libPurge'))}</button>`
    : `<button type="button" data-lib="open">${esc(t('libOpen'))}</button><button type="button" data-lib="tab">${esc(t('libTab'))}</button><button type="button" data-lib="dup">${esc(t('libDup'))}</button><button type="button" data-lib="tpl">${esc(t('libTpl'))}</button><button type="button" data-lib="del">${esc(t('delete'))}</button>`}</div></li>`;
  const tplRow = (e) => `<li data-id="${esc(e.id)}"><b class="lib-t">${esc(e.title)}</b> <small>${esc(when(e.savedAt))}</small><div class="btns"><button type="button" data-lib="fromtpl">${esc(t('libFromTpl'))}</button><button type="button" data-lib="purge">${esc(t('delete'))}</button></div></li>`;
  async function fill(d) {
    const box = d.querySelector('.lib');
    if (!box) return;
    const q = fold(String(d.querySelector('[data-lib-q]')?.value || '').normalize('NFKC'));
    const list = (await all() || []).sort((a, b) => String(b.savedAt).localeCompare(String(a.savedAt)));
    const tpls = list.filter(isTpl);
    const live = list.filter((e) => !isTpl(e) && !e.deletedAt && (!q || fold(e.title.normalize('NFKC')).includes(q)));
    const trash = list.filter((e) => !isTpl(e) && e.deletedAt);
    box.innerHTML = `<ol class="list lib-docs">${live.map((e) => row(e, false)).join('') || `<li class="hint">${esc(t('libEmpty'))}</li>`}</ol>${trash.length ? `<details class="lib-trash"><summary>${esc(t('libTrash'))} (${trash.length})</summary><ol class="list">${trash.map((e) => row(e, true)).join('')}</ol></details>` : ''}${tpls.length ? `<details class="lib-tpls" open><summary>${esc(t('libTpls'))} (${tpls.length})</summary><ol class="list">${tpls.map(tplRow).join('')}</ol></details>` : ''}`;
    d.dataset.libCount = String(live.length);
    d.dataset.libTrash = String(trash.length);
    d.dataset.libTpls = String(tpls.length);
    paintMetrics(d);
  }
  async function click(ev, d) {
    const b = ev.target.closest('[data-lib]');
    if (!b) return;
    const k = b.dataset.lib, id = b.closest('[data-id]')?.dataset.id;
    if (k === 'new') { if (await newDocument()) { closeDrawer(); toast(t('libNewMade'), 'ok'); return; } }
    else if (k === 'import') await importAny(await pickFile(ACCEPT));
    else if (k === 'open') { if (await open(id)) { closeDrawer(); return; } }
    else if (k === 'tab') window.open(`${location.pathname}#doc=${encodeURIComponent(id)}`, '_blank');
    else if (k === 'dup') await duplicate(id);
    else if (k === 'tpl') await saveTemplate(id);
    else if (k === 'fromtpl') { if (await fromTemplate(id)) { closeDrawer(); return; } }
    else if (k === 'del') await remove(id);
    else if (k === 'restore') await restore(id);
    else if (k === 'purge') await purge(id);
    if (S.drawer === 'library') fill(root.querySelector('.drawer'));
    else if (d) fill(d);
  }
  const drawer = () => ({
    title: t('library'),
    html: `<div class="btns"><button type="button" class="b primary" data-lib="new"><span class="w">${esc(t('libNew'))}</span></button><button type="button" class="b" data-lib="import"><span class="w">${esc(t('libImport'))}</span></button></div><label class="lib-q"><span class="vh">${esc(t('libSearch'))}</span><input type="search" data-lib-q placeholder="${esc(t('libSearch'))}"></label><div class="lib" aria-live="polite"></div>`,
    mount: (d) => {
      fill(d);
      d.querySelector('[data-lib-q]').addEventListener('input', () => fill(d));
      d.querySelector('.btns').addEventListener('click', (ev) => click(ev, d));
      d.querySelector('.lib').addEventListener('click', (ev) => click(ev, d));
    },
  });

  /** #doc=<id> in the address (Open in new tab): load that entry once the editor has booted. Otherwise, when the
   *  autosaved draft holds edits of a library document, offer it back (editor.js offerRecovery only knows templates). */
  async function fromHash() {
    const m = /[#&]doc=([^&]+)/.exec(location.hash);
    if (m) {
      const id = decodeURIComponent(m[1]);
      if (!(await open(id))) return;
      // the autosaved draft is written within 0.4 s of a change, the list entry within 0.6 s: a reload in between keeps the
      // newer draft (same base, the entry's ops plus more), applied quietly: no restore banner
      const x = readDraft()?.svc?.[id] || {};
      const newer = Object.fromEntries(Object.entries(x).filter(([ed, y]) => { const e = M[id]?.[ed]; return e && e.hash === y.hash && (y.ops || []).length > e.ops.length && e.ops.every((o, i) => y.ops[i]?.id === o.id); }));
      if (Object.keys(newer).length) { loadDraft({ svc: { [id]: newer } }); render(false); persist(id); }
      return;
    }
    if (document.documentElement.dataset.bwResumed || new URLSearchParams(location.search).get('tab')) return;
    const d = readDraft();
    const ids = Object.entries(d?.svc || {}).filter(([id, x]) => isDoc(id) && Object.values(x).some((e) => e.ops?.length)).map(([id]) => id);
    const found = (await Promise.all(ids.map(get))).filter((e) => e && !e.deletedAt).sort((a, b) => String(b.savedAt).localeCompare(String(a.savedAt)));
    if (!found.length) return;
    const e = found[0];
    banner(t('libRestore', { name: e.title }), [
      [t('restoreYes'), () => { mount(e); loadDraft({ svc: { [e.id]: d.svc[e.id] } }); show(e.id); }],
      [t('restoreNo'), () => {}],
    ]);
  }
  return { all, get, put, open, adopt, save, saveInPlace, captureHtml, ACCEPT, persist, persistSoon, persistNow, stamp, saveTemplate, fromTemplate, metricsOf, newDocument, importAny, remove, restore, purge, duplicate, entryOf, titleOf, syncTitle, syncAll, onCommit, isDoc, fromHash, drawer, TEMPLATES };
})();

IC.library = '<svg aria-hidden="true" focusable="false" class="ic" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" > <path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2" /> </svg>';
bwExt({
  cmds: [{ id: 'library', group: 'file', key: 'Ctrl+O', edit: false }],
  actions: { library: () => openDrawer('library') },
  drawers: { library: LIB.drawer },
  expose: { library: LIB },
  on: {
    boot: () => { LIB.fromHash(); },
    // Ctrl+O = «المستندات» (open a document); the toolbar tool sits in File
    keydown: (e) => { if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'o') { e.preventDefault(); openDrawer('library'); return true; } return false; },
    // H3: Save = the document itself (its list entry + its own HTML file), never a download
    save: () => { LIB.saveInPlace().then(() => { window.BW.libSaved = (window.BW.libSaved || 0) + 1; }); },
    // the autosave writes the list entry too (a library document): what the list reopens is what was on screen
    commit: (ops, ed) => { LIB.onCommit(ops, ed); LIB.persistSoon(); },
    beforeExport: () => LIB.syncAll(),
    saveHtml: () => setTimeout(LIB.persistSoon, 0), // after the timeline's Save HTML mark
    render: () => LIB.stamp(),
    pagehide: () => { LIB.persistNow(); },
  },
});
/* H3: Ctrl+S and the yellow Save (editor.js saveAll) on the local server save the document in place (the 'save' event
 * above) and download nothing: the edits file they used to download is Export › edits. Off the server: as before. */
{ const plain = saveAll; saveAll = function () { if (!EXT.session?.info) return plain(); writeDraft(); S.dirty = false; emitHook('save'); emit('save'); }; }
// the hover explainers of Save and Import say what they do now (editor/ux-i18n.json is outside this change's write-set)
Object.assign(I18N.ui.ar, { 'explain.save': 'يحفظ الوثيقة نفسها: في قائمة المستندات وفي ملفها HTML داخل مجلد الحفظ (Ctrl+S).', 'explain.import': 'يفتح ملف HTML (ومنه ملفات المشاركة) أو DOCX أو PDF أو JSON كمستند جديد في القائمة.' });
Object.assign(I18N.ui.en, { 'explain.save': 'Saves the document itself: in the documents list and in its own HTML file in the save folder (Ctrl+S).', 'explain.import': 'Opens an HTML (shares included), DOCX, PDF or JSON file as a new document in the list.' });
/* H3: File › Import is the documents list's import (HTML incl. shares, DOCX, PDF, JSON); edits files still merge */
{ const plain = runAction; runAction = async function (a) { if (a === 'import') { await LIB.importAny(await pickFile(LIB.ACCEPT)); return; } return plain(a); }; window.BW.runAction = runAction; }
// «حُفظ تلقائياً» toast → the «آخر حفظ» stamp beside the change counter (extra 1): it says what was saved where and when
{ const plain = flash; flash = function (msg, bad = false) { if (!bad && msg === t('autosaved')) { LIB.stamp(); return; } return plain(msg, bad); }; }
