/* ── updates ─────────────────────────────────────────────────────────────
   Its own module, mounted at one point (engine/build-editor.mjs appends it after editor.js, inside the
   same IIFE, so it reads DATA, S and ls). The same principle as QA Wrap's update card: one notice, never a
   modal, dismissible per version, off with one switch; nothing is downloaded from the page itself.
   - What's new: once, the first time this editor opens at a new version (DATA.whatsNew, cut from CHANGELOG).
   - Update available: only when served by engine/serve.mjs (GET /api/update, which checks with the user's
     gh auth or token, at most once a day). From disk (file://) the page cannot check and stays quiet.
   - Update: POST /api/update/apply {confirm:true} after a press; the server keeps the user's files.
   Never in an output: it lives in a Shadow DOM host that print hides and Save-HTML never serialises. */
(function mountUpdates() {
  const V = DATA.version || '';
  const NEW = DATA.whatsNew || { human: [], migration: [] };
  const L = {
    ar: { whatsNew: `الجديد في ${V}`, available: (v) => `يتوفر الإصدار ${v}`, update: 'حدث الآن', later: 'لاحقا', close: 'إغلاق', off: 'إيقاف فحص التحديثات', updating: 'جار التحديث…', done: 'تم التحديث. أعد تشغيل الخادم ثم حدث الصفحة.', failed: 'تعذر التحديث، ولم يتغير شيء.', kinds: { added: 'أضيف', changed: 'تغير', fixed: 'أصلح', other: 'أخرى' } },
    en: { whatsNew: `What's new in ${V}`, available: (v) => `Version ${v} is available`, update: 'Update now', later: 'Later', close: 'Close', off: 'Turn off update checks', updating: 'Updating…', done: 'Updated. Restart the server, then reload the page.', failed: 'Could not update; nothing was changed.', kinds: { added: 'Added', changed: 'Changed', fixed: 'Fixed', other: 'Other' } },
  };
  const lang = () => (S.ui === 'en' ? 'en' : 'ar');
  const tx = () => L[lang()];
  const host = document.createElement('div');
  host.id = 'bw-update';
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `<style>
:host{position:fixed;inset-block-end:20px;inset-inline-start:20px;z-index:99990;font:14px/1.5 'Thmanyah Sans',system-ui,sans-serif}
@media print{:host{display:none!important}}
.card{max-width:min(380px,calc(100vw - 40px));background:#fafaf9;color:#1b1813;border:1px solid #d5cfc3;border-inline-start:4px solid #9c7e36;
  border-radius:14px;box-shadow:0 12px 32px rgba(0,30,61,.18);padding:14px 16px;transform:translateY(12px) scale(.98);opacity:0;
  transition:transform 320ms cubic-bezier(.2,.8,.2,1),opacity 220ms ease}
.card.in{transform:none;opacity:1}
:host([data-dark="1"]) .card{background:#001e3d;color:#fafaf9;border-color:#003c7a;border-inline-start-color:#be9a41}
h2{margin:0 0 6px;font-size:15px;color:#003c7a}:host([data-dark="1"]) h2{color:#be9a41}
ul{margin:4px 0 8px;padding-inline-start:18px}li{margin:2px 0}.k{font-size:12px;font-weight:700;color:#5f4d21;margin-top:6px}
:host([data-dark="1"]) .k{color:#d3c6a6}
.row{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}
button{font:inherit;border-radius:9px;border:1px solid #d5cfc3;background:transparent;color:inherit;padding:5px 12px;cursor:pointer}
button.primary{background:#003c7a;border-color:#003c7a;color:#fff}button:focus-visible{outline:3px solid #005fc2;outline-offset:2px}
.off{border:0;padding:5px 2px;text-decoration:underline;font-size:12px;opacity:.8}
@media (prefers-reduced-motion:reduce){.card{transition:none}}
</style><div class="card" role="status" aria-live="polite" hidden></div>`;
  document.body.appendChild(host);
  const card = root.querySelector('.card');
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const sections = (human) => human.map((s) => `<div class="k">${esc(tx().kinds[s.kind] || s.kind)}</div><ul>${s.items.slice(0, 6).map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`).join('');
  function show(html) {
    host.dataset.dark = document.documentElement.dataset.bwDark === '1' ? '1' : '0';
    host.dir = lang() === 'ar' ? 'rtl' : 'ltr';
    card.innerHTML = html;
    card.hidden = false;
    requestAnimationFrame(() => card.classList.add('in'));
  }
  function hide() { card.classList.remove('in'); setTimeout(() => { card.hidden = true; }, 240); }
  root.addEventListener('click', async (e) => {
    const a = e.target.closest('button')?.dataset.u;
    if (!a) return;
    if (a === 'close' || a === 'later') { if (a === 'later' && card.dataset.v) ls.set('bw:update-dismissed', card.dataset.v); hide(); }
    if (a === 'off') { ls.set('bw:update-off', '1'); hide(); }
    if (a === 'apply') {
      card.querySelector('.row').innerHTML = `<span>${esc(tx().updating)}</span>`;
      try {
        const r = await (await fetch('/api/update/apply', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ confirm: true }) })).json();
        card.querySelector('.row').innerHTML = `<span>${esc(r.ok ? tx().done : tx().failed)}</span><button data-u="close">${esc(tx().close)}</button>`;
      } catch { card.querySelector('.row').innerHTML = `<span>${esc(tx().failed)}</span><button data-u="close">${esc(tx().close)}</button>`; }
    }
  });
  // 1. what's new: the first time this build opens at a new version
  const seen = ls.get('bw:seen-version');
  if (V && seen && seen !== V && NEW.human.length) show(`<h2>${esc(tx().whatsNew)}</h2>${sections(NEW.human)}<div class="row"><button class="primary" data-u="close">${esc(tx().close)}</button></div>`);
  if (V) ls.set('bw:seen-version', V);
  // 2. update available: only when served, not switched off, not dismissed for that version
  if (/^https?:$/.test(location.protocol) && ls.get('bw:update-off') !== '1') {
    fetch('/api/update').then((r) => (r.ok ? r.json() : null)).then((u) => {
      if (!u || u.status !== 'available' || ls.get('bw:update-dismissed') === u.latest) return;
      card.dataset.v = u.latest;
      show(`<h2>${esc(tx().available(u.latest))}</h2>${sections([{ kind: 'added', items: u.highlights || [] }])}<div class="row"><button class="primary" data-u="apply">${esc(tx().update)}</button><button data-u="later">${esc(tx().later)}</button><button class="off" data-u="off">${esc(tx().off)}</button></div>`);
    }).catch(() => { /* cannot check: quiet */ });
  }
  window.BW_UPDATE = { show, hide, version: V };
})();
