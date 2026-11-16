/* Business-Wrap editor — the Settings page (0.11.0; reworked 0.17.0 notes 8, 9, 10), concatenated after update.js.
 * A drawer («الإعدادات» / Settings), reached from the toolbar's View section and Ctrl+K. Cards, most used first (every group starts collapsed; the person opens what they need):
 * Preferences (language, word direction, page view, reduced motion), Update (installed vs latest, last check, «تحقّق الآن»,
 * auto-check on launch), File icons, Local learning (mounted by learning-hook.js through BW_LEARNING.mount(el)) and
 * About (name, logo, version, release date, repository: only what a user needs; embedded at build time, so it shows from
 * file:// too). Extension cards follow (collapsible groups, as before). Each preference is written to the store it already had
 * (bw:ui, bw:dir:<ed>, bw:pages, bw:calm, bw:update-auto). The check itself is update.js (BW_UPDATE).
 * the host on/off control is NOT here. It lives only in the top bar (editor/ext/18-server.js); this file keeps
 * the shared start / probe helpers (SRV, srvProbe, srvBegin, srvWait) that control uses.
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
${setSwitch('auto', updAuto(), t('set.auto'))}
${served ? '' : `<div class="set-file"><p>${esc(t('set.file'))}</p><p><b>${esc(t('set.fileServe'))}</b><code dir="ltr">npm run serve -- &lt;editor.html&gt;</code></p><p><b>${esc(t('set.fileCli'))}</b><code dir="ltr">npx business-wrap update --apply --yes</code></p></div>`}
<p class="hint">${esc(t('set.dataSafe'))}</p>`;
}
/** A segmented control with a sliding pill: --n segments, --i the pressed one (settings.css moves the pill with a spring). */
let SET_SLIDE = null; // {k, from}: the segmented control whose pill slides from its old place once the drawer is redrawn
function setSeg(k, items, label) {
  const to = Math.max(0, items.findIndex((x) => x[2]));
  let i = to;
  if (SET_SLIDE && SET_SLIDE.k === k) {
    if (!S.calm) { i = SET_SLIDE.from; setTimeout(() => root.querySelector(`.drawer .set-seg[data-seg="${k}"]`)?.style.setProperty('--i', String(to)), 40); }
    SET_SLIDE = null;
  }
  return `<div class="set-seg" data-seg="${k}" role="group" aria-label="${esc(label)}" style="--n:${items.length};--i:${i}">${items.map(([v, word, on, lang]) => `<button type="button" data-k="${k}" data-v="${v}" aria-pressed="${on}"${lang ? ` lang="${lang}"` : ''}>${esc(word)}</button>`).join('')}</div>`;
}
/** A switch: a real checkbox (keyboard, screen reader, data-set for settingsChange) with a drawn track and a spring thumb. */
function setSwitch(key, on, text) {
  return `<label class="chk set-sw"><input type="checkbox" data-set="${key}" ${on ? 'checked' : ''}><span class="set-sw-t" aria-hidden="true"><i></i></span><span class="set-sw-w">${esc(text)}</span></label>`;
}
/** every Settings group is the same card (set-c / set-h tile), extension groups included, each with its own icon (lucide, ISC). */
const SET_G = (inner) => '<svg aria-hidden="true" focusable="false" class="ic" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + inner + '</svg>';
IC.setFolder = SET_G('<path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"/>'); // folder-open: the save folder
IC.setGlobe = SET_G('<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>'); // globe: the browser
IC.setFolders = SET_G('<path d="M20 17a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3.9a2 2 0 0 1-1.69-.9l-.81-1.2a2 2 0 0 0-1.67-.9H8a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2Z"/><path d="M2 8v11a2 2 0 0 0 2 2h14"/>'); // folders: the files folder
const SET_ICON = { workspace: 'setFolder', browser: 'setGlobe', tree: 'setFolders' };
function setCard(cls, id, icon, title, body) {
  return `<section class="card set-c ${cls}" aria-labelledby="set-h-${id}"><h3 class="set-h" id="set-h-${id}"><span class="i">${ic(icon)}</span>${esc(title)}</h3>${body}</section>`;
}
/** About (0.17.0 note 8): the name, the version, the release date and the repository. Nothing else. */
function setAboutInner(A) {
  const repoText = String(A.repo || '').replace(/^https:\/\//, '');
  return `<div class="set-id"><span class="set-logo" aria-hidden="true">${DATA.brand?.mark || ''}</span><p><b class="set-name" dir="ltr">${esc(A.name || 'Business-Wrap')}</b> <bdi class="set-ver" dir="ltr">${esc(A.version || DATA.version || '')}</bdi></p></div>
<dl class="set-dl">
<dt>${esc(t('set.date'))}</dt><dd><bdi dir="ltr">${esc(A.date || '—')}</bdi></dd>
<dt>${esc(t('set.repo'))}</dt><dd>${A.repo ? `<a href="${esc(A.repo)}" target="_blank" rel="noopener noreferrer" dir="ltr">${esc(repoText)}</a>` : '—'}</dd>
</dl>`;
}
function settingsPanel() {
  const A = DATA.about || { name: 'Business-Wrap', version: DATA.version };
  setTimeout(icoLoad, 0); // the drawer is in the page once this returns: ask the server where the file icons stand
  const prefs = `<div class="set-row"><span class="set-k">${esc(t('set.lang'))}</span>${setSeg('setLang', [['ar', 'ع العربية', S.ui === 'ar', 'ar'], ['en', 'E English', S.ui === 'en', 'en']], t('set.lang'))}</div>
<div class="set-row"><span class="set-k">${esc(t('set.dir'))}</span>${setSeg('setDir', ['rtl', 'ltr'].map((d) => [d, t(d), uiDir() === d]), t('set.dir'))}</div>
<div class="set-row"><span class="set-k">${esc(t('set.view'))}</span>${setSeg('setView', viewModes().map((m) => [m, t('view.' + m), viewsMode() === m]), t('set.view'))}</div>
${setSwitch('calm', S.calm, t('set.calm'))}`;
  return `<div class="set">
${setCard('set-prefs', 'prefs', 'prefs', t('set.prefs'), prefs)}
${setCard('set-upd', 'upd', 'update', t('set.update'), `<div class="set-upd-body">${setUpdateInner()}</div>`)}
${setCard('set-ico', 'ico', 'image', t('ico.title'), `<div class="set-ico-body">${icoInner()}</div>`)}
${setCard('set-lrn', 'lrn', 'learning', t('learning'), '<div class="set-lrn-body" data-lrn-mount></div>')}
${setCard('set-about', 'about', 'about', t('set.about'), setAboutInner(A))}${EXT.settings.map((c) => setCard(`set-x-${esc(c.id)}`, esc(c.id), SET_ICON[c.id] || c.icon || 'prefs', t(c.title), `<div class="set-x-body">${c.html()}</div>`)).join('')}</div>`; // + extension cards
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
  if (k === 'icoApply' || k === 'icoRestore') { await icoRun(k === 'icoApply' ? 'apply' : 'restore'); return true; }
  if (k === 'setLang' || k === 'setDir' || k === 'setView') {
    SET_SLIDE = { k, from: Number(x.closest('.set-seg')?.style.getPropertyValue('--i')) || 0 }; // the redraw starts the pill where it was and slides it
    if (k === 'setLang') setLang(v);
    else if (k === 'setDir') setDir(v);
    else viewsSet(v);
    return true;
  }
  return false;
}
function settingsChange(el) {
  const k = el.dataset.set;
  if (k === 'auto') ls.set('bw:update-auto', el.checked ? '1' : '0');
  if (k === 'calm') { S.calm = el.checked; ls.set('bw:calm', S.calm ? '1' : '0'); buildUi(); EXT.start?.redraw?.(); root.querySelector('.drawer [data-set="calm"]')?.focus(); }
}

/* ── Servers (0.13.3): start / stop. A file:// page cannot start a process, so it asks the installed Business-Wrap through the
 *    per-user business-wrap: URL protocol (engine/protocol.mjs); a served page talks to its own server (engine/routes/servers.mjs). ── */
const SRV = { found: [], note: '', busy: false, asked: false }; // found: ports that answer (file:// only)
function srvServed() { return /^https?:$/.test(location.protocol); }
/** The ports a file:// page asks: 4317-4327. window.__bwProbePorts is a test hook only (the tests run their own servers on free ports). */
function srvPorts() { return Array.isArray(window.__bwProbePorts) ? window.__bwProbePorts : Array.from({ length: 11 }, (_, i) => 4317 + i); }
async function srvProbe(path = '/api/version') { // path: '/api/health' while a start is awaited (0.17.0 note 17)
  const found = [];
  await Promise.all(srvPorts().map(async (p) => {
    try {
      const j = await (await fetch(`http://127.0.0.1:${p}${path}`, { cache: 'no-store', signal: AbortSignal.timeout(900) })).json();
      if (j && j.name === 'Business-Wrap' && !j.stopping) found.push(p); // a host in its power-off grace window (stopping:true) is not a host to connect to
    } catch { /* nothing answers on this port */ }
  }));
  return found.sort((a, b) => a - b);
}
function srvLaunch(url) { // a link click: how a page asks the browser to hand a business-wrap: URL to its registered handler
  const a = document.createElement('a');
  a.href = url;
  a.hidden = true;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
/** Wait for a server to appear (want = true) or for none to answer (want = false), up to ms. */
async function srvWait(want, ms, path = '/api/version') {
  for (const t0 = Date.now(); Date.now() - t0 < ms;) {
    await new Promise((r) => setTimeout(r, 700));
    SRV.found = await srvProbe(path);
    SRV.asked = true;
    if (!!SRV.found.length === want) return true;
  }
  return false;
}
/** The shared start (the top-bar toggle, editor/ext/18-server.js; 0.17.0 note 17): ask the ports; when none answers hand
 *  business-wrap://start to the browser (the installed launcher starts this install's host and opens no browser), then poll
 *  127.0.0.1:4317-4327 /api/health until one answers (20 s cap). Resolves 'running' (one already answered, nothing launched),
 *  'started' or 'failed'. onStep('checking'|'starting') for the UI. */
/** the absolute path of the editor file this page IS (file:// only; '' for a served page or a UNC path), so the host can serve that same document. */
function srvDiskFile() {
  if (location.protocol !== 'file:' || location.host) return '';
  let p = '';
  try { p = decodeURIComponent(location.pathname); } catch { return ''; }
  return /^\/[A-Za-z]:[\\/]/.test(p) ? p.slice(1) : p;
}
async function srvBegin(onStep = () => {}) {
  onStep('checking');
  SRV.found = await srvProbe();
  SRV.asked = true;
  if (SRV.found.length) return 'running';
  onStep('starting');
  const disk = srvDiskFile();
  srvLaunch(disk ? `business-wrap://start?file=${encodeURIComponent(disk)}` : 'business-wrap://start');
  return (await srvWait(true, 20000, '/api/health')) ? 'started' : 'failed';
}
async function srvSaveHere() { // the same three saves as the power button: the draft, the library entry, the session state
  try { writeDraft(); } catch { /* nothing to write */ }
  try { await EXT.library?.persistNow?.(); } catch { /* not a library document */ }
  try { EXT.session?.flush?.(); } catch { /* no session */ }
}

/* ── File icons (0.15.1): «use Business-Wrap icons on this PC». The server writes per-user registry keys (engine/file-icons.mjs,
 *    engine/routes/file-icons.mjs); a file:// page cannot, so the buttons wait for the server and say so. ── */
/*FI-BEGIN*/
const FOLDER_ICONS = {"root": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 64 64\" aria-hidden=\"true\"><path d=\"M6 14Q6 10 10 10H24L30 16H54Q58 16 58 20V50Q58 54 54 54H10Q6 54 6 50Z\" fill=\"#003c7a\"/><path d=\"M6 22H58V50Q58 54 54 54H10Q6 54 6 50Z\" fill=\"#001e3d\"/><path d=\"M14 32H40\" stroke=\"#fafaf9\" stroke-width=\"3\" stroke-linecap=\"round\"/><path d=\"M14 41H30\" stroke=\"#be9a41\" stroke-width=\"3\" stroke-linecap=\"round\"/></svg>", "documents": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 64 64\" aria-hidden=\"true\"><path d=\"M6 14Q6 10 10 10H24L30 16H54Q58 16 58 20V50Q58 54 54 54H10Q6 54 6 50Z\" fill=\"#003c7a\"/><path d=\"M6 22H58V50Q58 54 54 54H10Q6 54 6 50Z\" fill=\"#1b5fc1\"/><g transform=\"translate(17.60 24.10) scale(1.2)\" fill=\"none\" stroke=\"#ffffff\" stroke-width=\"2.08\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M20 7h-3a2 2 0 0 1-2-2V2\"/><path d=\"M9 18a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h7l4 4v10a2 2 0 0 1-2 2Z\"/><path d=\"M3 7.6v12.8A1.6 1.6 0 0 0 4.6 22h9.8\"/></g></svg>", "document": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 64 64\" aria-hidden=\"true\"><path d=\"M6 14Q6 10 10 10H24L30 16H54Q58 16 58 20V50Q58 54 54 54H10Q6 54 6 50Z\" fill=\"#003c7a\"/><path d=\"M6 22H58V50Q58 54 54 54H10Q6 54 6 50Z\" fill=\"#0b6e83\"/><g transform=\"translate(17.60 24.10) scale(1.2)\" fill=\"none\" stroke=\"#ffffff\" stroke-width=\"2.08\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z\"/><path d=\"M14 2v4a2 2 0 0 0 2 2h4\"/><path d=\"M10 9H8\"/><path d=\"M16 13H8\"/><path d=\"M16 17H8\"/></g></svg>", "exports": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 64 64\" aria-hidden=\"true\"><path d=\"M6 14Q6 10 10 10H24L30 16H54Q58 16 58 20V50Q58 54 54 54H10Q6 54 6 50Z\" fill=\"#003c7a\"/><path d=\"M6 22H58V50Q58 54 54 54H10Q6 54 6 50Z\" fill=\"#c0262d\"/><g transform=\"translate(17.60 24.10) scale(1.2)\" fill=\"none\" stroke=\"#ffffff\" stroke-width=\"2.08\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M12 3v12\"/><path d=\"m17 8-5-5-5 5\"/><path d=\"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4\"/></g></svg>", "sources": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 64 64\" aria-hidden=\"true\"><path d=\"M6 14Q6 10 10 10H24L30 16H54Q58 16 58 20V50Q58 54 54 54H10Q6 54 6 50Z\" fill=\"#003c7a\"/><path d=\"M6 22H58V50Q58 54 54 54H10Q6 54 6 50Z\" fill=\"#6a3db8\"/><g transform=\"translate(17.60 24.10) scale(1.2)\" fill=\"none\" stroke=\"#ffffff\" stroke-width=\"2.08\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71\"/><path d=\"M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71\"/></g></svg>", "versions": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 64 64\" aria-hidden=\"true\"><path d=\"M6 14Q6 10 10 10H24L30 16H54Q58 16 58 20V50Q58 54 54 54H10Q6 54 6 50Z\" fill=\"#003c7a\"/><path d=\"M6 22H58V50Q58 54 54 54H10Q6 54 6 50Z\" fill=\"#b34700\"/><g transform=\"translate(17.60 24.10) scale(1.2)\" fill=\"none\" stroke=\"#ffffff\" stroke-width=\"2.08\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8\"/><path d=\"M3 3v5h5\"/><path d=\"M12 7v5l4 2\"/></g></svg>", "system": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 64 64\" aria-hidden=\"true\"><path d=\"M6 14Q6 10 10 10H24L30 16H54Q58 16 58 20V50Q58 54 54 54H10Q6 54 6 50Z\" fill=\"#003c7a\"/><path d=\"M6 22H58V50Q58 54 54 54H10Q6 54 6 50Z\" fill=\"#596270\"/><g transform=\"translate(17.60 24.10) scale(1.2)\" fill=\"none\" stroke=\"#ffffff\" stroke-width=\"2.08\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><rect width=\"18\" height=\"11\" x=\"3\" y=\"11\" rx=\"2\" ry=\"2\"/><path d=\"M7 11V7a5 5 0 0 1 10 0v4\"/></g></svg>", "unsorted": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 64 64\" aria-hidden=\"true\"><path d=\"M6 14Q6 10 10 10H24L30 16H54Q58 16 58 20V50Q58 54 54 54H10Q6 54 6 50Z\" fill=\"#003c7a\"/><path d=\"M6 22H58V50Q58 54 54 54H10Q6 54 6 50Z\" fill=\"#7a5c00\"/><g transform=\"translate(17.60 24.10) scale(1.2)\" fill=\"none\" stroke=\"#ffffff\" stroke-width=\"2.08\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M22 12h-6l-2 3h-4l-2-3H2\"/><path d=\"M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z\"/></g></svg>", "projects": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 64 64\" aria-hidden=\"true\"><path d=\"M6 14Q6 10 10 10H24L30 16H54Q58 16 58 20V50Q58 54 54 54H10Q6 54 6 50Z\" fill=\"#003c7a\"/><path d=\"M6 22H58V50Q58 54 54 54H10Q6 54 6 50Z\" fill=\"#2e7d32\"/><g transform=\"translate(17.60 24.10) scale(1.2)\" fill=\"none\" stroke=\"#ffffff\" stroke-width=\"2.08\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16\"/><rect width=\"20\" height=\"14\" x=\"2\" y=\"6\" rx=\"2\"/></g></svg>", "download": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 64 64\" aria-hidden=\"true\"><path d=\"M6 14Q6 10 10 10H24L30 16H54Q58 16 58 20V50Q58 54 54 54H10Q6 54 6 50Z\" fill=\"#003c7a\"/><path d=\"M6 22H58V50Q58 54 54 54H10Q6 54 6 50Z\" fill=\"#a8206f\"/><g transform=\"translate(17.60 24.10) scale(1.2)\" fill=\"none\" stroke=\"#ffffff\" stroke-width=\"2.08\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M12 15V3\"/><path d=\"m7 10 5 5 5-5\"/><path d=\"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4\"/></g></svg>"};
/*FI-END*/
/*FT-BEGIN*/
const FILE_ICONS = {"pdf": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 64 64\" aria-hidden=\"true\"><path d=\"M16 4H40L54 18V56Q54 60 50 60H16Q12 60 12 56V8Q12 4 16 4Z\" fill=\"#003c7a\"/><path d=\"M40 4V14Q40 18 44 18H54Z\" fill=\"#be9a41\"/><path d=\"M23 23H46\" stroke=\"#fafaf9\" stroke-width=\"3\" stroke-linecap=\"round\"/><path d=\"M28 54H46\" stroke=\"#be9a41\" stroke-width=\"3\" stroke-linecap=\"round\"/><rect x=\"2.75\" y=\"29.75\" width=\"40.5\" height=\"18.5\" rx=\"4.5\" fill=\"#c0262d\" stroke=\"#fafaf9\" stroke-width=\"1.5\"/><path d=\"M12.54 43.75V40.29H14.48C16.79 40.29 18 39.08 18 37.21C18 35.46 16.79 34.25 14.48 34.25H10.4V43.75ZM12.54 36H14.44C15.45 36 15.77 36.53 15.77 37.26C15.77 38 15.45 38.54 14.44 38.54H12.54ZM22.91 43.75C25.92 43.75 27.46 42.26 27.46 39.54V38.46C27.46 35.74 25.92 34.25 22.91 34.25H19.53V43.75ZM21.68 36H22.9C24.46 36 25.22 36.8 25.22 38.48V39.52C25.22 41.2 24.46 42 22.9 42H21.68ZM31.18 43.75V40.25H35.21V38.51H31.18V35.97H35.6V34.25H29.03V43.75Z\" fill=\"#ffffff\"/></svg>", "docx": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 64 64\" aria-hidden=\"true\"><path d=\"M16 4H40L54 18V56Q54 60 50 60H16Q12 60 12 56V8Q12 4 16 4Z\" fill=\"#003c7a\"/><path d=\"M40 4V14Q40 18 44 18H54Z\" fill=\"#be9a41\"/><path d=\"M23 23H46\" stroke=\"#fafaf9\" stroke-width=\"3\" stroke-linecap=\"round\"/><path d=\"M28 54H46\" stroke=\"#be9a41\" stroke-width=\"3\" stroke-linecap=\"round\"/><rect x=\"2.75\" y=\"29.75\" width=\"40.5\" height=\"18.5\" rx=\"4.5\" fill=\"#1b5fc1\" stroke=\"#fafaf9\" stroke-width=\"1.5\"/><path d=\"M9.64 43.4C12.43 43.4 13.86 42.02 13.86 39.5V38.49C13.86 35.97 12.43 34.59 9.64 34.59H6.5V43.4ZM8.49 36.21H9.62C11.07 36.21 11.78 36.95 11.78 38.52V39.47C11.78 41.03 11.07 41.78 9.62 41.78H8.49ZM18.79 43.55C21.24 43.55 22.71 42.07 22.71 39.5V38.49C22.71 35.92 21.24 34.43 18.79 34.43C16.35 34.43 14.88 35.92 14.88 38.49V39.5C14.88 42.07 16.35 43.55 18.79 43.55ZM18.79 41.88C17.48 41.88 16.94 40.97 16.94 39.47V38.52C16.94 37.02 17.48 36.11 18.79 36.11C20.1 36.11 20.64 37.02 20.64 38.52V39.47C20.64 40.97 20.1 41.88 18.79 41.88ZM27.67 43.57C29.23 43.57 30.19 42.94 30.83 42.12L29.69 40.87C29.26 41.44 28.69 41.89 27.75 41.89C26.44 41.89 25.85 40.98 25.85 39.5V38.52C25.85 37.03 26.45 36.11 27.75 36.11C28.71 36.11 29.27 36.56 29.7 37.13L30.83 35.87C30.19 35.05 29.22 34.43 27.66 34.43C25.25 34.43 23.78 35.97 23.78 38.49L23.77 39.52C23.77 42.08 25.24 43.57 27.67 43.57ZM33.73 43.4 35.43 40.52H35.49L37.26 43.4H39.5L36.59 38.86L39.26 34.59H37.27L35.6 37.39H35.55L33.9 34.59H31.65L34.39 38.89L31.53 43.4Z\" fill=\"#ffffff\"/></svg>", "html": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 64 64\" aria-hidden=\"true\"><path d=\"M16 4H40L54 18V56Q54 60 50 60H16Q12 60 12 56V8Q12 4 16 4Z\" fill=\"#003c7a\"/><path d=\"M40 4V14Q40 18 44 18H54Z\" fill=\"#be9a41\"/><path d=\"M23 23H46\" stroke=\"#fafaf9\" stroke-width=\"3\" stroke-linecap=\"round\"/><path d=\"M28 54H46\" stroke=\"#be9a41\" stroke-width=\"3\" stroke-linecap=\"round\"/><rect x=\"2.75\" y=\"29.75\" width=\"40.5\" height=\"18.5\" rx=\"4.5\" fill=\"#1b1813\" stroke=\"#fafaf9\" stroke-width=\"1.5\"/><path d=\"M8.46 43.34V39.79H11.78V43.34H13.74V34.66H11.78V38.16H8.46V34.66H6.5V43.34ZM19.29 43.34V36.27H21.61V34.66H14.99V36.27H17.33V43.34ZM24.74 43.34V37.08H24.79L26.31 43.34H28.36L29.88 37.08H29.93V43.34H31.79V34.66H28.76L27.39 40.91H27.34L25.98 34.66H22.87V43.34ZM39.5 43.34V41.74H35.7V34.66H33.74V43.34Z\" fill=\"#ffffff\"/></svg>", "json": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 64 64\" aria-hidden=\"true\"><path d=\"M16 4H40L54 18V56Q54 60 50 60H16Q12 60 12 56V8Q12 4 16 4Z\" fill=\"#003c7a\"/><path d=\"M40 4V14Q40 18 44 18H54Z\" fill=\"#be9a41\"/><path d=\"M23 23H46\" stroke=\"#fafaf9\" stroke-width=\"3\" stroke-linecap=\"round\"/><path d=\"M28 54H46\" stroke=\"#be9a41\" stroke-width=\"3\" stroke-linecap=\"round\"/><rect x=\"2.75\" y=\"29.75\" width=\"40.5\" height=\"18.5\" rx=\"4.5\" fill=\"#b34700\" stroke=\"#fafaf9\" stroke-width=\"1.5\"/><path d=\"M9.54 43.79C11.5 43.79 12.52 42.53 12.52 40.5V34.37H7.33V36.06H10.43V40.42C10.43 41.43 10.22 42.03 9.42 42.03C8.67 42.03 8.13 41.5 7.69 40.96L6.5 42.28C7.15 43.13 8.11 43.79 9.54 43.79ZM17.3 43.79C19.36 43.79 21.05 42.73 21.05 40.79C21.05 39.46 20.27 38.6 18.51 38.18L16.95 37.81C16.25 37.64 15.96 37.39 15.96 36.91C15.96 36.23 16.54 35.84 17.48 35.84C18.45 35.84 19.18 36.34 19.64 36.87L20.83 35.73C20.18 34.87 19.19 34.21 17.5 34.21C15.27 34.21 13.87 35.33 13.87 36.91C13.87 38.15 14.72 39.09 16.37 39.49L17.87 39.85C18.63 40.03 18.95 40.28 18.95 40.87C18.95 41.81 18.2 42.11 17.26 42.11C16.07 42.11 15.19 41.53 14.6 40.95L13.72 42.36C14.52 43.17 15.72 43.79 17.3 43.79ZM26.03 43.79C28.6 43.79 30.15 42.23 30.15 39.53V38.47C30.15 35.77 28.6 34.21 26.03 34.21C23.46 34.21 21.91 35.77 21.91 38.47V39.53C21.91 42.23 23.46 43.79 26.03 43.79ZM26.03 42.03C24.65 42.03 24.09 41.08 24.09 39.5V38.5C24.09 36.92 24.65 35.97 26.03 35.97C27.41 35.97 27.98 36.92 27.98 38.5V39.5C27.98 41.08 27.41 42.03 26.03 42.03ZM33.78 43.63V36.58H33.84L36.4 43.63H39.5V34.37H37.45V41.29H37.38L34.97 34.37H31.73V43.63Z\" fill=\"#ffffff\"/></svg>", "txt": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 64 64\" aria-hidden=\"true\"><path d=\"M16 4H40L54 18V56Q54 60 50 60H16Q12 60 12 56V8Q12 4 16 4Z\" fill=\"#003c7a\"/><path d=\"M40 4V14Q40 18 44 18H54Z\" fill=\"#be9a41\"/><path d=\"M23 23H46\" stroke=\"#fafaf9\" stroke-width=\"3\" stroke-linecap=\"round\"/><path d=\"M28 54H46\" stroke=\"#be9a41\" stroke-width=\"3\" stroke-linecap=\"round\"/><rect x=\"2.75\" y=\"29.75\" width=\"40.5\" height=\"18.5\" rx=\"4.5\" fill=\"#596270\" stroke=\"#fafaf9\" stroke-width=\"1.5\"/><path d=\"M15.56 43.75V36.01H18.1V34.25H10.85V36.01H13.42V43.75ZM21.09 43.75 22.92 40.64H22.99L24.89 43.75H27.3L24.17 38.85L27.04 34.25H24.9L23.1 37.28H23.04L21.26 34.25H18.85L21.79 38.89L18.71 43.75ZM32.61 43.75V36.01H35.15V34.25H27.9V36.01H30.46V43.75Z\" fill=\"#ffffff\"/></svg>", "md": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 64 64\" aria-hidden=\"true\"><path d=\"M16 4H40L54 18V56Q54 60 50 60H16Q12 60 12 56V8Q12 4 16 4Z\" fill=\"#003c7a\"/><path d=\"M40 4V14Q40 18 44 18H54Z\" fill=\"#be9a41\"/><path d=\"M23 23H46\" stroke=\"#fafaf9\" stroke-width=\"3\" stroke-linecap=\"round\"/><path d=\"M28 54H46\" stroke=\"#be9a41\" stroke-width=\"3\" stroke-linecap=\"round\"/><rect x=\"2.75\" y=\"29.75\" width=\"40.5\" height=\"18.5\" rx=\"4.5\" fill=\"#6a3db8\" stroke=\"#fafaf9\" stroke-width=\"1.5\"/><path d=\"M15.14 43.75V36.9H15.19L16.86 43.75H19.1L20.77 36.9H20.82V43.75H22.86V34.25H19.53L18.04 41.09H17.99L16.49 34.25H13.09V43.75ZM28.37 43.75C31.38 43.75 32.91 42.26 32.91 39.54V38.46C32.91 35.74 31.38 34.25 28.37 34.25H24.99V43.75ZM27.13 36H28.35C29.91 36 30.67 36.8 30.67 38.48V39.52C30.67 41.2 29.91 42 28.35 42H27.13Z\" fill=\"#ffffff\"/></svg>", "xml": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 64 64\" aria-hidden=\"true\"><path d=\"M16 4H40L54 18V56Q54 60 50 60H16Q12 60 12 56V8Q12 4 16 4Z\" fill=\"#003c7a\"/><path d=\"M40 4V14Q40 18 44 18H54Z\" fill=\"#be9a41\"/><path d=\"M23 23H46\" stroke=\"#fafaf9\" stroke-width=\"3\" stroke-linecap=\"round\"/><path d=\"M28 54H46\" stroke=\"#be9a41\" stroke-width=\"3\" stroke-linecap=\"round\"/><rect x=\"2.75\" y=\"29.75\" width=\"40.5\" height=\"18.5\" rx=\"4.5\" fill=\"#0b6e83\" stroke=\"#fafaf9\" stroke-width=\"1.5\"/><path d=\"M11.3 43.75 13.13 40.64H13.2L15.1 43.75H17.52L14.38 38.85L17.26 34.25H15.12L13.31 37.28H13.26L11.48 34.25H9.06L12.01 38.89L8.93 43.75ZM20.91 43.75V36.9H20.96L22.63 43.75H24.87L26.54 36.9H26.6V43.75H28.63V34.25H25.31L23.81 41.09H23.76L22.27 34.25H18.86V43.75ZM37.07 43.75V42H32.91V34.25H30.76V43.75Z\" fill=\"#ffffff\"/></svg>", "drawio": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 64 64\" aria-hidden=\"true\"><path d=\"M16 4H40L54 18V56Q54 60 50 60H16Q12 60 12 56V8Q12 4 16 4Z\" fill=\"#003c7a\"/><path d=\"M40 4V14Q40 18 44 18H54Z\" fill=\"#be9a41\"/><path d=\"M23 23H46\" stroke=\"#fafaf9\" stroke-width=\"3\" stroke-linecap=\"round\"/><path d=\"M28 54H46\" stroke=\"#be9a41\" stroke-width=\"3\" stroke-linecap=\"round\"/><rect x=\"2.75\" y=\"29.75\" width=\"40.5\" height=\"18.5\" rx=\"4.5\" fill=\"#a8206f\" stroke=\"#fafaf9\" stroke-width=\"1.5\"/><path d=\"M9.32 42.97C11.84 42.97 13.12 41.72 13.12 39.45V38.55C13.12 36.28 11.84 35.03 9.32 35.03H6.5V42.97ZM8.29 36.5H9.31C10.61 36.5 11.25 37.16 11.25 38.57V39.43C11.25 40.84 10.61 41.5 9.31 41.5H8.29ZM16.22 42.97V39.62H16.28C17.36 40.54 18.17 41.48 18.91 42.97H20.95C20.33 41.72 19.52 40.64 18.68 39.9V39.84C19.95 39.56 20.78 38.81 20.78 37.48C20.78 36.03 19.78 35.03 17.84 35.03H14.43V42.97ZM16.22 36.5H17.81C18.67 36.5 18.92 36.94 18.92 37.53C18.92 38.15 18.65 38.61 17.78 38.61H16.22ZM23.32 42.97 23.86 41.27H26.88L27.43 42.97H29.28L26.56 35.03H24.22L21.52 42.97ZM25.35 36.38H25.4L26.48 39.84H24.28ZM33.11 42.97 34.19 37.15H34.24L35.32 42.97H37.55L39.5 35.03H37.75L36.56 41.19H36.51L35.34 35.03H33.06L32.04 41.19H31.99L30.8 35.03H28.97L30.92 42.97Z\" fill=\"#ffffff\"/></svg>", "yaml": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 64 64\" aria-hidden=\"true\"><path d=\"M16 4H40L54 18V56Q54 60 50 60H16Q12 60 12 56V8Q12 4 16 4Z\" fill=\"#003c7a\"/><path d=\"M40 4V14Q40 18 44 18H54Z\" fill=\"#be9a41\"/><path d=\"M23 23H46\" stroke=\"#fafaf9\" stroke-width=\"3\" stroke-linecap=\"round\"/><path d=\"M28 54H46\" stroke=\"#be9a41\" stroke-width=\"3\" stroke-linecap=\"round\"/><rect x=\"2.75\" y=\"29.75\" width=\"40.5\" height=\"18.5\" rx=\"4.5\" fill=\"#2e7d32\" stroke=\"#fafaf9\" stroke-width=\"1.5\"/><path d=\"M11.65 43.21V39.97L14.91 34.79H12.96L10.77 38.36H10.71L8.54 34.79H6.5L9.76 39.97V43.21ZM15.88 43.21 16.46 41.41H19.66L20.25 43.21H22.21L19.32 34.79H16.84L13.97 43.21ZM18.03 36.22H18.09L19.24 39.89H16.9ZM25.18 43.21V37.14H25.22L26.7 43.21H28.69L30.17 37.14H30.22V43.21H32.02V34.79H29.07L27.75 40.85H27.7L26.38 34.79H23.36V43.21ZM39.5 43.21V41.66H35.81V34.79H33.91V43.21Z\" fill=\"#ffffff\"/></svg>", "image": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 64 64\" aria-hidden=\"true\"><path d=\"M16 4H40L54 18V56Q54 60 50 60H16Q12 60 12 56V8Q12 4 16 4Z\" fill=\"#003c7a\"/><path d=\"M40 4V14Q40 18 44 18H54Z\" fill=\"#be9a41\"/><path d=\"M23 23H46\" stroke=\"#fafaf9\" stroke-width=\"3\" stroke-linecap=\"round\"/><path d=\"M28 54H46\" stroke=\"#be9a41\" stroke-width=\"3\" stroke-linecap=\"round\"/><rect x=\"2.75\" y=\"29.75\" width=\"40.5\" height=\"18.5\" rx=\"4.5\" fill=\"#5f6b00\" stroke=\"#fafaf9\" stroke-width=\"1.5\"/><path d=\"M13.5 43.67V34.33H11.39V43.67ZM17.6 43.67V36.93H17.65L19.29 43.67H21.49L23.13 36.93H23.19V43.67H25.19V34.33H21.92L20.45 41.05H20.4L18.93 34.33H15.58V43.67ZM30.12 43.83C30.78 43.83 31.5 43.66 31.93 43.38L32.55 42.23H32.62L32.75 43.67H34.61V38.56H31.09V40.25H32.58V41.2C32.09 41.82 31.41 42.14 30.65 42.14C29.38 42.14 29 41.32 29 39.48V38.43C29 36.84 29.43 35.84 31.02 35.84C32.02 35.84 32.63 36.32 33.09 36.92L34.29 35.69C33.61 34.82 32.59 34.17 30.89 34.17C28.38 34.17 26.82 35.74 26.82 38.47V39.55C26.82 42.18 28.04 43.83 30.12 43.83Z\" fill=\"#ffffff\"/></svg>", "svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 64 64\" aria-hidden=\"true\"><path d=\"M16 4H40L54 18V56Q54 60 50 60H16Q12 60 12 56V8Q12 4 16 4Z\" fill=\"#003c7a\"/><path d=\"M40 4V14Q40 18 44 18H54Z\" fill=\"#be9a41\"/><path d=\"M23 23H46\" stroke=\"#fafaf9\" stroke-width=\"3\" stroke-linecap=\"round\"/><path d=\"M28 54H46\" stroke=\"#be9a41\" stroke-width=\"3\" stroke-linecap=\"round\"/><rect x=\"2.75\" y=\"29.75\" width=\"40.5\" height=\"18.5\" rx=\"4.5\" fill=\"#7b4a2a\" stroke=\"#fafaf9\" stroke-width=\"1.5\"/><path d=\"M14.09 43.83C16.18 43.83 17.88 42.76 17.88 40.8C17.88 39.47 17.1 38.6 15.32 38.17L13.75 37.8C13.04 37.63 12.75 37.37 12.75 36.89C12.75 36.21 13.33 35.81 14.28 35.81C15.25 35.81 15.99 36.32 16.46 36.85L17.66 35.7C17 34.84 16 34.17 14.29 34.17C12.05 34.17 10.64 35.3 10.64 36.89C10.64 38.15 11.49 39.09 13.16 39.49L14.67 39.85C15.44 40.04 15.76 40.29 15.76 40.88C15.76 41.83 15 42.14 14.05 42.14C12.85 42.14 11.97 41.55 11.37 40.96L10.49 42.39C11.29 43.2 12.51 43.83 14.09 43.83ZM24.19 43.67 27.22 34.33H25.13L22.78 41.98H22.73L20.4 34.33H18.2L21.26 43.67ZM31.03 43.83C31.68 43.83 32.4 43.66 32.83 43.38L33.45 42.23H33.52L33.65 43.67H35.51V38.56H31.99V40.25H33.48V41.2C32.99 41.82 32.31 42.14 31.55 42.14C30.28 42.14 29.9 41.32 29.9 39.48V38.43C29.9 36.84 30.33 35.84 31.92 35.84C32.92 35.84 33.53 36.32 33.99 36.92L35.19 35.69C34.51 34.82 33.49 34.17 31.79 34.17C29.28 34.17 27.72 35.74 27.72 38.47V39.55C27.72 42.18 28.94 43.83 31.03 43.83Z\" fill=\"#ffffff\"/></svg>", "zip": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 64 64\" aria-hidden=\"true\"><path d=\"M16 4H40L54 18V56Q54 60 50 60H16Q12 60 12 56V8Q12 4 16 4Z\" fill=\"#003c7a\"/><path d=\"M40 4V14Q40 18 44 18H54Z\" fill=\"#be9a41\"/><path d=\"M23 23H46\" stroke=\"#fafaf9\" stroke-width=\"3\" stroke-linecap=\"round\"/><path d=\"M28 54H46\" stroke=\"#be9a41\" stroke-width=\"3\" stroke-linecap=\"round\"/><rect x=\"2.75\" y=\"29.75\" width=\"40.5\" height=\"18.5\" rx=\"4.5\" fill=\"#7a5c00\" stroke=\"#fafaf9\" stroke-width=\"1.5\"/><path d=\"M19.95 43.75V42H15.01V41.95L19.81 36.18V34.25H12.92V36H17.54V36.05L12.62 41.84V43.75ZM23.66 43.75V34.25H21.52V43.75ZM27.93 43.75V40.29H29.87C32.17 40.29 33.38 39.08 33.38 37.21C33.38 35.46 32.17 34.25 29.87 34.25H25.78V43.75ZM27.93 36H29.83C30.83 36 31.16 36.53 31.16 37.26C31.16 38 30.83 38.54 29.83 38.54H27.93Z\" fill=\"#ffffff\"/></svg>", "file": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 64 64\" aria-hidden=\"true\"><path d=\"M16 4H40L54 18V56Q54 60 50 60H16Q12 60 12 56V8Q12 4 16 4Z\" fill=\"#003c7a\"/><path d=\"M40 4V14Q40 18 44 18H54Z\" fill=\"#be9a41\"/><path d=\"M23 23H46\" stroke=\"#fafaf9\" stroke-width=\"3\" stroke-linecap=\"round\"/><path d=\"M28 54H46\" stroke=\"#be9a41\" stroke-width=\"3\" stroke-linecap=\"round\"/><rect x=\"2.75\" y=\"29.75\" width=\"40.5\" height=\"18.5\" rx=\"4.5\" fill=\"#3d434c\" stroke=\"#fafaf9\" stroke-width=\"1.5\"/><path d=\"M11.77 43.75V40.25H15.8V38.51H11.77V35.97H16.19V34.25H9.63V43.75ZM19.98 43.75V34.25H17.84V43.75ZM28.41 43.75V42H24.24V34.25H22.1V43.75ZM36.37 43.75V42.03H31.95V39.81H35.98V38.13H31.95V35.97H36.37V34.25H29.81V43.75Z\" fill=\"#ffffff\"/></svg>"};
/*FT-END*/
const FOLDER_ROW = Object.keys(FOLDER_ICONS).map((k) => [k, `ico.fr.${k}`]); // one icon per folder role (assets/icons/folders.json), the same ones Explorer shows
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
<p class="set-ico-fh">${esc(t('ico.folders'))}</p>
<ul class="set-ico-folders">${FOLDER_ROW.map(([k, key]) => `<li>${FOLDER_ICONS[k]}<span>${esc(t(key))}</span></li>`).join('')}</ul>
<p class="hint">${esc(t('ico.foldersNote'))}</p>
<p class="set-ico-fh">${esc(t('ico.files'))}</p>
<ul class="set-ico-files">${Object.entries(FILE_ICONS).map(([k, svg]) => `<li>${svg}<span lang="en" dir="ltr">${esc(k === 'file' ? '*' : k === 'image' ? '.png .jpg' : `.${k}`)}</span></li>`).join('')}</ul>`;
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
