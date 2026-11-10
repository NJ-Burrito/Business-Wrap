/* 0.18.0 document studio · the start page (lane L3; spec work/sdlc/design/ux/start-page.md, contracts C2 and C3 of work/sdlc/design/architecture.md).
 * The first screen when the tool opens without a document, and File › Start page at any time: a gallery of the registry's document types (thumbnails
 * from each type's own `art`), category chips, search, the recent documents (open, pin) and a preview card with the document language and Create.
 * Create builds both editions from the payload's composed pair (LIB.newFromType: design, cover design and starter content are already in it) into a new
 * library document and opens the editor on it. It is a view of the shell, not a dialog: no scrim, no focus trap; Esc or «Back» returns.
 * Types come from the embedded JSON script #bw-doctypes (C2) and, served, from GET /api/doctypes when the page lacks the script.
 * Shown at boot only when: types answered, no #doc= in the address, the open service is the untouched template, bw:start is not 'off', and (automation
 * guard, as 30-profile) not ?automation=1 and not navigator.webdriver unless ?start=1. Only the Calm button reduces motion (owner rule).
 * 0.18.2: every way of opening the TOOL is that untouched template (the shortcut's file:// tool editor, the served blank editor of a plain business-wrap://start),
 * so it lands here; a specific saved document (a `doc-` service, a #doc= link) opens as itself. The shortcut's page cannot read the save folder, so the launcher embeds the
 * newest saved documents as #bw-recents and they are listed as Recents (a row opens that file); a served page has the host's mirror instead.
 * The resume prompt (12-session) does not open over a start page that is about to show: one landing; the last documents are in Recents and a «Continue where you left off (N)» button opens the same prompt.
 * Home (top bar, leading edge): saves through the editor's own autosave path (draft + library entry; there is no discard prompt, nothing is discarded), then opens this view. 
 * API (C3): EXT.start = { open, close, types, type, create, recents }; <html data-bw-start="open|closed">; tiles [data-type]; recents [data-recent];
 * events bw:start-open, bw:start-create {id, ed, doc}. */
