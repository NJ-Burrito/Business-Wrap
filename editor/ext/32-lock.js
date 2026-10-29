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
  // the approval travels in the log: the last signature names its signer beside the lock
  const sg = [...(EXT.ledger?.log(S.svc)?.entries || [])].reverse().find((e) => e.kind === 'sign');
  const signed = sg ? ` · ${t('lkSignedBy', { name: sg.data?.name || sg.actor.name || t('pfNoName') })}` : '';
  b.innerHTML = `<span class="i">${ic('warn')}</span><span class="m">${esc(t('lkBanner', { name: l.by || t('pfNoName'), time: new Date(l.at).toLocaleString(S.ui === 'ar' ? 'ar-JO' : 'en-GB') }) + signed)}</span><button type="button" class="b" data-lk="unlock"><span class="w">${esc(t('lkUnlock'))}</span></button>`;
  b.querySelector('[data-lk="unlock"]').onclick = () => runAction('lkToggle');
}
async function lkToggle() {
  const svc = S.svc;
  const me = PF.actor().name;
  if (!lkOn(svc)) {
    await EXT.ledger?.settle();
    LK[svc] = { locked: true, by: me, id: PF.id(), at: new Date().toISOString() }; // id: the profile key (review2 #12)
    await EXT.ledger?.append('lock', { by: me }, svc);
    flash(t('lkLocked'));
  } else {
    const k = await bwModal({ title: t('lkUnlockTitle'), html: `<p class="lk-warn">${esc(t('lkUnlockWarn'))}</p>`, buttons: [['cancel', t('pvCancel')], ['ok', t('lkUnlock'), true]] });
    if (k !== 'ok') return;
    const was = LK[svc];
    LK[svc] = { locked: false, by: me, id: PF.id(), at: new Date().toISOString() };
    await EXT.ledger?.append('unlock', { by: me, lockedBy: was.by || '', lockedAt: was.at || '' }, svc);
    flash(t('lkUnlocked'));
  }
  lkPaint();
  if (EXT.library?.isDoc(svc)) await EXT.library.save(); // the library entry carries the lock state (A16 ↔ A2)
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

IC.lkToggle = '<svg aria-hidden="true" focusable="false" class="ic" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" > <rect width="18" height="11" x="3" y="11" rx="2" ry="2" /> <path d="M7 11V7a5 5 0 0 1 10 0v4" /> </svg>';
IC.shShare = '<svg aria-hidden="true" focusable="false" class="ic" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" > <circle cx="18" cy="5" r="3" /> <circle cx="6" cy="12" r="3" /> <circle cx="18" cy="19" r="3" /> <line x1="8.59" x2="15.42" y1="13.51" y2="17.49" /> <line x1="15.41" x2="8.59" y1="6.51" y2="10.49" /> </svg>';
bwExt({
  cmds: [{ id: 'lkToggle', group: 'document', edit: false }, { id: 'shShare', group: 'file', edit: false }],
  actions: { lkToggle, shShare: lkShare },
  expose: { lock: { of: (svc) => LK[svc] || null, set: (svc, v) => { if (v) LK[svc] = v; else delete LK[svc]; if (svc === S.svc) lkPaint(); } } },
  guards: [(what) => (lkOn() ? t('lkRefused') : true)],
  on: {
    // painted at once, and again when the document's log is attached (the signer comes from it)
    boot: () => { lkPaint(); EXT.ledger?.ready().then(lkPaint); },
    open: () => { lkPaint(); EXT.ledger?.ready().then(lkPaint); },
    render: lkPaint,
    saveHtml: (data) => { data.lock = LK[S.svc] ? { [S.svc]: LK[S.svc] } : {}; },
    keydown: (e) => {
      if (!lkOn() || !e.target.closest?.('#bw-pair')) return false;
      if (e.key.length === 1 || ['Backspace', 'Delete', 'Enter'].includes(e.key)) { if (!e.ctrlKey && !e.metaKey) { toast(t('lkRefused'), 'warn'); return true; } }
      return false;
    },
  },
});
