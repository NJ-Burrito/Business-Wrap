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
  if (EXT.library) return EXT.library.captureHtml(); // queued with Save in place and Save HTML (H3)
  let cap = null;
  const dl0 = download;
  download = (name, text) => { cap = { name, text }; };
  try { await saveHtml(!!S.embedFonts); } finally { download = dl0; }
  return cap;
}
/** What a share carries (H3): the edits, the history (provenance log), the lock and the signatures. */
function lkTravels(svc = S.svc) {
  const log = EXT.ledger?.log(svc)?.entries || [];
  return { edits: Object.values(M[svc] || {}).reduce((n, e) => n + e.ops.length, 0), history: log.length, lock: LK[svc]?.locked ? LK[svc] : null, signs: log.filter((e) => e.kind === 'sign').length };
}
const lkDay = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
/** Share with a coworker (H3): one popup (recipient, note, what travels, the file name), the file written into the
 *  save folder's HTML\ as «<title>-<date>-<AR|ENG>.html» with the full log, then a result card: «افتح موقع الملف»
 *  (Explorer with that file selected), «انسخ المسار», close. Off the server: a download, as before. */
async function lkShare() {
  const svc = S.svc;
  const tr = lkTravels(svc);
  const title = EXT.library ? EXT.library.titleOf(svc) : cur().doc.control.title;
  const file = `${title}-${lkDay()}-${S.ed === 'en' ? 'ENG' : 'AR'}.html`;
  const li = (k, v) => `<li data-tr="${k}">${esc(v)}</li>`;
  let form;
  const k = await bwModal({
    cls: 'sh-modal',
    title: t('shTitle'),
    html: `<p class="hint">${esc(t('shHint'))}</p><label>${esc(t('shTo'))}<input data-sh="to" type="text" maxlength="80" autocomplete="off"></label><label>${esc(t('shNote'))}<textarea data-sh="note" rows="3" maxlength="500"></textarea></label>
<div class="sh-travels"><b>${esc(t('shTravels'))}</b><ul>${li('edits', t('shTEdits', { n: tr.edits }))}${li('history', t('shTHistory', { n: tr.history }))}${li('lock', tr.lock ? t('shTLocked', { name: tr.lock.by || t('pfNoName') }) : t('shTUnlocked'))}${li('signs', t('shTSigns', { n: tr.signs }))}</ul></div>
<p class="hint sh-file">${esc(t('shFileName', { name: '' }))}<bdi dir="ltr">${esc(file)}</bdi></p>`,
    buttons: [['cancel', t('pvCancel')], ['ok', t('shShare'), true]],
    mount: (m) => { form = m; },
  });
  if (k !== 'ok') return;
  const to = form.querySelector('[data-sh="to"]').value.trim().slice(0, 80), note = form.querySelector('[data-sh="note"]').value.trim().slice(0, 500);
  await EXT.ledger?.append('share', { to, ...(note ? { note } : {}) }, svc); // the recipient and the note travel in the log
  const cap = await lkCaptureHtml();
  if (!cap) return;
  if (!location.protocol.startsWith('http')) { download(cap.name, cap.text, 'text/html'); flash(t('shDownloaded', { name: cap.name })); return; }
  let j;
  try {
    const r = await fetch('/api/share', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: cap.name, html: cap.text }) });
    j = await r.json();
    if (!r.ok) throw new Error(j.error || r.status);
  } catch (err) { toast(t('shFailed', { why: String(err.message || err) }), 'err'); return; }
  S.lastShare = j.path;
  document.documentElement.dataset.bwShared = j.path;
  await bwModal({
    cls: 'sh-modal sh-done',
    title: t('shDoneTitle'),
    html: `<p>${esc(to ? t('shDoneTo', { to }) : t('shDoneLead'))}</p><p><code class="sh-path" dir="ltr">${esc(j.path)}</code></p><div class="btns sh-acts"><button type="button" class="b primary" data-sh="open"><span class="w">${esc(t('shOpen'))}</span></button><button type="button" class="b" data-sh="copy"><span class="w">${esc(t('shCopy'))}</span></button></div><p class="hint sh-out" role="status"></p>`,
    buttons: [['close', t('close')]],
    mount: (m) => m.addEventListener('click', async (e) => {
      const a = e.target.closest('[data-sh]')?.dataset.sh;
      const out = m.querySelector('.sh-out');
      if (a === 'open') {
        const r = await fetch('/api/share/open', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path: j.path }) }).catch(() => null);
        out.textContent = r?.ok ? t('shOpened') : t('shOpenFailed');
      } else if (a === 'copy') {
        const ok = await navigator.clipboard?.writeText(j.path).then(() => true, () => false);
        if (!ok) getSelection()?.selectAllChildren(m.querySelector('.sh-path')); // no clipboard: the path is selected for Ctrl+C
        out.textContent = t(ok ? 'shCopied' : 'shCopyHand');
      }
    }),
  });
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
