/* ── overlays: logos and images placed freely; positions in mm, saved in the document ── */
const MM = 96 / 25.4;
const mmScale = () => { const m = mainOf(S.ed); return m ? m.getBoundingClientRect().width / 210 : MM; };
const ovList = () => cur().doc.overlays || [];
const ovPtr = (i) => `/overlays/${i}`;
function ovOps(next, old) {
  // the document may not have the array yet: the first overlay creates it
  return cur().doc.overlays ? next : [{ op: 'replace', path: '/overlays', value: [], old: undefined }, ...next];
}
const OVL = {
  async add(kind, img, at) {
    img = img || await pickImage();
    if (!img) return;
    const w = kind === 'logo' ? 36 : 70;
    const o = { id: `ov${Date.now().toString(36)}`, kind, src: img.src, mode: 'cover', x: kind === 'logo' ? 140 : 40, y: kind === 'logo' ? 16 : 120, w };
    if (at) Object.assign(o, at);
    else if (kind !== 'logo' && S.sel?.b) Object.assign(o, imageAt(blockOf(S.sel.b)));
    // an anchored image follows its block (an id, kept by move and duplicate), not the slot the block sat in
    const pre = [];
    if (o.mode === 'anchor' && String(o.anchor).startsWith('/')) o.anchor = w2blockId(o.anchor, pre) || o.anchor;
    commit(ovOps([...pre, { op: 'insert', path: '/overlays/-', value: o }]), { mirror: true });
    S.selOv = ovList().length - 1;
    S.sel = null;
    paintSel();
    refreshUi();
    if (kind !== 'logo' && typeof w2showSection === 'function') w2showSection('wrap', true); // 23-objects: Word's seven wraps
    toast(t(kind === 'logo' ? 'logoAdded' : 'imageAdded'), 'ok');
  },
  async replace() {
    const i = S.selOv;
    if (i == null) return;
    const img = await pickImage();
    if (!img) return;
    commit([{ op: 'replace', path: `${ovPtr(i)}/src`, value: img.src, old: ovList()[i].src }]);
  },
  async caption() {
    const i = S.selOv;
    if (i == null) return;
    const text = await ask(t('captionPrompt'), ovList()[i].caption || '');
    commit([{ op: 'replace', path: `${ovPtr(i)}/caption`, value: text, old: ovList()[i].caption }]);
  },
  every() {
    const i = S.selOv;
    if (i == null) return;
    const o = ovList()[i];
    const mode = o.mode === 'every' ? 'cover' : 'every';
    commit([{ op: 'replace', path: ovPtr(i), value: { ...o, mode, anchor: undefined, y: mode === 'every' ? 2 : o.y }, old: o }], { mirror: true });
  },
  remove() {
    const i = S.selOv;
    if (i == null) return;
    const old = ovList()[i];
    commit([{ op: 'delete', path: ovPtr(i), old }], { mirror: true });
    S.selOv = null;
    refreshUi();
    undoToast(t('ux.deletedItem'), () => commit([{ op: 'insert', path: ovPtr(Math.min(i, ovList().length)), value: old }]));
  },
};

