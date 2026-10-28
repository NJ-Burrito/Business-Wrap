/* Local learning (hidden). Concatenated LAST into the editor IIFE (engine/build-editor.mjs), so it
 * wraps the editor's own functions in place: commit, setText, undo, redo, A.comment, the exports and
 * render. Every edit, note, export and undo becomes one redacted event: POSTed to the local server
 * (/api/learning/events → .local/learning/journal.jsonl) or, from file://, buffered in this
 * browser's IndexedDB until a server or an export takes it. Nothing here is written into the
 * document, Save HTML, the PDF, the DOCX, the design pack or a webhook. No toolbar button: Ctrl+K
 * «التعلّم المحلي» opens the panel; window.BW_LEARNING.mount(el) puts it in a Settings page.
 */
const LRN_STR = {
  ar: { learning: 'التعلّم المحلي', 'explain.learning': 'ما يتعلّمه المساعد من تعديلاتك وملاحظاتك وتصديراتك؛ يبقى على جهازك فقط.', lrnPrivacy: 'يبقى على جهازك فقط: لا يُرسل إلى أي مكان، ولا يدخل الوثيقة ولا ملفات التصدير.', lrnOn: 'التعلّم مفعّل', lrnEvents: 'أحداث', lrnLessons: 'دروس', lrnRules: 'قواعد', lrnBuffered: 'محفوظة في المتصفح بانتظار الخادم', lrnView: 'اعرض القواعد', lrnExport: 'صدّر', lrnImport: 'استورد', lrnForget: 'امسح كل ما تعلّمته', lrnForgetSure: 'سيُمسح كل ما تعلّمه المساعد على هذا الجهاز. متأكد؟', lrnForgetYes: 'نعم، امسح', lrnApplied: 'مطبّق من التعلّم', lrnUndoHint: 'Alt+نقرة للتراجع', lrnNoServer: 'القواعد تُعرض عبر الخادم المحلي (npm run serve) أو npm run learn -- rules.', lrnDone: 'تم' },
  en: { learning: 'Local learning', 'explain.learning': 'What the assistant learns from your edits, notes and exports; it stays on this machine only.', lrnPrivacy: 'Stays on this machine only: never sent anywhere, never written into the document or an export.', lrnOn: 'Learning on', lrnEvents: 'events', lrnLessons: 'lessons', lrnRules: 'rules', lrnBuffered: 'kept in this browser until the server is running', lrnView: 'View rules', lrnExport: 'Export', lrnImport: 'Import', lrnForget: 'Forget everything learned', lrnForgetSure: 'Everything the assistant learned on this machine will be wiped. Sure?', lrnForgetYes: 'Yes, wipe it', lrnApplied: 'Applied from learning', lrnUndoHint: 'Alt+click to undo', lrnNoServer: 'Rules show through the local server (npm run serve) or npm run learn -- rules.', lrnDone: 'Done' },
};
for (const l of ['ar', 'en']) Object.assign(I18N.ui[l], LRN_STR[l]);
CMDS.push({ id: 'learning', group: 'document' });

