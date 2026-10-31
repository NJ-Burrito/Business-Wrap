/* Power off (owner request 2026-10-29). A command (Settings › Local server, under the single server toggle; no top-bar button since 0.15.0), only when the editor is served by the local
 * host: a confirm dialog (Cancel has the focus, Esc cancels) → this tab and every other tab of this host save
 * (the draft, the library entry, the session state) → POST /api/power/off (engine/routes/power.mjs) → the «stopped»
 * page. The server then stops everything this install started, Edge windows on its own profile included, and itself.
 * Other tabs hear it on a BroadcastChannel and save and show the same page. */
IC.powerOff = '<svg aria-hidden="true" focusable="false" class="ic" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" > <path d="M12 2v10" /> <path d="M18.4 6.6a9 9 0 1 1-12.77.04" /> </svg>';
const PW = (() => {
  const served = location.protocol.startsWith('http');
  let bc = null;
  try { bc = new BroadcastChannel('bw-power'); } catch { /* no channel: this tab only */ }
  async function saveHere() {
    try { writeDraft(); } catch { /* nothing to write */ }
    try { await EXT.library?.persistNow?.(); } catch { /* not a library document */ }
    try { EXT.session?.flush?.(); } catch { /* no session */ }
  }
  function stopped() {
    if (root.querySelector('.pw-off')) return;
    const d = document.createElement('div');
    d.className = 'pw-off';
    d.setAttribute('role', 'alert');
    d.dataset.theme = S.dark ? 'dark' : 'light';
    d.innerHTML = `<div class="pw-card"><span class="pw-mark">${IC.powerOff}</span><h2>${esc(t('pwOffTitle'))}</h2><p>${esc(t('pwOffLead'))}</p></div>`;
    (root.querySelector('.shell') || root).appendChild(d);
    document.title = t('pwOffTitle');
    document.documentElement.dataset.bwPower = 'off';
  }
  bc && (bc.onmessage = async (e) => { if (e.data === 'off') { await saveHere(); stopped(); } });
  function confirmOff() {
    const d = root.querySelector('.dialog');
    d.hidden = false;
    d.setAttribute('aria-label', t('pwTitle'));
    d.classList.add('pw-dlg');
    d.innerHTML = `<h2>${esc(t('pwTitle'))}</h2><p>${esc(t('pwLead'))}</p><div class="btns"><button type="button" class="b danger" data-k="pw-yes"><span class="i">${IC.powerOff}</span><span class="w">${esc(t('pwYes'))}</span></button><button type="button" class="b" data-k="pw-no"><span class="w">${esc(t('pwNo'))}</span></button></div><p class="hint pw-out" role="status"></p>`;
    d.querySelector('[data-k="pw-no"]').focus();
    document.documentElement.dataset.bwPower = 'asked';
    return new Promise((res) => {
      const done = (v) => { d.hidden = true; d.classList.remove('pw-dlg'); d.onclick = d.onkeydown = null; if (!v) document.documentElement.dataset.bwPower = 'cancelled'; res(v); };
      d.onclick = (e) => { const k = e.target.closest('button')?.dataset.k; if (k) done(k === 'pw-yes'); };
      d.onkeydown = (e) => { if (e.key === 'Escape') done(false); };
    });
  }
  async function off() {
    if (!served || !(await confirmOff())) return;
    await saveHere();
    bc?.postMessage('off');
    try {
      const r = await fetch('/api/power/off', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ confirm: true }) });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || r.status);
      stopped();
    } catch (e) { toast(t('pwFailed', { e: e.message || e }), 'warn'); document.documentElement.dataset.bwPower = 'failed'; }
  }
  /* 0.15.0 w2: no toolbar button. The command stays (the `powerOff` action) and Settings › Local server shows it under the one server toggle (settings.js). */
  return { off, confirmOff, stopped };
})();

/* 0.14.0 D2: once the performance report PDF is made (Settings › report, served), «افتح المجلد / Open folder» appears beside
 * its result: POST /api/workspace/open { file } shows that PDF in the file manager. The report panel (30-profile.js) is not
 * touched: the one POST /api/report answer is watched here. file:// has no report (it reads the server's logs). */
const RPT = (() => {
  if (!location.protocol.startsWith('http')) return {};
  const f0 = window.fetch.bind(window);
  const isReport = (input, init) => { try { const u = String(typeof input === 'string' ? input : input?.url || '').split('?')[0]; return /\/api\/report$/.test(u) && String(init?.method || input?.method || 'GET').toUpperCase() === 'POST'; } catch { return false; } };
  function offer(pdf) {
    const out = root.querySelector('[data-rp="out"]');
    if (!out) return false;
    out.parentElement.querySelector('[data-rp="open"]')?.remove();
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'b';
    b.dataset.rp = 'open';
    b.dataset.file = pdf;
    b.innerHTML = `<span class="w">${esc(t('rpOpenFolder'))}</span>`;
    b.title = t('rpOpenFolderTip', { x: pdf });
    b.addEventListener('click', async () => {
      try {
        const r = await f0('/api/workspace/open', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ file: pdf }) });
        if (!r.ok) throw new Error('open');
        document.documentElement.dataset.bwReportFolder = 'opened';
      } catch { toast(t('rpOpenFolderFail', { x: pdf }), 'warn'); document.documentElement.dataset.bwReportFolder = 'failed'; }
    });
    out.insertAdjacentElement('afterend', b);
    return true;
  }
  window.fetch = function (input, init) {
    const p = f0(input, init);
    if (isReport(input, init)) p.then((r) => (r.ok ? r.clone().json() : null)).then((j) => { if (j?.pdf) offer(j.pdf); }).catch(() => {});
    return p;
  };
  return { offer };
})();

bwExt({
  cmds: location.protocol.startsWith('http') ? [{ id: 'powerOff', group: 'view', edit: false }] : [], // file:// has no host to turn off
  actions: { powerOff: () => PW.off() },
  expose: { power: PW, reportFolder: RPT },
});
