/* ── document events ───────────────────────────────────────────────────── */
const pair = () => document.getElementById('bw-pair');
document.addEventListener('focusin', (e) => {
  const el = e.target.closest?.('#bw-pair [data-p]');
  if (!el) return;
  if (el.closest('td[data-r], table[data-rows] td')) lastCell = el.closest('td[data-r], table[data-rows] td');
  else if (el.matches('td[data-r],th[data-c]')) lastCell = el;
  if (!el.isContentEditable) {
    el.contentEditable = 'plaintext-only';
    // keyboard focus (Tab) leaves no caret: put it at the end so typing works at once
    const sel = getSelection();
    if (!sel.rangeCount || !el.contains(sel.anchorNode)) {
      const r = document.createRange();
      r.selectNodeContents(el);
      r.collapse(false);
      sel.removeAllRanges();
      sel.addRange(r);
    }
  }
  S.typingGroup = null;
  selectEl(el);
});
document.addEventListener('mousedown', () => { S.pressAt = performance.now(); }, true);
document.addEventListener('click', (e) => {
  const el = e.target.closest?.('#bw-pair main.bw-doc [data-b], #bw-pair main.bw-doc [data-p]');
  if (el) {
    const cell = e.target.closest('td[data-r], table[data-rows] td');
    if (cell) lastCell = cell;
    selectEl(e.target);
  } else if (uxIsEmptySpace(e.target)) {
    // a click on empty page or background: the general tools come back
    if (S.dg && performance.now() - (S.dgPickedAt || 0) < 600) return; // the press just picked a drawing; its click lands on the wrapper after a re-layout
    if (S.sel && (S.selAt || 0) >= (S.pressAt || 0)) return; // the press itself selected this block and the page redrew under it (owner-flows L22): its click lands on the wrapper, it must not undo the selection
    if (S.sel || S.selOv != null || S.dg) { S.sel = null; S.selOv = null; dgClear(); paintSel(); refreshUi(); }
  }
});
const leafShown = (el) => (el.dataset.pfx || '') + el.innerText.replace(/\n{2,}/g, '\n').trim(); // a typed line break stays (Enter in a cell, Shift+Enter)
// what the leaf showed right before the browser changes it (TW-01): the page draws text through polish(), so a typed change is a delta on the DOM text, applied to the document text
document.addEventListener('beforeinput', (e) => {
  const el = e.target.closest?.('#bw-pair [data-p]');
  if (el) el.__bwShown = leafShown(el);
}, true);
document.addEventListener('input', (e) => {
  const el = e.target.closest?.('#bw-pair [data-p]');
  if (!el) return;
  const ed = el.closest('main.bw-doc').dataset.locale;
  let text = leafShown(el);
  const prev = el.__bwShown;
  el.__bwShown = text;
  const leaf = M[S.svc]?.[ed] ? get(cur(ed).doc, el.dataset.p) : undefined;
  const docOld = typeof leaf === 'string' || isRich(leaf) ? textOf(leaf) : null;
  if (docOld != null && prev != null && prev !== text && prev !== docOld) { // the document keeps what the page does not draw (diacritics, tatweel): only the typed change goes in
    let a = 0;
    while (a < prev.length && a < text.length && prev[a] === text[a]) a += 1;
    let z = 0;
    while (z < prev.length - a && z < text.length - a && prev[prev.length - 1 - z] === text[text.length - 1 - z]) z += 1;
    const map = w2align(docOld, prev);
    text = docOld.slice(0, map[a]) + text.slice(a, text.length - z) + docOld.slice(map[prev.length - z]);
  }
  setText(el.dataset.p, text, ed);
});
document.addEventListener('focusout', (e) => {
  const el = e.target.closest?.('#bw-pair [data-p]');
  if (el && el.isContentEditable) el.removeAttribute('contenteditable');
  S.typingGroup = null;
  const le = S.labelEdit;
  if (le) { S.labelEdit = null; toast(t('labelEdited'), 'info', { actions: [[t('labelAll'), () => labelToPack(le.path.slice(8), le.value, le.ed)]] }); }
});
// Pasted HTML never enters the document: text only, scripts and handlers cannot survive.
document.addEventListener('paste', (e) => {
  const imgFile = [...(e.clipboardData?.files || [])].find((x) => /^image\//.test(x.type));
  if (imgFile && e.target.closest?.('#bw-pair')) { e.preventDefault(); pasteImage(imgFile); return; }
  const el = e.target.closest?.('#bw-pair [data-p]');
  if (!el) return;
  e.preventDefault();
  const text = sanitizePaste(e.clipboardData.getData('text/plain') || e.clipboardData.getData('text/html'));
  const endBusy = text.length > 20000 ? EXT.busy?.begin('busy.work') : null; // a big paste shows the loading screen
  try { document.execCommand('insertText', false, text); } finally { endBusy?.(); }
});
// Pasted HTML is reduced to text by string work only: it never reaches an HTML
// parser, so no element (and no on*= handler in it) is ever created. On Linux
// Chrome a DOMParser document still tried the payload's inline handler, which the
// page CSP then blocked and reported as a console error (CI run 40532044817).
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
function sanitizePaste(s) {
  return String(s ?? '')
    .replace(/<(script|style|iframe|object|embed|template|svg|math)\b[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]*>/g, '')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
      if (e[0] === '#') {
        const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : '';
      }
      return ENTITIES[e.toLowerCase()] ?? m;
    })
    .replace(/[<>]/g, '')
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '')
    .replace(/\s+/g, ' ');
}
document.addEventListener('keydown', (e) => {
  if (EXT.on.keydown.some((f) => { try { return f(e) === true; } catch (x) { console.error(x); return false; } })) return; // an extension handled it
  const mod = e.ctrlKey || e.metaKey;
  // R3: the real target (inside the shadow UI too): typing keys in an input stay there; a toolbar button does not swallow the shortcuts
  const t0 = e.composedPath?.()[0] || e.target;
  const inUi = !!e.composedPath?.().some((x) => x === host);
  const inText = !!t0.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t0.tagName || '');
  if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); saveAll(); return; }
  if (mod && e.key.toLowerCase() === 'f') { e.preventDefault(); openDrawer('find'); return; }
  if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); openPalette(); return; }
  if (mod && e.altKey && (e.code === 'Digit8' || e.code === 'Digit9')) { e.preventDefault(); if (e.code === 'Digit8') zoomFitWidth(); else zoomFitHeight(); return; } // fit width / fit height (0.15.0)
  if (mod && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'p') { e.preventDefault(); pcOpenPrint(); return; } // the Print panel (print-center.js)
  if (inUi && (inText || e.key === 'Escape')) { if (e.key === 'Escape') uxEscape(); return; }
  if (!inText && !inUi && !mod && !e.altKey && e.key.toLowerCase() === 'f') { e.preventDefault(); runAction('focus'); return; }
  if (e.key === 'Escape' && S.focus) { runAction('focus'); return; }
  // in a text leaf the browser's own undo runs only while a typing group is open (its stack holds the typing); after any app-level
  // edit (Ctrl+B, Enter, a list, an alignment) that stack is empty, so the keyboard undoes the app's last edit (TW-04)
  const typingOpen = () => { const l = cur().ops.at(-1); return !!(S.typingGroup && l && l.op === 'setText' && String(l.id).startsWith(S.typingGroup + '.')); };
  if (mod && !e.shiftKey && e.key.toLowerCase() === 'z' && (!e.target.isContentEditable || !typingOpen())) { e.preventDefault(); undo(); return; }
  if (mod && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z')) && (!e.target.isContentEditable || cur().redo.length > 0)) { e.preventDefault(); redo(); return; }
  if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); A.duplicate(); return; }
  if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) { e.preventDefault(); A.moveKey(e.key === 'ArrowUp' ? -1 : 1); return; }
  if ((e.key === 'Delete') && !inText && S.sel?.b) { e.preventDefault(); A.delete(); return; }
  if (inUi) return; // the toolbar keeps Enter, Space and the arrows for its own buttons
  if (e.key === 'Escape') { if (e.target.isContentEditable) e.target.blur(); S.sel = null; S.selOv = null; dgClear(); paintSel(); refreshUi(); return; }
  if (e.key === 'Enter' && e.target.isContentEditable) { e.preventDefault(); e.target.blur(); }
});
window.addEventListener('resize', () => paintSel());
// leaving, hiding or closing the tab flushes a pending draft at once (a debounce must never lose the last edit)
const flushDraft = () => { if (S.pending || S.dirty) writeDraft(); };
window.addEventListener('pagehide', flushDraft);
window.addEventListener('pagehide', () => emit('pagehide'));
window.addEventListener('beforeunload', flushDraft);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushDraft(); });

