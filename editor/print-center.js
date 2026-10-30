/* Business-Wrap editor — Export & Print centre (0.11.0), concatenated after views.js.
 * Export menu (toolbar «تصدير»): every format one click, AR / EN / both. With the local server (npm run serve) the
 * engine makes the PDF, DOCX and print HTML (engine/printers.mjs, /api/export/file) and the file is downloaded or saved
 * in a chosen folder; from file:// the in-browser formats still work (HTML, JSON, Mermaid, SVG, PNG, PDF through the
 * browser's print dialog) and the server-only ones say plainly how to start the server.
 * Print panel («طباعة», Ctrl+P): the machine's printers through the server (/api/print/printers), refresh, options,
 * preview (/api/pages) and «اطبع» (/api/print/job: the engine's PDF straight to the chosen printer).
 * The watermark is UI only: it never reaches any of these files. Declarations only (hoisted), listeners at the end. */

function pcExportIds() {
  return ['export.pdf.ar', 'export.pdf.en', 'export.pdf.both', 'export.docx.ar', 'export.docx.en', 'export.docx.both', 'export.html', 'export.printHtml', 'export.edits', 'export.editsAll', 'export.pack', 'export.mermaid', 'export.svg', 'export.png'];
}
function pcServer() { return location.protocol.startsWith('http'); }
function pcServerOnly(id) { return ['export.docx.ar', 'export.docx.en', 'export.docx.both', 'export.printHtml'].includes(id); }
function pcOpts() {
  if (!S.pc) { let f = ''; try { f = ls.get('bw:exportFolder') || ''; } catch { /* no storage */ } S.pc = { range: '', cover: true, folder: f }; }
  return S.pc;
}
/** The diagram blocks of this edition. */
function pcDiagrams() {
  const out = [];
  for (const ch of cur().doc.chapters || []) for (const sec2 of ch.sections || []) for (const b of sec2.blocks || []) if (b.kind === 'diagram') out.push(b);
  return out;
}

/** The toolbar's Export button and its menu (a «More»-style menu: top layer, anchored, Esc / outside click close it). */
function pcExportMenu() {
  const o = pcOpts();
  const srv = pcServer();
  const hasDg = pcDiagrams().length > 0;
  const item = (id) => {
    const need = !srv && pcServerOnly(id);
    const noDg = !hasDg && /^export\.(mermaid|svg|png)$/.test(id);
    const l = /\.(ar|en)$/.exec(id)?.[1];
    const noEd = l && !M[S.svc][l];
    const note = need ? t('export.needsServer') : noDg ? t('export.noDiagram') : noEd ? t('export.noEdition') : '';
    return btn(id, { extra: note ? ` aria-disabled="true" data-note="${esc(note)}"` : '' });
  };
  // a row group (PDF, DOCX, diagram) says once why its tools are unavailable, beside its heading
  const why = (k) => (k === 'docx' && !srv ? t('export.needsServer') : k === 'diagram' && !hasDg ? t('export.noDiagram') : '');
  const grp = (k, ids, row = false) => `<div class="pc-g${row ? ' row' : ''}" role="group" aria-labelledby="pcg-${k}"><span class="pc-h" id="pcg-${k}">${esc(t('export.g.' + k))}${why(k) ? `<span class="pc-badge">${esc(why(k))}</span>` : ''}</span>${ids.map(item).join('')}</div>`;
  const name = t('export.menu');
  return `<div class="more pcx"><button type="button" class="b" data-a="more" data-x="export.menu" aria-expanded="false" aria-haspopup="true" title="${esc(name)}"><span class="i">${ic('export.menu')}</span><span class="w" data-alt="${esc(tAlt('export.menu'))}">${esc(name)}</span></button>
<div class="menu pc-menu" role="group" aria-label="${esc(name)}" hidden>
  <div class="pc-opts">
    <label class="pc-f"><span>${esc(t('export.range'))}</span><input type="text" data-pc="range" inputmode="numeric" placeholder="1-3,5" value="${esc(o.range)}" spellcheck="false"></label>
    <label class="pc-c"><input type="checkbox" data-pc="cover" ${o.cover ? 'checked' : ''}> <span>${esc(t('export.cover'))}</span></label>
    ${srv ? `<label class="pc-f wide"><span>${esc(t('export.folder'))}</span><input type="text" data-pc="folder" placeholder="${esc(t('export.folderHint'))}" value="${esc(o.folder)}" spellcheck="false" dir="ltr"></label>` : `<p class="pc-note">${esc(t('export.offline'))}</p>`}
    <p class="pc-note">${esc(t('export.noWatermark'))}</p>
  </div>
  ${grp('pdf', ['export.pdf.ar', 'export.pdf.en', 'export.pdf.both'], true)}
  ${grp('docx', ['export.docx.ar', 'export.docx.en', 'export.docx.both'], true)}
  ${grp('files', ['export.html', 'export.printHtml', 'export.edits', 'export.editsAll', 'export.pack'])}
  ${grp('diagram', ['export.mermaid', 'export.svg', 'export.png'], true)}
</div></div>`;
}

