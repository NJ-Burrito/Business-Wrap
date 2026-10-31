/* Business-Wrap editor — the Settings page (0.11.0), concatenated after update.js.
 * A drawer («الإعدادات» / Settings), reached from the toolbar's View section and Ctrl+K, in four cards:
 * About (name, logo, version, release date, repository, licence, credits — embedded at build time, so it shows
 * from file:// too), Update (installed vs latest, last check, «تحقّق الآن», auto-check on launch) and Preferences
 * (language, word direction, page view, reduced motion), each written to the store it already had
 * (bw:ui, bw:dir:<ed>, bw:pages, bw:calm, bw:update-auto), and Local learning («التعلّم المحلي»,
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
  setTimeout(icoLoad, 0); // the drawer is in the page once this returns: ask the server where the file icons stand
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
<section class="card set-ico" aria-labelledby="set-h-ico"><h3 id="set-h-ico"><span class="i">${ic('image')}</span>${esc(t('ico.title'))}</h3>
<div class="set-ico-body">${icoInner()}</div></section>
<section class="card set-prefs" aria-labelledby="set-h-prefs"><h3 id="set-h-prefs"><span class="i">${ic('prefs')}</span>${esc(t('set.prefs'))}</h3>
<div class="set-row"><span class="set-k">${esc(t('set.lang'))}</span>${setSeg('setLang', [['ar', 'ع العربية', S.ui === 'ar', 'ar'], ['en', 'E English', S.ui === 'en', 'en']], t('set.lang'))}</div>
<div class="set-row"><span class="set-k">${esc(t('set.dir'))}</span>${setSeg('setDir', ['rtl', 'ltr'].map((d) => [d, t(d), uiDir() === d]), t('set.dir'))}</div>
<div class="set-row"><span class="set-k">${esc(t('set.view'))}</span>${setSeg('setView', viewModes().map((m) => [m, t('view.' + m), viewsMode() === m]), t('set.view'))}</div>
<label class="chk"><input type="checkbox" data-set="calm" ${S.calm ? 'checked' : ''}> ${esc(t('set.calm'))}</label>
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
  if (k === 'srvPowerOff') { await runAction('powerOff'); return true; }
  if (k === 'icoApply' || k === 'icoRestore') { await icoRun(k === 'icoApply' ? 'apply' : 'restore'); return true; }
  if (k === 'srvOpen') { location.href = `http://127.0.0.1:${Number(v)}/`; return true; }
  if (k === 'setLang') { setLang(v); return true; }
  if (k === 'setDir') { setDir(v); return true; }
  if (k === 'setView') { viewsSet(v); return true; }
  return false;
}
function settingsChange(el) {
  const k = el.dataset.set;
  if (k === 'auto') ls.set('bw:update-auto', el.checked ? '1' : '0');
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
/** Settings › Local server (0.15.0 note 15): the same toggle as the top bar (editor/ext/18-server.js), its sentence, the port and the link to the served editor. */
function srvInner() {
  const sb = EXT.server;
  const served = srvServed();
  const on = sb?.state.mode === 'online';
  const open = !served && on && sb.state.port ? `<button type="button" class="b" data-k="srvOpen" data-v="${Number(sb.state.port)}"><span class="i">${ic('connect')}</span><span class="w">${esc(t('sv.open'))}</span></button>` : '';
  const off = served ? `<div class="set-srv-row"><button type="button" class="b danger" data-k="srvPowerOff" title="${esc(t('pwTitle'))}"><span class="i">${ic('powerOff')}</span><span class="w">${esc(t('powerOff'))}</span></button></div>` : '';
  return `<div class="set-srv-row">${sb ? sb.html('settings') : ''}${open}</div>${off}
<p class="set-status set-srv-status" role="status" aria-live="polite" data-st="${on ? 'on' : sb?.state.mode === 'offline' || sb?.state.mode === 'error' ? 'off' : ''}">${esc(sb ? sb.sentence() : '')}</p>
<p class="hint">${esc(t(served ? 'sv.hintServed' : 'srv.hintFile'))}</p>`;
}
function srvDraw(focusKey) {
  const body = root.querySelector('.drawer .set-srv-body');
  if (!body) return;
  const had = body.contains(root.activeElement) ? root.activeElement?.dataset?.k : '';
  body.innerHTML = srvInner();
  focusKey = focusKey || had;
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
/** The shared start (the toggle, editor/ext/18-server.js): ask the ports, launch business-wrap://open?file=<f> when none answers,
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
async function srvSaveHere() { // the same three saves as the power button: the draft, the library entry, the session state
  try { writeDraft(); } catch { /* nothing to write */ }
  try { await EXT.library?.persistNow?.(); } catch { /* not a library document */ }
  try { EXT.session?.flush?.(); } catch { /* no session */ }
}

/* ── File icons (0.15.1): «use Business-Wrap icons on this PC». The server writes per-user registry keys (engine/file-icons.mjs,
 *    engine/routes/file-icons.mjs); a file:// page cannot, so the buttons wait for the server and say so. ── */
