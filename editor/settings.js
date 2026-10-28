/* Business-Wrap editor — the Settings page (0.11.0), concatenated after update.js.
 * A drawer («الإعدادات» / Settings), reached from the toolbar's View section and Ctrl+K, in four cards:
 * About (name, logo, version, release date, repository, licence, credits — embedded at build time, so it shows
 * from file:// too), Update (installed vs latest, last check, «تحقّق الآن», auto-check on launch) and Preferences
 * (language, word direction, page view, reduced motion, explainer cards), each written to the store it already had
 * (bw:ui, bw:dir, bw:pages, bw:calm, bw:explainers, bw:update-auto), and Local learning («التعلّم المحلي»,
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
</dl></section>
<section class="card set-upd" aria-labelledby="set-h-upd"><h3 id="set-h-upd"><span class="i">${ic('update')}</span>${esc(t('set.update'))}</h3>
<div class="set-upd-body">${setUpdateInner()}</div></section>
<section class="card set-prefs" aria-labelledby="set-h-prefs"><h3 id="set-h-prefs"><span class="i">${ic('prefs')}</span>${esc(t('set.prefs'))}</h3>
<div class="set-row"><span class="set-k">${esc(t('set.lang'))}</span>${setSeg('setLang', [['ar', 'ع العربية', S.ui === 'ar', 'ar'], ['en', 'E English', S.ui === 'en', 'en']], t('set.lang'))}</div>
<div class="set-row"><span class="set-k">${esc(t('set.dir'))}</span>${setSeg('setDir', ['rtl', 'ltr'].map((d) => [d, t(d), uiDir() === d]), t('set.dir'))}</div>
<div class="set-row"><span class="set-k">${esc(t('set.view'))}</span>${setSeg('setView', viewModes().map((m) => [m, t('view.' + m), viewsMode() === m]), t('set.view'))}</div>
<label class="chk"><input type="checkbox" data-set="calm" ${S.calm ? 'checked' : ''}> ${esc(t('set.calm'))}</label>
<label class="chk"><input type="checkbox" data-set="explain" ${ls.get('bw:explainers') !== '0' ? 'checked' : ''}> ${esc(t('set.explain'))}</label>
</section>
<section class="card set-lrn" aria-labelledby="set-h-lrn"><h3 id="set-h-lrn"><span class="i">${ic('learning')}</span>${esc(t('learning'))}</h3>
<div class="set-lrn-body" data-lrn-mount></div></section></div>`;
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
  if (k === 'setLang') { setLang(v); return true; }
  if (k === 'setDir') { setDir(v); return true; }
  if (k === 'setView') { viewsSet(v); return true; }
  return false;
}
function settingsChange(el) {
  const k = el.dataset.set;
  if (k === 'auto') ls.set('bw:update-auto', el.checked ? '1' : '0');
  if (k === 'explain') { ls.set('bw:explainers', el.checked ? '1' : '0'); if (!el.checked) xplHide(); }
  if (k === 'calm') { S.calm = el.checked; ls.set('bw:calm', S.calm ? '1' : '0'); buildUi(); root.querySelector('.drawer [data-set="calm"]')?.focus(); }
}