/** The editions an action covers: ar / en / both (the ones this service has). */
function pcEds(l) { return (l === 'both' ? ['ar', 'en'] : [l]).filter((x) => M[S.svc][x]); }
async function pcAction(a) {
  const el = root.querySelector(`[data-a="${a}"][aria-disabled="true"]`);
  if (el) {
    if (pcServerOnly(a) && !pcServer()) banner(t('export.serverHow'), [[t('close'), () => {}]]);
    else toast(el.dataset.note, 'warn');
    return;
  }
  const [, kind, l] = a.split('.');
  const o = pcOpts();
  if (kind === 'html') { await saveHtml(!!S.embedFonts); return; }
  if (kind === 'edits') { await runAction('exportEdits'); return; }
  if (kind === 'editsAll') { await runAction('exportAll'); return; }
  if (kind === 'pack') { exportDesignPack(); return; }
  if (kind === 'mermaid' || kind === 'svg' || kind === 'png') { await pcDiagram(kind); return; }
  if (kind === 'pdf' && !pcServer()) { pcBrowserPdf(l); return; }
  const format = kind === 'printHtml' ? 'printHtml' : kind;
  if (!o.folder) await beforeExport(); // the first export asks for the save folder (A11), unless a folder is chosen here
  busy(true);
  try {
    for (const ed of pcEds(l || S.ed)) {
      const body = { service: S.svc, locale: ed, doc: M[S.svc][ed].doc, theme: S.theme, format, range: format === 'pdf' ? o.range : '', cover: o.cover, folder: o.folder || undefined, embedFonts: S.docxFonts };
      const r = await fetch('/api/export/file', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || r.status);
      if (j.url && !o.folder) pcFetchDownload(j.url, j.file.split(/[\\/]/).pop());
      toast(t('export.saved', { x: j.file }), 'ok');
      emitHook('export', { [format]: true, locale: ed });
    }
  } catch (err) { flash(String(err.message || err), true); } finally { busy(false); }
}
function pcFetchDownload(url, name) {
  const x = document.createElement('a');
  x.href = url;
  x.download = name;
  document.body.appendChild(x);
  x.click();
  setTimeout(() => x.remove(), 1000);
}
/** file://: the browser's own print dialog («Save as PDF»), one edition after the other. */
function pcBrowserPdf(l) {
  const back = S.ed;
  toast(t('export.browserPdf'), 'info');
  for (const ed of pcEds(l)) { if (ed !== S.ed) setLang(ed); window.print(); }
  if (S.ed !== back) setLang(back);
}
/** The diagrams as Mermaid text, SVG or PNG (2×), drawn by the same renderer the page uses. */
async function pcDiagram(kind) {
  const dgs = pcDiagrams();
  const th = designTheme(S.theme, cur().doc);
  for (const [i, b] of dgs.entries()) {
    const stem = `${S.svc}.${S.ed}.diagram${dgs.length > 1 ? `-${i + 1}` : ''}`;
    if (kind === 'mermaid') { download(`${stem}.mmd`, DIAGRAM.toMermaid(b.model || {}), 'text/plain'); continue; }
    const svg = DIAGRAM.render(b.model || {}, { theme: th, locale: S.ed, title: b.caption });
    if (kind === 'svg') { download(`${stem}.svg`, svg, 'image/svg+xml'); continue; }
    const png = await pcSvgToPng(svg);
    download(`${stem}.png`, png, 'image/png');
  }
  toast(t('export.done', { n: dgs.length }), 'ok');
}
function pcSvgToPng(svg) {
  return new Promise((ok, bad) => {
    const img = new Image();
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.naturalWidth * 2;
      c.height = img.naturalHeight * 2;
      const g = c.getContext('2d');
      g.fillStyle = '#fff';
      g.fillRect(0, 0, c.width, c.height);
      g.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob((b) => (b ? ok(b) : bad(new Error('png'))), 'image/png');
    };
    img.onerror = () => { URL.revokeObjectURL(url); bad(new Error('svg')); };
    img.src = url;
  });
}

