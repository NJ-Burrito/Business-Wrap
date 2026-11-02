/* 0.15.9 P1/P3: the folder picker, an in-editor panel (no native dialog). Its whole state is HOST state (engine/workspace.mjs
 * pickerOpen / pickerGo / pickerMkdir / pickerChoose / pickerCancel; routes POST /api/workspace/picker/<verb>), so this panel, the MCP
 * tools (picker_*) and the CLI (`picker`) see one picker and any of them can finish it. The panel only draws what the host says:
 *   - open: a long-poll (picker/wait, 20 s) returns the moment anyone changes it, so an agent's moves appear live;
 *   - closed: a 2.5 s check while the tab is visible, plus one 120 ms / 700 ms after a click or key (a Save that needs the folder
 *     opens the picker on the host, and the panel is there before the person looks up).
 * Keyboard: Tab through places, path, list and buttons; Arrow Up/Down in the list, Enter opens a folder, Backspace or Alt+Up goes up,
 * Enter in the path box goes there, Esc cancels. Screen reader: a labelled dialog, a nav for the path, a list of buttons, a polite status line.
 * The old `/api/workspace/pick` caller (Settings «غيّر المجلد», first Save) just waits on the host while this panel is shown. */
const FPK = (() => {
  const LUC = { // Lucide (ISC): folder, folder-plus, hard-drive, house, monitor, download, file-text, arrow-up, chevron-right, check, x
    folder: '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
    folderPlus: '<path d="M12 10v6"/><path d="M9 13h6"/><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
    drive: '<line x1="22" x2="2" y1="12" y2="12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/><line x1="6" x2="6.01" y1="16" y2="16"/><line x1="10" x2="10.01" y1="16" y2="16"/>',
    home: '<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    desktop: '<rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/>',
    downloads: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/>',
    documents: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>',
    up: '<path d="m5 12 7-7 7 7"/><path d="M12 19V5"/>',
    next: '<path d="m9 18 6-6-6-6"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  };
  const icon = (k) => `<svg aria-hidden="true" focusable="false" class="ic" data-ic="fp-${k}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${LUC[k]}</svg>`;
  const post = (verb, body = {}) => fetch(`/api/workspace/picker/${verb}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json().catch(() => ({ ok: false })));
  let dlg = null, st = { rev: -1, open: false, picker: null, last: null }, started = false, mine = false, lastKey = {}, nudge = 0;

  const placeName = (p) => (p.id === 'drive' ? t('fpDrive', { d: p.label || p.path }) : t({ documents: 'fpDocuments', desktop: 'fpDesktop', downloads: 'fpDownloads', home: 'fpHome' }[p.id]));
  /** Breadcrumb segments of an absolute path: [{name, path}], from the root down. */
  function crumbsOf(p) {
    if (!p) return [];
    const sep = p.includes('\\') ? '\\' : '/';
    let rootEnd = 0, rootName;
    if (/^[A-Za-z]:[\\/]/.test(p)) { rootEnd = 3; rootName = p.slice(0, 2); }
    else if (p.startsWith('\\\\')) { const m = /^\\\\[^\\]+\\[^\\]+/.exec(p); rootEnd = m ? m[0].length + 1 : 2; rootName = m ? m[0] : '\\\\'; }
    else { rootEnd = 1; rootName = '/'; }
    const out = [{ name: rootName, path: p.slice(0, rootEnd) }];
    let acc = p.slice(0, rootEnd);
    for (const seg of p.slice(rootEnd).split(/[\\/]+/).filter(Boolean)) { acc = acc.endsWith(sep) ? acc + seg : acc + sep + seg; out.push({ name: seg, path: acc }); }
    return out;
  }
  const errText = (e) => (e ? t(`fpe_${e.code}`) === `fpe_${e.code}` ? e.message || '' : t(`fpe_${e.code}`) : '');

  function build() {
    dlg = document.createElement('dialog');
    dlg.className = 'bw-fp';
    dlg.dataset.theme = S.dark ? 'dark' : 'light';
    dlg.dir = uiDir();
    dlg.setAttribute('aria-labelledby', 'bw-fp-h');
    dlg.innerHTML = `<h2 id="bw-fp-h">${esc(t('fpTitle'))}</h2><p class="fp-lead">${esc(t('fpLead'))}</p><p class="fp-by" hidden></p>
<form class="fp-pathrow" autocomplete="off"><label for="bw-fp-path">${esc(t('fpPath'))}</label><input id="bw-fp-path" type="text" dir="ltr" spellcheck="false" /><button type="submit" class="b"><span class="w">${esc(t('fpGo'))}</span></button></form>
<p class="fp-msg" role="status" aria-live="polite"></p>
<nav class="fp-crumbs" aria-label="${esc(t('fpCrumbs'))}"><ol></ol></nav>
<div class="fp-body"><div class="fp-places" role="group" aria-label="${esc(t('fpPlaces'))}"></div><div class="fp-main"><div class="fp-tools"><button type="button" class="b fp-up"><span class="i">${icon('up')}</span><span class="w">${esc(t('fpUp'))}</span></button><button type="button" class="b fp-new"><span class="i">${icon('folderPlus')}</span><span class="w">${esc(t('fpNew'))}</span></button></div>
<form class="fp-newrow" hidden autocomplete="off"><label for="bw-fp-name">${esc(t('fpNewName'))}</label><input id="bw-fp-name" type="text" maxlength="120" spellcheck="false" /><button type="submit" class="b"><span class="w">${esc(t('fpCreate'))}</span></button></form>
<ul class="fp-list" aria-label="${esc(t('fpList'))}" tabindex="-1"></ul></div></div>
<div class="btns"><button type="button" class="b primary fp-choose"><span class="i">${icon('check')}</span><span class="w">${esc(t('fpChoose'))}</span></button><button type="button" class="b fp-cancel"><span class="i">${icon('x')}</span><span class="w">${esc(t('fpCancel'))}</span></button></div>`;
    root.appendChild(dlg);
    const q = (s) => dlg.querySelector(s);
    const act = async (verb, body) => { mine = true; try { const r = await post(verb, body); if (r && 'open' in r) paint(r); return r; } finally { mine = false; } };
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); act('cancel'); });
    q('.fp-cancel').addEventListener('click', () => act('cancel'));
    q('.fp-choose').addEventListener('click', () => act('choose'));
    q('.fp-up').addEventListener('click', () => { const p = st.picker?.listing; if (p) act('go', { path: p.parent ?? '' }); });
    const pathInput = q('#bw-fp-path');
    pathInput.addEventListener('input', () => { pathInput.dataset.dirty = '1'; }); // what the person is typing is never overwritten by a live update
    pathInput.addEventListener('blur', (e) => { if (e.relatedTarget && pathInput.form.contains(e.relatedTarget)) return; delete pathInput.dataset.dirty; pathInput.value = st.picker?.listing.path ?? ''; });
    q('.fp-pathrow').addEventListener('submit', (e) => { e.preventDefault(); const v = pathInput.value.trim(); delete pathInput.dataset.dirty; if (v) act('go', { path: v }); });
    q('.fp-new').addEventListener('click', () => { const f = q('.fp-newrow'); f.hidden = !f.hidden; if (!f.hidden) q('#bw-fp-name').focus(); });
    q('.fp-newrow').addEventListener('submit', async (e) => { e.preventDefault(); const n = q('#bw-fp-name').value.trim(); if (!n) return; const r = await act('mkdir', { name: n }); if (r?.picker && !r.picker.error) { q('#bw-fp-name').value = ''; q('.fp-newrow').hidden = true; } });
    dlg.addEventListener('click', (e) => {
      const b = e.target.closest('[data-go]');
      if (b) act('go', { path: b.dataset.go });
    });
    dlg.addEventListener('keydown', (e) => {
      const items = [...dlg.querySelectorAll('.fp-item')];
      const i = items.indexOf(root.activeElement);
      if (i >= 0 && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { e.preventDefault(); items[Math.max(0, Math.min(items.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))].focus(); }
      else if (i >= 0 && e.key === 'Backspace') { e.preventDefault(); q('.fp-up').click(); }
      else if (e.altKey && e.key === 'ArrowUp') { e.preventDefault(); q('.fp-up').click(); }
    });
    lastKey = {};
    dlg.showModal();
    document.documentElement.dataset.bwFolderPicker = 'open';
  }

  /** Draw the host's state. Each region is rebuilt only when its content changed, so typing and focus are left alone. */
  function paint(next) {
    if (!next || typeof next.rev !== 'number' || next.rev < st.rev) return;
    const was = st;
    st = next;
    const p = next.picker;
    if (!next.open || !p) {
      if (dlg) { dlg.close(); dlg.remove(); dlg = null; delete document.documentElement.dataset.bwFolderPicker; }
      if (was.open && next.last?.outcome === 'chosen') chosen(next.last.parent, mine);
      return;
    }
    if (!dlg) build();
    const q = (s) => dlg.querySelector(s);
    const L = p.listing;
    const keyOf = (o) => JSON.stringify(o);
    const reg = (name, v, fn) => { const k = keyOf(v); if (lastKey[name] !== k) { lastKey[name] = k; fn(); } };
    const inList = dlg.querySelector('.fp-list')?.contains(root.activeElement);
    reg('by', p.by, () => { const el = q('.fp-by'); el.hidden = p.by !== 'agent'; el.textContent = p.by === 'agent' ? t('fpAgent') : ''; });
    reg('path', L.path, () => { const f = q('#bw-fp-path'); if (!f.dataset.dirty) f.value = L.path; });
    reg('crumbs', L.path, () => {
      const items = [{ name: t('fpThisPc'), path: '' }, ...crumbsOf(L.path)];
      q('.fp-crumbs ol').innerHTML = items.map((c, n) => `<li>${n ? `<span class="fp-sep">${icon('next')}</span>` : ''}<button type="button" class="fp-crumb" data-go="${esc(c.path)}"${n === items.length - 1 ? ' aria-current="page"' : ''}><span dir="auto">${esc(c.name)}</span></button></li>`).join('');
    });
    reg('places', p.places, () => { q('.fp-places').innerHTML = p.places.map((x) => `<button type="button" class="fp-place" data-go="${esc(x.path)}" title="${esc(x.path)}"><span class="i">${icon(x.id === 'drive' ? 'drive' : x.id)}</span><span class="w" dir="auto">${esc(placeName(x))}</span></button>`).join(''); });
    reg('list', [L.path, L.entries, L.error], () => {
      q('.fp-list').innerHTML = L.entries.length ? L.entries.map((e) => `<li><button type="button" class="fp-item" data-go="${esc(e.path)}"><span class="i">${icon(L.path ? 'folder' : 'drive')}</span><span class="w" dir="auto">${esc(e.name)}</span></button></li>`).join('') : `<li class="fp-empty">${esc(L.error ? '' : t('fpEmpty'))}</li>`;
      if (inList) (q('.fp-item') || q('.fp-list')).focus();
    });
    q('.fp-up').disabled = !L.path;
    q('.fp-new').disabled = !L.path || !!L.error;
    q('.fp-choose').disabled = !L.path || !!L.error || L.blocked;
    const msg = p.error ? errText(p.error) : L.error ? errText(L.error) : L.blocked ? t('fpBlocked') : L.truncated ? t('fpMore') : '';
    reg('msg', [msg, !!(p.error || L.error || L.blocked)], () => { const m = q('.fp-msg'); m.textContent = msg; m.classList.toggle('bad', !!(p.error || L.error || L.blocked)); });
    if (!lastKey.focused) { lastKey.focused = 1; (q('.fp-item') || q('.fp-up:not(:disabled)') || q('.fp-choose')).focus(); }
  }

  /** Done: tell this tab's save-folder card (and the session's idea of the folder) what the host now has. */
  async function chosen(parent, own) {
    try {
      const w = await fetch('/api/workspace').then((r) => r.json());
      const info = EXT.session?.info;
      if (info) info.workspace = { root: w.root, chosen: true };
      root.querySelectorAll('.ws-root').forEach((el) => { el.textContent = w.root; });
      if (!own) toast(t('fpChosen', { dir: w.root }), 'ok');
      document.documentElement.dataset.bwFolder = w.parent || parent || '';
    } catch { /* the card refreshes on the next open */ }
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function loop() {
    for (;;) {
      try {
        if (document.hidden && !st.open) { await new Promise((r) => document.addEventListener('visibilitychange', r, { once: true })); continue; }
        const r = st.open ? await post('wait', { since: st.rev, ms: 20000 }) : await post('state');
        if (r && 'open' in r) paint(r); else { st.rev = -1; await sleep(3000); }
      } catch { st.rev = -1; await sleep(3000); }
      if (!st.open) await new Promise((r) => { const tm = setTimeout(r, 2500); FPK.wake = () => { clearTimeout(tm); r(); }; });
    }
  }
  /** A click or a key may have opened the picker on the host (a Save that needs the folder): look again soon. */
  const soon = () => { if (st.open) return; clearTimeout(nudge); nudge = setTimeout(() => FPK.wake?.(), 120); setTimeout(() => FPK.wake?.(), 700); };
  async function start() {
    if (started || !location.protocol.startsWith('http')) return;
    try { const w = await fetch('/api/workspace').then((r) => r.json()); if (!w?.served) return; } catch { return; }
    started = true;
    for (const ev of ['pointerdown', 'keydown']) document.addEventListener(ev, soon, true);
    loop();
  }
  /** Open it now (the Settings button, a test): the host opens it and this panel draws the answer at once. */
  async function open(path) { mine = true; try { const r = await post('open', { by: 'user', ...(path ? { path } : {}) }); paint(r); return r; } finally { mine = false; } }
  return { start, open, paint, get state() { return st; }, get panel() { return dlg; }, wake: null };
})();

bwExt({
  expose: { folderPicker: FPK },
  on: { boot: () => { FPK.start(); } },
});
// «غيّر المجلد» opens the panel at once (the click also asks the host through the old route, which joins this picker)
root.addEventListener('click', (e) => { if (e.target.closest?.('[data-ws="pick"]')) FPK.open(); }, true);
