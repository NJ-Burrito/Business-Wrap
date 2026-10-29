/* A12 Profile and work metrics (design.md §3 A12). The profile lives on this machine only (localStorage bw:profile,
 * picture re-encoded to 256 px WebP); a per-install actor id; metrics are read from the provenance log (31-provenance.js),
 * never kept in a second store. The manager report is served (POST /api/report → engine/report.mjs). */
const PF_KEY = 'bw:profile';
/** Privacy (design.md §5 #2): the picture never leaves the machine; flip only on the owner's decision (design.md §5). */
const PF_PICTURE_IN_SHARED_HTML = false;
const PF = {
  get() { try { return JSON.parse(ls.get(PF_KEY) || 'null'); } catch { return null; } },
  set(p) { ls.set(PF_KEY, JSON.stringify({ ...(PF.get() || {}), ...p })); },
  id() { let id = ls.get('bw:actor'); if (!id) { id = crypto.randomUUID(); ls.set('bw:actor', id); } return id; },
  actor() { return { id: PF.id(), name: PF.get()?.name || '' }; },
  recording() { return PF.get()?.activity !== false; },
};

/** A small modal in the toolbar's shadow root. Resolves with the pressed button's key (Escape → 'cancel'). */
function bwModal({ title, html, buttons, mount, cls = '', modal = true }) {
  return new Promise((res) => {
    const m = document.createElement('div');
    m.className = `bw-modal ${cls}`;
    m.innerHTML = `<div class="bw-modal-card" role="dialog" aria-modal="${modal}" aria-labelledby="bw-modal-h"><h2 id="bw-modal-h">${esc(title)}</h2>${html}<div class="btns">${buttons.map(([k, l, primary]) => `<button type="button" class="b${primary ? ' primary' : ''}" data-mk="${esc(k)}"><span class="w">${esc(l)}</span></button>`).join('')}</div></div>`;
    // a toolbar rebuild (root.innerHTML) drops it: put it back until it is answered
    const keep = new MutationObserver(() => { if (!m.isConnected) root.appendChild(m); });
    const done = (k) => { keep.disconnect(); m.remove(); res(k); };
    m.addEventListener('click', (e) => { const k = e.target.closest('[data-mk]')?.dataset.mk; if (k) done(k); });
    m.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); done('cancel'); } });
    root.appendChild(m);
    keep.observe(root, { childList: true });
    mount?.(m);
    if (modal) (m.querySelector('input, [data-mk]'))?.focus(); // the first-launch card does not take the focus from the document
  });
}

async function pfPicture(file) {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, 256 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(bmp.width * k)); c.height = Math.max(1, Math.round(bmp.height * k));
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL('image/webp', 0.85);
}
const pfForm = (p = PF.get() || {}) => `<p class="hint">${esc(t('pfNotice'))}</p>
<label>${esc(t('pfName'))}<input data-pf="name" type="text" maxlength="80" value="${esc(p.name || '')}" autocomplete="name"></label>
<div class="pf-pic"><span class="pf-av">${p.picture ? `<img alt="" src="${esc(p.picture)}">` : ''}</span><button type="button" class="b" data-pf="pick"><span class="w">${esc(t('pfPicture'))}</span></button>${p.picture ? `<button type="button" class="b" data-pf="nopic"><span class="w">${esc(t('pfNoPicture'))}</span></button>` : ''}</div>
<label class="chk"><input type="checkbox" data-pf="activity" ${p.activity !== false ? 'checked' : ''}> ${esc(t('pfActivity'))}</label>`;
function pfWire(el, live = false) {
  el.addEventListener('click', async (e) => {
    const k = e.target.closest('[data-pf]')?.dataset.pf;
    if (k === 'pick') {
      const f = await pickFile('image/png,image/jpeg,image/webp,image/gif');
      if (!f) return;
      try { el.dataset.pic = await pfPicture(f); } catch { flash(t('badFile'), true); return; }
      el.querySelector('.pf-av').innerHTML = `<img alt="" src="${esc(el.dataset.pic)}">`;
      if (live) { PF.set({ picture: el.dataset.pic }); flash(t('pfSaved')); }
    } else if (k === 'nopic') { el.dataset.pic = ''; el.querySelector('.pf-av').innerHTML = ''; if (live) PF.set({ picture: '' }); }
  });
  if (live) el.addEventListener('change', (e) => {
    if (e.target.dataset.pf === 'name') {
      const was = PF.get()?.name || '';
      PF.set({ name: e.target.value.trim().slice(0, 80) });
      flash(t('pfSaved'));
      if (was && was !== PF.get().name) EXT.ledger?.renamed(); // review2 #12: same profile key, a new name: the rename is logged
    }
    if (e.target.dataset.pf === 'activity') PF.set({ activity: e.target.checked });
  });
}
async function pfFirstLaunch() {
  if (PF.get()) return;
  // ponytail: under browser automation the card waits for an explicit opt-in (bw:profile-prompt = 1), so the suites that
  // drive the toolbar and drag on the page are not covered by it; a person (navigator.webdriver false) always sees it
  if (navigator.webdriver && ls.get('bw:profile-prompt') !== '1') return;
  let form;
  // a card in the corner, not a blocking modal: the page stays usable while it waits
  const k = await bwModal({ cls: 'pf-first', modal: false, title: t('pfWelcome'), html: `<div class="pf-form">${pfForm({})}</div>`, buttons: [['skip', t('pfSkip')], ['ok', t('pfSave'), true]], mount: (m) => { form = m.querySelector('.pf-form'); pfWire(form); } });
  if (k === 'later' || k === 'cancel') return;
  if (k === 'ok') PF.set({ name: form.querySelector('[data-pf="name"]').value.trim().slice(0, 80), picture: form.dataset.pic || '', activity: form.querySelector('[data-pf="activity"]').checked, at: new Date().toISOString() });
  else PF.set({ skipped: true, activity: form.querySelector('[data-pf="activity"]').checked, at: new Date().toISOString() });
  PF.id();
}