/* ── tool watermark: moved to editor/ext/34-watermark.js in 0.15.0 (mount, the 20 reactions W01-W20, the bw:wm event). It mounts on the boot event. ── */

/* ── dialog hooks and the settled-ready signal (0.15.0, docs/automation.md) ────────────────────────────
 * Every modal carries data-bw-dialog="<id>" (set here from what the modal is, so a call site that names none still gets one;
 * a call site that sets the attribute itself wins). BW.dialogs() lists them, BW.dialog(id) returns the element (inside the
 * UI shadow root: Playwright's CSS pierces it, document.querySelector does not).
 * Ready: window.BW.ready (boolean) still means «booted and rendered». `bw:ready` (window event, once), data-bw-ready="1" on <html>
 * and BW.whenReady() mean «settled»: booted, no modal open, no hold taken with BW.holdReady(reason), and the document named by
 * #doc=<id> is the one on screen. The resume dialog and the first-launch card take a hold (or are suppressed by data-bw-automation). */
const DIALOG_IDS = [['pf-first', 'pf-first'], ['bw-resume', 'resume'], ['sh-done', 'share-done'], ['sh-modal', 'share'], ['pc-dlg', 'print'], ['pj-ask', 'ask']];
function dialogIdOf(el) {
  if (el.dataset.bwDialog) return el.dataset.bwDialog;
  for (const [cls, id] of DIALOG_IDS) if (el.classList.contains(cls) || el.querySelector?.(`.${cls}`)) return id;
  return el.querySelector?.('[data-mk="cancel"]') && el.querySelector('[data-mk="ok"]') ? 'confirm' : 'dialog';
}
function tagDialogs() {
  const taken = new Set([...root.querySelectorAll('[data-bw-dialog]'), ...document.querySelectorAll('[data-bw-dialog]')].map((x) => x.dataset.bwDialog));
  for (const el of [...root.querySelectorAll('.bw-modal, dialog.bw-resume, dialog.pc-dlg'), ...document.querySelectorAll('dialog.bw-resume')]) {
    if (el.dataset.bwDialog) continue;
    const base = dialogIdOf(el);
    let id = base, n = 1;
    while (taken.has(id)) { n += 1; id = `${base}-${n}`; } // ids are unique among the dialogs that exist now
    taken.add(id);
    el.dataset.bwDialog = id;
  }
}
const dialogEls = () => [...root.querySelectorAll('[data-bw-dialog]'), ...document.querySelectorAll('[data-bw-dialog]')];
const dialogOpen = (el) => el.isConnected && (el.tagName === 'DIALOG' ? el.open : !el.hidden);
/** 0.16.0: a tool talking to this tab must never wait behind a question meant for a person. The resume popup is closed without an answer and a first-launch / confirm card is skipped
 *  (its own skip or cancel button, so its hold is released the normal way). Returns how many it dismissed. */
function dismissBlockers({ keepResume = false } = {}) {
  tagDialogs();
  let n = 0;
  for (const el of dialogEls()) {
    if (!dialogOpen(el)) continue;
    if (el.dataset.bwDialog === 'resume') { if (!keepResume && EXT.session?.dismissResume?.()) n += 1; continue; }
    const b = el.querySelector?.('[data-mk="skip"],[data-mk="later"],[data-mk="cancel"]');
    if (b) { b.click(); n += 1; }
  }
  return n;
}
/* graceMs: a dialog that opens asynchronously after boot (the first-launch card waits for the stored profile, the resume dialog for the host) must
 * not be missed by a fast check, so «settled» cannot come sooner than this after boot unless a module says so; a module that knows it will ask takes a hold. */