const START = (() => {
  const OFF = 'bw:start';
  const PINS = 'bw:start-pins';
  const LIBX = () => EXT.library;
  let data = null; // the registry payload (C2)
  let loading = null;
  let el = null; // dialog.bw-start on the shadow root
  const st = { cat: 'all', q: '', sel: null, pl: 'en', first: true, rec: [], last: 0, gone: new Set(), busy: false, opener: null, kind: '' };
  const types = () => data?.types || [];
  const type = (id) => types().find((x) => x.id === id) || null;
  const lang = () => (S.ui === 'ar' ? 'ar' : 'en');
  const nm = (x, l = lang()) => x.name?.[l] || x.name?.en || x.id;
  const dsc = (x, l = lang()) => x.description?.[l] || x.description?.en || '';
  const tf = (k, vars = {}) => { let s = t(k); for (const [a, b] of Object.entries(vars)) s = s.split(`{${a}}`).join(String(b)); return s; }; // t() with literal values ($ in a file name stays)
  const isOpen = () => !!el?.isConnected;

  /* ── the registry ── */
  const valid = (j) => (j && j.v === 1 && Array.isArray(j.types) ? j : null);
  function embedded() { try { const n = document.getElementById('bw-doctypes'); return n ? valid(JSON.parse(n.textContent)) : null; } catch { return null; } }
  function load() {
    return (loading ||= (async () => {
      let j = embedded();
      if (!j && document.readyState === 'loading') { await new Promise((ok) => document.addEventListener('DOMContentLoaded', ok, { once: true })); j = embedded(); }
      if (!j && location.protocol.startsWith('http')) { try { const r = await fetch('/api/doctypes'); if (r.ok) j = valid(await r.json()); } catch { /* not served by a host that has the route */ } }
      if (j) { data = j; LIBX()?.addPlaceholders?.(j.types.flatMap((x) => [x.placeholder?.ar, x.placeholder?.en])); }
      loading = null; // a later call asks again when nothing was found (a host that starts later)
      return data;
    })());
  }
  /** One tile's page thumbnail: the type's `art` inline (language-neutral, no text; the CSS mirrors it in RTL), with its own size, title and role dropped. */
  const frame = '<svg viewBox="0 0 240 320" aria-hidden="true" focusable="false"><rect width="240" height="320" fill="var(--bw-surface-2)"/></svg>';
  const artCache = new Map();
  function art(ty) {
    if (!ty) return frame;
    if (artCache.has(ty.id)) return artCache.get(ty.id);
    let s = String(ty.art || '').trim();
    if (!/^<svg\b/i.test(s) || /<script|<foreignObject|<image|<iframe|<use\b|\son[a-z]+\s*=|javascript:|href\s*=/i.test(s)) s = frame;
    else s = s.replace(/<svg\b([^>]*)>/i, (m, a) => `<svg${a.replace(/\s(width|height|role|aria-label)="[^"]*"/g, '')} aria-hidden="true" focusable="false">`).replace(/<title>[\s\S]*?<\/title>/i, '');
    artCache.set(ty.id, s);
    return s;
  }
  /** A landscape page thumbnail (viewBox wider than tall: the sheets that print landscape): the tile bottom-aligns it instead of stretching it. */
  const land = (ty) => { const m = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(art(ty)); return !!m && +m[1] > +m[2]; };
  const ordered = () => [...types().filter((x) => x.id === 'blank'), ...types().filter((x) => x.id !== 'blank')];
  const cats = () => (data?.categories || []).filter((c) => c.id !== 'start' && types().some((x) => x.category === c.id));
  const catColor = (id) => types().find((x) => x.category === id)?.accent || 'var(--bw-primary)';
  function filtered() {
    const q = fold(st.q.normalize('NFKC').trim());
    if (q) return ordered().filter((x) => fold([x.id, x.code, x.name?.en, x.name?.ar, x.description?.en, x.description?.ar].join(' ').normalize('NFKC')).includes(q));
    if (st.cat === 'all') return ordered();
    return ordered().filter((x) => x.id === 'blank' || x.category === st.cat); // Blank is the escape hatch: first in every filter
  }
  /** The names of the first chapters of the type's starter document in `ed`: the card's «Inside» list. */
  function inside(ty, ed) {
    try { return (JSON.parse(ty.docs?.[ed] || '{}').chapters || []).map((c) => String(c.title || '').trim()).filter(Boolean).slice(0, 5); } catch { return []; }
  }

  /* ── recents ── */
  const pins = () => { try { const a = JSON.parse(ls.get(PINS) || '[]'); return Array.isArray(a) ? a.map(String) : []; } catch { return []; } };
  const savePins = (a) => ls.set(PINS, JSON.stringify([...new Set(a)]));
  const typeCache = new Map();
  /** The registry type a library entry was made from: entry.docType, else the document's own docType (read once), else none. */
  function typeOf(e) {
    if (e.docType) return e.docType;
    if (typeCache.has(e.id)) return typeCache.get(e.id);
    let id = '';
    try { const raw = Object.values(e.editions || {})[0]?.raw; id = raw ? String(JSON.parse(raw).docType || '') : ''; } catch { /* not readable */ }
    typeCache.set(e.id, id);
    return id;
  }
  const fileOf = (e) => { const f = Object.values(e.htmlFiles || {})[0]; return f ? String(f).split(/[\\/]/).pop() : e.title; };
  async function recents() {
    const L = LIBX();
    if (!L) return [];
    const all = ((await L.all()) || []).filter((e) => L.isDoc(e.id) && !e.deletedAt && e.kind !== 'template');
    if (L.isDoc(S.svc) && M[S.svc] && !all.some((e) => e.id === S.svc)) { try { all.push({ ...L.entryOf(S.svc), pending: true }); } catch { /* not readable */ } } // a new document is unsaved until its first edit
    const pinned = pins();
    const rows = all.sort((a, b) => (pinned.includes(b.id) ? 1 : 0) - (pinned.includes(a.id) ? 1 : 0) || String(b.savedAt).localeCompare(String(a.savedAt))).slice(0, 20) // pinned first, then newest; the rest stay in the Documents drawer
      .map((e) => ({ id: e.id, title: e.title, file: fileOf(e), type: typeOf(e), savedAt: e.savedAt, pinned: pinned.includes(e.id), now: e.id === S.svc, pending: !!e.pending }));
    const have = new Set(all.flatMap((e) => Object.values(e.htmlFiles || {}).map(sameFile)));
    for (const d of diskRows()) if (!have.has(sameFile(d.file))) rows.push({ id: `disk:${d.file}`, title: d.name, file: String(d.file).split(/[\\/]/).pop(), type: d.type || '', savedAt: d.savedAt, pinned: pinned.includes(`disk:${d.file}`), now: false, pending: false, url: d.url });
    return rows.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || String(b.savedAt).localeCompare(String(a.savedAt))).slice(0, 20);
  }
  /** The saved documents the launcher embedded (#bw-recents) in the shortcut's file:// tool editor: [{name, file, url, savedAt, type}]. A served page has the library mirror instead: none here. */
  const sameFile = (f) => String(f || '').replace(/\\/g, '/').toLowerCase();
  function diskRows() {
    if (location.protocol !== 'file:') return [];
    try {
      const j = JSON.parse(document.getElementById('bw-recents')?.textContent || 'null');
      return j && j.v === 1 && Array.isArray(j.rows) ? j.rows.filter((r) => r && typeof r.file === 'string' && /^file:\/\/\//.test(String(r.url))).slice(0, 20) : [];
    } catch { return []; }
  }
  const pad = (n) => String(n).padStart(2, '0');
  function whenText(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const day0 = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const diff = Math.round((day0(new Date()) - day0(d)) / 864e5);
    const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`; // 24 h, Latin digits in both languages
    if (diff === 0) return `${t('startToday')} ${hm}`;
    if (diff === 1) return `${t('startYest')} ${hm}`;
    let mon = '';
    try { mon = d.toLocaleDateString(lang() === 'ar' ? 'ar-u-nu-latn' : 'en', { month: 'short' }); } catch { mon = String(d.getMonth() + 1); }
    return `${d.getDate()} ${mon} ${hm}`;
  }

  /* ── markup ── */
  const KEEP_ICON = '<svg aria-hidden="true" focusable="false" class="ic" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/></svg>';
  function shellHtml() {
    return `<span class="st-spine" aria-hidden="true"></span>
<header class="st-bar"><span class="st-brand" data-st-brand></span><span class="st-grow"></span>
  <div class="st-seg" role="group" data-st-ui><button type="button" data-st-l="en" lang="en">EN</button><button type="button" data-st-l="ar" lang="ar">عربي</button></div>
  <button type="button" class="st-ib" data-st-dark></button><button type="button" class="st-ib" data-st-calm></button></header>
<div class="st-wrap">
  <main class="st-main" aria-labelledby="st-h1">
    <div class="st-head"><div class="st-hl"><h1 id="st-h1"><span class="st-rule" data-st-title></span></h1></div>
      <div class="st-search" role="search"><span class="st-sic" data-st-find></span><input type="search" data-st-q autocomplete="off" spellcheck="false"><kbd aria-hidden="true">/</kbd></div></div>
    <p class="st-lede" data-st-lede></p>
    <button type="button" class="st-back" data-st-back hidden></button>
    <div class="st-chips" role="radiogroup" data-st-chips></div>
    <div data-st-gal></div>
    <p class="vh" role="status" aria-live="polite" data-st-live></p>
  </main>
  <aside class="st-side" data-st-side></aside>
</div>`;
  }
  function chrome() {
    const l = lang();
    el.lang = l; el.dir = l === 'ar' ? 'rtl' : 'ltr';
    el.dataset.theme = S.dark ? 'dark' : 'light'; el.dataset.calm = S.calm ? '1' : '0';
    el.setAttribute('aria-label', t('startMain'));
    const q = (s) => el.querySelector(s);
    q('[data-st-title]').textContent = t('startTitle');
    q('[data-st-lede]').textContent = t('startLede');
    const inp = q('[data-st-q]'); inp.placeholder = t('startSearch'); inp.setAttribute('aria-label', t('startSearch'));
    q('[data-st-find]').innerHTML = ic('find');
    q('[data-st-brand]').innerHTML = DATA.brand?.mark ? `<span class="st-mark" aria-hidden="true">${DATA.brand.mark}</span><b class="st-wm">Business-Wrap</b>` : '<b class="st-wm">Business-Wrap</b>';
    q('[data-st-brand]').setAttribute('aria-label', 'Business-Wrap');
    const d = q('[data-st-dark]'); d.innerHTML = ic('dark'); d.setAttribute('aria-label', t('startDark')); d.title = t('startDark'); d.setAttribute('aria-pressed', String(!!S.dark));
    const c = q('[data-st-calm]'); c.innerHTML = ic('calm'); c.setAttribute('aria-label', t('startCalm')); c.title = t('startCalm'); c.setAttribute('aria-pressed', String(!!S.calm));
    const u = q('[data-st-ui]'); u.setAttribute('aria-label', t('startUi'));
    u.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.stL === l)));
    const back = q('[data-st-back]');
    const cur = LIBX()?.isDoc(S.svc) ? LIBX().titleOf() : '';
    back.hidden = false; back.textContent = cur ? tf('startBack', { name: cur }) : t('startSkip'); back.dir = 'auto';
    const total = types().filter((x) => x.id !== 'blank').length;
    q('[data-st-chips]').setAttribute('aria-label', t('startCats'));
    q('[data-st-chips]').innerHTML = [{ id: 'all', name: { [l]: t('startAll') }, n: total }, ...cats().map((x) => ({ ...x, n: types().filter((y) => y.category === x.id).length }))].map((x) => {
      const name = x.name?.[l] || x.name?.en || x.id;
      return `<button type="button" class="st-chip" role="radio" aria-checked="${st.cat === x.id && !st.q}" tabindex="${st.cat === x.id ? 0 : -1}" aria-label="${esc(tf('startCatCount', { name, n: x.n }))}" data-st-c="${esc(x.id)}">${x.id === 'all' ? '' : `<span class="st-ms" style="--c:${esc(catColor(x.id))}"></span>`}<span>${esc(name)}</span></button>`;
    }).join('');
  }
  function gallery() {
    const l = lang();
    const list = filtered();
    const g = el.querySelector('[data-st-gal]'), live = el.querySelector('[data-st-live]');
    if (!list.length) {
      g.innerHTML = `<div class="st-empty"><h2>${esc(tf('startNoMatchT', { q: st.q.trim() || '…' }))}</h2><p>${esc(t('startNoMatchP'))}</p><div class="st-row"><button type="button" class="st-btn" data-st-a="clear">${esc(t('startClear'))}</button><button type="button" class="st-btn" data-st-a="blank">${esc(t('startBlank'))}</button></div></div>`;
      live.textContent = tf('startNoMatchT', { q: st.q.trim() });
      return;
    }
    const rove = list.some((x) => x.id === st.sel) ? st.sel : list[0].id;
    g.innerHTML = `<ul class="st-grid${st.first ? ' st-first' : ''}" role="listbox" aria-label="${esc(t('startTitle'))}" aria-orientation="horizontal">${list.map((x, i) =>
      `<li class="st-tile" role="option" tabindex="${x.id === rove ? 0 : -1}" aria-selected="${st.sel === x.id}" data-type="${esc(x.id)}" data-type-id="${esc(x.id)}" aria-labelledby="stn-${esc(x.id)} std-${esc(x.id)}" style="--i:${i}"><span class="st-thumb" data-land="${land(x)}" data-mirror="${st.sel === x.id ? st.pl === 'ar' : l === 'ar'}">${art(x)}</span><span class="st-nm" id="stn-${esc(x.id)}">${esc(nm(x))}</span><span class="st-ds" id="std-${esc(x.id)}">${esc(dsc(x))}</span></li>`).join('')}</ul>`;
    live.textContent = tf('startResults', { n: list.length });
  }
  function rowHtml(r) {
    const ty = type(r.type);
    const meta = `${ty ? nm(ty) : t('startDocument')} · ${r.now ? t('startNow') : whenText(r.savedAt)}`;
    if (st.gone.has(r.id)) return `<li class="st-rec st-gone" data-recent="${esc(r.id)}"><span class="st-open" aria-disabled="true"><span class="st-rt" data-mirror="${lang() === 'ar'}">${art(ty)}</span><span class="st-rm"><span class="st-fn" dir="auto">${esc(r.file)}</span><span class="st-meta st-miss">${esc(t('startMissing'))}</span></span></span><button type="button" class="st-btn st-sm" data-st-rm="${esc(r.id)}">${esc(t('startRemove'))}</button></li>`;
    return `<li class="st-rec" data-recent="${esc(r.id)}"><button type="button" class="st-open" data-st-open="${esc(r.id)}"><span class="st-rt" data-mirror="${lang() === 'ar'}">${art(ty)}</span><span class="st-rm"><span class="st-fn" dir="auto" title="${esc(r.file)}">${esc(r.file)}</span><span class="st-meta">${esc(meta)} <span class="st-go">· ${esc(t('startOpen'))}</span></span></span></button><button type="button" class="st-ib st-keep" aria-pressed="${r.pinned}" aria-label="${esc(`${t(r.pinned ? 'startUnpin' : 'startPin')}: ${r.file}`)}" title="${esc(t(r.pinned ? 'startUnpin' : 'startPin'))}" data-st-keep="${esc(r.id)}">${KEEP_ICON}</button></li>`;
  }
  function side() {
    const l = lang();
    const box = el.querySelector('[data-st-side]');
    const kind = st.sel ? 'prev' : 'rec';
    const cls = kind !== st.kind ? ' st-in' : '';
    st.kind = kind;
    box.setAttribute('aria-label', t('startAside'));
    if (st.sel) {
      const ty = type(st.sel);
      if (!ty) { st.sel = null; side(); return; }
      const pl = st.pl;
      box.innerHTML = `<div class="st-pane st-prev${cls}" role="region" aria-label="${esc(t('startPreview'))}"><div class="st-hd"><h2>${esc(t('startPreview'))}</h2><button type="button" class="st-ib" data-st-a="close" aria-label="${esc(t('startClosePrev'))}" title="${esc(t('startClosePrev'))}">${ic('close')}</button></div>
<div class="st-cover"><span class="st-thumb" data-land="${land(ty)}" data-mirror="${pl === 'ar'}">${art(ty)}</span></div>
<h3 lang="${pl}" dir="${pl === 'ar' ? 'rtl' : 'ltr'}">${esc(nm(ty, pl))}</h3><p lang="${pl}" dir="${pl === 'ar' ? 'rtl' : 'ltr'}">${esc(dsc(ty, pl))}</p>
<span class="st-lab" id="st-pl-l">${esc(t('startLang'))}</span>
<div class="st-seg st-seg-w" role="radiogroup" aria-labelledby="st-pl-l"><button type="button" role="radio" aria-checked="${pl === 'ar'}" data-st-pl="ar" lang="ar">${esc(t('startLangAr'))}</button><button type="button" role="radio" aria-checked="${pl === 'en'}" data-st-pl="en" lang="en">${esc(t('startLangEn'))}</button></div>
${inside(ty, pl).length ? `<span class="st-lab">${esc(t('startInside'))}</span><ul lang="${pl}" dir="${pl === 'ar' ? 'rtl' : 'ltr'}">${inside(ty, pl).map((s) => `<li>${esc(s)}</li>`).join('')}</ul>` : ''}
<button type="button" class="st-btn st-primary" data-st-a="create" data-bw-create="${esc(ty.id)}">${ic('add')}<span>${esc(t('startCreate'))}</span></button><p class="st-hint">${esc(t('startHint'))}</p></div>`;
      return;
    }
    const rows = st.rec;
    const pinned = rows.filter((r) => r.pinned), rest = rows.filter((r) => !r.pinned);
    box.innerHTML = `<div class="st-pane${cls}"><h2>${esc(t('startRecent'))}<span class="st-n">${rows.length || ''}</span></h2>${rows.length
      ? (pinned.length ? `<div class="st-sub">${esc(t('startPinned'))}</div><ul class="st-recs" aria-label="${esc(t('startPinned'))}">${pinned.map(rowHtml).join('')}</ul>` : '') + (rest.length ? `<div class="st-sub">${esc(t('startRecents'))}</div><ul class="st-recs" aria-label="${esc(t('startRecents'))}">${rest.map(rowHtml).join('')}</ul>` : '')
      : `<div class="st-norec"><span class="st-art" data-mirror="${l === 'ar'}">${art(type('blank'))}</span><b>${esc(t('startNoRecT'))}</b><span>${esc(t('startNoRecP'))}</span></div>`}
<div class="st-drop">${st.last ? `<button type="button" class="st-btn" data-st-a="resume">${ic('history')}<span>${esc(tf('startResume', { n: st.last }))}</span></button>` : ''}<button type="button" class="st-btn" data-st-a="file">${ic('rbt.file')}<span>${esc(t('startOpenFile'))}</span></button><small>${esc(t('startDrop'))}</small></div></div>`;
  }
  async function refresh() { st.rec = await recents(); if (isOpen() && !st.sel) side(); }
  /** How many documents the last session had (the «Continue where you left off» button): only a served page has a host session to ask. */
  async function lastCount() { try { st.last = (await EXT.session?.lastCount?.()) || 0; } catch { st.last = 0; } if (isOpen() && !st.sel) side(); }

  /* ── actions ── */
  /** The tiles are patched in place, never rebuilt, when the pick changes: a double click is two clicks on the SAME element (a rebuilt tile would lose the second). */
  function markTiles() {
    const l = lang();
    el.querySelectorAll('.st-tile').forEach((x) => {
      const on = x.dataset.type === st.sel;
      x.setAttribute('aria-selected', String(on));
      x.querySelector('.st-thumb').dataset.mirror = String(on ? st.pl === 'ar' : l === 'ar');
      if (st.sel) x.tabIndex = on ? 0 : -1;
    });
  }
  function pick(id, focusCreate) {
    if (st.sel !== id) st.pl = lang(); // picking the tile that is already picked keeps the document language chosen in the card
    st.sel = id; st.first = false;
    markTiles(); side();
    if (focusCreate) el.querySelector('[data-st-a="create"]')?.focus();
    else el.querySelector(`.st-tile[data-type="${CSS.escape(id)}"]`)?.focus({ preventScroll: true });
  }
  function closePreview() {
    const id = st.sel; st.sel = null; st.first = false;
    markTiles(); side(); refresh();
    el.querySelector(`.st-tile[data-type="${CSS.escape(id || '')}"]`)?.focus();
  }
  async function create(id, ed) {
    if (!(await load()) || !type(id) || st.busy) return null;
    st.busy = true;
    try {
      const want = ed || (st.sel === id ? st.pl : lang());
      const L = LIBX();
      const entry = L ? await L.newFromType(id, want) : null;
      if (!entry) { toast(t('startOpenFail'), 'warn', { actions: [[t('startBlank'), () => { create('blank'); }]] }); return null; }
      close(true);
      window.dispatchEvent(new CustomEvent('bw:start-create', { detail: { id, ed: want, doc: entry.id } }));
      return entry;
    } finally { st.busy = false; }
  }
  async function openRecent(id) {
    const disk = st.rec.find((r) => r.id === id && r.url); // 0.18.2: a saved document the launcher listed (the shortcut's file:// page): that file opens, as itself
    if (disk) { location.assign(disk.url); return; }
    const L = LIBX();
    if (id === S.svc && L?.isDoc(id)) { close(true); return; }
    const ok = await L?.open(id);
    if (ok) close(true);
    else { st.gone.add(id); side(); }
  }
  async function openFile() {
    const f = await pickFile(LIBX().ACCEPT);
    if (!f) return;
    const e = await LIBX().importAny(f);
    if (e) close(true);
  }
  async function dropped(ev) {
    ev.preventDefault();
    el.querySelector('.st-side').classList.remove('st-over');
    const f = ev.dataTransfer?.files?.[0];
    if (!f) return;
    const e = await LIBX().importAny(f);
    if (e) close(true);
  }
  function setUi(l) { if (S.ui !== l) runAction('uiLang'); st.sel = null; st.first = false; st.kind = ''; chrome(); gallery(); side(); }

  /* ── events ── */
  function onClick(ev) {
    const g = (s) => ev.target.closest(s);
    let b;
    if ((b = g('[data-st-c]'))) { st.cat = b.dataset.stC; st.q = ''; el.querySelector('[data-st-q]').value = ''; st.first = false; chrome(); gallery(); return; }
    if ((b = g('[data-st-pl]'))) { st.pl = b.dataset.stPl; markTiles(); side(); el.querySelector(`[data-st-pl="${st.pl}"]`)?.focus(); return; }
    if ((b = g('[data-st-keep]'))) { const id = b.dataset.stKeep; const p = pins(); savePins(p.includes(id) ? p.filter((x) => x !== id) : [...p, id]); refresh().then(() => el?.querySelector(`[data-st-keep="${CSS.escape(id)}"]`)?.focus()); return; }
    if ((b = g('[data-st-open]'))) { openRecent(b.dataset.stOpen); return; }
    if ((b = g('[data-st-rm]'))) { const id = b.dataset.stRm; LIBX().remove(id).catch(() => {}); savePins(pins().filter((x) => x !== id)); st.gone.delete(id); refresh(); return; }
    if ((b = g('[data-st-a]'))) {
      const k = b.dataset.stA;
      if (k === 'close') closePreview();
      else if (k === 'create') create(st.sel);
      else if (k === 'clear') { st.q = ''; el.querySelector('[data-st-q]').value = ''; chrome(); gallery(); el.querySelector('[data-st-q]').focus(); }
      else if (k === 'blank') pick('blank');
      else if (k === 'file') openFile();
      else if (k === 'resume') EXT.session?.ask?.();
      return;
    }
    if ((b = g('[data-st-l]'))) { setUi(b.dataset.stL); return; }
    if (g('[data-st-dark]')) { runAction('dark'); chrome(); return; }
    if (g('[data-st-calm]')) { runAction('calm'); chrome(); return; }
    if (g('[data-st-back]')) { close(); return; }
    if ((b = g('.st-tile'))) pick(b.dataset.type);
  }
  function onKey(ev) {
    ev.stopPropagation(); // the editor's own shortcuts (F, Ctrl+S, Ctrl+F …) never run on the page behind
    const q = el.querySelector('[data-st-q]');
    const inField = ev.target === q;
    if (ev.key === '/' && !inField && !/^(INPUT|TEXTAREA|SELECT)$/.test(ev.target.tagName || '')) { ev.preventDefault(); q.focus(); return; }
    if (ev.key === 'Escape') {
      ev.preventDefault();
      if (inField && st.q) { st.q = ''; q.value = ''; chrome(); gallery(); }
      else if (st.sel) closePreview();
      else close();
      return;
    }
    const chip = ev.target.closest?.('.st-chip');
    if (chip) {
      const chips = [...el.querySelectorAll('.st-chip')], i = chips.indexOf(chip), rtl = lang() === 'ar';
      const step = ev.key === 'ArrowRight' ? (rtl ? -1 : 1) : ev.key === 'ArrowLeft' ? (rtl ? 1 : -1) : ev.key === 'ArrowDown' ? 1 : ev.key === 'ArrowUp' ? -1 : 0;
      if (step) { ev.preventDefault(); const n = chips[(i + step + chips.length) % chips.length]; st.cat = n.dataset.stC; st.q = ''; q.value = ''; st.first = false; chrome(); gallery(); el.querySelector(`.st-chip[data-st-c="${CSS.escape(st.cat)}"]`)?.focus(); return; }
    }
    const tile = ev.target.closest?.('.st-tile');
    if (tile) {
      const tiles = [...el.querySelectorAll('.st-tile')], i = tiles.indexOf(tile), rtl = lang() === 'ar';
      const cols = Math.max(1, tiles.filter((x) => x.offsetTop === tiles[0].offsetTop).length);
      let n = null;
      if (ev.key === 'ArrowRight') n = i + (rtl ? -1 : 1); else if (ev.key === 'ArrowLeft') n = i + (rtl ? 1 : -1);
      else if (ev.key === 'ArrowDown') n = i + cols; else if (ev.key === 'ArrowUp') n = i - cols; else if (ev.key === 'Home') n = 0; else if (ev.key === 'End') n = tiles.length - 1;
      if (n !== null) { ev.preventDefault(); n = Math.max(0, Math.min(tiles.length - 1, n)); tiles.forEach((x) => { x.tabIndex = -1; }); tiles[n].tabIndex = 0; tiles[n].focus(); return; }
      if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); create(tile.dataset.type); return; }
      if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); pick(tile.dataset.type, true); return; }
    }
    if (ev.key === 'Enter' && ev.target.closest?.('.st-prev') && !ev.target.closest('button, [role="radio"]')) { ev.preventDefault(); create(st.sel); return; }
    if (ev.key === 'ArrowDown' && inField) { ev.preventDefault(); el.querySelector('.st-tile[tabindex="0"]')?.focus(); }
  }

  /* ── open / close ── */
  async function open(opts = {}) {
    if (isOpen()) { el.querySelector('[data-st-q]')?.focus(); return true; }
    if (!(await load())) { if (!opts.auto) toast(t('startNoTypes'), 'warn'); return false; }
    if (isOpen()) return true;
    Object.assign(st, { cat: 'all', q: '', sel: null, first: true, rec: [], last: 0, gone: new Set(), kind: '', pl: lang() });
    st.opener = root.activeElement || null;
    el = document.createElement('dialog');
    el.className = 'bw-start';
    el.setAttribute('aria-modal', 'false');
    el.dataset.bwStart = 'view';
    el.innerHTML = shellHtml();
    el.addEventListener('click', onClick);
    el.addEventListener('dblclick', (ev) => { const tile = ev.target.closest('.st-tile'); if (tile) create(tile.dataset.type); });
    el.addEventListener('keydown', onKey);
    el.addEventListener('input', (ev) => { if (ev.target.matches('[data-st-q]')) { st.q = ev.target.value; st.first = false; chrome(); gallery(); } });
    el.addEventListener('dragover', (ev) => { if ([...(ev.dataTransfer?.items || [])].some((x) => x.kind === 'file')) { ev.preventDefault(); ev.stopPropagation(); el.querySelector('.st-side').classList.add('st-over'); } });
    el.addEventListener('dragleave', (ev) => { if (!ev.relatedTarget || !el.contains(ev.relatedTarget)) el.querySelector('.st-side').classList.remove('st-over'); });
    el.addEventListener('drop', (ev) => { ev.stopPropagation(); dropped(ev); });
    root.appendChild(el);
    el.show();
    document.documentElement.style.overflow = 'hidden'; // the page behind does not scroll under the view
    document.documentElement.dataset.bwStart = 'open';
    // 0.18.2: the NJ mark (z 41, in the page, above this view) stays on screen over the start page; 50-start.css leaves it a bottom-start safe area (0.18.0 hid it, which hid it on every open)
    chrome(); gallery(); side();
    st.rec = await recents();
    if (isOpen() && !st.sel) side();
    lastCount();
    if (!opts.auto || !st.opener) el.querySelector('[data-st-q]')?.focus({ preventScroll: true });
    setTimeout(() => { st.first = false; el?.querySelector('.st-grid')?.classList.remove('st-first'); }, 1400);
    window.dispatchEvent(new CustomEvent('bw:start-open', { detail: { auto: !!opts.auto } }));
    return true;
  }
  function close(created = false) {
    if (!isOpen()) return;
    const back = st.opener;
    el.remove();
    el = null;
    document.documentElement.style.overflow = '';
    document.documentElement.dataset.bwStart = 'closed';
    if (!created && back?.isConnected) { try { back.focus({ preventScroll: true }); } catch { /* gone */ } }
  }

  /* ── when it shows by itself ── */
  const untouched = () => { const L = LIBX(); return !!M[S.svc] && !L?.isDoc(S.svc) && Object.values(M[S.svc]).every((e) => !(e.ops || []).length); };
  /** The address-and-setting part of "shows by itself" (no waiting, no registry): bw:start off, a tool's tab, a test's browser without ?start=1, a #doc= link. */
  function allowed() {
    if (ls.get(OFF) === 'off') return false;
    const P = new URLSearchParams(location.search);
    if (P.get('automation') === '1' || document.documentElement.dataset.bwAutomation === '1') return false;
    if (navigator.webdriver && P.get('start') !== '1') return false;
    if (/[#&]doc=/.test(location.hash)) return false;
    return true;
  }
  /** 0.18.2: true when this page opens the TOOL (not a specific document) and the start page will show by itself: 12-session then asks no «continue where you left off» question over it. */
  const landing = () => allowed() && untouched();
  async function auto() {
    document.documentElement.dataset.bwStart = 'closed';
    if (!allowed()) return;
    if (document.documentElement.dataset.bwSessionSettled !== '1') await new Promise((ok) => window.addEventListener('bw:session-settled', ok, { once: true }));
    try { await window.BW?.whenReady?.(20000); } catch { return; } // a first-launch card or another question is still open: not stacked on it
    if (!untouched()) return;
    if (!(await load())) return;
    if (!untouched() || isOpen()) return;
    await open({ auto: true });
  }

  /* ── Settings card ── */
  const card = () => `<p class="hint">${esc(t('startSetHint'))}</p><label class="chk st-sw"><input type="checkbox" data-st-show ${ls.get(OFF) === 'off' ? '' : 'checked'}><span class="st-sw-t" aria-hidden="true"><i></i></span><span class="st-sw-w">${esc(t('startSetShow'))}</span></label>`;
  const mountCard = (c) => c?.querySelector('[data-st-show]')?.addEventListener('change', (ev) => { if (ev.target.checked) ls.del(OFF); else ls.set(OFF, 'off'); });

  /** Home (top bar): the document in front is saved by the editor's own paths first (the draft and the library entry: the autosave a Save would also run), then the start page opens over it
   *  («Back to <name>» returns). The editor has no discard prompt because nothing is discarded; opening this view never closes or replaces the document. */
  async function home() {
    try { writeDraft(); } catch { /* nothing to write */ }
    try { await LIBX()?.persistNow?.(); } catch { /* not a library document */ }
    return open();
  }
  return { open, close, home, landing, refresh, types: () => types(), type, create, recents, load, auto, card, mountCard, isOpen, get state() { return { ...st, rec: [...st.rec] }; } };
})();

/* the File tool: Lucide layout-template (ISC), one gold part; its own hover motion (the 0.13 rule: every icon an extension adds moves) */
IC.startPage = '<svg aria-hidden="true" focusable="false" class="ic" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="7" rx="1.5"/><rect x="3" y="14" width="9" height="7" rx="1.5"/><rect class="hl" x="16" y="14" width="5" height="7" rx="1" stroke="none"/></svg>';
/* the top bar's Home button: Lucide house (ISC), one gold part (the door); its own hover motion in 40-icon-motion.css */
IC.homeBtn = '<svg aria-hidden="true" focusable="false" class="ic" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><rect class="hl" x="9.5" y="13.5" width="5" height="7.5" rx="1" stroke="none"/></svg>';
/** The Home button: first in the top bar, before the document and language controls (the bar's own markup carries it, as the host switch, so syncUi keeps the very same node). */
const homeHtml = () => `<button type="button" class="b home" data-a="home" data-k="home" title="${esc(t('startHomeTip'))}" aria-label="${esc(t('startHomeTip'))}"><span class="i">${ic('homeBtn')}</span><span class="w">${esc(t('startHome'))}</span></button>`;
{
  const baseUi = uiHtml;
  uiHtml = function () {
    const h = baseUi();
    return /<div class="grp doc">/.test(h) ? h.replace(/<div class="grp doc">/, (m) => homeHtml() + m) : h;
  };
}
bwExt({
  cmds: [{ id: 'startPage', group: 'file', key: 'Ctrl+Alt+N', edit: false }],
  actions: { startPage: () => { START.open(); }, home: () => START.home() },
  expose: { start: START },
  settings: [{ id: 'start', title: 'startSetTitle', icon: 'newdoc', html: START.card, mount: START.mountCard }],
  on: {
    boot: () => {
      document.documentElement.dataset.bwStart = 'closed';
      // a tool talking to this tab never waits behind a view meant for a person (as the resume popup: 12-session)
      const prev = window.BW?.dismissBlockers;
      if (prev) window.BW.dismissBlockers = (o) => { let n = prev(o); if (START.isOpen()) { START.close(); n += 1; } return n; };
      // the brand mark in the quick strip opens it too (a convention; no label)
      root.addEventListener('click', (e) => { if (e.target.closest?.('.island .brand') && !START.isOpen()) START.open(); });
      // 0.18.2: the host's mirror comes in at boot, in parallel with this page: a document it brings (a new browser profile, the host's own tab) joins the open list at once
      window.addEventListener('bw:library-ingested', () => { if (START.isOpen()) START.refresh(); });
      START.auto().catch((e) => console.error(e));
    },
    keydown: (e) => { if ((e.ctrlKey || e.metaKey) && e.altKey && !e.shiftKey && e.key.toLowerCase() === 'n') { e.preventDefault(); START.open(); return true; } return false; },
  },
});
