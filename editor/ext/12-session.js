/* A10 session + A11 save folder, the page half (0.13.0). Only on the local server with a save folder
 * (GET /api/session/info answers): each tab has a tabId (sessionStorage, or ?tab= when the server reopened it),
 * holds a live connection (EventSource), pushes its state 1.5 s after a change and flushes it with sendBeacon on
 * pagehide, so closing the last tab saves every tab and the host stops. A fresh tab asks for the last run: a modal
 * offers (1) resume everything (the server opens all tabs) or (2) new work. Save HTML goes into the save folder's
 * HTML\ instead of the downloads; the first Save or export asks for the parent folder once; Settings «مجلد الحفظ».
 */
const SESS = (() => {
  const P = new URLSearchParams(location.search);
  let info = null, tab = null, es = null, timer = 0;
  const json = (u, b) => fetch(u, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }).then((r) => r.json().catch(() => ({})));
  const newId = () => `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  function payload() {
    const lib = EXT.library;
    return { tab, title: lib ? lib.titleOf() : cur().doc.control?.title || S.svc, svc: S.svc, ed: S.ed, entry: lib?.isDoc(S.svc) ? lib.entryOf(S.svc) : null, snap: snapshotState() };
  }
  const push = () => { clearTimeout(timer); timer = 0; if (info) json('/api/session/state', payload()).catch(() => {}); };
  const soon = () => { if (!info) return; clearTimeout(timer); timer = setTimeout(push, 1500); };
  function flush() {
    if (!info) return;
    clearTimeout(timer);
    const body = JSON.stringify(payload());
    if (!navigator.sendBeacon?.('/api/session/flush', new Blob([body], { type: 'application/json' }))) fetch('/api/session/flush', { method: 'POST', body, keepalive: true }).catch(() => {});
  }
  async function apply(rec) {
    if (rec.entry && EXT.library) await EXT.library.adopt(rec.entry);
    else if (rec.snap) {
      loadDraft(rec.snap);
      if (M[rec.svc]) { S.svc = rec.svc; S.ed = M[rec.svc][rec.ed] ? rec.ed : Object.keys(M[rec.svc])[0]; }
      buildUi();
      render(false);
      emit('open', S.svc, S.ed);
    }
    document.documentElement.dataset.bwResumed = '1';
  }
  function modal(last) {
    const dlg = document.createElement('dialog');
    dlg.className = 'bw-resume';
    dlg.setAttribute('aria-labelledby', 'bw-resume-h');
    dlg.innerHTML = `<h2 id="bw-resume-h">${esc(t('sessTitle'))}</h2><p>${esc(t('sessLead', { n: last.tabs.length }))}</p><ol class="list">${last.tabs.slice(0, 12).map((x) => `<li>${esc(x.title || x.tab)}</li>`).join('')}${last.tabs.length > 12 ? `<li>… +${last.tabs.length - 12}</li>` : ''}</ol><div class="btns"><button type="button" class="b primary" data-s="resume"><span class="w">${esc(t('sessResume', { n: last.tabs.length }))}</span></button><button type="button" class="b" data-s="new"><span class="w">${esc(t('sessNew'))}</span></button></div><p class="hint out" role="status"></p>`;
    root.appendChild(dlg);
    dlg.addEventListener('click', async (ev) => {
      const k = ev.target.closest('[data-s]')?.dataset.s;
      if (!k) return;
      dlg.querySelectorAll('button').forEach((b) => { b.disabled = true; });
      const r = await json(`/api/session/${k}`, { runId: last.runId });
      if (k === 'resume') { dlg.querySelector('.out').textContent = r.ok ? t('sessOpened', { n: r.n }) : String(r.error || ''); document.documentElement.dataset.bwResume = r.ok ? 'resumed' : 'failed'; }
      else { document.documentElement.dataset.bwResume = 'new'; await EXT.library?.newDocument(); }
      setTimeout(() => { dlg.close(); dlg.remove(); }, k === 'resume' ? 1200 : 0);
    });
    dlg.showModal();
    document.documentElement.dataset.bwResume = 'asked';
  }

  /* A11: the save folder */
  async function ensureFolder() {
    if (!info || info.workspace.chosen) return true;
    const r = await json('/api/workspace/pick', {});
    if (r.ok) { info.workspace = { root: r.root, chosen: true }; toast(t('wsChosen', { dir: r.root }), 'ok'); }
    return !!r.ok;
  }
  const _download = download;
  download = function (name, text, type) {
    if (!info || !/\.editor\.html$/.test(name)) return _download(name, text, type);
    ensureFolder().then(() => json('/api/workspace/html', { title: EXT.library ? EXT.library.titleOf() : S.svc, locale: S.ed, html: text })).then((r) => {
      if (r.ok) toast(t('wsSavedHtml', { file: r.file }), 'ok');
      else _download(name, text, type);
    }).catch(() => _download(name, text, type));
  };

  async function boot() {
    if (!location.protocol.startsWith('http')) return;
    try { const r = await fetch('/api/session/info'); if (!r.ok) return; info = await r.json(); } catch { return; }
    let resumed = null;
    if (P.get('tab')) {
      tab = P.get('tab');
      try { const r = await fetch(`/api/session/tab?tab=${encodeURIComponent(tab)}`); if (r.ok) resumed = await r.json(); } catch { /* fresh */ }
    }
    try { tab ||= sessionStorage.getItem('bw:tab'); } catch { /* no storage */ }
    tab ||= newId();
    try { sessionStorage.setItem('bw:tab', tab); } catch { /* no storage */ }
    es = new EventSource(`/api/session/live?tab=${encodeURIComponent(tab)}`);
    es.addEventListener('flush', flush);
    if (resumed) await apply(resumed);
    else {
      const last = await fetch('/api/session/last').then((r) => r.json()).catch(() => null);
      if (last?.tabs?.length) modal(last);
    }
    push();
    document.documentElement.dataset.bwSession = tab;
  }
  const card = () => (info ? `<p class="hint">${esc(t('wsLead'))}</p><p><code class="ws-root">${esc(info.workspace.root)}</code></p><div class="btns"><button type="button" class="b" data-ws="pick"><span class="w">${esc(t('wsChange'))}</span></button></div>` : `<p class="hint">${esc(t('wsServerOnly'))}</p>`);
  const mountCard = (el) => el?.querySelector('[data-ws="pick"]')?.addEventListener('click', async () => {
    const r = await json('/api/workspace/pick', {});
    if (r.ok) { info.workspace = { root: r.root, chosen: true }; el.querySelector('.ws-root').textContent = r.root; }
  });
  return { boot, push, soon, flush, ensureFolder, card, mountCard, get tab() { return tab; }, get info() { return info; } };
})();

bwExt({
  settings: [{ id: 'workspace', title: 'wsTitle', html: SESS.card, mount: SESS.mountCard }],
  expose: { session: SESS },
  on: {
    boot: () => { SESS.boot(); },
    commit: () => SESS.soon(),
    save: () => { SESS.ensureFolder(); SESS.soon(); },
    export: () => SESS.push(),
    pagehide: () => SESS.flush(),
  },
});
