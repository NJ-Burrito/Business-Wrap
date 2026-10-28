/* A16 Share and Lock (design.md §3 A16). Lock = a guard against accidental edits, not access control: every change is
 * refused while locked (the seam's guards), editing tools are greyed, typing does nothing; Unlock asks once (no password)
 * and is logged with the name. Lock state travels inside the Save-HTML (bw-data → lock). Share writes the Save-HTML
 * (with provenance and lock) to the workspace HTML folder and offers: show the file, copy its path, an e-mail draft. */
const LK = Object.assign({}, DATA.lock || {});
const lkOn = (svc = S.svc) => !!LK[svc]?.locked;
const lkEditIds = () => new Set(CMDS.filter((c) => c.edit).map((c) => c.id));

function lkPaint() {
  const on = lkOn();
  document.documentElement.dataset.bwLocked = on ? '1' : '0';
  const ids = lkEditIds();
  root.querySelectorAll('[data-a]').forEach((b) => { if (ids.has(b.dataset.a)) { b.disabled = on; b.toggleAttribute('aria-disabled', on); } });
  root.querySelectorAll('[data-a="lkToggle"] .w').forEach((w) => { w.textContent = t(on ? 'lkUnlock' : 'lkLock'); });
  if (on) document.querySelectorAll('#bw-pair [contenteditable]').forEach((el) => el.removeAttribute('contenteditable'));
  let b = root.querySelector('.lk-banner');
  if (!on) { b?.remove(); return; }
  if (!b) { b = document.createElement('div'); b.className = 'lk-banner'; b.setAttribute('role', 'status'); root.appendChild(b); }
  const l = LK[S.svc];
  b.innerHTML = `<span class="i">${ic('warn')}</span><span class="m">${esc(t('lkBanner', { name: l.by || t('pfNoName'), time: new Date(l.at).toLocaleString(S.ui === 'ar' ? 'ar-JO' : 'en-GB') }))}</span><button type="button" class="b" data-lk="unlock"><span class="w">${esc(t('lkUnlock'))}</span></button>`;
  b.querySelector('[data-lk="unlock"]').onclick = () => runAction('lkToggle');
}
async function lkToggle() {
  const svc = S.svc;
  const me = PF.actor().name;
  if (!lkOn(svc)) {
    await EXT.ledger?.settle();
    LK[svc] = { locked: true, by: me, at: new Date().toISOString() };
    await EXT.ledger?.append('lock', { by: me }, svc);
    flash(t('lkLocked'));
  } else {
    const k = await bwModal({ title: t('lkUnlockTitle'), html: `<p class="lk-warn">${esc(t('lkUnlockWarn'))}</p>`, buttons: [['cancel', t('pvCancel')], ['ok', t('lkUnlock'), true]] });
    if (k !== 'ok') return;
    const was = LK[svc];
    LK[svc] = { locked: false, by: me, at: new Date().toISOString() };
    await EXT.ledger?.append('unlock', { by: me, lockedBy: was.by || '', lockedAt: was.at || '' }, svc);
    flash(t('lkUnlocked'));
  }
  lkPaint();
}

/** The Save-HTML text, captured instead of downloaded. */
async function lkCaptureHtml() {
  let cap = null;
  const dl0 = download;
  download = (name, text) => { cap = { name, text }; };
  try { await saveHtml(!!S.embedFonts); } finally { download = dl0; }
  return cap;
}
async function lkShare() {
  let to = '';
  const k = await bwModal({ title: t('shShare'), html: `<p class="hint">${esc(t('shHint'))}</p><label>${esc(t('shTo'))}<input data-sh="to" type="text" maxlength="80"></label>`, buttons: [['cancel', t('pvCancel')], ['ok', t('shShare'), true]], mount: (m) => m.querySelector('[data-sh="to"]').addEventListener('input', (e) => { to = e.target.value.trim(); }) });
  if (k !== 'ok') return;
  await EXT.ledger?.append('share', { to });
  const cap = await lkCaptureHtml();
  if (!cap) return;
  if (!location.protocol.startsWith('http')) { download(cap.name, cap.text, 'text/html'); flash(t('shDownloaded', { name: cap.name })); return; }
  try {
    const r = await fetch('/api/share', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: cap.name, html: cap.text }) });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || r.status);
    S.lastShare = j.path;
    toast(t('shDone', { path: j.path }), 'ok', { persist: true, actions: [
      [t('shOpen'), () => fetch('/api/share/open', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path: j.path }) })],
      [t('shCopy'), () => navigator.clipboard?.writeText(j.path).then(() => flash(t('shCopied')), () => flash(j.path))],
      [t('shMail'), () => { location.href = `mailto:?subject=${encodeURIComponent(cur().doc.control.title)}&body=${encodeURIComponent(t('shMailBody', { name: cap.name }))}`; }],
    ] });
  } catch (err) { flash(String(err.message || err), true); }
}

// typing into a locked document does nothing (the guard would refuse it anyway; this keeps the DOM unchanged too)
document.addEventListener('beforeinput', (e) => { if (lkOn() && e.target.closest?.('#bw-pair')) { e.preventDefault(); } }, true);
document.addEventListener('dblclick', () => { if (lkOn()) setTimeout(lkPaint, 0); }, true);

bwExt({
  actions: { lkToggle, shShare: lkShare },
  guards: [(what) => (lkOn() ? t('lkRefused') : true)],
  on: {
    boot: lkPaint,
    open: lkPaint,
    render: lkPaint,
    saveHtml: (data) => { data.lock = LK[S.svc] ? { [S.svc]: LK[S.svc] } : {}; },
    keydown: (e) => {
      if (!lkOn() || !e.target.closest?.('#bw-pair')) return false;
      if (e.key.length === 1 || ['Backspace', 'Delete', 'Enter'].includes(e.key)) { if (!e.ctrlKey && !e.metaKey) { toast(t('lkRefused'), 'warn'); return true; } }
      return false;
    },
  },
});