/** Where a point lands: the cover, the every-page layer, or a block it anchors to (mm coordinates). */
function placeAt(clientX, clientY, kind, wMm) {
  const main = mainOf(S.ed);
  const k = mmScale();
  const mr = main.getBoundingClientRect();
  const cover = main.querySelector('.cover');
  const cr = cover.getBoundingClientRect();
  if (kind !== 'every' && clientY >= cr.top && clientY <= cr.bottom) {
    return { mode: 'cover', x: (clientX - cr.left) / k, y: (clientY - cr.top) / k };
  }
  if (kind === 'every') {
    const ev = main.querySelector('.bw-every') || cover;
    const er = ev === cover ? { left: mr.left, top: cr.bottom } : ev.getBoundingClientRect();
    return { mode: 'every', x: (clientX - er.left) / k, y: Math.max(0, (clientY - er.top) / k) };
  }
  // anchor: the block under the point (probed in the page column), else the nearest one above
  const blocks = [...main.querySelectorAll('.wrap [data-b]')];
  let best = null;
  for (const el of blocks) {
    const r = el.getBoundingClientRect();
    if (r.top <= clientY + 1) best = el; else break;
  }
  best = best || blocks[0];
  const ptr = blockOf(best.dataset.b)?.ptr || best.dataset.b;
  const anchorEl = main.querySelector(`.bw-anchor[data-anchor="${CSS.escape(ptr)}"]`) || best;
  const ar = anchorEl.getBoundingClientRect();
  const wrap = main.querySelector('.wrap').getBoundingClientRect();
  const padL = parseFloat(getComputedStyle(main.querySelector('.wrap')).paddingLeft) || 16 * k;
  const colLeft = viewsActive() ? best.getBoundingClientRect().left : wrap.left + padL;
  return { mode: 'anchor', anchor: ptr, x: (clientX - colLeft) / k, y: (clientY - ar.top) / k, _anchorEl: !!main.querySelector(`.bw-anchor[data-anchor="${CSS.escape(ptr)}"]`) };
}
/** The text column's width in mm (the printable width an anchored object may use), 0 if unknown. */
function colMm(main) {
  const w = main?.querySelector('.wrap');
  if (!w) return 0;
  const cs = getComputedStyle(w);
  return (w.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0)) / mmScale();
}
function snapMm(p, wMm) {
  if (!S.snap) return { p, guides: [] };
  const guides = [];
  const xs = p.mode === 'anchor' ? [0, 89 - wMm / 2, 178 - wMm] : [16, 105 - wMm / 2, 194 - wMm];
  for (const gx of xs) if (Math.abs(p.x - gx) < 3) { p.x = gx; guides.push(['x', gx]); break; }
  p.y = Math.round(p.y / 2.5) * 2.5;
  return { p, guides };
}
function showGuides(main, guides, base) {
  main.querySelectorAll('.bw-guide').forEach((g) => g.remove());
  for (const [axis, v] of guides) {
    const g = document.createElement('div');
    g.className = `bw-guide ${axis}`;
    g.style.setProperty('--at', `${(base + v) * mmScale()}px`);
    main.appendChild(g);
  }
}

