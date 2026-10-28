/* ── updates (0.11.0) ─────────────────────────────────────────────────────
   Its own module, mounted at one point (engine/build-editor.mjs appends it after editor.js, inside the same IIFE,
   so it reads DATA, S, M and ls). Mirrors QA Wrap's update card (extension/ui/update-card.js): remote notes reach
   the page through textContent only, never forced, a version can be skipped, off with one switch.
   - Auto-check on launch: only when served by engine/serve.mjs (GET /api/update/check, which asks the public
     GitHub release list, no token needed: the page never holds a token and never calls GitHub). Non-blocking, at most once
     per 24 h (bw:update-last) unless «تحقّق الآن» is pressed; silent on any failure, the reason kept for Settings.
   - A newer release → a calm popup: version, release notes (Added / Changed / Fixed, AR+EN headings),
     «حدّث الآن» / «لاحقاً» / «تخطَّ هذا الإصدار» (bw:update-skip).
   - «حدّث الآن»: POST /api/update/apply {confirm:true}; the server runs update/apply.mjs (backup first, program
     files only, verify, rollback on any failure) while the popup shows the steps (GET /api/update/progress);
     the server restarts on the new code, and the editor reloads itself with the draft saved and the document
     reopened where the user was (bw:resume → resumeAfterUpdate, no question asked).
   - From disk (file://) nothing is fetched at all; Settings explains how to update.
   Never in an output: Shadow DOM host, print-hidden, never serialised by Save-HTML. */

// declarations (hoisted): boot() → offerRecovery() calls resumeAfterUpdate before this file's statements run
function updServed() { return /^https?:$/.test(location.protocol); }
function updAuto() { return ls.get('bw:update-auto') !== '0' && ls.get('bw:update-off') !== '1'; }
function updState() { try { return JSON.parse(ls.get('bw:update-result') || 'null'); } catch { return null; } }
/** Reopened by the updater: load the draft without asking, back to the service, edition, page and scroll. */
function resumeAfterUpdate(d) {
  let r = null;
  try { r = JSON.parse(ls.get('bw:resume') || 'null'); } catch { /* none */ }
  if (!r || r.set !== DATA.setId || !(Date.now() - r.at < 15 * 60 * 1000)) return false;
  ls.del('bw:resume');
  if (d) loadDraft(d);
  if (r.svc && M[r.svc]) { S.svc = r.svc; if (M[r.svc][r.ed]) S.ed = r.ed; }
  if (Number.isInteger(r.page)) S.pageAt = r.page;
  buildUi();
  render(false);
  requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo(0, r.y || 0)));
  resumeAfterUpdate.done = r;
  return true;
}