/* active time: one ping per 30-s bucket with input or pointer activity while the tab is visible (off switch: profile) */
const PF_PINGS = new Set();
for (const ev of ['pointerdown', 'keydown', 'input', 'wheel']) document.addEventListener(ev, () => {
  if (document.visibilityState !== 'visible' || !PF.recording()) return;
  PF_PINGS.add(new Date(Math.floor(Date.now() / 30e3) * 30e3).toISOString());
}, { capture: true, passive: true });
/** Hands the pings collected so far to the log (31-provenance.js), once. */
function pfTakePings() { const p = [...PF_PINGS].sort(); PF_PINGS.clear(); return p; }

/* the performance report (served only: it reads the HISTORY logs) */
const pfReportHtml = () => {
  const d = new Date(), iso = (x) => x.toISOString().slice(0, 10);
  const from = new Date(d.getTime() - 30 * 864e5);
  return `<p class="hint">${esc(t('pfReportHint'))}</p>
<div class="pf-period"><label>${esc(t('pfFrom'))}<input type="date" data-rp="from" value="${iso(from)}"></label><label>${esc(t('pfTo'))}<input type="date" data-rp="to" value="${iso(d)}"></label></div>
<fieldset class="pf-people"><legend>${esc(t('pfPeople'))}</legend><p class="hint" data-rp="people">${esc(location.protocol.startsWith('http') ? '…' : t('serverOnly'))}</p></fieldset>
<div class="btns"><button type="button" class="b primary" data-rp="go"${location.protocol.startsWith('http') ? '' : ' disabled'}><span class="w">${esc(t('pfReportGo'))}</span></button></div><p class="out" role="status" data-rp="out"></p>`;
};
async function pfReportMount(el) {
  if (!el || !location.protocol.startsWith('http')) return;
  try {
    const j = await (await fetch('/api/report')).json();
    el.querySelector('[data-rp="people"]').outerHTML = j.people.length ? `<div data-rp="people">${j.people.map((p) => `<label class="chk"><input type="checkbox" data-person="${esc(p.id)}" checked> ${esc(p.name || t('pfNoName'))}</label>`).join('')}</div>` : `<p class="hint" data-rp="people">${esc(t('pfNobody'))}</p>`;
  } catch { /* the list stays empty: the report still covers everyone */ }
  el.addEventListener('click', async (e) => {
    if (!e.target.closest('[data-rp="go"]')) return;
    const out = el.querySelector('[data-rp="out"]');
    out.textContent = '…';
    const people = [...el.querySelectorAll('[data-person]:checked')].map((x) => x.dataset.person);
    try {
      const r = await fetch('/api/report', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ from: el.querySelector('[data-rp="from"]').value, to: el.querySelector('[data-rp="to"]').value, people, lang: S.ui }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || r.status);
      out.textContent = t('pfReportDone', { x: j.pdf });
      EXT.ledger?.append('export', { fmt: 'report', file: String(j.pdf).split(/[\\/]/).pop() }); // review2 #11: a report is an export too
    } catch (err) { out.textContent = String(err.message || err); }
  });
}

bwExt({
  settings: [
    { id: 'profile', title: 'pfTitle', icon: 'prefs', html: () => `<div class="pf-form">${pfForm()}</div>`, mount: (el) => el && pfWire(el.querySelector('.pf-form'), true) },
    { id: 'report', title: 'pfReport', icon: 'prefs', html: pfReportHtml, mount: pfReportMount },
    { id: 'trust', title: 'pfTrustTitle', icon: 'info', html: () => `<p class="pf-limit">${esc(t('pfTrustLimit'))}</p><div class="btns"><button type="button" class="b" data-pf="prov"><span class="w">${esc(t('pvOpen'))}</span></button></div>`, mount: (el) => el?.querySelector('[data-pf="prov"]').addEventListener('click', () => openDrawer('provenance')) },
  ],
  expose: { profile: { get: PF.get, actor: PF.actor, recording: PF.recording, takePings: pfTakePings, pictureInSharedHtml: PF_PICTURE_IN_SHARED_HTML } },
  on: { boot: () => { pfFirstLaunch(); } },
});