/** Move (body) and resize (corner handle) on pointer events; one commit on release, corrected to the drop point. */
function startOvDrag(e, el, resize, dir = 1) {
  const i = +el.dataset.i;
  const o = ovList()[i];
  if (!o) return;
  guard('drag', { i, resize });
  e.preventDefault();
  try { el.setPointerCapture(e.pointerId); } catch { /* a synthetic pointer: the window listeners below still track it */ }
  el.focus({ preventScroll: true }); // pressing a logo focuses it, so the arrow keys nudge it at once
  if (S.dg) { dgClear(); dgPaint(); } // a logo picked: the arrow keys and tools are the logo's, not a diagram's
  S.selOv = i; S.sel = null; paintSel(); refreshUi();
  const k = mmScale();
  // the page may be zoomed (Zoom, a paged view): a translate inside it is scaled too, so move by screen px / zoom
  const z = k / MM || 1;
  const r0 = el.getBoundingClientRect();
  const sx = e.clientX, sy = e.clientY;
  const main = mainOf(S.ed);
  let last = null;
  el.classList.add('bw-dragging');
  const move = (ev) => {
    const dx = ev.clientX - sx, dy = ev.clientY - sy;
    if (resize) {
      // review2 · extra 10: the handle sits bottom-right in both directions (the box grows rightwards from its left edge);
      // a text box keeps room for its words (20 mm), a picture 6 mm
      const w = Math.max(o.kind === 'text' ? 20 : 6, Math.min(200, o.w + dir * dx / k));
      el.style.width = `${w}mm`;
      last = { w };
    } else {
      el.style.transform = `translate(${dx / z}px, ${dy / z}px)`;
      const target = placeAt(r0.left + dx, r0.top + dy, o.mode === 'every' ? 'every' : o.kind, o.w);
      const { p, guides } = snapMm(target, o.w);
      showGuides(main, guides.map((g) => [g[0], g[1]]), p.mode === 'anchor' ? 16 : 0);
      last = { p, dx, dy };
    }
  };
  const up = (ev) => {
    if (ev?.pointerId != null && ev.pointerId !== e.pointerId) return;
    window.removeEventListener('pointermove', move, true);
    window.removeEventListener('pointerup', up, true);
    window.removeEventListener('pointercancel', up, true);
    el.classList.remove('bw-dragging');
    main.querySelectorAll('.bw-guide').forEach((g) => g.remove());
    if (!last) { el.style.transform = ''; return; }
    if (resize) { commit([{ op: 'replace', path: `${ovPtr(i)}/w`, value: +last.w.toFixed(1), old: o.w }]); return; }
    const p = last.p;
    // review2 · extra 10: an anchored object stays inside the text column (it never lands past the page margin)
    const colW = p.mode === 'anchor' ? colMm(main) : 0;
    const clampX = (x) => (colW ? Math.max(0, Math.min(colW - o.w, x)) : x);
    p.x = clampX(p.x);
    const next = { ...o, mode: p.mode, x: +p.x.toFixed(1), y: +p.y.toFixed(1) };
    if (p.mode === 'anchor') next.anchor = p.anchor; else delete next.anchor;
    const group = newGroup();
    commit([{ op: 'replace', path: ovPtr(i), value: next, old: o }], { group, mirror: false });
    // the anchor box only exists once something is anchored there: measure it and land exactly on the drop point
    if (p.mode === 'anchor') {
      const box = mainOf(S.ed).querySelector(`.bw-ov[data-i="${i}"]`);
      if (box) {
        const br = box.getBoundingClientRect();
        const ddy = (r0.top + last.dy - br.top) / mmScale();
        const ddx = (r0.left + last.dx - br.left) / mmScale();
        if (Math.abs(ddy) > 0.3 || Math.abs(ddx) > 0.3) {
          const fixed = { ...next, x: +clampX(next.x + ddx).toFixed(1), y: +(next.y + ddy).toFixed(1) };
          applyOp(cur().doc, { op: 'replace', path: ovPtr(i), value: fixed });
          cur().ops.at(-1).value = fixed;
          render();
        }
      }
    }
  };
  // window listeners: a drag survives a lost capture or the pointer leaving the logo; cancel ends it where it is
  window.addEventListener('pointermove', move, true);
  window.addEventListener('pointerup', up, true);
  window.addEventListener('pointercancel', up, true);
}
function decorateOverlays(main) {
  // DOCS-08: a square-wrap (floated) picture or box has the same corner handle as a free one and resizes by drag;
  // it sits at the corner that stays still while the width changes (right edge for a box floated left, left edge for one floated right)
  main.querySelectorAll('.bw-ovf').forEach((el) => {
    let h = el.querySelector(':scope > .bw-ov-handle');
    if (!h) {
      h = document.createElement('span');
      h.className = 'bw-ov-handle';
      h.setAttribute('aria-hidden', 'true');
      el.appendChild(h);
    }
    const right = getComputedStyle(el).float === 'right';
    h.dataset.side = right ? 'l' : 'r';
    h.style.cssText = right ? 'left:-7px;right:auto;cursor:nesw-resize' : '';
  });
  main.querySelectorAll('.bw-ov').forEach((el) => {
    el.tabIndex = 0;
    el.setAttribute('role', 'button');
    el.setAttribute('aria-label', t(el.dataset.kind === 'logo' ? 'logoItem' : el.dataset.kind === 'text' ? 'insTextBox' : 'imageItem'));
    if (+el.dataset.i === S.selOv) el.classList.add('bw-ov-sel');
    if (!el.querySelector('.bw-ov-handle')) {
      const h = document.createElement('span');
      h.className = 'bw-ov-handle';
      h.setAttribute('aria-hidden', 'true');
      el.appendChild(h);
    }
    if (el.dataset.kind === 'text' && !el.querySelector('.bw-ov-move')) {
      const g = document.createElement('span');
      g.className = 'bw-ov-move';
      g.title = t('ux.moveBox');
      g.setAttribute('aria-hidden', 'true');
      el.prepend(g);
    }
  });
}
document.addEventListener('pointerdown', (e) => {
  // DOCS-08: only the corner handle of an in-flow (.bw-ovf) object starts a drag (a click on it picks it, see 23-objects.js)
  const fl = e.target.closest?.('#bw-pair .bw-ovf > .bw-ov-handle');
  if (fl && e.button === 0) { startOvDrag(e, fl.parentElement, true, fl.dataset.side === 'l' ? -1 : 1); return; }
  const el = e.target.closest?.('#bw-pair .bw-ov');
  if (!el || e.target.closest('[data-p]')) return;
  startOvDrag(e, el, e.target.classList.contains('bw-ov-handle'));
});
document.addEventListener('keydown', (e) => {
  const el = e.target.closest?.('#bw-pair .bw-ov');
  if (!el) return;
  const i = +el.dataset.i;
  const o = ovList()[i];
  const step = e.shiftKey ? 5 : 1;
  const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
  if (d && o) { e.preventDefault(); commit([{ op: 'replace', path: ovPtr(i), value: { ...o, x: o.x + d[0], y: o.y + d[1] }, old: o }]); mainOf(S.ed)?.querySelector(`.bw-ov[data-i="${i}"]`)?.focus(); }
  if ((e.key === 'Delete' || e.key === 'Backspace') && o) { e.preventDefault(); S.selOv = i; OVL.remove(); }
});
document.addEventListener('focusin', (e) => {
  const el = e.target.closest?.('#bw-pair .bw-ov');
  if (el) { if (S.dg) { dgClear(); dgPaint(); } S.selOv = +el.dataset.i; S.sel = null; paintSel(); refreshUi(); }
});