const BWR = { booted: false, fired: false, holds: new Set(), waiters: [], bootAt: 0, graceMs: 700 };
/** A module that is about to ask the person something (resume, first launch) takes a hold; the returned function releases it. */
function holdReady(reason = 'hold') {
  const h = String(reason);
  BWR.holds.add(h);
  let done = false;
  return () => { if (done) return; done = true; BWR.holds.delete(h); readyCheck(); };
}
function readyBlockers() {
  const out = [];
  if (!BWR.booted) out.push('boot');
  else if (performance.now() - BWR.bootAt < BWR.graceMs) out.push('settling');
  for (const h of BWR.holds) out.push(`hold:${h}`);
  tagDialogs();
  for (const el of dialogEls()) if (dialogOpen(el)) out.push(`dialog:${el.dataset.bwDialog}`);
  const want = /[#&]doc=([^&]+)/.exec(location.hash);
  if (want) { let id = want[1]; try { id = decodeURIComponent(id); } catch { /* keep raw */ } if (M[id] && S.svc !== id) out.push(`doc:${id}`); }
  return out;
}
function readyCheck() {
  if (BWR.fired || readyBlockers().length) return;
  BWR.fired = true;
  document.documentElement.dataset.bwReady = '1';
  window.dispatchEvent(new Event('bw:ready'));
  BWR.waiters.splice(0).forEach((w) => { clearTimeout(w.timer); w.res(true); });
}
/** Resolves once the editor is settled; rejects after `ms` (20 s) naming what still blocks it, so a script never hangs behind a modal. */
function whenReady(ms = 20000) {
  readyCheck();
  if (BWR.fired) return Promise.resolve(true);
  return new Promise((res, rej) => {
    const w = { res, timer: setTimeout(() => { BWR.waiters = BWR.waiters.filter((x) => x !== w); rej(new Error(`BW.whenReady: not ready after ${ms} ms, blocked by ${readyBlockers().join(', ') || 'nothing known'}`)); }, ms) };
    BWR.waiters.push(w);
  });
}
{
  const mo = new MutationObserver(() => { tagDialogs(); if (!BWR.fired) readyCheck(); });
  mo.observe(root, { childList: true });
  mo.observe(document.body, { childList: true });
  const poll = setInterval(() => { if (BWR.fired) clearInterval(poll); else readyCheck(); }, 100); // a hold released, a dialog closed, #doc= reached
}

/* ── boot ──────────────────────────────────────────────────────────────── */
function boot() {
  const ov = document.createElement('div');
  ov.id = 'bw-overlay';
  ov.innerHTML = `<button type="button" class="bw-grip" hidden aria-label="${esc(t('drag'))}"><span aria-hidden="true">✥</span> ${esc(t('drag'))}</button><div class="bw-drop" hidden></div>`;
  document.body.appendChild(ov);
  overlay.grip = ov.querySelector('.bw-grip');
  overlay.drop = ov.querySelector('.bw-drop');
  overlay.grip.addEventListener('pointerdown', startDrag);
  document.documentElement.dataset.bwDark = S.dark ? '1' : '0';
  buildUi();
  render(false);
  offerRecovery();
  window.BW.ready = true; // booted and rendered with the remembered state
  BWR.bootAt = performance.now();
  BWR.booted = true; // the settled signal (bw:ready) fires from here once nothing blocks it
  readyCheck();
  // boot() runs once the whole script has loaded (engine/build-editor.mjs calls it after editor/ext/*.js), so the
  // first mount already draws every extension's commands and sections: no second build, the recovery banner and the
  // first-open motion stay. The events wait one microtask, for the local-learning layer that wraps the editor last.
  queueMicrotask(() => { emit('boot'); emit('open', S.svc, S.ed); });
}
// a re-harvest that met a hand edit: the person's text was kept; show the source's new text beside it
for (const [svc, eds] of Object.entries(M)) for (const [ed, e] of Object.entries(eds)) for (const c of e.doc.harvestConflicts || []) if (svc === S.svc) S.conflicts.push({ ed, path: c.path, mine: c.manual, theirs: c.harvested, kind: 'text' });
if (S.conflicts.length) toast(t('reharvestConflicts', { n: S.conflicts.length }), 'warn', { actions: [[t('show'), () => openDrawer('conflicts')]], persist: true });
{ const n = (cur().doc.process?.actors || []).filter((a) => a.unresolved).length; if (n) toast(t('rolesUnresolved', { n }), 'warn', { actions: [[t('show'), () => openDrawer('process')]], persist: true }); }
/* ── the agent indicator (0.16.0, field notes item 3): a small status chip «agent editing: <section>» with the time of the last edit, and a short outline on the block just edited.
 * Never a dialog, never over the text (a corner chip), never scrolls the page; hidden in print; the class on a block lives only in the page (a render drops it, Save-HTML never sees it). */
Object.assign(I18N.ui.ar, { agentEditing: 'الوكيل يحرّر: {x}', agentIdle: 'آخر تعديل من الوكيل: {x}', agentTip: 'اضغط لإظهار آخر موضع عدّله الوكيل' });
Object.assign(I18N.ui.en, { agentEditing: 'agent editing: {x}', agentIdle: 'agent last edited: {x}', agentTip: 'Press to show where the agent last edited' });
const AGENT = (() => {
  let chip = null, last = null, hideT = 0, hlT = 0, n = 0;
  /* the person's place in the page is held while a batch runs: any scroll that did not come from their hand (a wheel, a touch, a key, a press on the scrollbar) is put back at once, so the
     page rebuild after each op, a focus, a band that grew, or anything else that scrolls on its own never moves what they are reading. Their own scrolling moves the held place. */
  const hold = { y: 0, user: false, t: 0, on: false };
  const userAct = () => { hold.user = true; clearTimeout(hold.t); hold.t = setTimeout(() => { hold.user = false; hold.y = window.scrollY; }, 250); };
  const onScroll = () => { if (hold.user) return; if (Math.abs(window.scrollY - hold.y) > 1) window.scrollTo({ top: hold.y, behavior: 'instant' }); };
  const USER_EVS = ['wheel', 'touchmove', 'keydown', 'pointerdown'];
  function holdOn() { if (hold.on) return; hold.on = true; hold.y = window.scrollY; hold.user = false; window.addEventListener('scroll', onScroll, { passive: true }); USER_EVS.forEach((ev) => window.addEventListener(ev, userAct, { passive: true, capture: true })); }
  function holdOff() { if (!hold.on) return; hold.on = false; window.removeEventListener('scroll', onScroll); USER_EVS.forEach((ev) => window.removeEventListener(ev, userAct, { capture: true })); clearTimeout(hold.t); }
  const css = '#bw-agent-ind{position:fixed;inset-block-end:14px;inset-inline-end:14px;z-index:99980;max-inline-size:min(360px,calc(100vw - 28px));display:flex;gap:8px;align-items:center;padding:7px 12px;border-radius:999px;background:var(--bw-band,#001e3d);color:var(--bw-on-primary,#fff);font:600 12.5px/1.3 "Thmanyah Sans",system-ui,sans-serif;box-shadow:0 6px 18px rgba(0,30,61,.28);cursor:pointer;border:0;transition:opacity .25s,transform .25s}#bw-agent-ind[hidden]{display:none}#bw-agent-ind .dot{inline-size:9px;block-size:9px;border-radius:50%;background:var(--bw-accent,#be9a41);flex:none}#bw-agent-ind[data-live="1"] .dot{animation:bwAgentPulse 1s ease-in-out infinite}#bw-agent-ind .lbl{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}#bw-agent-ind time{opacity:.75;font-variant-numeric:tabular-nums;flex:none}.bw-agent-hl{outline:2px solid var(--bw-accent,#be9a41)!important;outline-offset:2px;background:color-mix(in srgb,var(--bw-accent,#be9a41) 16%,transparent)!important;transition:outline-color .6s,background .6s}@keyframes bwAgentPulse{50%{opacity:.35}}@media print{#bw-agent-ind{display:none!important}.bw-agent-hl{outline:0!important;background:none!important}}';
  const hhmmss = (d) => d.toLocaleTimeString('en-GB', { hour12: false });
  function ensure() {
    if (chip) return chip;
    const st = document.createElement('style'); st.id = 'bw-agent-css'; st.textContent = css; document.head.appendChild(st);
    chip = document.createElement('button');
    chip.id = 'bw-agent-ind'; chip.type = 'button'; chip.hidden = true;
    chip.setAttribute('role', 'status'); chip.setAttribute('aria-live', 'polite'); chip.title = t('agentTip');
    chip.innerHTML = '<span class="dot" aria-hidden="true"></span><span class="lbl"></span><time></time>';
    chip.addEventListener('click', () => { const el = last && find(last.op, last.ed); if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' }); });
    document.body.appendChild(chip);
    return chip;
  }
  /** The element a path points at, or the deepest one above it that the page draws (a text leaf, else its block). */
  function find(op, ed) {
    const main = mainOf(ed || S.ed);
    if (!main || !op) return null;
    const parts = String(op.op === 'move' ? op.path : op.path).split('/');
    for (let k = parts.length; k > 1; k--) {
      const p = parts.slice(0, k).join('/');
      const el = main.querySelector(`[data-p="${CSS.escape(p)}"]`) || main.querySelector(`[data-b="${CSS.escape(p)}"]`);
      if (el) return el;
    }
    return null;
  }
  /** The section a path is in, by its printed number and title: «3.2 Fees». */
  function where(op, ed) {
    const d = cur(ed || S.ed).doc;
    const m = /^\/chapters\/(\d+)(?:\/sections\/(\d+))?/.exec(String(op?.path || ''));
    if (!m) return /^\/control/.test(String(op?.path || '')) ? textOf(d.control?.title) || t('agentDoc') : String(op?.path || '').split('/').slice(0, 3).join('/') || '/';
    try {
      const NUM = docNumbers(d);
      const ch = d.chapters?.[+m[1]];
      if (m[2] === undefined) return `${NUM.ch[+m[1]] ?? +m[1] + 1} ${textOf(ch?.title)}`.trim();
      return `${NUM.sec[+m[1]]?.[+m[2]] ?? `${+m[1] + 1}.${+m[2] + 1}`} ${textOf(ch?.sections?.[+m[2]]?.title)}`.trim();
    } catch { return String(op.path); }
  }
  const paint = (live) => {
    const c = ensure();
    c.dir = S.ui === 'en' ? 'ltr' : 'rtl';
    c.dataset.live = live ? '1' : '0';
    c.querySelector('.lbl').textContent = live ? t('agentEditing', { x: last?.where || '' }) : t('agentIdle', { x: '' }).replace(/:\s*$/, '');
    c.querySelector('time').textContent = last ? hhmmss(new Date(last.at)) : '';
    c.hidden = false;
  };
  Object.assign(I18N.ui.ar, { agentDoc: 'الوثيقة' });
  Object.assign(I18N.ui.en, { agentDoc: 'the document' });
  return {
    /** A batch starts: the chip shows (live), the name of the agent is kept for its tooltip. */
    begin(name) { n += 1; holdOn(); clearTimeout(hideT); document.documentElement.dataset.bwAgent = 'editing'; ensure().title = `${name} · ${t('agentTip')}`; paint(true); },
    /** The op (or chunk) about to be applied: the section is named before the block changes. */
    at(op, ed) { last = { op, ed, where: where(op, ed), at: Date.now() }; paint(true); },
    /** The op just applied: outline its block for a moment. Nothing is scrolled, no focus moves. */
    mark(op, ed) {
      last = { op, ed, where: where(op, ed), at: Date.now() };
      paint(true);
      const el = find(op, ed);
      if (el) { document.querySelectorAll('.bw-agent-hl').forEach((x) => x.classList.remove('bw-agent-hl')); el.classList.add('bw-agent-hl'); clearTimeout(hlT); hlT = setTimeout(() => el.classList.remove('bw-agent-hl'), 1800); }
    },
    /** The batch ended: the chip keeps «agent last edited» with the time for a while, then goes. */
    /** put the page back where the person has it (called after each op: the scroll listener also does it for a scroll that comes later) */
    keepPlace() { if (hold.on && !hold.user && Math.abs(window.scrollY - hold.y) > 1) window.scrollTo({ top: hold.y, behavior: 'instant' }); },
    end() { setTimeout(holdOff, 400); document.documentElement.dataset.bwAgent = 'idle'; if (last) paint(false); clearTimeout(hideT); hideT = setTimeout(() => { if (chip) chip.hidden = true; document.documentElement.dataset.bwAgent = ''; }, 20000); },
    get last() { return last && { ...last }; },
  };
})();
/* ── editor bridge (0.15.0): what a tool asks of the OPEN document, answered here ──────────────────────────────────────────
 * engine/routes/editor-bridge.mjs pushes the SSE event `req {id, tool, doc, args}` to this tab; editor/ext/12-session.js hands it to
 * BW.bridge(tool, doc, args) and replies with POST /api/editor/reply. Errors carry a code: NO_DOC BAD_ARGS BAD_OP CONFLICT UNKNOWN_ACTION REFUSED.
 * ops: validated on a COPY first (nothing changes when one op is wrong or an `old` does not match), then ONE commit = ONE undo group, saved to
 * the library, and signed in the provenance log as the agent (its own actor id `agent:<name>`, never the person's). */
const BRIDGE = (() => {
  const err = (code, message, extra = {}) => Object.assign(new Error(message), { bw: code, extra });
  const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'agent';
  const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  const sha = async (s) => `sha256:${hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))}`;
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b) || (textOf(a) !== '' && textOf(a) === textOf(b));
  const wordsOf = (doc) => { try { return textLeaves(doc).map((x) => x.value).join(' ').split(/\s+/).filter(Boolean).length; } catch { return 0; } };
  /** Run fn with the agent bound as the actor of the log entries it creates (PF.withActor); then wait for the queue so the reply carries a written log. */
  async function asAgent(name, fn, hold = false) {
    if (typeof PF === 'undefined' || typeof PV === 'undefined') return fn();
    const actor = { id: `agent:${slug(name)}`, name: String(name || 'Claude').slice(0, 80) };
    try { if (typeof pvFlushTyping === 'function') pvFlushTyping(); await PV.q; } catch { /* the log is best effort */ }
    // no global swap: the actor is bound to the entries created inside fn (PF.withActor), so a person's edit while the queue drains stays the person's
    try { return await PF.withActor(actor, fn, hold); } finally { try { await PV.q; } catch { /* idem */ } }
  }
  /** The document the call is about, mounted and shown: the open one, or a library entry of this browser; NO_DOC otherwise. */
  async function target(doc, locale) {
    if (doc && doc !== S.svc) {
      let ok = false;
      try { ok = !!(await EXT.library?.open(doc, locale)); } catch { ok = false; }
      if (!ok || S.svc !== doc) throw err('NO_DOC', `no document "${doc}" in this editor's library`, { doc });
    }
    const ed = locale || S.ed;
    if (!M[S.svc]?.[ed]) throw err('BAD_ARGS', `the document has no "${ed}" edition`, { editions: Object.keys(M[S.svc] || {}) });
    return ed;
  }
  // 0.15.2 note 12: the allow-list adds SAFE actions (they change the view, never the content); destructive ones stay locked (REFUSED, never run)
  const SAFE = ['zoomPct', 'zoomHeight', 'zoomWidth', 'zoomIn', 'zoomOut', 'zoomReset', 'theme', 'reading', 'find', 'save', 'outline', 'nextPage', 'prevPage'];
  const FIXES = ['fixTashkeel', 'singleEdition', 'splitFigure']; // 0.15.3: the Check panel's fixes, one call each
  const ACTIONS = ['renumber', 'check', 'autoLayout', 'saveHtml', 'share', 'exportPdf', 'dismissResume', 'claim', 'verifyHistory', ...FIXES, ...SAFE]; // dismissResume / claim: 0.16.0 (the session extension, editor/ext/12-session.js)
  const LOCKED = /^(delete|remove|close|stop|power|clear|purge|reset|wipe|erase|trash|quit|exit)/i;
  const tools = {
    async list({ project, include_trashed } = {}) {
      const rows = ((await EXT.library?.all()) || []).filter((e) => e.kind !== 'template' && (include_trashed || !e.deletedAt) && EXT.library.isDoc(e.id));
      const documents = rows.map((e) => {
        const pid = EXT.projects?.of(e.id) || null;
        const proj = pid ? EXT.projects.state().projects.find((p) => p.id === pid)?.name || pid : null;
        // 0.15.3 (T8): words come from each BUILT edition (what it holds now: the open document live, a stored one by its saved count or base + ops), never from the first edition's blank base
        const by = M[e.id] ? Object.fromEntries(Object.entries(M[e.id]).map(([ed, x]) => [ed, wordCount(x.doc)])) : (e.words && typeof e.words === 'object' ? e.words : entryWords(e));
        const eds = (() => { for (const x of Object.values(M[e.id] || {})) { const l = editionsOf(x.doc); if (l?.length === 1) return l; } return Object.keys(by); })();
        return { id: e.id, title: M[e.id] ? EXT.library.titleOf(e.id) : e.title, project: proj, editions: Object.keys(e.editions || {}), savedAt: e.savedAt, ...(e.deletedAt ? { deletedAt: e.deletedAt } : {}), words: Math.max(0, ...eds.map((ed) => by[ed] || 0)), wordsByEdition: by };
      }).filter((d) => !project || d.project === project);
      return { documents };
    },
    async get({ pointer = '', locale } = {}, doc) {
      const ed = await target(doc, locale);
      const value = pointer ? get(cur(ed).doc, pointer) : cur(ed).doc;
      if (value === undefined) throw err('BAD_ARGS', `nothing at ${pointer}`, { pointer });
      return { value: clone(value), pointer, locale: ed, doc: S.svc };
    },
    async outline({ locale } = {}, doc) {
      const ed = await target(doc, locale);
      const d = cur(ed).doc;
      const NUM = docNumbers(d); // what prints, by position (a stale stored number is never reported)
      const chapters = (d.chapters || []).map((ch, i) => ({
        pointer: `/chapters/${i}`, number: NUM.ch[i], title: textOf(ch.title),
        sections: (ch.sections || []).map((s, j) => ({ pointer: `/chapters/${i}/sections/${j}`, number: NUM.sec[i][j], title: textOf(s.title), blocks: (s.blocks || []).map((b, k) => ({ pointer: `/chapters/${i}/sections/${j}/blocks/${k}`, kind: b.kind, ...(b.id ? { id: b.id } : {}) })) })),
      }));
      return { doc: S.svc, locale: ed, title: textOf(d.control?.title), chapters, counts: { chapters: chapters.length, sections: chapters.reduce((n, c) => n + c.sections.length, 0), blocks: chapters.reduce((n, c) => n + c.sections.reduce((m, s) => m + s.blocks.length, 0), 0), words: wordsOf(d) } };
    },
    async ops({ ops, locale, mirror = false, agent, group } = {}, doc) {
      if (!Array.isArray(ops) || !ops.length) throw err('BAD_OP', 'ops must be a non-empty array');
      if (!locale) throw err('BAD_ARGS', 'locale is required (ar or en): no silent default');
      const ed = await target(doc, locale);
      const e = cur(ed);
      const test = clone(e.doc);
      const list = clone(ops);
      list.forEach((op, i) => { const bad = opShapeErrors(op); if (bad.length) throw err('BAD_OP', `op ${i}: ${bad[0]}`, { index: i }); }); // columns: [] , a hand-written story number and a data URI that does not decode are refused here as in the host
      list.forEach((op, i) => {
        if (!op || !['setText', 'replace', 'insert', 'delete', 'move', 'duplicate'].includes(op.op) || typeof op.path !== 'string') throw err('BAD_OP', `op ${i}: bad op or path`, { index: i });
        if ('old' in op) { const live = get(test, op.path); if (!same(live, op.old)) throw err('CONFLICT', `op ${i}: ${op.path} holds something else than old`, { index: i, path: op.path, live: clone(live) ?? null }); }
        try { applyOp(test, op); } catch (x) { throw err('BAD_OP', `op ${i}: ${x.message}`, { index: i }); }
      });
      const g = `${newGroup()}${group ? `-${slug(group)}` : ''}`; // a group id never holds a dot: undo() splits on it
      const name = agent || 'Claude';
      // 0.16.0 (field notes item 3): the batch is validated whole (above), then applied OP BY OP in order, so the person watching sees each block change. It is still ONE undo group (the ops
      // share the group id, numbered g.0 g.1 …). The page is not scrolled and the person's caret stays where it is (render() keeps both); a block being typed in is merged, never blocked:
      // the op lands on the live text. A long batch is applied in chunks (at most ~60 renders), a hidden tab (no one is watching, timers are throttled) in one go.
      const watched = document.visibilityState === 'visible';
      const per = Math.max(1, Math.ceil(list.length / 60));
      const pace = watched ? Math.min(Number(window.BW_OP_PACE_MS ?? 120), 6000 / Math.ceil(list.length / per)) : 0;
      AGENT.begin(name);
      let done = 0;
      // the agent signs ONLY the synchronous commit of each chunk (PF.withActor binds the actor for that call, not across the pauses): a person's edit made between two ops is the person's
      const actor = { id: `agent:${slug(name)}`, name: String(name || 'Claude').slice(0, 80) };
      const signed = (fn) => (typeof PF === 'undefined' ? fn() : PF.withActor(actor, fn));
      try {
        try { if (typeof pvFlushTyping === 'function') pvFlushTyping(); await PV.q; } catch { /* the log is best effort */ }
        try {
          for (let i = 0; i < list.length; i += per) {
            const chunk = list.slice(i, i + per);
            AGENT.at(chunk[0], ed);
            signed(() => commit(chunk, { ed, group: g, mirror, k0: i }));
            done = i + chunk.length;
            AGENT.keepPlace();
            AGENT.mark(chunk[chunk.length - 1], ed);
            if (pace > 0 && done < list.length) await new Promise((r) => setTimeout(r, pace));
          }
        } finally { try { await PV.q; } catch { /* idem */ } }
      } catch (x) {
        AGENT.end(false);
        if (x?.refused) throw err('REFUSED', x.message);
        if (done) throw err('BAD_OP', `${x.message} (${done} of ${list.length} ops were applied, as one undo group: undo it to take them back)`, { applied: done, of: list.length });
        throw x;
      }
      AGENT.end(true);
      await EXT.library?.persist?.(S.svc);
      return { applied: list.length, group: g, opsLen: e.ops.length, revision: e.ops.length, hash: await sha(JSON.stringify(e.doc)), doc: S.svc, locale: ed, actor: { id: `agent:${slug(name)}`, name } };
    },
    async action({ id, args = {} } = {}, doc) {
      if (LOCKED.test(String(id || ''))) throw err('REFUSED', `"${id}" is locked: a destructive action is never run through the bridge`, { id });
      if (!ACTIONS.includes(id)) throw err('UNKNOWN_ACTION', `unknown action "${id}"`, { allowed: ACTIONS });
      if (id === 'dismissResume') return { id, dismissed: !!EXT.session?.dismissResume?.() }; // closes the «continue where you left off» popup without answering it
      if (id === 'claim') { const r = await EXT.session?.claim?.(doc); if (!r?.ok) throw err(r?.code || 'REFUSED', r?.error || 'claim failed'); return { id, ...r }; } // takes the document's lease for this tab now
      const ed = await target(doc, args.locale);
      if (id === 'check') return checkAll();
      if (id === 'autoLayout') { let r; await asAgent(args.agent || 'Claude', async () => { r = EXT.diagram.autoLayout(args.pointer, args, ed); }, true); await EXT.library?.persist?.(S.svc); return { id, ...r }; } // 0.16.0: one undoable replace of the diagram's model
      if (id === 'verifyHistory') return verifyHistoryNow();
      if (id === 'exportPdf') return exportViaHost(args, ed);
      if (FIXES.includes(id)) {
        const before = cur(ed).ops.length;
        let r = null;
        await asAgent(args.agent || 'Claude', async () => {
          if (id === 'fixTashkeel') r = { changed: DOC153.fixTashkeel() };
          else if (id === 'singleEdition') r = { changed: DOC153.singleEdition(args.editions ?? args.value ?? 'both') };
          else r = DOC153.splitFigure(args.pointer);
        }, true);
        await EXT.library?.persist?.(S.svc);
        return { id, ...r, opsAdded: cur(ed).ops.length - before };
      }
      if (SAFE.includes(id)) return safeAction(id, args);
      if (id === 'share') return shareAs(args);
      const before = cur(ed).ops.length;
      let r = null;
      await asAgent(args.agent || 'Claude', async () => { r = await runAction(id); }, true); // an action may log after an await: bound until it settles
      if (id === 'saveHtml') return { id, opsAdded: cur(ed).ops.length - before, file: r?.file || null, folder: r?.folder || null, copy: !!r?.copy };
      return { id, opsAdded: cur(ed).ops.length - before };
    },
    /** 0.16.0 (item 11): a library document to a project (a name makes the project), or out of every project. */
    async assign({ project } = {}, doc) {
      if (!doc) throw err('BAD_ARGS', 'doc is required');
      const PJ = EXT.projects;
      if (!PJ) throw err('BAD_ARGS', 'projects are not available in this editor');
      if (!(await EXT.library.get(doc))) throw err('NO_DOC', `no document "${doc}" in this editor's library`, { doc });
      const pj = project ? PJ.state().projects.find((p) => !p.deletedAt && !p.purgedAt && (p.id === project || p.name === project)) || PJ.create(project) : null;
      if (project && !pj) throw err('BAD_ARGS', 'the project could not be made');
      if (!PJ.assign(doc, pj ? pj.id : null)) throw err('BAD_ARGS', 'the document could not be assigned');
      return { doc, project: pj ? pj.name : null, projectId: pj ? pj.id : null };
    },
    /** 0.16.0 (item 11): the Trash, from a tool: move a document there, or bring it back. Never a purge. */
    async trash({ restore } = {}, doc) {
      if (!doc) throw err('BAD_ARGS', 'doc is required');
      if (!(await EXT.library.get(doc))) throw err('NO_DOC', `no document "${doc}" in this editor's library`, { doc });
      if (restore) await EXT.library.restore(doc); else await EXT.library.remove(doc);
      const after = await EXT.library.get(doc);
      return { doc, trashed: !!after?.deletedAt, deletedAt: after?.deletedAt || null };
    },
    async new({ title, project, template } = {}) {
      if (!title) throw err('BAD_ARGS', 'title is required');
      const PJ = EXT.projects;
      const pid = project ? PJ?.state().projects.find((p) => !p.deletedAt && !p.purgedAt && (p.id === project || p.name === project))?.id || PJ?.create(project)?.id || null : null;
      const entry = template ? await EXT.library.fromTemplate(template) : await PJ.newIn(pid);
      if (!entry) throw err('BAD_ARGS', 'the new document could not be made (is the host serving the blank structure?)');
      if (template && pid) PJ.assign(entry.id, pid);
      for (const ed of Object.keys(M[S.svc])) await asAgent('Claude', async () => { commit([{ op: 'setText', path: '/control/title', value: String(title) }], { ed, mirror: false }); });
      await EXT.library.persist(S.svc);
      return { id: S.svc, title: String(title), project: project || null };
    },
    async import({ document, project } = {}) {
      if (!document || typeof document !== 'object' || !document.chapters || !document.control) throw err('BAD_ARGS', 'document must be a document JSON object (control, chapters)');
      const ed = /[؀-ۿ]/.test(document.control.title || '') ? 'ar' : 'en';
      const file = new File([JSON.stringify(document)], `document.${ed}.json`, { type: 'application/json' });
      const PJ = EXT.projects;
      const pid = project ? PJ?.state().projects.find((p) => !p.deletedAt && (p.id === project || p.name === project))?.id || PJ?.create(project)?.id || null : null;
      const entry = pid ? await PJ.importInto(pid, file) : await EXT.library.importAny(file);
      if (!entry) throw err('BAD_ARGS', 'the document could not be imported');
      return { id: entry.id, title: entry.title, project: project || null };
    },
  };
  /** 0.16.0 (item 12): the issues list the «سجل المصدر لهذه الوثيقة يظهر عبثا» banner is based on, read now (the log is verified again, never a cached verdict). */
  async function verifyHistoryNow() {
    try { if (typeof pvFlushTyping === 'function') pvFlushTyping(); await PV.q; } catch { /* best effort */ }
    const L = EXT.ledger?.log?.(S.svc);
    if (!L) return { id: 'verifyHistory', ok: true, issues: [], entries: 0, legacy: false, note: 'no history log is attached to this document' };
    return { id: 'verifyHistory', ok: !!L.verdict?.ok || !(L.verdict?.issues || []).some((i) => i.reason !== 'tofu'), issues: (L.verdict?.issues || []).slice(0, 50), entries: L.entries?.length || 0, legacy: !!L.verdict?.legacy, source: L.src || null };
  }
  /** 0.16.0 (item 8): the export an agent asked for, straight to the host: no window.open, no save-folder question (the person answers that one, not a tool), the file AND its folder in the reply. */
  async function exportViaHost({ name, destination, docx } = {}, ed) {
    if (!location.protocol.startsWith('http')) throw err('BAD_ARGS', 'exports need the local host (the editor was opened from a file)');
    const e = cur(ed);
    const body = { service: S.svc, locale: ed, doc: e.doc, theme: S.theme, embedFonts: S.docxFonts, ...(name ? { name: String(name) } : {}), ...(destination ? { destination: String(destination) } : {}), ...(docx === false ? { docx: false } : {}) };
    const r = await fetch('/api/export', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw err(r.status === 400 ? 'BAD_ARGS' : 'HOST_ERROR', String(j.error || `the export answered ${r.status}`));
    emit('export', { pdf: !!j.pdf, docx: !!j.docx });
    return { id: 'exportPdf', pdf: j.pdf, folder: j.folder || null, docx: j.docx || null, ...(j.docxError ? { docxError: j.docxError } : {}), locale: ed, doc: S.svc };
  }
  /** /business-wrap:check (0.15.2 note 13): the Check panel's findings, plus the spelling error counts (ar / en) and the diagram legibility warnings. */
  async function checkAll() {
    const findings = validate().map(([level, message, path, fix]) => ({ level, message, path, ...(fix ? { fix: { action: fix.id, ...(fix.arg != null ? { args: { pointer: fix.arg } } : {}) } } : {}) })); // fix = the bridge action that settles it
    const sp = EXT.spell;
    let spelling = { enabled: false, ar: 0, en: 0, total: 0 };
    if (sp?.enabled?.(S.ed)) {
      try { await sp.scan?.(); } catch { /* the engine may be loading: count what is there */ }
      const list = sp.issues?.() || [];
      spelling = { enabled: true, ar: list.filter((i) => i.lang === 'ar').length, en: list.filter((i) => i.lang === 'en').length, total: list.length };
    }
    const d = cur().doc;
    const diagramWarnings = [], diagramChecks = [];
    (d.chapters || []).forEach((ch, ci) => (ch.sections || []).forEach((sec, si) => (sec.blocks || []).forEach((bl, bi) => {
      if (bl.kind !== 'diagram' || !bl.model || typeof DIAGRAM.legibility !== 'function') return;
      const r = diagramLegibility(bl.model, d, bl.frame);
      const path = `/chapters/${ci}/sections/${si}/blocks/${bi}`;
      if (r) diagramChecks.push({ path, legible: !!r.ok, minPtPrinted: r.minPtPrinted, arrowOverlaps: r.wireOverlaps, arrowCrossings: r.wireCrossings });
      if (r && !r.ok) diagramWarnings.push({ path, minPtPrinted: r.minPtPrinted, minPt: r.minPt, small: (r.small || []).length, overlaps: (r.overlaps || []).length, arrowOverlaps: r.wireOverlaps, arrowCrossings: r.wireCrossings });
    })));
    return { id: 'check', findings, spelling, diagramWarnings, diagramChecks };
  }
  /** The safe view actions: zoom, theme, reading mode, find, save, outline, page turns. None adds an op to the document. */
  async function safeAction(id, args) {
    const zoomed = () => ({ id, zoomPct: zoomPctNow(), zoom: +zoomEff().toFixed(4) });
    switch (id) {
      case 'zoomPct': { const v = args.value ?? args.percent ?? args.pct; if (!Number.isFinite(parseFloat(v))) throw err('BAD_ARGS', 'zoomPct needs args {value} (25 to 400)'); zoomFromField(v); return zoomed(); }
      case 'zoomHeight': zoomFitHeight(); return zoomed();
      case 'zoomWidth': zoomFitWidth(); return zoomed();
      case 'zoomIn': case 'zoomOut': case 'zoomReset': await runAction(id); return zoomed();
      case 'theme': { const want = args.mode ? args.mode === 'dark' : !S.dark; if (want !== S.dark) await runAction('dark'); return { id, dark: !!S.dark, theme: S.dark ? 'dark' : 'light' }; }
      case 'reading': { const want = typeof args.on === 'boolean' ? args.on : !S.reading; if (want !== !!S.reading) await runAction('reading'); return { id, reading: !!S.reading }; }
      case 'find': case 'outline': if (S.drawer !== id) await runAction(id); return { id, open: S.drawer === id };
      case 'save': await runAction('save'); return { id, saved: true };
      case 'nextPage': case 'prevPage': {
        const dir = id === 'nextPage' ? 1 : -1;
        if (viewsActive()) viewsGo(dir); else window.scrollBy({ top: dir * Math.round(innerHeight * 0.9), behavior: 'instant' });
        return { id, page: (S.pageAt || 0) + 1, pages: S.pageN || 1 };
      }
      default: throw err('UNKNOWN_ACTION', `unknown action "${id}"`, { allowed: ACTIONS });
    }
  }
  /** The coworker-share dialog driven like a person would: recipient and note typed in, «Share» pressed, the result card read, then closed. */
  async function shareAs({ to = '', note = '' } = {}) {
    const wait = async (f, ms = 8000) => { for (const t0 = Date.now(); Date.now() - t0 < ms; await new Promise((r) => setTimeout(r, 60))) { const v = f(); if (v) return v; } return null; };
    const run = runAction('shShare');
    const form = await wait(() => root.querySelector('.sh-modal [data-sh="to"]')?.closest('.sh-modal'));
    if (!form) { await run.catch(() => {}); throw err('BAD_ARGS', 'the share dialog did not open'); }
    form.querySelector('[data-sh="to"]').value = String(to).slice(0, 80);
    form.querySelector('[data-sh="note"]').value = String(note).slice(0, 500);
    form.querySelector('.primary')?.click();
    const done = await wait(() => root.querySelector('.sh-done .sh-path'), 15000);
    const path = done?.textContent || S.lastShare || null;
    root.querySelector('.sh-done .btns:not(.sh-acts) button, .sh-done [data-k="close"]')?.click();
    await Promise.race([run.catch(() => {}), new Promise((r) => setTimeout(r, 1500))]);
    return { id: 'share', path };
  }
  // 0.16.0 (item 9): a call with a request_id runs once. The host remembers answers too; this is for the request it gave up on (TAB_TIMEOUT) that the tab finished anyway.
  const memo = new Map();
  const ONCE = new Set(['ops', 'new', 'import', 'assign', 'trash']);
  return async (tool, doc, args) => {
    if (!Object.hasOwn(tools, tool)) throw err('BAD_ARGS', `unknown tool "${tool}"`);
    const rid = args && typeof args.request_id === 'string' ? args.request_id : '';
    const once = rid && (ONCE.has(tool) || (tool === 'action' && ['exportPdf', 'saveHtml', 'share'].includes(args.id)));
    if (once && memo.has(rid)) { const r = await memo.get(rid); return r && typeof r === 'object' ? { ...r, replayed: true } : r; }
    const run = tools[tool](args || {}, doc);
    if (once) { memo.set(rid, run); run.catch(() => memo.delete(rid)); if (memo.size > 200) memo.delete(memo.keys().next().value); }
    return run;
  };
})();

window.BW = { bridge: BRIDGE, whenReady, holdReady, dismissBlockers, dialogs: () => { tagDialogs(); return dialogEls().map((el) => ({ id: el.dataset.bwDialog, open: dialogOpen(el) })); }, dialog: (id) => dialogEls().find((el) => el.dataset.bwDialog === id) || null, hasAction: actionKnown, setZoom, zoomTo: zoomFromField, automation: AUTOMATION, ic, IC, undoToast, flushDraft, S, M, commit, runAction, toast, DIAGRAM, setText, undo, redo, render, editsFile, bundle, importFile, saveHtml, validate, applyOps, A, selectEl, sanitizePaste, snapshotState, KEY, findNext, replaceAll, EXT, emit, bwExt, openDrawer };
// boot(): called by engine/build-editor.mjs after editor/ext/*.js (the seam)
