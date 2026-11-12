/* Sources tab (owner request 2026-11-12; plan docs/research/sources-tab/PLAN.md). A «Documents · Sources» switch under the start page's title.
 * Sources: add any source (a meeting recording, a screen recording, a document, a web page, an image, an Android app, a tool or skill folder),
 * watch every stage run (pause, resume, stop; several sources at once, one recording at a time), then review each stage's preview:
 * the readable text (fix a word, a speaker, drop a noisy line) and the candidate facts (accept, reject, edit) before any of it reaches a document.
 * The host does the work (engine/routes/sources.mjs → engine/sources/jobs.mjs); everything stays in the local save folder. A file:// page has no host
 * and says so. Contract: <html data-bw-sources="docs|sources">, section [data-src] inside .st-main. */
const SOURCES = (() => {
  const html = document.documentElement;
  const served = () => /^https?:$/.test(location.protocol);
  const dlg = () => root.querySelector('dialog.bw-start');
  const st = { view: 'docs', jobs: [], open: null, prev: null, tab: 'lines', timer: 0 };
  const LIVE = /^(running|queued|paused)$/;
  const api = async (p, body, raw) => {
    const r = await fetch(`/api/sources${p}`, body === undefined ? { cache: 'no-store' } : { method: 'POST', ...(raw ? { body } : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || r.status);
    return j;
  };
  const say = (m) => { const l = dlg()?.querySelector('[data-st-live]'); if (l) l.textContent = m; };
  const fail = (e) => toast(t('src.failed', { r: String(e?.message || e).slice(0, 200) }), 'err');

  function mount() {
    const d = dlg();
    if (!d || d.querySelector('[data-src-switch]')) return;
    const hl = d.querySelector('.st-hl'), main = d.querySelector('.st-main');
    if (!hl || !main) return;
    hl.insertAdjacentHTML('beforeend', `<div class="st-seg src-switch" role="radiogroup" data-src-switch aria-label="${esc(t('src.switch'))}">
<button type="button" role="radio" data-src-v="docs">${esc(t('src.docs'))}</button><button type="button" role="radio" data-src-v="sources">${esc(t('src.sources'))}</button></div>`);
    main.insertAdjacentHTML('beforeend', '<section class="src" data-src hidden></section>');
    d.addEventListener('click', onClick);
    d.addEventListener('change', onChange);
    d.addEventListener('dragover', (e) => { if (st.view === 'sources' && e.target.closest?.('[data-src]')) e.preventDefault(); });
    d.addEventListener('drop', (e) => { if (st.view !== 'sources' || !e.target.closest?.('[data-src]')) return; e.preventDefault(); e.stopPropagation(); upload([...(e.dataTransfer?.files || [])]); }, true);
    show(st.view);
  }
  function show(v) {
    st.view = v; html.dataset.bwSources = v;
    const d = dlg(); if (!d) return;
    d.dataset.srcView = v;
    for (const b of d.querySelectorAll('[data-src-v]')) b.setAttribute('aria-checked', String(b.dataset.srcV === v));
    d.querySelector('[data-src]').hidden = v !== 'sources';
    if (v === 'sources') refresh(); else clearTimeout(st.timer);
  }

  /* ── data ── */
  async function refresh() {
    clearTimeout(st.timer);
    if (st.view !== 'sources' || !dlg()) return;
    if (!served()) { draw(); return; }
    try {
      st.jobs = (await api('')).jobs;
      if (st.open) { const j = await api(`/${st.open}`); st.prev = j.previews; st.jobs = st.jobs.map((x) => (x.id === st.open ? j.job : x)); }
    } catch (e) { st.err = String(e.message || e); }
    draw();
    if (st.jobs.some((j) => LIVE.test(j.state))) st.timer = setTimeout(refresh, 1500);
  }
  async function upload(files) {
    const prompt = dlg()?.querySelector('[data-src-terms]')?.value.trim() || '';
    for (const f of files) {
      try { await api(`/upload?name=${encodeURIComponent(f.name)}&prompt=${encodeURIComponent(prompt)}`, f, true); say(t('src.added', { n: f.name })); } catch (e) { fail(e); }
    }
    refresh();
  }
  async function addPath() {
    const box = dlg()?.querySelector('[data-src-path]'); const v = box?.value.trim();
    if (!v) return;
    const prompt = dlg()?.querySelector('[data-src-terms]')?.value.trim() || '';
    try { await api('', /^https?:\/\//i.test(v) ? { url: v, prompt } : { path: v.replace(/^"|"$/g, ''), prompt }); box.value = ''; say(t('src.added', { n: v })); } catch (e) { fail(e); }
    refresh();
  }

  /* ── drawing ── */
  const kindLabel = (k) => t(`src.kind.${k}`);
  const stateLabel = (s) => t(`src.state.${s}`);
  const pct = (s) => (s.total ? Math.round((100 * s.done) / s.total) : s.state === 'done' ? 100 : 0);
  function card(j) {
    const stages = Object.entries(j.stages || {});
    const btn = (verb, on) => (on ? `<button type="button" class="st-btn st-sm" data-src-do="${verb}" data-id="${esc(j.id)}">${esc(t(`src.${verb}`))}</button>` : '');
    return `<li class="src-job" data-state="${esc(j.state)}" data-job="${esc(j.id)}">
<div class="src-top"><span class="src-kind">${esc(kindLabel(j.kind))}</span><b class="src-name" dir="auto" title="${esc(j.name)}">${esc(j.name)}</b><span class="src-badge">${esc(stateLabel(j.state))}</span><span class="st-grow"></span>
${btn('pause', j.state === 'running' && j.kind === 'media')}${btn('resume', /^(paused|stopped|error)$/.test(j.state))}${btn('stop', LIVE.test(j.state))}
<button type="button" class="st-btn st-sm${st.open === j.id ? ' st-primary' : ''}" data-src-do="review" data-id="${esc(j.id)}" aria-expanded="${st.open === j.id}">${esc(t('src.review'))}</button></div>
<ol class="src-stages" aria-label="${esc(t('src.stages'))}">${stages.map(([n, s]) => `<li data-s="${esc(s.state)}" title="${esc(s.msg || '')}"><span>${esc(t(`src.stage.${n}`))}</span><i style="--p:${pct(s)}%"></i>${s.msg ? `<small dir="auto">${esc(s.msg)}</small>` : ''}</li>`).join('')}</ol>
${j.error ? `<p class="src-err" dir="auto">${esc(j.error)}</p>` : ''}${j.interrupted ? `<p class="src-note">${esc(t('src.interrupted'))}</p>` : ''}
${st.open === j.id ? review(j) : ''}</li>`;
  }
  function review(j) {
    const p = st.prev || { lines: [], facts: [] };
    const tabs = ['lines', 'facts', ...(j.kind === 'media' ? ['names'] : [])];
    const head = `<div class="st-seg src-tabs" role="tablist">${tabs.map((x) => `<button type="button" role="tab" aria-selected="${st.tab === x}" data-src-tab="${x}">${esc(t(`src.tab.${x}`))}${x === 'facts' ? ` <span class="st-n">${p.facts.length}</span>` : x === 'lines' ? ` <span class="st-n">${p.lines.length}</span>` : ''}</button>`).join('')}</div>`;
    let body = '';
    if (st.tab === 'lines') {
      body = p.lines.length ? `<p class="src-hint">${esc(t(p.edited ? 'src.linesEdited' : 'src.linesHint'))}</p><ol class="src-lines">${p.lines.slice(0, 600).map((l, i) => `<li data-i="${i}"${l.deleted ? ' data-del' : ''}${l.low ? ' data-low' : ''}>
<span class="src-loc" dir="ltr">${esc(l.loc)}</span>${l.who != null ? `<input class="src-who" data-f="who" value="${esc(l.who)}" aria-label="${esc(t('src.who'))}" dir="auto">` : ''}
<textarea data-f="text" rows="1" dir="auto" aria-label="${esc(t('src.text'))}">${esc(l.text)}</textarea>
<button type="button" class="st-ib src-x" data-src-del="${i}" aria-pressed="${!!l.deleted}" title="${esc(t('src.drop'))}" aria-label="${esc(t('src.drop'))}">${ic('close')}</button></li>`).join('')}</ol>
${p.lines.length > 600 ? `<p class="src-note">${esc(t('src.more', { n: p.lines.length - 600 }))}</p>` : ''}<div class="st-row"><button type="button" class="st-btn st-primary" data-src-do="save" data-id="${esc(j.id)}">${esc(t('src.save'))}</button></div>`
        : `<p class="src-hint">${esc(t(j.kind === 'image' ? 'src.imageHint' : 'src.noLines'))}</p>`;
    } else if (st.tab === 'facts') {
      body = p.facts.length ? `<p class="src-hint">${esc(t('src.factsHint'))}</p><ul class="src-facts">${p.facts.map((f) => `<li data-fid="${esc(f.id)}" data-status="${esc(f.status)}">
<span class="src-fk" data-k="${esc(f.kind)}">${esc(t(`src.fk.${f.kind}`))}</span><span class="src-ft" dir="auto" contenteditable="plaintext-only" data-src-ft>${esc(f.text)}</span>
<span class="src-fm" dir="auto">${esc([f.who, f.loc, `${Math.round(f.confidence * 100)}%`, f.corroborated_by.length ? t('src.again', { n: f.corroborated_by.length }) : ''].filter(Boolean).join(' · '))}</span>
<span class="src-fb"><button type="button" class="st-btn st-sm" data-src-fact="accepted" aria-pressed="${f.status === 'accepted'}">${esc(t('src.accept'))}</button><button type="button" class="st-btn st-sm" data-src-fact="rejected" aria-pressed="${f.status === 'rejected'}">${esc(t('src.reject'))}</button></span></li>`).join('')}</ul>`
        : `<p class="src-hint">${esc(t('src.noFacts'))}</p>`;
    } else {
      body = `<p class="src-hint">${esc(t('src.namesHint'))}</p><textarea class="src-enroll" data-src-enroll rows="4" dir="ltr" placeholder="Rana 12-25&#10;Omar 26-40"></textarea>
<div class="st-row"><button type="button" class="st-btn st-primary" data-src-do="enroll" data-id="${esc(j.id)}">${esc(t('src.namesGo'))}</button></div>`;
    }
    return `<div class="src-review">${head}${body}</div>`;
  }
  function draw() {
    const box = dlg()?.querySelector('[data-src]'); if (!box) return;
    const keep = box.querySelector('.src-review textarea:focus, .src-review input:focus, [data-src-ft]:focus, .src-add input:focus');
    if (keep && st.drawn) return; // never redraw under a person who is typing
    st.drawn = true;
    if (!served()) { box.innerHTML = `<div class="st-empty"><h2>${esc(t('src.noHostT'))}</h2><p>${esc(t('src.noHostP'))}</p></div>`; return; }
    const add = box.querySelector('.src-add');
    const vals = add ? { path: add.querySelector('[data-src-path]').value, terms: add.querySelector('[data-src-terms]').value } : { path: '', terms: '' };
    box.innerHTML = `<div class="src-add">
<label class="src-drop"><input type="file" multiple data-src-file hidden><b>${esc(t('src.addFiles'))}</b><small>${esc(t('src.addHint'))}</small></label>
<div class="src-fields"><input type="text" data-src-path dir="auto" placeholder="${esc(t('src.pathPh'))}" aria-label="${esc(t('src.pathPh'))}" value="${esc(vals.path)}"><button type="button" class="st-btn" data-src-do="add">${esc(t('src.add'))}</button>
<input type="text" data-src-terms dir="auto" placeholder="${esc(t('src.termsPh'))}" aria-label="${esc(t('src.termsPh'))}" value="${esc(vals.terms)}">
<button type="button" class="st-btn src-guide-btn" data-src-do="guide">${esc(t('src.guide'))}</button></div></div>
${st.jobs.length ? `<ul class="src-jobs">${st.jobs.map(card).join('')}</ul>` : `<div class="st-empty"><h2>${esc(t('src.emptyT'))}</h2><p>${esc(t('src.emptyP'))}</p></div>`}`;
  }

  /* ── events ── */
  function linesFromDom(li) {
    return [...li.querySelectorAll('.src-lines > li')].map((r) => {
      const old = st.prev.lines[+r.dataset.i];
      const who = r.querySelector('[data-f="who"]')?.value.trim();
      const text = r.querySelector('[data-f="text"]').value.trim();
      return { ...old, text, ...(who != null ? { who } : {}), ...(text !== old.text && old.orig == null ? { orig: old.text } : {}), deleted: r.hasAttribute('data-del') };
    });
  }
  async function onClick(e) {
    const v = e.target.closest('[data-src-v]'); if (v) { show(v.dataset.srcV); return; }
    if (st.view !== 'sources') return;
    const tab = e.target.closest('[data-src-tab]'); if (tab) { st.tab = tab.dataset.srcTab; st.drawn = false; draw(); return; }
    const del = e.target.closest('[data-src-del]');
    if (del) { const r = del.closest('li'); r.toggleAttribute('data-del'); del.setAttribute('aria-pressed', String(r.hasAttribute('data-del'))); return; }
    const fb = e.target.closest('[data-src-fact]');
    if (fb) {
      const li = fb.closest('[data-fid]'), id = fb.closest('[data-job]').dataset.job;
      const text = li.querySelector('[data-src-ft]').textContent.trim(), old = st.prev.facts.find((f) => f.id === li.dataset.fid);
      const status = text !== old.text && fb.dataset.srcFact === 'accepted' ? 'edited' : fb.dataset.srcFact;
      try { st.prev = (await api(`/${id}/fact`, { id: li.dataset.fid, status, text })).previews; st.drawn = false; draw(); } catch (er) { fail(er); }
      return;
    }
    const b = e.target.closest('[data-src-do]'); if (!b) return;
    const id = b.dataset.id, verb = b.dataset.srcDo;
    try {
      if (verb === 'guide') { guide(); return; }
      if (verb === 'add') await addPath();
      else if (verb === 'review') { st.open = st.open === id ? null : id; st.prev = null; st.tab = 'lines'; await refresh(); }
      else if (verb === 'save') { await api(`/${id}/lines`, { lines: linesFromDom(b.closest('[data-job]')) }); say(t('src.saved')); st.drawn = false; await refresh(); }
      else if (verb === 'enroll') {
        const map = {};
        for (const row of b.closest('.src-review').querySelector('[data-src-enroll]').value.split('\n')) {
          const m = /^(.+?)\s+(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)\s*$/.exec(row.trim());
          if (m) (map[m[1]] ||= []).push([+m[2], +m[3]]);
        }
        if (!Object.keys(map).length) { toast(t('src.namesBad'), 'warn'); return; }
        await api(`/${id}/enroll`, map); await api(`/${id}/resume`, {}); st.drawn = false; await refresh();
      } else { await api(`/${id}/${verb}`, {}); await refresh(); }
    } catch (er) { fail(er); }
  }
  function onChange(e) { const f = e.target.closest?.('[data-src-file]'); if (f) { upload([...f.files]); f.value = ''; } }

  /* ── the meeting guide: what makes a recording readable. A cue card on screen (steps light up in turn), and the same card
   *    as a printable Arabic + English one-pager (its own window, the editor's Thmanyah faces copied in, then the print dialog). ── */
  const STEPS = ['before', 'open', 'intro', 'during', 'summary', 'close'];
  const GL = (l) => (k) => I18N.ui[l]?.[k] ?? I18N.ui.en[k] ?? k;
  const stepsHtml = (tt, dir) => `<ol class="src-g-steps" dir="${dir}">${STEPS.map((k, i) => `<li style="--i:${i}"><b>${esc(tt(`src.g.${k}T`))}</b><span>${esc(tt(`src.g.${k}`))}</span></li>`).join('')}</ol>`;
  function guide() {
    const d = dlg(); if (!d) return;
    let g = d.querySelector('dialog.src-guide');
    if (!g) { g = document.createElement('dialog'); g.className = 'src-guide'; d.append(g); g.addEventListener('click', (e) => { if (e.target === g || e.target.closest('[data-g-close]')) g.close(); if (e.target.closest('[data-g-print]')) printGuide(); }); }
    const l = S.ui === 'ar' ? 'ar' : 'en';
    g.lang = l; g.dir = l === 'ar' ? 'rtl' : 'ltr';
    g.innerHTML = `<div class="src-g-card"><div class="src-g-hd"><h2>${esc(t('src.guide'))}</h2><span class="st-grow"></span>
<button type="button" class="st-btn st-sm" data-g-print>${esc(t('src.guidePrint'))}</button><button type="button" class="st-ib" data-g-close aria-label="${esc(t('startClosePrev'))}">${ic('close')}</button></div>
<p class="src-hint">${esc(t('src.guideLede'))}</p>${stepsHtml(t, g.dir)}</div>`;
    g.showModal();
  }
  function printGuide() {
    const faces = [...document.querySelectorAll('style')].map((x) => x.textContent).join(' ').match(/@font-face\s*{[^}]*}/g) || [];
    const card = (l) => `<section lang="${l}" dir="${l === 'ar' ? 'rtl' : 'ltr'}"><h1>${esc(GL(l)('src.guide'))}</h1><p>${esc(GL(l)('src.guideLede'))}</p>${stepsHtml(GL(l), l === 'ar' ? 'rtl' : 'ltr')}</section>`;
    const w = window.open('', '_blank', 'width=900,height=1100');
    if (!w) { toast(t('src.failed', { r: 'pop-up blocked' }), 'warn'); return; }
    w.document.write(`<!doctype html><meta charset="utf-8"><title>Business-Wrap · ${esc(t('src.guide'))}</title><style>${faces.join(' ')}
@page{size:A4;margin:14mm}body{margin:0;font:400 11pt/1.5 'Thmanyah Sans','Thmanyah Serif Text',sans-serif;color:#14213d}
section{break-inside:avoid;padding:6mm 0;border-block-end:2px solid #e9b949}section:last-child{border:0}
section[lang=ar]{font-family:'Thmanyah Serif Text','Thmanyah Sans',serif}
h1{margin:0 0 2mm;font:700 18pt/1.2 'Thmanyah Serif Display','Thmanyah Serif Text',serif;color:#14213d}
p{margin:0 0 3mm;color:#4a5568}ol{margin:0;padding-inline-start:7mm;display:grid;gap:2.5mm}b{display:block;color:#14213d}span{color:#2d3748}
</style>${card('ar')}${card('en')}`);
    w.document.close();
    w.document.fonts.ready.then(() => w.print()); // printed from here: the page's CSP never runs a script inside the new window
  }

  function init() {
    window.addEventListener('bw:start-open', () => { mount(); if (st.view === 'sources') refresh(); });
    new MutationObserver(() => { if (html.dataset.bwStart === 'open') mount(); else clearTimeout(st.timer); }).observe(html, { attributes: true, attributeFilter: ['data-bw-start'] });
    root.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches?.('[data-src-path]')) { e.preventDefault(); addPath(); } }, true);
  }
  return { init, show, refresh };
})();

bwExt({
  on: { boot: () => SOURCES.init() },
});