/* drag-drop and paste of image files: drop = free position at the point, paste = after the block */
document.addEventListener('dragover', (e) => { if ([...(e.dataTransfer?.items || [])].some((x) => x.kind === 'file')) { e.preventDefault(); document.documentElement.classList.add('bw-drop'); } });
document.addEventListener('dragleave', (e) => { if (!e.relatedTarget) document.documentElement.classList.remove('bw-drop'); });
document.addEventListener('drop', async (e) => {
  document.documentElement.classList.remove('bw-drop');
  const f = [...(e.dataTransfer?.files || [])].find((x) => /^image\//.test(x.type));
  if (!f || !e.target.closest?.('#bw-pair main.bw-doc')) return;
  e.preventDefault();
  let img;
  try { img = await reencode(f); } catch { flash(t('badFile'), true); return; }
  const p = placeAt(e.clientX, e.clientY, 'image', 70);
  delete p._anchorEl;
  await OVL.add('image', img, { ...p, w: 70 });
});
async function pasteImage(f) {
  let img;
  try { img = await reencode(f); } catch { flash(t('badFile'), true); return true; }
  await OVL.add('image', img, imageAt(blockOf(S.sel?.b)));
  return true;
}
/** Where an inserted or pasted image goes: beside the selected block (else the first one), text wrapped square. */
function imageAt(b) {
  const ptr = b?.ptr || blocksInOrder(cur().doc)[0]?.ptr;
  return ptr ? { mode: 'anchor', anchor: ptr, x: 0, y: 0, wrap: 'square' } : undefined;
}

/* ── webhooks: off by default, no default URLs, sent only through the local server ── */
const HOOK_EVENTS = ['save', 'export', 'edits.exported', 'import.merged', 'validation.failed'];
const H = (() => {
  try { return JSON.parse(ls.get('bw:hooks') || 'null') || { enabled: false, full: false, urls: [], log: [] }; } catch { return { enabled: false, full: false, urls: [], log: [] }; }
})();
const saveHooks = () => ls.set('bw:hooks', JSON.stringify(H));
function hookPayload(event, extra = {}) {
  const e = cur();
  const ops = liveOps(e);
  return {
    schema: 'bw-webhook', version: 1, event,
    service: S.svc, edition: S.ed, timestamp: new Date().toISOString(),
    summary: {
      changes: ops.length,
      text: ops.filter((o) => o.op === 'setText').length,
      structural: ops.filter((o) => ['move', 'delete', 'insert', 'duplicate'].includes(o.op)).length,
      rejected: e.ops.filter((o) => e.status[o.id] === 'rejected').length,
      ...extra,
    },
    ...(H.full ? { document: e.doc } : {}),
  };
}
async function sendHook(url, payload) {
  const t0 = performance.now();
  try {
    const r = await fetch('/api/webhook', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url, payload }) });
    const j = await r.json().catch(() => ({}));
    return { ok: r.ok && j.ok, status: j.status || r.status, ms: Math.round(performance.now() - t0), error: j.error };
  } catch (err) { return { ok: false, status: 0, ms: Math.round(performance.now() - t0), error: String(err.message || err) }; }
}
async function emitHook(event, extra) {
  if (!H.enabled || !H.urls.length) return;
  if (!location.protocol.startsWith('http')) return; // file:// cannot deliver: the panel explains why
  const payload = hookPayload(event, extra);
  for (const h of H.urls.filter((x) => x.events?.includes(event))) {
    const r = await sendHook(h.url, payload);
    logHook(event, h.url, r);
  }
}
function logHook(event, url, r) {
  let host = url;
  try { host = new URL(url).host; } catch { /* keep the text */ }
  H.log.unshift({ at: new Date().toISOString(), event, host, ok: r.ok, status: r.status, ms: r.ms, error: r.error });
  H.log = H.log.slice(0, 30);
  saveHooks();
  if (S.drawer === 'webhooks') openDrawer('webhooks', true);
}
function hooksPanel() {
  const served = location.protocol.startsWith('http');
  return `<p class="hint">${esc(t(served ? 'hooksHint' : 'hooksNeedServer'))}</p>
<label class="chk"><input type="checkbox" data-hook="enabled" ${H.enabled ? 'checked' : ''} ${served ? '' : 'disabled'}> ${esc(t('hooksEnable'))}</label>
<label class="chk"><input type="checkbox" data-hook="full" ${H.full ? 'checked' : ''}> ${esc(t('hooksFull'))}</label>
<ul class="list hooks">${H.urls.map((h, i) => `<li><span class="path">${esc(h.url)}</span><div class="evs">${HOOK_EVENTS.map((ev) => `<label class="chk"><input type="checkbox" data-hook="ev" data-i="${i}" data-ev="${ev}" ${h.events?.includes(ev) ? 'checked' : ''}> ${esc(t('ev_' + ev))}</label>`).join('')}</div><div class="btns"><button type="button" class="b" data-hk="test" data-i="${i}" ${served ? '' : 'disabled'}><span class="i">${ic('send')}</span><span class="w">${esc(t('hooksTest'))}</span></button><button type="button" class="b" data-hk="del" data-i="${i}"><span class="i">${ic('delete')}</span><span class="w">${esc(t('delete'))}</span></button></div></li>`).join('')}</ul>
<label>${esc(t('hooksUrl'))}<input type="url" data-hook="url" placeholder="https://"></label>
<div class="btns"><button type="button" class="b primary" data-hk="add"><span class="i">${ic('webhooks')}</span><span class="w">${esc(t('hooksAdd'))}</span></button></div>
<h3>${esc(t('hooksLog'))}</h3><ol class="list log">${H.log.map((l) => `<li class="${l.ok ? 'approved' : 'rejected'}"><span class="i">${ic(l.ok ? 'ok' : 'err')}</span> <b>${esc(t('ev_' + l.event) || l.event)}</b> ${esc(l.host)} · ${esc(String(l.status))} · ${l.ms} ms${l.error ? ` · ${esc(l.error)}` : ''}</li>`).join('') || `<li class="hint">${esc(t('hooksNone'))}</li>`}</ol>`;
}
function hooksChange(el) {
  const k = el.dataset.hook;
  if (k === 'enabled') H.enabled = el.checked;
  if (k === 'full') H.full = el.checked;
  if (k === 'ev') {
    const h = H.urls[+el.dataset.i];
    const ev = el.dataset.ev;
    h.events = el.checked ? [...new Set([...(h.events || []), ev])] : (h.events || []).filter((x) => x !== ev);
  }
  saveHooks();
}
async function hooksClick(x) {
  const a = x.dataset.hk;
  if (a === 'add') {
    const v = root.querySelector('.drawer [data-hook="url"]').value.trim();
    let u;
    try { u = new URL(v); } catch { flash(t('hooksBadUrl'), true); return; }
    if (!/^https?:$/.test(u.protocol)) { flash(t('hooksBadUrl'), true); return; }
    H.urls.push({ url: u.href, events: [...HOOK_EVENTS] });
    saveHooks();
    openDrawer('webhooks');
  }
  if (a === 'del') { H.urls.splice(+x.dataset.i, 1); saveHooks(); openDrawer('webhooks'); }
  if (a === 'test') {
    const h = H.urls[+x.dataset.i];
    const r = await sendHook(h.url, hookPayload('test', { test: true }));
    logHook('test', h.url, r);
    toast(r.ok ? t('hooksSent', { s: r.status }) : t('hooksFailed', { s: r.status || r.error }), r.ok ? 'ok' : 'err');
  }
}