const LRN = (() => {
  const HTTP = location.protocol.startsWith('http');
  const on = () => ls.get('bw:learning') !== '0';
  let queue = [];
  let timer = 0;
  let seq = 0;
  let inText = false;
  let pend = null;
  let pendTimer = 0;
  const byRef = new Map(); // op id → the events it produced (a redo records them again)
  const reverted = new Set(); // learned marks the person undid in this session
  const post = (p, body) => fetch(`/api/learning/${p}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

  /* IndexedDB buffer (file://, or the server is down) */
  const db = () => new Promise((res, rej) => {
    const r = indexedDB.open('bw-learning', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('events', { keyPath: 'id' });
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  const tx = async (mode, fn) => { const d = await db(); return new Promise((res, rej) => { const t2 = d.transaction('events', mode); const st = t2.objectStore('events'); const out = fn(st); t2.oncomplete = () => { d.close(); res(out.result ?? out); }; t2.onerror = () => { d.close(); rej(t2.error); }; }); };
  const idbPut = (evs) => tx('readwrite', (st) => { evs.forEach((e) => st.put(e)); return {}; });
  const idbAll = () => tx('readonly', (st) => st.getAll());
  const idbClear = () => tx('readwrite', (st) => st.clear());

  async function flush() {
    clearTimeout(timer);
    const batch = queue;
    queue = [];
    if (!batch.length) return;
    if (HTTP) { try { if ((await post('events', { events: batch })).ok) return; } catch { /* server gone: buffer */ } }
    try { await idbPut(batch); } catch { /* no storage: the events are dropped, never written elsewhere */ }
  }
  async function drain() {
    if (!HTTP) return;
    try { const evs = await idbAll(); if (evs.length && (await post('events', { events: evs })).ok) await idbClear(); } catch { /* try again next load */ }
  }

  function record(ev, ed = S.ed) {
    if (!on()) return null;
    const d = cur(ed).doc;
    const note = ev.note ?? cur(ed).comments.filter((c) => ev.path && (ev.path === c.path || ev.path.startsWith(c.path + '/'))).at(-1)?.text;
    const e = LEARN.redact({
      id: `e${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      at: new Date().toISOString(), service: S.svc, serviceType: d.control?.documentType || '', locale: ed,
      ...(ev.path ? { field: LEARN.fieldKind(d, ev.path), section: LEARN.sectionOf(d, ev.path) } : {}),
      ...ev, ...(note ? { note } : {}),
    });
    queue.push(e);
    clearTimeout(timer);
    timer = setTimeout(flush, 300);
    if (e.ref) { if (!byRef.has(e.ref)) byRef.set(e.ref, []); byRef.get(e.ref).push(e); }
    return e;
  }
  const esc2 = (k) => String(k).replace(/~/g, '~0').replace(/\//g, '~1');
  function originOf(e, path, ref) {
    if ((e.doc.learned || []).some((x) => x.path === path) && !reverted.has(path)) return 'learned';
    if (e.doc.manual?.[esc2(path)] || e.ops.some((o) => o.path === path && o.id !== ref && !String(o.id).startsWith(ref?.split('.')[0] + '.'))) return 'manual';
    return e.doc.harvest ? 'harvested' : 'generated';
  }

  /* one op → events: design and diagram replacements are split into the leaves that changed */
  function leaves(v, p, out) {
    if (v && typeof v === 'object' && !Array.isArray(v)) { for (const [k, x] of Object.entries(v)) leaves(x, `${p}/${esc2(k)}`, out); } else out.set(p, v);
    return out;
  }
  function expand(op, before, e) {
    const base = { kind: 'edit', op: op.op, ref: op.id, origin: originOf(e, op.path, op.id) };
    if (/^\/design$/.test(op.path)) {
      const a = leaves(before, '/design', new Map());
      const b = leaves(op.value, '/design', new Map());
      return [...new Set([...a.keys(), ...b.keys()])].filter((k) => JSON.stringify(a.get(k)) !== JSON.stringify(b.get(k)))
        .map((k) => ({ ...base, op: 'replace', path: k, before: LEARN.brief(a.get(k) ?? null), after: LEARN.brief(b.get(k) ?? null) }));
    }
    if (/\/model$/.test(op.path) && before?.nodes && op.value?.nodes) {
      const out = [];
      const old = new Map(before.nodes.map((n, i) => [n.id, [n, i]]));
      const now = new Map(op.value.nodes.map((n, i) => [n.id, [n, i]]));
      for (const [id, [n, i]] of old) if (!now.has(id)) out.push({ ...base, op: 'delete', path: `${op.path}/nodes/${i}`, before: LEARN.brief(n.label ?? ''), after: null, meta: { nodeKind: n.kind } });
      for (const [id, [n, i]] of now) {
        const o = old.get(id)?.[0];
        if (!o) out.push({ ...base, op: 'insert', path: `${op.path}/nodes/${i}`, before: null, after: LEARN.brief(n.label ?? ''), meta: { nodeKind: n.kind } });
        else for (const f of ['label', 'sub']) if ((o[f] ?? '') !== (n[f] ?? '')) out.push({ ...base, op: 'replace', path: `${op.path}/nodes/${i}/${f}`, before: o[f] ?? '', after: n[f] ?? '' });
      }
      return out;
    }
    return [{ ...base, path: op.path, ...(op.from ? { meta: { from: op.from } } : {}), before: LEARN.brief(before ?? null), after: op.op === 'delete' ? null : LEARN.brief(op.op === 'move' || op.op === 'duplicate' ? get(e.doc, op.path) : op.value) }];
  }

  const _commit = commit;
  commit = function (ops, opts = {}) {
    const ed = opts.ed || S.ed;
    const e = cur(ed);
    const before = ops.map((op) => (op.op === 'insert' ? undefined : get(e.doc, op.op === 'move' ? op.from : op.path)));
    const r = _commit(ops, opts);
    if (!inText) ops.forEach((op, i) => { if (!/^\/manual(\/|$)/.test(op.path)) for (const ev of expand(op, op.op === 'replace' ? (op.old ?? before[i]) : before[i], e)) record(ev, ed); });
    return r;
  };

  function flushText() {
    clearTimeout(pendTimer);
    const p = pend;
    pend = null;
    if (p && p.before !== p.after) record({ kind: 'edit', op: 'setText', path: p.path, before: LEARN.brief(p.before ?? ''), after: LEARN.brief(p.after), origin: p.origin, ref: p.ref, ...(p.rule ? { rule: p.rule } : {}) }, p.ed);
  }
  const _setText = setText;
  setText = function (path, value, ed = S.ed, extra = {}) {
    const e = cur(ed);
    const before = get(e.doc, path) ?? (path.startsWith('/labels/') ? get(labelsOf(ed), path.slice(7)) : undefined);
    const origin = originOf(e, path, null);
    inText = true;
    try { _setText(path, value, ed); } finally { inText = false; }
    const ref = e.ops.at(-1)?.id;
    if (!ref) return;
    if (!pend || pend.path !== path || pend.ed !== ed || pend.ref !== ref) {
      flushText();
      pend = { path, ed, before, ref, origin, ...extra };
    }
    pend.after = value;
    pendTimer = setTimeout(flushText, 1200);
  };

  const _undo = undo;
  undo = function (ed = S.ed) {
    flushText();
    const e = cur(ed);
    const last = e.ops.at(-1);
    if (!last) return _undo(ed);
    const g = last.id.split('.')[0];
    const refs = e.ops.filter((o) => o.id.split('.')[0] === g).map((o) => o.id);
    const r = _undo(ed);
    record({ kind: 'revert', refs, op: last.op, path: last.path, before: LEARN.brief(last.value ?? null), after: LEARN.brief(last.old ?? null), origin: (byRef.get(last.id) || [])[0]?.origin || 'manual' }, ed);
    return r;
  };
  const _redo = redo;
  redo = function (ed = S.ed) {
    const grp = cur(ed).redo.at(-1) || [];
    const r = _redo(ed);
    for (const op of grp) for (const ev of byRef.get(op.id) || []) { const { id, at, ...rest } = ev; record({ ...rest, redo: true }, ed); }
    return r;
  };

  const _comment = A.comment;
  A.comment = async function () {
    const e = cur();
    const n = e.comments.length;
    await _comment.call(A);
    for (const c of e.comments.slice(n)) record({ kind: 'note', path: c.path, note: c.text });
  };

  const exp = (format) => {
    flushText();
    const e = cur();
    record({ kind: 'export', format, accepted: liveOps(e).map((o) => o.id).slice(-2000), meta: { ops: liveOps(e).length, comments: e.comments.length } });
  };
  const _pdf = exportPdfDocx;
  exportPdfDocx = async function (...a) { exp('pdf+docx'); return _pdf(...a); };
  const _html = saveHtml;
  saveHtml = async function (...a) { exp('html'); return _html(...a); };
  window.addEventListener('beforeprint', () => exp('print'));
  const _run = runAction;
  runAction = async function (a) {
    if (a === 'learning') { openPanel(); return; }
    if (a === 'exportEdits' || a === 'exportAll' || a === 'save') exp(a === 'save' ? 'edits' : a);
    return _run(a);
  };

  /* «مطبّق من التعلّم»: a learned change is marked on hover; Alt+click undoes it (and teaches the reversal) */
  function mark() {
    const main = mainOf(S.ed);
    if (!main) return;
    for (const x of cur().doc.learned || []) {
      if (reverted.has(x.path)) continue;
      const el = main.querySelector(`[data-p="${CSS.escape(x.path)}"]`) || main.querySelector(`[data-b="${CSS.escape(x.path.replace(/\/model$/, ''))}"]`);
      if (!el) continue;
      el.classList.add('bw-learned');
      el.dataset.bwRule = x.rule;
      el.title = `${t('lrnApplied')}: ${x.from ?? ''} → ${x.to ?? ''} (${t('lrnUndoHint')})`;
    }
  }
  const _render = render;
  render = function (...a) { const r = _render(...a); mark(); return r; };
  document.addEventListener('click', (ev) => {
    if (!ev.altKey) return;
    const el = ev.target.closest?.('.bw-learned');
    const x = el && (cur().doc.learned || []).find((y) => y.rule === el.dataset.bwRule && (el.dataset.p === y.path || el.dataset.b === y.path.replace(/\/model$/, '')));
    if (!x || typeof x.from !== 'string' || typeof x.to !== 'string') return;
    ev.preventDefault();
    ev.stopPropagation();
    const now = get(cur().doc, x.path);
    if (typeof now !== 'string') return;
    setText(x.path, now.split(x.to).join(x.from), S.ed, { rule: x.rule });
    flushText();
    reverted.add(x.path);
    el.classList.remove('bw-learned');
    el.removeAttribute('title');
    render();
  }, true);

  /* the panel: «التعلّم المحلي» — on/off, counts, rules, export/import, forget */
  async function stats() {
    let srv = null;
    if (HTTP) { try { srv = await (await fetch('/api/learning/status')).json(); } catch { /* no server */ } }
    let buffered = 0;
    try { buffered = (await idbAll()).length; } catch { /* no storage */ }
    return { srv, buffered };
  }
  async function panelHtml() {
    const { srv, buffered } = await stats();
    const n = (k, v) => `<span><b>${v}</b> ${esc(t(k))}</span>`;
    return `<section class="bw-learning" dir="${S.ui === 'ar' ? 'rtl' : 'ltr'}" lang="${S.ui}"><h2>${esc(t('learning'))}</h2>
<p class="hint">${esc(t('lrnPrivacy'))}</p>
<label><input type="checkbox" data-lrn="toggle" ${on() ? 'checked' : ''}> ${esc(t('lrnOn'))}</label>
<p class="counts">${srv ? [n('lrnEvents', srv.events), n('lrnLessons', srv.lessons), n('lrnRules', srv.promoted)].join(' · ') : ''}${buffered ? ` <span>${buffered} ${esc(t('lrnBuffered'))}</span>` : ''}</p>
<div class="btns"><button type="button" class="b" data-lrn="rules"><span class="w">${esc(t('lrnView'))}</span></button><button type="button" class="b" data-lrn="export"><span class="w">${esc(t('lrnExport'))}</span></button><button type="button" class="b" data-lrn="import"><span class="w">${esc(t('lrnImport'))}</span></button><button type="button" class="b" data-lrn="forget"><span class="w">${esc(t('lrnForget'))}</span></button></div>
<pre class="out" data-lrn-out dir="auto" hidden></pre></section>`;
  }
  async function onPanel(el, ev) {
    const k = ev.target.closest('[data-lrn]')?.dataset.lrn;
    if (!k || (k === 'toggle') !== (ev.type === 'change')) return;
    const out = el.querySelector('[data-lrn-out]');
    const show = (s) => { out.hidden = false; out.textContent = s; };
    if (k === 'toggle') {
      ls.set('bw:learning', ev.target.checked ? '1' : '0');
      if (HTTP) { try { await post('settings', { enabled: ev.target.checked }); } catch { /* the browser switch still holds */ } }
    } else if (k === 'rules') {
      if (!HTTP) return show(t('lrnNoServer'));
      try { show((await (await fetch('/api/learning/rules')).json()).markdown); } catch (err) { show(String(err.message || err)); }
    } else if (k === 'export') {
      await flush();
      let b = { kind: 'bw-learning', version: 1, exportedAt: new Date().toISOString(), events: [], lessons: [] };
      if (HTTP) { try { b = await (await fetch('/api/learning/export')).json(); } catch { /* buffer only */ } }
      try { b.events = [...b.events, ...(await idbAll())]; } catch { /* no storage */ }
      download('bw-learning.json', JSON.stringify(b, null, 1));
    } else if (k === 'import') {
      const f = await pickFile('.json,application/json');
      if (!f) return;
      try {
        const b = JSON.parse(await f.text());
        if (b.kind !== 'bw-learning') throw new Error('not a bw-learning file');
        if (HTTP && (await post('import', b)).ok) show(t('lrnDone'));
        else { await idbPut((b.events || []).map(LEARN.redact)); show(t('lrnDone')); }
      } catch (err) { show(String(err.message || err)); }
    } else if (k === 'forget') {
      if (!el.querySelector('[data-lrn="forget-yes"]')) {
        ev.target.closest('.btns').insertAdjacentHTML('afterend', `<p class="warn" role="alert">${esc(t('lrnForgetSure'))} <button type="button" class="b" data-lrn="forget-yes"><span class="w">${esc(t('lrnForgetYes'))}</span></button></p>`);
        return;
      }
    } else if (k === 'forget-yes') {
      queue = [];
      try { await idbClear(); } catch { /* nothing kept */ }
      if (HTTP) { try { await post('forget', { confirm: true }); } catch { /* server gone */ } }
      el.querySelector('[role="alert"]')?.remove();
      show(t('lrnDone'));
    }
    if (k !== 'rules' && k !== 'import' && k !== 'export' && k !== 'forget') { const keep = out.textContent; el.innerHTML = await panelHtml(); if (keep) { const o2 = el.querySelector('[data-lrn-out]'); o2.hidden = false; o2.textContent = keep; } }
  }
  /** Settings mounts the section here (the upd branch's page): BW_LEARNING.mount(container). */
  async function mount(el) {
    el.innerHTML = await panelHtml();
    if (!el.dataset.lrnWired) { el.addEventListener('click', (ev) => onPanel(el, ev)); el.addEventListener('change', (ev) => onPanel(el, ev)); el.dataset.lrnWired = '1'; }
    return el;
  }
  async function openPanel() {
    const d = root.querySelector('.dialog');
    d.hidden = false;
    d.setAttribute('aria-label', t('learning'));
    d.innerHTML = `<div data-lrn-host></div><div class="btns"><button type="button" class="b" data-k="close-lrn"><span class="w">${esc(t('close'))}</span></button></div>`;
    d.onclick = (e) => { if (e.target.closest('[data-k="close-lrn"]')) d.hidden = true; };
    d.onkeydown = (e) => { if (e.key === 'Escape') d.hidden = true; };
    await mount(d.querySelector('[data-lrn-host]'));
    d.querySelector('input, button')?.focus();
  }

  for (const k of ['commit', 'setText', 'undo', 'redo', 'render', 'saveHtml', 'runAction']) window.BW[k] = { commit, setText, undo, redo, render, saveHtml, runAction }[k];
  window.addEventListener('pagehide', () => { flushText(); flush(); });
  drain();
  mark();
  return { mount, open: openPanel, flush: async () => { flushText(); await flush(); }, pending: () => queue.length, buffered: () => idbAll().catch(() => []) };
})();
window.BW_LEARNING = LRN;
