/* Business-Wrap editor — the Settings page (0.11.0), concatenated after update.js.
 * A drawer («الإعدادات» / Settings), reached from the toolbar's View section and Ctrl+K, in four cards:
 * About (name, logo, version, release date, repository, licence, credits — embedded at build time, so it shows
 * from file:// too), Update (installed vs latest, last check, «تحقّق الآن», auto-check on launch) and Preferences
 * (language, word direction, page view, reduced motion, explainer cards), each written to the store it already had
 * (bw:ui, bw:dir:<ed>, bw:pages, bw:calm, bw:explainers, bw:update-auto), and Local learning («التعلّم المحلي»,
 * mounted by learning-hook.js through BW_LEARNING.mount(el)). The check itself is update.js (BW_UPDATE):
 * from file:// nothing is fetched, the card says why and how to update instead.
 * Declarations only (hoisted): openDrawer('settings') calls them. */

function setStamp(ts) {
  if (!ts) return t('set.never');
  try { return new Date(ts).toLocaleString(S.ui === 'ar' ? 'ar-u-nu-latn' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' }); } catch { return new Date(ts).toISOString(); }
}
/** One line saying where the update check stands (never a guess: what the last check answered, or why it could not). */
function setStatusText(st) {
  if (!updServed()) return '';
  if (!st) return '';
  if (st.status === 'checking') return t('set.st.checking');
  if (st.status === 'available') return t('set.st.available', { v: st.latest });
  if (st.status === 'current') return t('set.st.current');
  if (st.status === 'off') return t('set.st.off');
  return t(`set.why.${st.reason || 'error'}`);
}
function setUpdateInner() {
  const st = updState();
  const served = updServed();
  const avail = st?.status === 'available' && st.current === DATA.version;
  const latest = avail ? st.latest : st?.status === 'current' ? DATA.version : '—';
  return `<dl class="set-dl">
<dt>${esc(t('set.version'))}</dt><dd><bdi dir="ltr">${esc(DATA.version || '—')}</bdi></dd>
<dt>${esc(t('set.latest'))}</dt><dd><bdi dir="ltr">${esc(latest)}</bdi>${avail ? ` <span class="set-new">${esc(t('upd.whatsNew'))}</span>` : ''}</dd>
<dt>${esc(t('set.lastChecked'))}</dt><dd>${esc(setStamp(st?.checkedAt))}</dd>
</dl>
<p class="set-status" role="status" aria-live="polite" data-st="${esc(st?.status || '')}">${esc(setStatusText(st))}</p>
<div class="btns"><button type="button" class="b primary" data-k="updCheck"><span class="i">${ic('updCheck')}</span><span class="w">${esc(t('set.checkNow'))}</span></button>${avail ? `<button type="button" class="b" data-k="updNow"><span class="i">${ic('update')}</span><span class="w">${esc(t('set.updateNow'))}</span></button>` : ''}</div>
<label class="chk"><input type="checkbox" data-set="auto" ${updAuto() ? 'checked' : ''}> ${esc(t('set.auto'))}</label>
${served ? '' : `<div class="set-file"><p>${esc(t('set.file'))}</p><p><b>${esc(t('set.fileServe'))}</b><code dir="ltr">npm run serve -- &lt;editor.html&gt;</code></p><p><b>${esc(t('set.fileCli'))}</b><code dir="ltr">npx business-wrap update --apply --yes</code></p></div>`}
<p class="hint">${esc(t('set.dataSafe'))}</p>`;
}
function setSeg(k, items, label) {
  return `<div class="set-seg" role="group" aria-label="${esc(label)}">${items.map(([v, word, on, lang]) => `<button type="button" data-k="${k}" data-v="${v}" aria-pressed="${on}"${lang ? ` lang="${lang}"` : ''}>${esc(word)}</button>`).join('')}</div>`;
}
function settingsPanel() {
  const A = DATA.about || { name: 'Business-Wrap', version: DATA.version, credits: [] };
  const repoText = String(A.repo || '').replace(/^https:\/\//, '');
  return `<div class="set">
<section class="card set-about" aria-labelledby="set-h-about"><h3 id="set-h-about"><span class="i">${ic('about')}</span>${esc(t('set.about'))}</h3>
<div class="set-id"><span class="set-logo" aria-hidden="true">${DATA.brand?.mark || ''}</span><p><b class="set-name" dir="ltr">${esc(A.name || 'Business-Wrap')}</b> <bdi class="set-ver" dir="ltr">${esc(A.version || DATA.version || '')}</bdi></p></div>
<dl class="set-dl">
<dt>${esc(t('set.version'))}</dt><dd><bdi dir="ltr">${esc(A.version || DATA.version || '—')}</bdi></dd>
<dt>${esc(t('set.date'))}</dt><dd><bdi dir="ltr">${esc(A.date || '—')}</bdi></dd>
<dt>${esc(t('set.repo'))}</dt><dd>${A.repo ? `<a href="${esc(A.repo)}" target="_blank" rel="noopener noreferrer" dir="ltr">${esc(repoText)}</a>` : '—'}</dd>
<dt>${esc(t('set.license'))}</dt><dd>${esc(A.license || '—')}</dd>
<dt>${esc(t('set.credits'))}</dt><dd>${esc((A.credits || []).join(' · '))}</dd>
</dl>${t('pfTrustLimit') !== 'pfTrustLimit' ? `<p class="hint set-limit">${esc(t('pfTrustLimit'))}</p>` : ''}</section>
<section class="card set-upd" aria-labelledby="set-h-upd"><h3 id="set-h-upd"><span class="i">${ic('update')}</span>${esc(t('set.update'))}</h3>
<div class="set-upd-body">${setUpdateInner()}</div></section>
<section class="card set-srv" aria-labelledby="set-h-srv"><h3 id="set-h-srv"><span class="i">${ic('connect')}</span>${esc(t('srv.title'))}</h3>
<div class="set-srv-body">${srvInner()}</div></section>
<section class="card set-prefs" aria-labelledby="set-h-prefs"><h3 id="set-h-prefs"><span class="i">${ic('prefs')}</span>${esc(t('set.prefs'))}</h3>
<div class="set-row"><span class="set-k">${esc(t('set.lang'))}</span>${setSeg('setLang', [['ar', 'ع العربية', S.ui === 'ar', 'ar'], ['en', 'E English', S.ui === 'en', 'en']], t('set.lang'))}</div>
<div class="set-row"><span class="set-k">${esc(t('set.dir'))}</span>${setSeg('setDir', ['rtl', 'ltr'].map((d) => [d, t(d), uiDir() === d]), t('set.dir'))}</div>
<div class="set-row"><span class="set-k">${esc(t('set.view'))}</span>${setSeg('setView', viewModes().map((m) => [m, t('view.' + m), viewsMode() === m]), t('set.view'))}</div>
<label class="chk"><input type="checkbox" data-set="calm" ${S.calm ? 'checked' : ''}> ${esc(t('set.calm'))}</label>
<label class="chk"><input type="checkbox" data-set="explain" ${ls.get('bw:explainers') !== '0' ? 'checked' : ''}> ${esc(t('set.explain'))}</label>
<label class="chk"><input type="checkbox" data-set="explainAlways" ${ls.get('bw:explainers') === 'always' ? 'checked' : ''}${ls.get('bw:explainers') === '0' ? ' disabled' : ''}> ${esc(t('set.explainAlways'))}</label>
</section>
<section class="card set-lrn" aria-labelledby="set-h-lrn"><h3 id="set-h-lrn"><span class="i">${ic('learning')}</span>${esc(t('learning'))}</h3>
<div class="set-lrn-body" data-lrn-mount></div></section>${EXT.settings.map((c) => `<section class="card set-x-${esc(c.id)}" aria-labelledby="set-h-${esc(c.id)}"><h3 id="set-h-${esc(c.id)}"><span class="i">${ic(c.icon || 'prefs')}</span>${esc(t(c.title))}</h3>${c.html()}</section>`).join('')}</div>`; // + extension cards
}
/** Redraw the Update card in place (keeps the drawer, its scroll and the focus on the pressed button). */
function setRefreshUpdate(focusKey) {
  const body = root.querySelector('.drawer .set-upd-body');
  if (!body) return;
  body.innerHTML = setUpdateInner();
  if (focusKey) body.querySelector(`[data-k="${focusKey}"]`)?.focus();
}
/** A click inside the Settings drawer; true when handled. */
async function settingsClick(x) {
  const k = x.dataset.k;
  const v = x.dataset.v;
  if (k === 'updCheck') {
    const out = root.querySelector('.drawer .set-status');
    if (!updServed()) { if (out) out.textContent = t('set.fileWhy'); return true; } // file://: nothing is fetched, ever
    if (out) { out.textContent = t('set.st.checking'); out.dataset.st = 'checking'; }
    x.disabled = true;
    const u = await window.BW_UPDATE.check(true);
    setRefreshUpdate('updCheck');
    if (u?.status === 'available') window.BW_UPDATE.popup(u, { manual: true });
    return true;
  }
  if (k === 'updNow') { const st = updState(); if (st?.status === 'available') window.BW_UPDATE.popup(st, { manual: true }); return true; }
  if (k === 'srvStart') { srvStart(); return true; }
  if (k === 'srvStop') { srvStop(); return true; }
  if (k === 'srvOpen') { location.href = `http://127.0.0.1:${Number(v)}/`; return true; }
  if (k === 'setLang') { setLang(v); return true; }
  if (k === 'setDir') { setDir(v); return true; }
  if (k === 'setView') { viewsSet(v); return true; }
  return false;
}
function settingsChange(el) {
  const k = el.dataset.set;
  if (k === 'auto') ls.set('bw:update-auto', el.checked ? '1' : '0');
  if (k === 'explain') { ls.set('bw:explainers', el.checked ? '1' : '0'); if (!el.checked) xplHide(); const al = root.querySelector('.drawer [data-set="explainAlways"]'); if (al) { al.disabled = !el.checked; al.checked = false; } }
  if (k === 'explainAlways') ls.set('bw:explainers', el.checked ? 'always' : '1'); // off / once (default) / always
  if (k === 'calm') { S.calm = el.checked; ls.set('bw:calm', S.calm ? '1' : '0'); buildUi(); root.querySelector('.drawer [data-set="calm"]')?.focus(); }
}

/* ── Servers (0.13.3): start / stop. A file:// page cannot start a process, so it asks the installed Business-Wrap through the
 *    per-user business-wrap: URL protocol (engine/protocol.mjs); a served page talks to its own server (engine/routes/servers.mjs). ── */
const SRV = { found: [], note: '', busy: false, asked: false }; // found: ports that answer (file:// only)
function srvServed() { return /^https?:$/.test(location.protocol); }
/** The ports a file:// page asks: 4317-4327. window.__bwProbePorts is a test hook only (the tests run their own servers on free ports). */
function srvPorts() { return Array.isArray(window.__bwProbePorts) ? window.__bwProbePorts : Array.from({ length: 11 }, (_, i) => 4317 + i); }
async function srvProbe() {
  const found = [];
  await Promise.all(srvPorts().map(async (p) => {
    try {
      const j = await (await fetch(`http://127.0.0.1:${p}/api/version`, { cache: 'no-store', signal: AbortSignal.timeout(900) })).json();
      if (j && j.name === 'Business-Wrap') found.push(p);
    } catch { /* nothing answers on this port */ }
  }));
  return found.sort((a, b) => a - b);
}
/** This file's own path for business-wrap://open?file=…, from location (a drive letter becomes C:\…); '' for a network path. */
function srvFilePath() {
  if (location.protocol !== 'file:' || location.host) return '';
  let f = '';
  try { f = decodeURIComponent(location.pathname); } catch { return ''; }
  return /^\/[A-Za-z]:\//.test(f) ? f.slice(1).replace(/\//g, '\\') : f;
}
function srvLaunch(url) { // a link click: how a page asks the browser to hand a business-wrap: URL to its registered handler
  const a = document.createElement('a');
  a.href = url;
  a.hidden = true;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
function srvStatus() {
  if (SRV.note) return SRV.note;
  if (srvServed()) return t('srv.running', { p: location.port || '80' });
  if (SRV.asked) return SRV.found.length ? t('srv.running', { p: SRV.found[0] }) : t('srv.none');
  return t(SRV.busy ? 'srv.checking' : 'srv.idle'); // a file:// page asks the local ports only when a button is pressed, never on its own
}
function srvInner() {
  const served = srvServed();
  const start = served ? '' : `<button type="button" class="b primary" data-k="srvStart"${SRV.busy ? ' disabled' : ''}><span class="i">${ic('send')}</span><span class="w">${esc(t('srv.start'))}</span></button>`;
  const open = !served && SRV.found.length ? `<button type="button" class="b" data-k="srvOpen" data-v="${Number(SRV.found[0])}"><span class="i">${ic('connect')}</span><span class="w">${esc(t('srv.open'))}</span></button>` : '';
  const stop = `<button type="button" class="b danger" data-k="srvStop"${SRV.busy ? ' disabled' : ''}><span class="i">${ic('powerOff')}</span><span class="w">${esc(t('srv.stop'))}</span></button>`;
  return `<p class="set-status set-srv-status" role="status" aria-live="polite" data-st="${served || SRV.found.length ? 'on' : SRV.asked ? 'off' : ''}">${esc(srvStatus())}</p>
<div class="btns">${start}${open}${stop}</div>
<p class="hint">${esc(t(served ? 'srv.hintServed' : 'srv.hintFile'))}</p>`;
}
function srvDraw(focusKey) {
  const body = root.querySelector('.drawer .set-srv-body');
  if (!body) return;
  body.innerHTML = srvInner();
  if (focusKey) body.querySelector(`[data-k="${focusKey}"]`)?.focus();
}
/** Wait for a server to appear (want = true) or for none to answer (want = false), up to ms. */
async function srvWait(want, ms) {
  for (const t0 = Date.now(); Date.now() - t0 < ms;) {
    await new Promise((r) => setTimeout(r, 700));
    SRV.found = await srvProbe();
    SRV.asked = true;
    if (!!SRV.found.length === want) return true;
  }
  return false;
}
/** The shared start (Settings and the 18-server.js banner): ask the ports, launch business-wrap://open?file=<f> when none answers,
 *  wait for one. Resolves 'running' (one already answered, nothing launched), 'started' or 'failed'. onStep('checking'|'starting') for the UI. */
async function srvBegin(f, onStep = () => {}) {
  onStep('checking');
  SRV.found = await srvProbe();
  SRV.asked = true;
  if (SRV.found.length) return 'running';
  onStep('starting');
  srvLaunch(`business-wrap://open?file=${encodeURIComponent(f)}`);
  return (await srvWait(true, 25000)) ? 'started' : 'failed';
}
async function srvStart() {
  if (srvServed() || SRV.busy) return;
  const f = srvFilePath();
  if (!f) { SRV.note = t('srv.nopath'); srvDraw('srvStart'); return; }
  SRV.busy = true;
  SRV.note = '';
  srvDraw(); // «checking…»: does a server already answer on 4317-4327?
  const r = await srvBegin(f, (st) => { if (st === 'starting') { SRV.note = t('srv.starting'); srvDraw(); } });
  SRV.busy = false;
  SRV.note = r === 'failed' ? t('srv.noHandler') : '';
  srvDraw(r === 'failed' ? 'srvStart' : 'srvOpen');
  EXT.server?.sync?.();
}
/** The confirm dialog for «stop all» (the power-off look: Cancel has the focus, Esc cancels). */
function srvConfirm(lead) {
  const d = root.querySelector('.dialog');
  d.hidden = false;
  d.setAttribute('aria-label', t('srv.stopTitle'));
  d.classList.add('pw-dlg');
  d.innerHTML = `<h2>${esc(t('srv.stopTitle'))}</h2><p>${esc(lead)}</p><div class="btns"><button type="button" class="b danger" data-k="srv-yes"><span class="i">${ic('powerOff')}</span><span class="w">${esc(t('srv.stopYes'))}</span></button><button type="button" class="b" data-k="srv-no"><span class="w">${esc(t('srv.no'))}</span></button></div>`;
  d.querySelector('[data-k="srv-no"]').focus();
  setTimeout(() => { if (!d.hidden && !d.contains(root.activeElement)) d.querySelector('[data-k="srv-no"]')?.focus(); }, 150); // a recovery card that opens late must not take the focus from the question
  document.documentElement.dataset.bwServers = 'asked';
  return new Promise((res) => {
    const done = (v) => { d.hidden = true; d.classList.remove('pw-dlg'); d.onclick = d.onkeydown = null; if (!v) document.documentElement.dataset.bwServers = 'cancelled'; res(v); };
    d.onclick = (e) => { const k = e.target.closest('button')?.dataset.k; if (k) done(k === 'srv-yes'); };
    d.onkeydown = (e) => { if (e.key === 'Escape') done(false); };
  });
}
async function srvSaveHere() { // the same three saves as the power button: the draft, the library entry, the session state
  try { writeDraft(); } catch { /* nothing to write */ }
  try { await EXT.library?.persistNow?.(); } catch { /* not a library document */ }
  try { EXT.session?.flush?.(); } catch { /* no session */ }
}
async function srvStop() {
  if (SRV.busy) return;
  const served = srvServed();
  let lead = t('srv.stopLeadGeneric');
  if (served) {
    const info = await fetch('/api/servers', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    if (info) lead = t('srv.stopLead', { n: info.servers.length, b: info.browsers });
  } else {
    SRV.found = await srvProbe();
    SRV.asked = true;
    if (SRV.found.length) lead = t('srv.stopLeadFile', { n: SRV.found.length });
  }
  if (!(await srvConfirm(lead))) { srvDraw('srvStop'); return; }
  SRV.busy = true;
  if (served) {
    await srvSaveHere();
    try { new BroadcastChannel('bw-power').postMessage('off'); } catch { /* this tab only */ }
    try {
      const r = await fetch('/api/servers/stop', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ confirm: true }) });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || r.status);
      document.documentElement.dataset.bwServers = 'stopped';
      EXT.power?.stopped?.();
    } catch (e) { SRV.busy = false; toast(t('srv.failed', { e: e.message || e }), 'warn'); document.documentElement.dataset.bwServers = 'failed'; srvDraw('srvStop'); }
    return;
  }
  SRV.note = t('srv.stopping');
  srvDraw();
  srvLaunch('business-wrap://stop');
  const gone = await srvWait(false, 20000);
  SRV.busy = false;
  SRV.note = gone ? t('srv.stoppedAll') : t('srv.noHandlerStop');
  document.documentElement.dataset.bwServers = gone ? 'stopped' : 'failed';
  srvDraw('srvStop');
}