/* ── New document wizard: harvest a process model (in the page) or walk the live service (server) ── */
const HL = (ed) => I18N.harvest[ed];
async function sha256Hex(text) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
const inflateRawBrowser = async (bin) => {
  const ds = new DecompressionStream('deflate-raw');
  const buf = await new Response(new Blob([bin]).stream().pipeThrough(ds)).arrayBuffer();
  return [...new Uint8Array(buf)].map((c) => String.fromCharCode(c)).join('');
};
/** A new service from two editions; it opens at once and is saved like any other. */
async function addService(docs) {
  let id = docs.en.service || docs.ar.service || 'service';
  while (M[id]) id = `${id}-2`;
  const editions = {};
  M[id] = {};
  for (const [ed, doc] of Object.entries(docs)) {
    doc.service = id;
    const raw = JSON.stringify(doc, null, 1) + '\n';
    const hash = `sha256:${await sha256Hex(raw)}`;
    const name = doc.control.title.split(/\s*[:—]\s+/).slice(1).join(': ') || doc.control.title;
    editions[ed] = { name, raw, hash, ops: [] };
    M[id][ed] = { base: JSON.parse(raw), raw, hash, name, ops: [], redo: [], status: {}, stale: new Set(), comments: [], versions: [], doc: null };
    rebuild(M[id][ed]);
  }
  DATA.services.push({ id, editions });
  S.svc = id;
  S.sel = null;
  closeDrawer();
  buildUi();
  render(false);
  window.scrollTo(0, 0);
  emit('open', S.svc, S.ed);
  toast(t('newdocDone'), 'ok');
  return id;
}
async function newFromModel(file) {
  busy(true);
  try {
    const text = await readAs(file, 'text');
    const ir = await HV.parseModel(text, { inflateRaw: inflateRawBrowser });
    if (!ir.name || ir.name === 'Process') ir.name = file.name.replace(/\.[^.]+$/, '');
    return await addService({ ar: HV.modelToDocument(ir, { locale: 'ar', L: HL('ar') }), en: HV.modelToDocument(ir, { locale: 'en', L: HL('en') }) });
  } catch (err) { toast(`${t('newdocFailed')} ${err.message || err}`, 'err', { persist: true }); return null; } finally { busy(false); }
}
/** The documented union of a crawl harvest and a process model, in the page: two files, one document. */
async function newFromMerge() {
  const crawlFile = await pickFile('.json,application/json');
  if (!crawlFile) return null;
  const modelFile = await pickFile('.json,.bpmn,.bpmn20.xml,.xml,.drawio,.yaml,.yml');
  if (!modelFile) return null;
  busy(true);
  try {
    const raw = JSON.parse(await readAs(crawlFile, 'text'));
    if (raw.kind !== 'bw-harvest') throw new Error('harvest.json expected first');
    const text = await readAs(modelFile, 'text');
    const ir = /"kind"\s*:\s*"bw-process"/.test(text) ? JSON.parse(text) : await HV.parseModel(text, { inflateRaw: inflateRawBrowser });
    const docs = { ar: HV.mergeToDocument(ir, raw, { locale: 'ar', L: HL('ar') }), en: HV.mergeToDocument(ir, raw, { locale: 'en', L: HL('en') }) };
    const r = await addService(docs);
    for (const [ed, d] of Object.entries(docs)) for (const c of d.harvestConflicts || []) S.conflicts.push({ ed, path: c.path, mine: c.kept, theirs: c.other, kind: 'text' });
    if (S.conflicts.length) toast(t('reharvestConflicts', { n: S.conflicts.length }), 'warn', { actions: [[t('show'), () => openDrawer('conflicts')]], persist: true });
    return r;
  } catch (err) { toast(`${t('newdocFailed')} ${err.message || err}`, 'err', { persist: true }); return null; } finally { busy(false); }
}
async function newFromCrawl(configText) {
  if (!location.protocol.startsWith('http')) { toast(t('crawlNeedServer'), 'warn', { persist: true }); return null; }
  let cfg;
  try { cfg = JSON.parse(configText); } catch { toast(t('crawlBadConfig'), 'err'); return null; }
  busy(true);
  toast(t('crawlRunning'), 'info');
  try {
    const r = await fetch('/api/harvest/crawl', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(cfg) });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || r.status);
    return await addService(j.documents);
  } catch (err) { toast(`${t('newdocFailed')} ${err.message || err}`, 'err', { persist: true }); return null; } finally { busy(false); }
}
const CRAWL_TEMPLATE = JSON.stringify({
  name: 'Service name',
  languages: [{ code: 'ar', startUrl: 'https://example.org/ar/service' }, { code: 'en', startUrl: 'https://example.org/en/service' }],
  openForm: '#start',
  login: { when: '#username', steps: [{ fill: '#username', value: '$env:BW_HARVEST_USER' }, { fill: '#password', value: '$env:BW_HARVEST_PASS' }, { press: 'button[type=submit]' }] },
  pause: [{ selector: '#otp', until: 'gone', message: 'Type the one-time code in the browser' }],
  next: 'button[type=submit]',
  delayMs: 600,
}, null, 2);
function newdocPanel() {
  const served = location.protocol.startsWith('http');
  return `<p class="hint">${esc(t('newdocHint'))}</p>
<section class="card"><h3><span class="i">${ic('process')}</span> ${esc(t('newdocModel'))}</h3><p class="hint">${esc(t('newdocModelHint'))}</p>
<div class="btns"><button type="button" class="b primary" data-k="nd-model"><span class="i">${ic('import')}</span><span class="w">${esc(t('newdocPick'))}</span></button></div></section>
<section class="card"><h3><span class="i">${ic('crawl')}</span> ${esc(t('newdocCrawl'))}</h3><p class="hint">${esc(t(served ? 'newdocCrawlHint' : 'crawlNeedServer'))}</p>
<label>${esc(t('crawlConfig'))}<textarea data-f="crawl" rows="12" spellcheck="false" dir="ltr">${esc(CRAWL_TEMPLATE)}</textarea></label>
<div class="btns"><button type="button" class="b primary" data-k="nd-crawl" ${served ? '' : 'disabled'}><span class="i">${ic('crawl')}</span><span class="w">${esc(t('newdocRun'))}</span></button></div></section>
<section class="card"><h3><span class="i">${ic('connect')}</span> ${esc(t('ndMerge'))}</h3><p class="hint">${esc(t('ndMergeHint'))}</p>
<div class="btns"><button type="button" class="b primary" data-k="nd-merge"><span class="i">${ic('import')}</span><span class="w">${esc(t('ndMergeCrawl'))} + ${esc(t('ndMergeModel'))}</span></button></div></section>`;
}