/* ── the Print panel ─────────────────────────────────────────────────────── */
function pcPrintState() {
  if (!S.pp) S.pp = { printers: [], at: '', printer: '', ed: S.ed, copies: 1, range: '', color: 'color', duplex: 'one', paper: '', orientation: 'auto', error: '' };
  return S.pp;
}
/** the print center leaves with the shared exit (editor.js leaveEl): fade and a small scale, then the native close */
function pcClose(d = root.querySelector('dialog.pc-dlg')) { if (d?.open) leaveEl(d, () => d.close()); }
function pcOpenPrint() {
  const shell = root.querySelector('.shell');
  if (!shell) return;
  uxMenusOpen().forEach((m) => uxMenuClose(m));
  let d = root.querySelector('dialog.pc-dlg');
  if (!d) {
    d = document.createElement('dialog');
    d.className = 'pc-dlg';
    d.addEventListener('keydown', (e) => { if (e.key === 'Escape') e.stopPropagation(); }); // Esc closes this panel only
    d.addEventListener('cancel', (e) => { e.preventDefault(); pcClose(d); }); // Esc leaves the way the button does (UIP-13)
    d.addEventListener('click', pcPrintClick);
    d.addEventListener('change', pcPrintChange);
    d.addEventListener('input', pcPrintChange);
  }
  if (d.parentNode !== shell) shell.appendChild(d);
  d.dir = LAYOUT_DIR;
  d.lang = S.ui;
  d.setAttribute('aria-labelledby', 'pc-title');
  pcPrintRender(d);
  arriveEl(d);
  if (!d.open) d.showModal();
  d.querySelector('[data-pp="close"]')?.focus();
  if (pcServer() && !pcPrintState().at) pcRefresh(false);
}
function pcPrintRender(d = root.querySelector('dialog.pc-dlg')) {
  if (!d) return;
  const p = pcPrintState();
  const head = `<header class="pc-hd"><span class="i">${ic('print')}</span><h2 id="pc-title">${esc(t('print.title'))}</h2><button type="button" class="b" data-pp="close" aria-label="${esc(t('close'))}"><span class="i">${ic('close')}</span><span class="w">${esc(t('close'))}</span></button></header>`;
  if (!pcServer()) {
    d.innerHTML = `${head}<div class="pc-body"><p>${esc(t('print.offline'))}</p><p class="pc-code" dir="ltr"><code>npm run serve</code></p><p class="pc-note">${esc(t('print.offlineHow'))}</p></div>
<footer class="pc-ft"><button type="button" class="b primary" data-pp="browser"><span class="i">${ic('print.browser')}</span><span class="w">${esc(t('print.browser'))}</span></button></footer>`;
    return;
  }
  const sel = p.printers.find((x) => x.name === p.printer);
  const st = (s) => `<span class="pc-st ${s}">${esc(t('print.st.' + s))}</span>`;
  const rows = p.printers.map((x, i) => `<label class="pc-row"><input type="radio" name="pc-prn" value="${i}" ${x.name === p.printer ? 'checked' : ''}><span class="pc-n">${esc(x.name)}</span>${x.default ? `<span class="pc-def">✓ ${esc(t('print.default'))}</span>` : ''}${st(x.status)}${x.paper.length ? `<span class="pc-pp">${esc(t('print.papers', { n: x.paper.length }))}</span>` : ''}</label>`).join('');
  const opt = (k, vals) => `<label class="pc-f"><span>${esc(t('print.' + k))}</span><select data-po="${k}">${vals.map(([v, l]) => `<option value="${esc(v)}" ${String(p[k]) === String(v) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;
  const eds = ['ar', 'en'].filter((x) => M[S.svc][x]);
  d.innerHTML = `${head}<div class="pc-body">
  <section class="pc-prs" aria-labelledby="pc-prs-h"><div class="pc-ph"><h3 id="pc-prs-h">${esc(t('print.printers'))}</h3>
    <button type="button" class="b" data-pp="refresh" ${S.ppBusy ? 'aria-busy="true"' : ''}><span class="i ${S.ppBusy ? 'spin' : ''}">${ic('print.refresh')}</span><span class="w">${esc(t('print.refresh'))}</span></button>
    <span class="pc-at" role="status" aria-live="polite">${p.at ? esc(t('print.at', { x: new Date(p.at).toLocaleTimeString(S.ui === 'ar' ? 'ar' : 'en') })) : esc(t('print.loading'))}</span></div>
    ${p.error ? `<p class="pc-err" role="alert">${esc(p.error)}</p>` : ''}
    <div class="pc-list" role="radiogroup" aria-labelledby="pc-prs-h">${rows || `<p class="pc-note">${esc(p.at ? t('print.none') : t('print.loading'))}</p>`}</div></section>
  <section class="pc-os" aria-label="${esc(t('print.options'))}">
    ${opt('ed', [...eds.map((x) => [x, t(x === 'ar' ? 'print.edAr' : 'print.edEn')]), ...(eds.length > 1 ? [['both', t('print.both')]] : [])])}
    <label class="pc-f"><span>${esc(t('print.copies'))}</span><input type="number" data-po="copies" min="1" max="99" value="${p.copies}"></label>
    <label class="pc-f"><span>${esc(t('print.range'))}</span><input type="text" data-po="range" inputmode="numeric" placeholder="${esc(t('print.all'))}" value="${esc(p.range)}" spellcheck="false"></label>
    ${opt('color', [['color', t('print.colour')], ['mono', t('print.mono')]])}
    ${opt('duplex', [['one', t('print.one')], ['long', t('print.long')], ['short', t('print.short')]])}
    ${opt('paper', [['', t('print.paperDefault')], ...(sel?.paper || []).map((x) => [x, x])])}
    ${opt('orientation', [['auto', t('print.auto')], ['portrait', t('print.portrait')], ['landscape', t('print.landscape')]])}
  </section>
  <div class="pc-prog" ${S.ppJob ? '' : 'hidden'} role="status" aria-live="polite"><progress aria-label="${esc(t('print.sending'))}"></progress><span>${esc(S.ppJob || '')}</span></div>
  <div class="pc-prev" ${S.ppPrev ? '' : 'hidden'} aria-label="${esc(t('print.preview'))}" role="group">${S.ppPrev || ''}</div>
</div>
<footer class="pc-ft">
  <button type="button" class="b" data-pp="browser"><span class="i">${ic('print.browser')}</span><span class="w">${esc(t('print.browser'))}</span></button>
  <button type="button" class="b" data-pp="preview"><span class="i">${ic('print.preview')}</span><span class="w">${esc(t('print.preview'))}</span></button>
  <button type="button" class="b primary" data-pp="go" ${sel && !S.ppJob ? '' : 'disabled'}><span class="i">${ic('print')}</span><span class="w">${esc(t('print.go'))}</span></button>
</footer>`;
}
async function pcRefresh(force = true) {
  const p = pcPrintState();
  S.ppBusy = true;
  pcPrintRender();
  try {
    const r = await fetch(`/api/print/printers${force ? '?refresh=1' : ''}`);
    const j = await r.json();
    p.printers = j.printers || [];
    p.at = j.at || new Date().toISOString();
    p.error = j.error || '';
    if (!p.printers.some((x) => x.name === p.printer)) p.printer = (p.printers.find((x) => x.default && x.status === 'online') || p.printers.find((x) => x.status === 'online') || p.printers[0])?.name || ''; // never an offline printer by default
  } catch (e) { p.error = String(e.message || e); p.at = new Date().toISOString(); }
  S.ppBusy = false;
  pcPrintRender();
}
function pcPrintChange(e) {
  const p = pcPrintState();
  const x = e.target;
  if (x.name === 'pc-prn') { p.printer = p.printers[+x.value]?.name || ''; p.paper = ''; if (e.type === 'change') { pcPrintRender(); root.querySelector(`dialog.pc-dlg input[name="pc-prn"][value="${x.value}"]`)?.focus(); } return; }
  if (x.dataset.po) p[x.dataset.po] = x.dataset.po === 'copies' ? Math.max(1, Math.min(99, parseInt(x.value, 10) || 1)) : x.value;
}
async function pcPrintClick(e) {
  const b = e.target.closest('[data-pp]');
  const d = root.querySelector('dialog.pc-dlg');
  if (!b) { if (e.target === d) pcClose(d); return; } // a click on the backdrop closes
  const k = b.dataset.pp;
  if (k === 'close') { pcClose(d); return; }
  if (k === 'browser') { d.classList.remove('closing'); d.close(); window.print(); return; }
  if (k === 'refresh') { await pcRefresh(true); root.querySelector('dialog.pc-dlg [data-pp="refresh"]')?.focus(); return; }
  const p = pcPrintState();
  const eds = pcEds(p.ed);
  if (k === 'preview') {
    S.ppJob = t('print.preparing');
    pcPrintRender();
    try {
      const r = await fetch('/api/pages', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ doc: M[S.svc][eds[0]].doc, theme: S.theme, locale: eds[0] }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || r.status);
      const want = pcPages(p.range);
      S.ppPrev = j.pages.filter((x) => !want || want.has(x.n)).map((x) => `<figure><img alt="${esc(t('page', { n: x.n }))}" src="${x.png}" class="${x.wide ? 'wide' : ''}"><figcaption>${x.n}</figcaption></figure>`).join('') || `<p class="pc-note">${esc(t('print.noPages'))}</p>`;
    } catch (err) { toast(String(err.message || err), 'err'); }
    S.ppJob = '';
    pcPrintRender();
    return;
  }
  if (k === 'go') {
    try {
      for (const ed of eds) {
        S.ppJob = t('print.sendingTo', { x: p.printer });
        pcPrintRender();
        const body = { service: S.svc, locale: ed, doc: M[S.svc][ed].doc, theme: S.theme, printer: p.printer, copies: p.copies, range: p.range, color: p.color, duplex: p.duplex, paper: p.paper, orientation: p.orientation };
        const r = await fetch('/api/print/job', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
        const j = await r.json();
        if (!r.ok || !j.ok) throw new Error(j.error || r.status);
        toast(t('print.queued', { x: j.printer, id: j.jobId != null ? ` · ${t('print.job')} ${j.jobId}` : '' }), 'ok');
      }
    } catch (err) { toast(String(err.message || err), 'err'); }
    S.ppJob = '';
    pcPrintRender();
  }
}
function pcPages(range) {
  if (!String(range || '').trim()) return null;
  return new Set(String(range).replace(/\s+/g, '').split(',').flatMap((r) => { const [a, b = a] = r.split('-').map(Number); return Array.from({ length: Math.max(0, b - a + 1) }, (_, i) => a + i); }));
}

/* listeners (run after boot): the menu's options are remembered while the toolbar rebuilds */
root.addEventListener('input', (e) => {
  const k = e.target.dataset?.pc;
  if (!k) return;
  const o = pcOpts();
  o[k] = e.target.type === 'checkbox' ? e.target.checked : e.target.value.trim();
  if (k === 'folder') { try { ls.set('bw:exportFolder', o.folder); } catch { /* no storage */ } }
});
root.addEventListener('change', (e) => { if (e.target.dataset?.pc === 'cover') pcOpts().cover = e.target.checked; });