(function mountUpdates() {
  const V = DATA.version || '';
  const NEW = DATA.whatsNew || { human: [], migration: [] };
  const DAY = 24 * 60 * 60 * 1000;
  const KIND = { added: 'أُضيف · Added', changed: 'تغيّر · Changed', fixed: 'أُصلح · Fixed', other: 'أخرى · Other' };
  const STEPS = ['download', 'backup', 'replace', 'verify', 'done'];
  const lang = () => (S.ui === 'en' ? 'en' : 'ar');
  const tdir = () => uiDir();
  const host = document.createElement('div');
  host.id = 'bw-update';
  const ur = host.attachShadow({ mode: 'open' });
  ur.innerHTML = `<style>
/* brand v3 roles; the notice renders outside the editor's shadow root, so each role carries its value as the fallback (light here, dark below) */
:host{all:initial;font:500 14px/1.5 'Thmanyah Sans',system-ui,sans-serif;color:var(--bw-ink,#1b1813);
  --navy:var(--bw-primary,#003c7a);--navy-hover:var(--bw-primary-hover,#002d5c);--on-navy:var(--bw-on-primary,#ffffff);--deep:var(--bw-band,#001e3d);--gold:var(--bw-accent,#be9a41);--gold-deep:var(--bw-accent-strong,#5f4d21);
  --paper:var(--bw-surface,#ffffff);--line:var(--bw-rule-strong,#d5cfc3);--soft:var(--bw-ink-muted,#544c3b);--wash:var(--bw-primary-soft,#e1eaf4);--focus:var(--bw-focus,#005fc2);
  --ok:var(--bw-success,#16644e);--bad:var(--bw-signal,#a81a1f);--e-out:var(--bw-ease-out,cubic-bezier(.22,1,.36,1));--e-move:var(--bw-ease-in-out,cubic-bezier(.65,0,.35,1));--e-spring:var(--bw-ease-spring,cubic-bezier(.34,1.36,.64,1))}
:host([data-dark="1"]){--navy:var(--bw-primary,#bfd6ee);--navy-hover:var(--bw-primary-hover,#e1eaf4);--on-navy:var(--bw-on-primary,#001e3d);--gold-deep:var(--bw-accent-strong,#c6af76);--paper:var(--bw-surface,#002d5c);
  --line:var(--bw-rule-strong,#004e9e);--soft:var(--bw-ink-muted,#d5cfc3);--wash:var(--bw-primary-soft,#003c7a);--focus:var(--bw-focus,#be9a41);--ok:var(--bw-success,#7cd5bb);--bad:var(--bw-signal,#dc898c);color:var(--bw-ink,#fafaf9)}
@media print{:host{display:none!important}}
[hidden]{display:none!important}
.row:not(:has(button:not([hidden]))){display:none}
.card{position:fixed;inset-block-end:20px;inset-inline-start:20px;z-index:99990;max-width:min(380px,calc(100vw - 40px));background:var(--paper);
  border:1px solid var(--line);border-inline-start:6px solid var(--deep);border-radius:14px;box-shadow:var(--bw-shadow-3,0 6px 12px rgba(27,24,19,.06),0 28px 56px -12px rgba(0,30,61,.24));padding:16px 18px;
  transform:translateY(12px);opacity:0;transition:transform 240ms var(--e-out),opacity 240ms var(--e-out)}
.card.in{transform:none;opacity:1;transition-duration:360ms}
.scrim{position:fixed;inset:0;z-index:99991;display:grid;place-items:center;padding:16px;background:color-mix(in srgb,var(--bw-band,#001e3d) 42%,transparent);backdrop-filter:blur(3px);opacity:0;transition:opacity 240ms var(--e-out)}
.scrim.in{opacity:1}
.dlg{inline-size:min(560px,100%);max-block-size:min(86vh,720px);display:flex;flex-direction:column;background:var(--paper);border-radius:20px;
  box-shadow:0 0 0 1px var(--line),var(--bw-shadow-3,0 6px 12px rgba(27,24,19,.06),0 28px 56px -12px rgba(0,30,61,.24));overflow:hidden;transform:scale(.96);transition:transform 240ms var(--e-out)}
.scrim.in .dlg{transform:none}
.dlg:focus{outline:none}
.top{display:flex;gap:14px;align-items:center;padding:18px 20px 12px;border-block-end:1px solid var(--line)}
.mark{inline-size:44px;block-size:44px;flex:none;border-radius:8px;background:var(--bw-on-glass,#fafaf9);padding:6px;box-sizing:border-box;box-shadow:0 0 0 1px var(--line)}
.mark svg{inline-size:100%;block-size:100%}
h2{margin:0;font:700 20px/1.25 'Thmanyah Sans',system-ui,sans-serif;color:var(--navy)}
.sub{margin:2px 0 0;color:var(--soft);font-size:13px}
.body{padding:12px 20px;overflow:auto}
h3{margin:4px 0 6px;font-size:13px;color:var(--soft)}
h4{margin:12px 0 4px;font-size:12.5px;font-weight:800;color:var(--gold-deep)}
ul{margin:0;padding-inline-start:20px}li{margin:3px 0}
.safe{margin:12px 0 0;padding:8px 10px;border-radius:10px;background:var(--wash);font-size:12.5px}
.row{display:flex;gap:8px;flex-wrap:wrap;padding:12px 20px 18px;border-block-start:1px solid var(--line)}
button{font:inherit;min-block-size:44px;border-radius:12px;border:1px solid var(--line);background:transparent;color:inherit;padding:9px 16px;cursor:pointer;
  transition:background .2s var(--e-out),transform .2s var(--e-out)}
button:hover{background:var(--wash)}button:active{transform:scale(.97)}
button.primary{background:var(--navy);border-color:var(--navy);color:var(--on-navy);font-weight:700}button.primary:hover{background:var(--navy-hover)}
button.ghost{border-color:transparent;text-decoration:underline;text-underline-offset:3px}
button:focus-visible{outline:3px solid var(--focus);outline-offset:2px}
.cmd{margin:10px 0 0;font-size:12.5px;color:var(--soft)}.cmd code{font:12px/1.4 ui-monospace,Consolas,monospace;direction:ltr;unicode-bidi:isolate;padding:1px 6px;border-radius:6px;background:var(--wash);color:inherit}
.steps{list-style:none;margin:4px 0;padding:0;display:grid;gap:8px}
.steps li{display:flex;gap:10px;align-items:center;padding:8px 10px;border-radius:12px;background:var(--wash);opacity:.62;transition:opacity .3s var(--e-out),background .3s var(--e-out)}
.steps li .dot{inline-size:18px;block-size:18px;flex:none;border-radius:50%;border:2px solid var(--soft);box-sizing:border-box;display:grid;place-items:center;font-size:11px;font-weight:800}
.steps li[data-s="active"]{opacity:1;background:transparent;box-shadow:0 0 0 2px var(--navy) inset}
.steps li[data-s="active"] .dot{border-color:var(--navy);border-block-start-color:transparent;animation:spin 900ms linear infinite}
.steps li[data-s="done"]{opacity:1}.steps li[data-s="done"] .dot{background:var(--ok);border-color:var(--ok);color:var(--paper);animation:pop 360ms var(--e-spring)}
.steps li[data-s="failed"]{opacity:1;box-shadow:0 0 0 1px var(--bad) inset}.steps li[data-s="failed"] .dot{background:var(--bad);border-color:var(--bad);color:var(--paper)}
.msg{margin:10px 0 0;min-block-size:1.4em;font-weight:600}.msg[data-k="err"]{color:var(--bad)}
.detail{margin:4px 0 0;font:12px/1.4 ui-monospace,Consolas,monospace;color:var(--soft);overflow-wrap:anywhere}
@keyframes spin{to{transform:rotate(1turn)}}@keyframes pop{0%{transform:scale(.6)}100%{transform:scale(1)}}
:host([data-calm="1"]) *{transition:none!important;animation:none!important}
@media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}
</style><div class="card" role="status" aria-live="polite" hidden></div><div class="scrim" hidden><div class="dlg" role="dialog" aria-modal="true" aria-labelledby="upd-h" aria-label="Business-Wrap" tabindex="-1"></div></div>`;
  document.body.appendChild(host);
  const card = ur.querySelector('.card');
  const scrim = ur.querySelector('.scrim');
  const dlg = ur.querySelector('.dlg');
  const el = (tag, text, attrs = {}) => {
    const e = document.createElement(tag);
    if (text != null) e.textContent = text; // remote text: textContent only, never innerHTML
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    return e;
  };
  // CHANGELOG lines read "English / العربية": keep the user's side
  const side = (s) => { const p = String(s).split(' / '); return (lang() === 'ar' ? p[p.length - 1] : p[0]).trim(); };
  const notesNodes = (human, max = 8) => human.flatMap((s) => [el('h4', KIND[s.kind] || s.kind), (() => { const ul = el('ul'); for (const i of s.items.slice(0, max)) ul.appendChild(el('li', side(i))); return ul; })()]);
  const paint = () => {
    host.dataset.dark = document.documentElement.dataset.bwDark === '1' ? '1' : '0';
    host.dataset.calm = document.documentElement.dataset.bwCalm === '1' ? '1' : '0';
  };

  /* the small card: what's new after an update */
  function show(title, human) {
    paint();
    card.dir = tdir();
    card.lang = lang();
    card.replaceChildren(el('h2', title), ...notesNodes(human, 6), (() => { const r = el('div', null, { class: 'row' }); r.style.padding = '8px 0 0'; r.style.border = '0'; const b = el('button', t('upd.close'), { type: 'button', class: 'primary' }); b.onclick = hide; r.appendChild(b); return r; })());
    card.hidden = false;
    requestAnimationFrame(() => card.classList.add('in'));
  }
  function hide() { card.classList.remove('in'); setTimeout(() => { card.hidden = true; }, 240); }

  /* the modal */
  let lastFocus = null;
  let busy = false;
  function openModal(nodes, rowButtons) {
    paint();
    lastFocus = document.activeElement;
    dlg.dir = 'rtl'; // the layout never flips (0.10.0): the words follow the language below
    const top = el('div', null, { class: 'top' });
    const mark = el('span', null, { class: 'mark', 'aria-hidden': 'true' });
    mark.innerHTML = DATA.brand?.mark || ''; // the tool's own logo, sanitised at build time (engine/render.mjs safeSvg)
    mark.firstElementChild?.classList.add('bw-still'); // a calm notice: the mark stands still here
    const words = el('div', null, { dir: tdir(), lang: lang() });
    words.style.flex = '1';
    top.append(mark, words);
    words.append(...nodes.head);
    const body = el('div', null, { class: 'body', dir: tdir(), lang: lang() });
    body.append(...nodes.body);
    const row = el('div', null, { class: 'row', lang: lang() });
    row.append(...rowButtons);
    dlg.replaceChildren(top, body, row);
    scrim.hidden = false;
    requestAnimationFrame(() => scrim.classList.add('in'));
    (row.querySelector('.primary') || dlg).focus();
  }
  function closeModal() {
    if (busy) return;
    scrim.classList.remove('in');
    setTimeout(() => { scrim.hidden = true; }, 220);
    try { lastFocus?.focus?.(); } catch { /* gone */ }
  }
  const button = (text, cls, fn) => { const b = el('button', text, { type: 'button', ...(cls ? { class: cls } : {}) }); b.onclick = fn; return b; };
  dlg.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); if (!busy) closeModal(); return; }
    if (e.key !== 'Tab') return;
    const f = [...dlg.querySelectorAll('button:not([disabled])')];
    if (!f.length) { e.preventDefault(); return; }
    const i = f.indexOf(ur.activeElement);
    if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); } else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
  });

  /** The popup for a newer release (u: the /api/update/check answer). */
  function popup(u) {
    if (!u || u.status !== 'available') return;
    const human = u.notes?.human?.length ? u.notes.human : [{ kind: 'added', items: u.highlights || [] }];
    openModal({
      head: [el('h2', t('upd.title', { v: u.latest }), { id: 'upd-h' }), el('p', t('upd.installed', { v: u.current }) + (u.publishedAt ? ` · ${String(u.publishedAt).slice(0, 10)}` : ''), { class: 'sub' })],
      body: [el('h3', t('upd.whatsNew')), ...notesNodes(human), el('p', t('set.dataSafe'), { class: 'safe' }), (() => { const c = el('p', `${t('upd.plugin')} `, { class: 'cmd' }); c.append(el('code', '/plugin marketplace update business-wrap'), ` · ${t('upd.cli')} `, el('code', 'npx business-wrap update --apply')); return c; })()],
    }, [
      button(t('upd.now'), 'primary', () => apply(u)),
      button(t('upd.later'), '', closeModal),
      button(t('upd.skip'), 'ghost', () => { ls.set('bw:update-skip', u.latest); closeModal(); }),
    ]);
    host.dataset.open = 'popup';
  }

  /** «حدّث الآن»: the server applies; the modal shows the steps; then the editor reopens on the new version. */
  async function apply(u) {
    busy = true;
    host.dataset.open = 'progress';
    const list = el('ol', null, { class: 'steps' });
    const items = STEPS.map((s) => { const li = el('li', null, { 'data-step': s, 'data-s': 'wait' }); li.append(el('span', '', { class: 'dot', 'aria-hidden': 'true' }), el('span', t(`upd.s.${s}`))); list.appendChild(li); return li; });
    const msg = el('p', '', { class: 'msg', role: 'status', 'aria-live': 'polite' });
    const detail = el('p', '', { class: 'detail' });
    const close = button(t('upd.close'), 'primary', () => { busy = false; closeModal(); });
    close.hidden = true;
    openModal({ head: [el('h2', t('upd.progress', { v: u.latest }), { id: 'upd-h' }), el('p', t('upd.installed', { v: u.current }), { class: 'sub' })], body: [list, msg, detail] }, [close]);
    dlg.focus();
    const mark = (stage, failed = false) => {
      const at = STEPS.indexOf(stage);
      items.forEach((li, i) => {
        const s = i < at || (stage === 'done' && i === at) ? 'done' : i === at ? (failed ? 'failed' : 'active') : 'wait';
        li.dataset.s = s;
        li.querySelector('.dot').textContent = s === 'done' ? '✓' : s === 'failed' ? '✕' : '';
      });
    };
    const fail = (text, why) => { busy = false; msg.textContent = text; msg.dataset.k = 'err'; detail.textContent = why || ''; close.hidden = false; close.focus(); };
    mark('download');
    let start;
    try { start = await (await fetch('/api/update/apply', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ confirm: true }) })).json(); } catch { start = null; }
    if (!start?.started) { mark('download', true); fail(t('upd.failedNone'), start?.error || (start?.reason ? t(`set.why.${start.reason}`) : t('set.why.server'))); return; }
    const to = start.to;
    // follow the server's stages (the updater is the one doing the work; this only reads where it is)
    for (;;) {
      await new Promise((r) => setTimeout(r, 400));
      let j = null;
      try { j = await (await fetch('/api/update/progress', { cache: 'no-store' })).json(); } catch { /* the server may be restarting already */ }
      if (j?.stage) mark(j.stage, j.finished && !j.ok);
      if (j?.finished && !j.ok) { fail(j.rolledBack ? t('upd.failed') : t('upd.failedNone'), j.error); return; }
      if (j?.finished && j.ok) { mark('done'); break; }
    }
    msg.textContent = t('upd.reopen');
    // the save that matters: the draft, the place in the document; then wait for the server on the new version
    try { flushDraft(); writeDraft(); } catch { /* storage full: the embedded document stays */ }
    ls.set('bw:resume', JSON.stringify({ set: DATA.setId, svc: S.svc, ed: S.ed, y: Math.round(window.scrollY), page: Number.isInteger(S.pageAt) ? S.pageAt : null, at: Date.now(), from: V, to }));
    ls.del('bw:update-last'); // the next launch checks again, on the new version
    const t0 = Date.now();
    for (;;) {
      await new Promise((r) => setTimeout(r, 700));
      let v = null;
      try { v = await (await fetch('/api/version', { cache: 'no-store' })).json(); } catch { /* restarting */ }
      if (v?.version === to) break;
      if (Date.now() - t0 > 30000) msg.textContent = t('upd.reloadSlow');
      if (Date.now() - t0 > 180000) { busy = false; close.hidden = false; return; }
    }
    busy = false;
    host.dataset.open = 'reloading';
    location.reload();
  }

  /** Ask the local server. force: «تحقّق الآن» (skips the 24 h throttle and the server's daily cache). Never throws. */
  async function check(force = false) {
    if (!updServed()) return null; // file://: the page never makes a network call for updates
    let u;
    try {
      const r = await fetch(`/api/update/check${force ? '?force=1' : ''}`, { cache: 'no-store' });
      u = r.ok ? await r.json() : { status: 'unknown', reason: 'server' };
    } catch { u = { status: 'unknown', reason: 'server' }; }
    const keep = { status: u.status, current: u.current || V, latest: u.latest, reason: u.reason, publishedAt: u.publishedAt, notes: u.notes, highlights: u.highlights, checkedAt: Date.now() };
    ls.set('bw:update-result', JSON.stringify(keep));
    ls.set('bw:update-last', String(Date.now()));
    if (S.drawer === 'settings') setRefreshUpdate();
    return keep;
  }

  // 1. after an update: one card, «updated to …» and what is new; otherwise what's new the first time this build opens
  const seen = ls.get('bw:seen-version');
  if (resumeAfterUpdate.done) show(t('upd.updated', { v: V }), NEW.human);
  else if (V && seen && seen !== V && NEW.human.length) show(`${t('upd.whatsNew')} · ${V}`, NEW.human);
  if (V) ls.set('bw:seen-version', V);
  // 2. auto-check on launch: served only, switched on, at most once per 24 h (or when this build changed); never blocks the editor
  const st = updState();
  const last = Number(ls.get('bw:update-last')) || 0;
  if (updServed() && updAuto() && (Date.now() - last >= DAY || (st && st.current !== V))) {
    setTimeout(() => {
      check(false).then((u) => { if (u?.status === 'available' && u.current === V && ls.get('bw:update-skip') !== u.latest && scrim.hidden) popup(u); });
    }, 1200);
  }
  window.BW_UPDATE = { show, hide, popup, check, apply, state: updState, served: updServed, auto: updAuto, close: closeModal, version: V };
})();