const FOLDER_ICONS = {"general": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 64 64\" aria-hidden=\"true\"><path d=\"M6 14Q6 10 10 10H24L30 16H54Q58 16 58 20V50Q58 54 54 54H10Q6 54 6 50Z\" fill=\"#003c7a\"/><path d=\"M6 22H58V50Q58 54 54 54H10Q6 54 6 50Z\" fill=\"#001e3d\"/><path d=\"M14 32H40\" stroke=\"#fafaf9\" stroke-width=\"3\" stroke-linecap=\"round\"/><path d=\"M14 41H30\" stroke=\"#be9a41\" stroke-width=\"3\" stroke-linecap=\"round\"/></svg>", "pdf": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 64 64\" aria-hidden=\"true\"><path d=\"M6 14Q6 10 10 10H24L30 16H54Q58 16 58 20V50Q58 54 54 54H10Q6 54 6 50Z\" fill=\"#003c7a\"/><path d=\"M6 22H58V50Q58 54 54 54H10Q6 54 6 50Z\" fill=\"#001e3d\"/><rect x=\"12.75\" y=\"30.75\" width=\"38.5\" height=\"17.5\" rx=\"4.5\" fill=\"#c0262d\" stroke=\"#fafaf9\" stroke-width=\"1.5\"/><path d=\"M22.09 44V40.72H23.93C26.12 40.72 27.26 39.58 27.26 37.8C27.26 36.14 26.12 35 23.93 35H20.06V44ZM22.09 36.66H23.89C24.84 36.66 25.15 37.16 25.15 37.85C25.15 38.55 24.84 39.06 23.89 39.06H22.09ZM31.92 44C34.77 44 36.22 42.59 36.22 40.01V38.99C36.22 36.41 34.77 35 31.92 35H28.71V44ZM30.75 36.66H31.9C33.38 36.66 34.1 37.42 34.1 39.01V39.99C34.1 41.58 33.38 42.34 31.9 42.34H30.75ZM39.75 44V40.68H43.56V39.04H39.75V36.63H43.94V35H37.71V44Z\" fill=\"#ffffff\"/></svg>", "docx": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 64 64\" aria-hidden=\"true\"><path d=\"M6 14Q6 10 10 10H24L30 16H54Q58 16 58 20V50Q58 54 54 54H10Q6 54 6 50Z\" fill=\"#003c7a\"/><path d=\"M6 22H58V50Q58 54 54 54H10Q6 54 6 50Z\" fill=\"#001e3d\"/><rect x=\"12.75\" y=\"30.75\" width=\"38.5\" height=\"17.5\" rx=\"4.5\" fill=\"#1b5fc1\" stroke=\"#fafaf9\" stroke-width=\"1.5\"/><path d=\"M19.45 43.64C22.07 43.64 23.41 42.33 23.41 39.97V39.02C23.41 36.65 22.07 35.35 19.45 35.35H16.5V43.64ZM18.37 36.88H19.43C20.8 36.88 21.46 37.58 21.46 39.04V39.94C21.46 41.41 20.8 42.11 19.43 42.11H18.37ZM28.05 43.78C30.34 43.78 31.73 42.38 31.73 39.97V39.02C31.73 36.61 30.34 35.21 28.05 35.21C25.75 35.21 24.37 36.61 24.37 39.02V39.97C24.37 42.38 25.75 43.78 28.05 43.78ZM28.05 42.2C26.82 42.2 26.31 41.35 26.31 39.94V39.04C26.31 37.64 26.82 36.78 28.05 36.78C29.28 36.78 29.79 37.64 29.79 39.04V39.94C29.79 41.35 29.28 42.2 28.05 42.2ZM36.39 43.79C37.86 43.79 38.76 43.2 39.36 42.43L38.28 41.26C37.88 41.79 37.35 42.22 36.46 42.22C35.23 42.22 34.67 41.36 34.67 39.97V39.04C34.67 37.65 35.24 36.78 36.46 36.78C37.36 36.78 37.89 37.21 38.29 37.74L39.36 36.56C38.76 35.79 37.85 35.21 36.38 35.21C34.12 35.21 32.73 36.65 32.73 39.02L32.72 39.99C32.72 42.39 34.11 43.79 36.39 43.79ZM42.08 43.64 43.68 40.93H43.74L45.39 43.64H47.5L44.77 39.36L47.28 35.35H45.41L43.83 37.99H43.78L42.23 35.35H40.13L42.7 39.4L40.01 43.64Z\" fill=\"#ffffff\"/></svg>", "html": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 64 64\" aria-hidden=\"true\"><path d=\"M6 14Q6 10 10 10H24L30 16H54Q58 16 58 20V50Q58 54 54 54H10Q6 54 6 50Z\" fill=\"#003c7a\"/><path d=\"M6 22H58V50Q58 54 54 54H10Q6 54 6 50Z\" fill=\"#001e3d\"/><rect x=\"12.75\" y=\"30.75\" width=\"38.5\" height=\"17.5\" rx=\"4.5\" fill=\"#1b1813\" stroke=\"#fafaf9\" stroke-width=\"1.5\"/><path d=\"M18.34 43.57V40.25H21.46V43.57H23.3V35.43H21.46V38.71H18.34V35.43H16.5V43.57ZM28.51 43.57V36.94H30.69V35.43H24.47V36.94H26.67V43.57ZM33.64 43.57V37.7H33.68L35.11 43.57H37.03L38.47 37.7H38.51V43.57H40.26V35.43H37.41L36.13 41.29H36.08L34.8 35.43H31.88V43.57ZM47.5 43.57V42.07H43.93V35.43H42.09V43.57Z\" fill=\"#ffffff\"/></svg>"}; // brand/v3/file-icons/folder*.svg (0.15.3), inline: no request, no font
const FOLDER_ROW = [['general', 'ico.fGeneral'], ['pdf', 'ico.fPdf'], ['docx', 'ico.fDocx'], ['html', 'ico.fHtml']];
const ICO = { st: null, busy: false, msg: '', bad: false }; // st: the server's /status answer, null until it came
function icoInner() {
  const served = srvServed();
  const off = !served || ICO.st?.supported === false;
  const line = ICO.msg || (!served ? t('export.needsServer') : ICO.st?.supported === false ? t('ico.unsupported') : ICO.busy ? t('ico.busy') : ICO.st ? t(ICO.st.applied ? 'ico.on' : 'ico.off') : '');
  const dis = off || ICO.busy ? ' disabled' : '';
  return `<p>${esc(t('ico.lead'))}</p>
<div class="btns"><button type="button" class="b primary" data-k="icoApply"${dis}><span class="i">${ic('image')}</span><span class="w">${esc(t('ico.apply'))}</span></button><button type="button" class="b" data-k="icoRestore"${dis}><span class="i">${ic('undo')}</span><span class="w">${esc(t('ico.restore'))}</span></button></div>
<p class="set-status set-ico-status" role="status" aria-live="polite" data-st="${ICO.bad ? 'bad' : ICO.st?.applied ? 'on' : ''}">${esc(line)}</p>
<p class="hint">${esc(t('ico.note'))}</p>
<h4 class="set-ico-fh">${esc(t('ico.folders'))}</h4>
<ul class="set-ico-folders">${FOLDER_ROW.map(([k, key]) => `<li>${FOLDER_ICONS[k]}<span>${esc(t(key))}</span></li>`).join('')}</ul>
<p class="hint">${esc(t('ico.foldersNote'))}</p>`;
}
function icoDraw(focusKey) {
  const body = root.querySelector('.drawer .set-ico-body');
  if (!body) return;
  body.innerHTML = icoInner();
  if (focusKey) body.querySelector(`[data-k="${focusKey}"]`)?.focus();
}
async function icoLoad() {
  if (!srvServed()) return;
  ICO.msg = ''; ICO.bad = false;
  try { ICO.st = await (await fetch('/api/file-icons/status', { cache: 'no-store' })).json(); } catch { ICO.st = null; }
  icoDraw();
}
/** The toast tells, extension by extension, what took and what did not (read back from the registry, never assumed). */
async function icoRun(act) {
  if (ICO.busy) return;
  ICO.busy = true; ICO.msg = ''; ICO.bad = false;
  icoDraw(act === 'apply' ? 'icoApply' : 'icoRestore');
  let kind = 'ok';
  try {
    const r = await fetch(`/api/file-icons/${act}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    const j = await r.json().catch(() => ({}));
    if (r.status === 501) { ICO.st = j; ICO.msg = t('ico.unsupported'); kind = 'warn'; }
    else if (!r.ok || j.error) { ICO.msg = t('ico.fail', { m: j.error || r.status }); kind = 'err'; }
    else {
      const name = (x) => `.${x.ext}`;
      const good = (j.results || []).filter((x) => x.ok).map(name).join(' ');
      const bad = (j.results || []).filter((x) => !x.ok).map((x) => `${name(x)} (${x.reason || '?'})`).join(' ');
      if (act === 'restore') { ICO.msg = j.ok ? t('ico.restored') : t('ico.fail', { m: bad }); kind = j.ok ? 'ok' : 'err'; }
      else if (!good) { ICO.msg = t('ico.none', { bad }); kind = 'err'; }
      else if (bad) { ICO.msg = t('ico.partial', { ok: good, bad }); kind = 'warn'; }
      else ICO.msg = t('ico.done', { ok: good });
    }
  } catch (e) { ICO.msg = t('ico.fail', { m: String(e?.message || e) }); kind = 'err'; }
  ICO.bad = kind === 'err';
  toast(ICO.msg, kind);
  ICO.busy = false;
  try { ICO.st = await (await fetch('/api/file-icons/status', { cache: 'no-store' })).json(); } catch { /* keep the last answer */ }
  icoDraw(act === 'apply' ? 'icoApply' : 'icoRestore');
}