/* ── Process panel: edit the steps as a flowchart; regenerate the sections from it ── */
function procOf() { return cur().doc.process || null; }
function processPanel() {
  const ir = procOf();
  if (!ir) return `<p class="hint">${esc(t('procNone'))}</p><div class="btns"><button type="button" class="b primary" data-k="pr-new"><span class="i">${ic('add')}</span><span class="w">${esc(t('procStart'))}</span></button></div>`;
  const actorOpts = (sel) => `<option value="">${esc(t('procNoActor'))}</option>` + ir.actors.map((a) => `<option value="${esc(a.id)}" ${a.id === sel ? 'selected' : ''}>${esc(a.name)}</option>`).join('');
  const stepOpts = (sel) => ir.steps.map((s) => `<option value="${esc(s.id)}" ${s.id === sel ? 'selected' : ''}>${esc(s.name || t('kind_' + s.type))}</option>`).join('');
  const kindOf = (s) => t('kind_' + s.type);
  return `<div class="proc-fig" aria-label="${esc(t('procPreview'))}">${DIAGRAM.render(DIAGRAM.fromGraph(HV.humanGraph(ir), { actors: ir.actors, locale: S.ed }), { theme: S.theme, locale: S.ed })}</div>
<h3>${esc(t('procActors'))}</h3><ul class="list">${ir.actors.map((a, i) => `<li><input type="text" data-pr="actor" data-i="${i}" value="${esc(a.names?.[S.ed] || a.name)}" aria-label="${esc(t('procActorName'))}${a.unresolved ? `: ${esc(t('procUnresolved'))}` : ''}"${a.unresolved ? ' aria-invalid="true"' : ''}>${a.unresolved ? ` <small class="warn">${esc(t('procUnresolved'))}: <code>${esc(a.raw || '')}</code></small>` : ''}</li>`).join('')}</ul>
<div class="btns"><button type="button" class="b" data-k="pr-actor"><span class="i">${ic('add')}</span><span class="w">${esc(t('procAddActor'))}</span></button></div>
<h3>${esc(t('procSteps'))}</h3><ul class="list">${ir.steps.filter((s) => ['task', 'decision', 'end', 'start', 'system'].includes(s.type)).map((s) => { const i = ir.steps.indexOf(s); return `<li><span class="badge">${esc(kindOf(s))}</span> <input type="text" data-pr="name" data-i="${i}" value="${esc(s.name)}" aria-label="${esc(t('procStepName'))}"> ${['task', 'decision'].includes(s.type) ? `<select data-pr="actorOf" data-i="${i}" aria-label="${esc(t('colActorUi'))}">${actorOpts(s.actor)}</select>` : ''} <button type="button" data-pr-del="${i}" aria-label="${esc(t('delete'))}">${ic('close')}</button></li>`; }).join('')}</ul>
<div class="btns"><button type="button" class="b" data-k="pr-step"><span class="i">${ic('add')}</span><span class="w">${esc(t('procAddStep'))}</span></button><button type="button" class="b" data-k="pr-decision"><span class="i">${ic('add')}</span><span class="w">${esc(t('procAddDecision'))}</span></button><button type="button" class="b" data-k="pr-end"><span class="i">${ic('add')}</span><span class="w">${esc(t('procAddEnd'))}</span></button></div>
<h3>${esc(t('procConnect'))}</h3><ul class="list">${ir.flows.map((f, i) => `<li>${esc(ir.steps.find((s) => s.id === f.from)?.name || f.from)} → ${esc(ir.steps.find((s) => s.id === f.to)?.name || f.to)}${f.label ? ` (${esc(f.label)})` : ''} <button type="button" data-pr-unlink="${i}" aria-label="${esc(t('delete'))}">${ic('close')}</button></li>`).join('')}</ul>
<div class="row3"><label>${esc(t('procFrom'))}<select data-f="pr-from">${stepOpts()}</select></label><label>${esc(t('procTo'))}<select data-f="pr-to">${stepOpts()}</select></label><label>${esc(t('procLabel'))}<input type="text" data-f="pr-label"></label></div>
<div class="btns"><button type="button" class="b" data-k="pr-link"><span class="i">${ic('connect')}</span><span class="w">${esc(t('procLink'))}</span></button></div>
<div class="btns"><button type="button" class="b primary" data-k="pr-regen"><span class="i">${ic('replace')}</span><span class="w">${esc(t('procRegen'))}</span></button></div><p class="hint">${esc(t('procRegenHint'))}</p>`;
}
/** Process edits are ordinary ops on /process, mirrored to the other edition. */
function setProcess(next) {
  const old = procOf();
  commit([{ op: 'replace', path: '/process', value: next, old }], { mirror: true, rerender: false });
  openDrawer('process');
}
async function processClick(x) {
  const ir = procOf() ? JSON.parse(JSON.stringify(procOf())) : null;
  const k = x.dataset.k;
  const nid = (p) => `${p}${Date.now().toString(36)}${Math.floor(Math.random() * 99)}`;
  if (k === 'pr-new') {
    const fresh = { kind: 'bw-process', version: 1, name: cur().doc.control.title.split(/\s*[:—]\s+/).slice(1).join(': ') || cur().doc.control.title, source: 'editor', actors: [{ id: 'a1', name: t('procFirstActor') }], steps: [{ id: 'start', type: 'start', name: '' }, { id: 's1', type: 'task', name: t('procFirstStep'), actor: 'a1' }, { id: 'end1', type: 'end', name: t('procFirstEnd') }], flows: [{ from: 'start', to: 's1' }, { from: 's1', to: 'end1' }] };
    commit([{ op: 'replace', path: '/process', value: fresh, old: undefined }], { mirror: true, rerender: false });
    openDrawer('process');
    return true;
  }
  if (!ir) return false;
  if (k === 'pr-actor') { ir.actors.push({ id: nid('a'), name: t('procNewActor') }); setProcess(ir); return true; }
  if (k === 'pr-step' || k === 'pr-decision' || k === 'pr-end') {
    const type = { 'pr-step': 'task', 'pr-decision': 'decision', 'pr-end': 'end' }[k];
    ir.steps.push({ id: nid(type[0]), type, name: t({ task: 'procNewStep', decision: 'procNewDecision', end: 'procNewEnd' }[type]), actor: type === 'end' ? undefined : ir.actors[0]?.id });
    setProcess(ir);
    return true;
  }
  if (x.dataset.prDel !== undefined) { const s = ir.steps[+x.dataset.prDel]; ir.steps.splice(+x.dataset.prDel, 1); ir.flows = ir.flows.filter((f) => f.from !== s.id && f.to !== s.id); setProcess(ir); return true; }
  if (x.dataset.prUnlink !== undefined) { ir.flows.splice(+x.dataset.prUnlink, 1); setProcess(ir); return true; }
  if (k === 'pr-link') {
    const d = root.querySelector('.drawer');
    const from = d.querySelector('[data-f="pr-from"]').value, to = d.querySelector('[data-f="pr-to"]').value, label = d.querySelector('[data-f="pr-label"]').value.trim();
    if (!from || !to || from === to) return true;
    ir.flows.push({ from, to, ...(label ? { label } : {}) });
    setProcess(ir);
    return true;
  }
  if (k === 'pr-regen') {
    // the sections that come from the process are rebuilt in both editions; control data, revisions and logos stay
    for (const ed of Object.keys(M[S.svc])) {
      const e = cur(ed);
      const gen = HV.modelToDocument(e.doc.process || ir, { locale: ed, L: HL(ed) });
      commit([{ op: 'replace', path: '/chapters', value: gen.chapters, old: e.doc.chapters }, { op: 'replace', path: '/openQuestions', value: gen.openQuestions, old: e.doc.openQuestions }], { ed, rerender: false });
    }
    render();
    toast(t('procRegenDone'), 'ok');
    return true;
  }
  return false;
}
function processChange(el) {
  const ir = JSON.parse(JSON.stringify(procOf()));
  const i = +el.dataset.i;
  if (el.dataset.pr === 'actor') { const a = ir.actors[i]; a.name = el.value; if (a.names) a.names = { ...a.names, [S.ed]: el.value }; delete a.unresolved; }
  if (el.dataset.pr === 'name') ir.steps[i].name = el.value;
  if (el.dataset.pr === 'actorOf') ir.steps[i].actor = el.value || undefined;
  setProcess(ir);
}
