/* Business-Wrap editor — the font picker: a searchable list (type to filter, arrow keys, A→Z) in three
 * sections: the project's fonts (Thmanyah, the default), the fonts installed on this computer (Local Font
 * Access API, asked on a button press) and fonts uploaded into this document (@font-face from a data URI,
 * saved in doc.design.fontFaces). The choice is saved in the document (doc.design.fonts) through an op,
 * so the edits JSON, undo, the PDF and the DOCX all carry it.
 * Concatenated by engine/build-editor.mjs before editor/editor.js (uses its state and helpers at call time). */

const FONT_MAX_BYTES = 2 * 1024 * 1024;
const FONTS = {
  local: null, // [{family, data}] once read, sorted
  status: '', // '' | 'noApi' | 'denied' | 'fileBlocked'
  open: null, // the role whose list is open: 'text' | 'display'
  collator() { return new Intl.Collator(S.ui === 'ar' ? ['ar', 'en'] : ['en', 'ar'], { sensitivity: 'base', numeric: true }); },
  sort(list) { const c = FONTS.collator(); return list.slice().sort((a, b) => c.compare(a, b)); },
  uploaded() { return cur().doc.design?.fontFaces || []; },
  project() { return FONTS.sort(DATA.fontFamilies); },
  chosen(role) { return designTheme(S.theme, cur().doc).fonts[role] || ''; },
  sourceOf(fam) {
    if (FONTS.uploaded().some((f) => f.family === fam)) return 'uploaded';
    if (DATA.fontFamilies.includes(fam)) return 'project';
    return 'local';
  },
  /** [kind, message] under the picker: a machine font is named as one (it prints and embeds as real text) */
  warning(fam) {
    return FONTS.sourceOf(fam) === 'local' ? ['info', t('font.machineNote')] : null;
  },

  /** one picker: a button that shows the chosen font in its own face, and the list it opens */
  picker(role) {
    const fam = FONTS.chosen(role);
    const isDefault = fam === S.theme.fonts[role];
    const warn = FONTS.warning(fam);
    return `<div class="fp" data-fp="${role}">
<span class="vc-l" id="fp-${role}-l">${esc(t('font.' + role))}</span><p class="hint" id="fp-${role}-h">${esc(t('font.' + role + 'Hint'))}</p>
<button type="button" class="fp-btn" data-fpopen="${role}" aria-haspopup="listbox" aria-expanded="false" aria-labelledby="fp-${role}-l fp-${role}-v" aria-describedby="fp-${role}-h"><span class="fp-v" id="fp-${role}-v" style="font-family:'${safeFamily(fam)}'">${esc(fam)}</span>${isDefault ? `<span class="fp-tag">${esc(t('font.default'))}</span>` : ''}<span class="fp-caret" aria-hidden="true">▾</span></button>
<div class="fp-pop" hidden></div>
<p class="fp-warn hint ${warn ? warn[0] : ''}" role="status">${warn ? `<span class="i">${ic(warn[0])}</span> ${esc(warn[1])}` : ''}</p></div>`;
  },
  options(role, q = '') {
    const chosen = FONTS.chosen(role);
    // Arabic folding (hamza forms, diacritics) plus Latin accents and case: «ecran» finds «Écran»
    const key = (x) => fold(String(x).normalize('NFD').replace(/[̀-ͯ]/g, ''));
    const needle = key(q.trim());
    const hit = (f) => !needle || key(f).includes(needle);
    const uploaded = FONTS.sort([...new Set(FONTS.uploaded().map((f) => f.family))]);
    const groups = [
      ['project', FONTS.project()],
      ['local', FONTS.local ? FONTS.local.map((x) => x.family) : []],
      ['uploaded', uploaded],
    ];
    let n = 0;
    const sample = t('font.sample');
    const html = groups.map(([g, list]) => {
      const shown = list.filter(hit);
      n += shown.length;
      const extra = g === 'local' && !FONTS.local
        ? `<div class="fp-act" aria-hidden="false"><button type="button" class="b" data-fplocal="${role}"><span class="w">${esc(t('font.askLocal'))}</span></button><p class="hint">${esc(FONTS.status ? t('font.' + FONTS.status) : t('font.askLocalHint'))}</p></div>`
        : g === 'uploaded' ? `<div class="fp-act"><button type="button" class="b" data-fpupload="${role}"><span class="w">${esc(t('font.upload'))}</span></button><p class="hint">${esc(t('font.uploadHint'))}</p></div>` : '';
      const opts = shown.map((f, i) => `<div role="option" id="fp-${role}-${g}-${i}" class="fp-o" data-fam="${attr(f)}" aria-selected="${f === chosen}"><span class="fp-name">${esc(f)}${g === 'project' && f === S.theme.fonts[role] ? ` <span class="fp-tag">${esc(t('font.default'))}</span>` : ''}</span><span class="fp-prev" style="font-family:'${safeFamily(f)}'" aria-hidden="true">${esc(sample)}</span></div>`).join('');
      return `<div class="fp-g" data-g="${g}"><p class="fp-gt">${esc(t('font.' + g))}</p>${opts ? `<div role="group" aria-label="${attr(t('font.' + g))}">${opts}</div>` : ''}${extra}</div>`;
    }).join('');
    return { html, n };
  },
  fill(role) {
    const box = root.querySelector(`.drawer .fp[data-fp="${role}"] .fp-pop`);
    const q = box.querySelector('input')?.value || '';
    const { html, n } = FONTS.options(role, q);
    if (!box.querySelector('input')) {
      box.innerHTML = `<input type="search" class="fp-q" role="combobox" aria-expanded="true" aria-autocomplete="list" aria-controls="fp-${role}-list" aria-label="${attr(t('font.search'))}" placeholder="${attr(t('font.search'))}" autocomplete="off" spellcheck="false">
<p class="hint fp-count" role="status"></p><div class="fp-list" role="listbox" id="fp-${role}-list" aria-label="${attr(t('font.' + role))}"></div><div class="fp-acts"></div>`;
    }
    const list = box.querySelector('.fp-list');
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    // the action buttons sit outside the listbox (a listbox holds options and groups only)
    const acts = [...tmp.querySelectorAll('.fp-act')];
    acts.forEach((a) => a.remove());
    tmp.querySelectorAll('.fp-g').forEach((g) => { if (!g.querySelector('[role="option"]')) g.remove(); });
    list.innerHTML = '';
    for (const g of [...tmp.querySelectorAll('.fp-g')]) {
      const grp = g.querySelector('[role="group"]');
      const title = g.querySelector('.fp-gt');
      title.setAttribute('aria-hidden', 'true');
      grp.prepend(title);
      list.append(grp);
    }
    box.querySelector('.fp-acts').replaceChildren(...acts);
    box.querySelector('.fp-count').textContent = n ? t('font.count', { n }) : t('font.none');
    FONTS.move(role, 0, true);
  },
  toggle(role, on = FONTS.open !== role) {
    if (FONTS.open && FONTS.open !== role) FONTS.toggle(FONTS.open, false);
    const fp = root.querySelector(`.drawer .fp[data-fp="${role}"]`);
    if (!fp) return;
    const pop = fp.querySelector('.fp-pop');
    fp.querySelector('.fp-btn').setAttribute('aria-expanded', String(on));
    pop.hidden = !on;
    FONTS.open = on ? role : null;
    if (on) {
      FONTS.fill(role);
      pop.querySelector('.fp-q').focus();
      pop.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
    } else pop.innerHTML = '';
  },
  /** move the active option (activedescendant); start = jump to the chosen one */
  move(role, d, start = false) {
    const pop = root.querySelector(`.drawer .fp[data-fp="${role}"] .fp-pop`);
    const opts = [...pop.querySelectorAll('[role="option"]')];
    const q = pop.querySelector('.fp-q');
    let i = opts.findIndex((o) => o.classList.contains('active'));
    if (start) i = Math.max(0, opts.findIndex((o) => o.getAttribute('aria-selected') === 'true'));
    else i = d === 'home' ? 0 : d === 'end' ? opts.length - 1 : Math.min(opts.length - 1, Math.max(0, i + d));
    opts.forEach((o) => o.classList.remove('active'));
    const o = opts[i];
    if (!o) { q.removeAttribute('aria-activedescendant'); return; }
    o.classList.add('active');
    q.setAttribute('aria-activedescendant', o.id);
    if (!start) o.scrollIntoView({ block: 'nearest' });
  },
  async choose(role, fam) {
    const d = cur().doc;
    const next = JSON.parse(JSON.stringify(d.design || {}));
    next.fonts = { ...(next.fonts || {}) };
    if (fam === S.theme.fonts[role]) delete next.fonts[role]; else next.fonts[role] = fam;
    if (!Object.keys(next.fonts).length) delete next.fonts;
    commit([{ op: 'replace', path: '/design', value: next, old: d.design }], { mirror: true });
    FONTS.toggle(role, false);
    FONTS.refresh(role);
    root.querySelector(`.drawer [data-fpopen="${role}"]`)?.focus();
  },
  /** the picker's button and note, redrawn in place (the drawer itself stays where it is) */
  refresh(role) {
    const fp = root.querySelector(`.drawer .fp[data-fp="${role}"]`);
    if (!fp) return;
    const tmp = document.createElement('div');
    tmp.innerHTML = FONTS.picker(role);
    fp.querySelector('.fp-btn').replaceWith(tmp.querySelector('.fp-btn'));
    fp.querySelector('.fp-warn').replaceWith(tmp.querySelector('.fp-warn'));
  },
  async loadLocal(role, quiet = false) {
    if (!('queryLocalFonts' in window)) { FONTS.status = 'noApi'; if (!quiet && role) FONTS.fill(role); return; }
    try {
      const all = await window.queryLocalFonts();
      // one entry per family (one FontData per face comes back), the upright regular face kept for reading its file
      const byFam = new Map();
      for (const f of all) {
        if (!f.family) continue;
        const k = f.family.toLocaleLowerCase();
        const prev = byFam.get(k);
        if (!prev || (/^(regular|normal|book|roman)$/i.test(f.style) && !/^(regular|normal|book|roman)$/i.test(prev.style))) byFam.set(k, prev ? { ...f, family: prev.family, blob: f.blob.bind(f) } : f);
      }
      const house = new Set(DATA.fontFamilies.map((f) => f.toLocaleLowerCase()));
      const list = [...byFam.values()].filter((f) => !house.has(f.family.toLocaleLowerCase()));
      const names = FONTS.sort(list.map((f) => f.family));
      FONTS.local = names.map((family) => ({ family, data: list.find((f) => f.family === family) }));
      FONTS.status = '';
    } catch (err) {
      // a page opened as a file may be refused where localhost is not: say so, and point at the server and the upload
      FONTS.status = location.protocol === 'file:' ? 'fileBlocked' : ['NotAllowedError', 'SecurityError'].includes(err?.name) ? 'denied' : 'noApi';
    }
    if (role && FONTS.open === role) { FONTS.fill(role); root.querySelector(`.drawer .fp[data-fp="${role}"] .fp-q`)?.focus(); }
  },
  /** the machine list loads by itself when the permission was given before (no prompt) */
  async autoLocal() {
    if (FONTS.local || !('queryLocalFonts' in window) || !navigator.permissions) return;
    try { if ((await navigator.permissions.query({ name: 'local-fonts' })).state === 'granted') await FONTS.loadLocal(null, true); } catch { /* the permission name is unknown here: wait for the button */ }
  },
  async upload(role) {
    const f = await pickFile('.ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2');
    if (!f) return;
    if (f.size > FONT_MAX_BYTES) { toast(t('font.tooBig'), 'err'); return; }
    const bytes = new Uint8Array(await f.arrayBuffer());
    const info = sfntFromBytes(bytes);
    if (!info || info.format === 'ttc') { toast(t('font.badFile'), 'err'); return; }
    const family = (info.family || f.name.replace(/\.[^.]+$/, '')).replace(/[^\p{L}\p{N}\s._-]/gu, '').trim().slice(0, 80) || 'Uploaded font';
    const src = await readAs(new Blob([bytes], { type: `font/${info.format}` }), 'url');
    const weight = info.weight >= 600 ? 700 : 400;
    const d = cur().doc;
    const next = JSON.parse(JSON.stringify(d.design || {}));
    next.fontFaces = [...(next.fontFaces || []).filter((x) => !(x.family === family && +x.weight === weight)), { family, weight, src, format: info.format, outlines: info.outlines, embed: !!info.embeddable }];
    next.fonts = { ...(next.fonts || {}), [role]: family };
    commit([{ op: 'replace', path: '/design', value: next, old: d.design }], { mirror: true });
    toast(t('font.added', { x: family }), 'ok');
    FONTS.toggle(role, false);
    openDrawer('theme');
    root.querySelector(`.drawer [data-fpopen="${role}"]`)?.focus();
  },
  remove(fam) {
    const d = cur().doc;
    const next = JSON.parse(JSON.stringify(d.design || {}));
    next.fontFaces = (next.fontFaces || []).filter((x) => x.family !== fam);
    if (!next.fontFaces.length) delete next.fontFaces;
    for (const r of ['text', 'display']) if (next.fonts?.[r] === fam) delete next.fonts[r];
    commit([{ op: 'replace', path: '/design', value: next, old: d.design }], { mirror: true });
    openDrawer('theme');
  },
  /** the uploaded fonts of this document, each with a remove button */
  uploadedList() {
    const fams = FONTS.sort([...new Set(FONTS.uploaded().map((f) => f.family))]);
    return fams.length ? `<ul class="list fp-up">${fams.map((f) => `<li><span style="font-family:'${safeFamily(f)}'">${esc(f)}</span> <button type="button" class="b" data-fprm="${attr(f)}" aria-label="${attr(t('font.remove', { x: f }))}"><span class="i">${ic('delete')}</span></button></li>`).join('')}</ul>` : '';
  },

  /* events, routed from the drawer's own handlers; each returns true when it handled the event */
  click(e) {
    const opt = e.target.closest?.('.fp-o');
    if (opt) { FONTS.choose(opt.closest('.fp').dataset.fp, opt.dataset.fam); return true; }
    const b = e.target.closest?.('button');
    if (!b) { if (FONTS.open && !e.target.closest?.('.fp-pop')) FONTS.toggle(FONTS.open, false); return false; }
    if (b.dataset.fpopen) { FONTS.toggle(b.dataset.fpopen); return true; }
    if (b.dataset.fplocal) { FONTS.loadLocal(b.dataset.fplocal); return true; }
    if (b.dataset.fpupload) { FONTS.upload(b.dataset.fpupload); return true; }
    if (b.dataset.fprm) { FONTS.remove(b.dataset.fprm); return true; }
    if (FONTS.open && !b.closest('.fp-pop')) FONTS.toggle(FONTS.open, false);
    return false;
  },
  input(e) {
    if (!e.target.classList?.contains('fp-q')) return false;
    FONTS.fill(e.target.closest('.fp').dataset.fp);
    return true;
  },
  keydown(e) {
    const fp = e.target.closest?.('.fp');
    if (!fp) return false;
    const role = fp.dataset.fp;
    if (e.target.classList.contains('fp-btn') && ['ArrowDown', 'ArrowUp'].includes(e.key)) { e.preventDefault(); FONTS.toggle(role, true); return true; }
    if (!e.target.closest('.fp-pop')) return false;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); FONTS.toggle(role, false); fp.querySelector('.fp-btn').focus(); return true; }
    if (!e.target.classList.contains('fp-q')) return false;
    const step = { ArrowDown: 1, ArrowUp: -1, PageDown: 10, PageUp: -10, Home: 'home', End: 'end' }[e.key];
    if (step !== undefined && !(typeof step === 'string' && e.target.value)) { e.preventDefault(); FONTS.move(role, step); return true; }
    if (e.key === 'Enter') {
      e.preventDefault();
      const o = fp.querySelector('.fp-o.active');
      if (o) FONTS.choose(role, o.dataset.fam);
      return true;
    }
    if (e.key === 'Tab') FONTS.toggle(role, false);
    return false;
  },
};
