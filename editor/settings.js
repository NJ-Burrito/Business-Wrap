/* Business-Wrap editor — the Settings page (0.11.0; reworked 0.17.0 notes 8, 9, 10), concatenated after update.js.
 * A drawer («الإعدادات» / Settings), reached from the toolbar's View section and Ctrl+K. Cards, most used first (Preferences opens first; the others are the collapsible groups every drawer has):
 * Preferences (language, word direction, page view, reduced motion), Update (installed vs latest, last check, «تحقّق الآن»,
 * auto-check on launch), File icons, Local learning (mounted by learning-hook.js through BW_LEARNING.mount(el)) and
 * About (name, logo, version, release date, repository: only what a user needs; embedded at build time, so it shows from
 * file:// too). Extension cards follow (collapsible groups, as before). Each preference is written to the store it already had
 * (bw:ui, bw:dir:<ed>, bw:pages, bw:calm, bw:update-auto). The check itself is update.js (BW_UPDATE).
 * 0.17.0 note 10: the host on/off control is NOT here. It lives only in the top bar (editor/ext/18-server.js); this file keeps
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
  try { if (sessionStorage.getItem('bw:grp:settings:0') == null) sessionStorage.setItem('bw:grp:settings:0', '1'); } catch { /* storage blocked: all collapsed */ } // Preferences (group 0) opens first; the others stay collapsed (0.13 F2 · 11) until the person opens them
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
${setCard('set-about', 'about', 'about', t('set.about'), setAboutInner(A))}${EXT.settings.map((c) => `<section class="card set-x-${esc(c.id)}" aria-labelledby="set-h-${esc(c.id)}"><h3 id="set-h-${esc(c.id)}"><span class="i">${ic(c.icon || 'prefs')}</span>${esc(t(c.title))}</h3>${c.html()}</section>`).join('')}</div>`; // + extension cards
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
  if (k === 'calm') { S.calm = el.checked; ls.set('bw:calm', S.calm ? '1' : '0'); buildUi(); root.querySelector('.drawer [data-set="calm"]')?.focus(); }
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
      if (j && j.name === 'Business-Wrap') found.push(p);
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
async function srvBegin(onStep = () => {}) {
  onStep('checking');
  SRV.found = await srvProbe();
  SRV.asked = true;
  if (SRV.found.length) return 'running';
  onStep('starting');
  srvLaunch('business-wrap://start');
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
const FOLDER_ROW = Object.keys(FOLDER_ICONS).map((k) => [k, `ico.fr.${k}`]); // 0.17.4: one icon per folder role (assets/icons/folders.json), the same ones Explorer shows
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
