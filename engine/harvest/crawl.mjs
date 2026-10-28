// Harvest path B: walk a live e-service with a real browser and record what a user meets: the
// service card, every form step (fields, labels, required flags, options, conditional fields,
// attachments), the validation messages and the statuses after sending. Node only.
//
// Rules: one tab, real-user triggers (focus + keyboard first, a click only as the fallback), a delay
// between actions, robots.txt respected unless the config says otherwise, an OTP/captcha pause that
// waits for the human, headed Chrome unless `headed: false`. Credentials come only from the
// environment ($env:NAME) or the gitignored .local/harvest-secrets.json ($secret:key); typed values
// are never written to the harvest, the log or a screenshot file name.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { launchOptions, REPO, loadPlaywright } from '../export.mjs';

const SECRETS = path.join(REPO, '.local', 'harvest-secrets.json');
export function resolveValue(v) {
  const s = String(v ?? '');
  let m = /^\$env:([A-Z0-9_]+)$/i.exec(s);
  if (m) { if (!(m[1] in process.env)) throw new Error(`missing environment variable ${m[1]}`); return process.env[m[1]]; }
  m = /^\$secret:([\w.-]+)$/.exec(s);
  if (m) {
    let all = {};
    try { all = JSON.parse(fs.readFileSync(SECRETS, 'utf8')); } catch { throw new Error('no .local/harvest-secrets.json'); }
    if (!(m[1] in all)) throw new Error(`missing secret ${m[1]}`);
    return all[m[1]];
  }
  return s;
}

// a control whose options are language names is the site's language switcher, never a form field
const LANG_NAMES = /^(english|arabic|العربية|عربي|عربى|الإنجليزية|الانجليزية|انجليزي|إنجليزي|en|ar|fr|français|french|deutsch|español|türkçe|اردو|فارسی)$/i;
export const isLanguageSwitch = (options = []) => options.length >= 2 && options.length <= 12 && options.every((o) => LANG_NAMES.test(String(o).trim()));
/** Share of Arabic letters among the letters of a set of strings (0..1). */
export function arabicShare(strings) {
  const all = strings.join(' ');
  const ar = (all.match(/[\u0600-\u06FF]/g) || []).length;
  const la = (all.match(/[A-Za-z]/g) || []).length;
  return ar + la ? ar / (ar + la) : 0.5;
}
/** A run captured in the wrong language (the portal switched under it): what the site itself localises
 * (titles, step titles, options, validation messages) is mostly in the other script. */
export function wrongLanguage(code, L) {
  const strings = [L.card?.title, ...(L.steps || []).flatMap((s) => [s.title, ...s.validations, ...s.fields.flatMap((f) => [f.label, ...(f.options || [])])])].filter(Boolean);
  if (strings.length < 3) return null;
  const share = arabicShare(strings);
  if (code === 'ar' && share < 0.25) return `the Arabic run captured mostly Latin text (${Math.round(share * 100)}% Arabic)`;
  if (code === 'en' && share > 0.35) return `the English run captured mostly Arabic text (${Math.round(share * 100)}% Arabic)`;
  return null;
}

// ── safety: the crawler never files a request unless asked ───────────────────────────────────────
// A final action is a control that sends, submits, confirms, pays or finishes; "Next / Continue" is not.
const FINAL = /(^|\s)(إرسال|ارسال|تقديم|قدّم|حفظ\s*و\s*إرسال|حفظ\s*وإرسال|تأكيد|تاكيد|دفع|ادفع|إنهاء|انهاء|اعتماد|send|submit|confirm|pay|finish|complete|place\s+order|file\s+(the\s+)?request|apply\s+now)(\s|$|[.!؟?])/i;
const STEP = /(^|\s)(التالي|التالى|متابعة|استمرار|السابق|next|continue|proceed|back|previous)(\s|$)/i;
export const isFinalLabel = (text) => FINAL.test(String(text || '').trim()) && !STEP.test(String(text || '').trim());
/** Is this control a final action? Its own text / aria-label / value, or a plain type=submit with no step word. */
async function isFinalAction(page, selector) {
  const el = page.locator(selector).first();
  const info = await el.evaluate((e) => ({ text: (e.innerText || e.value || e.getAttribute('aria-label') || e.title || '').replace(/\s+/g, ' ').trim(), type: (e.getAttribute('type') || '').toLowerCase(), tag: e.tagName })).catch(() => null);
  if (!info) return false;
  if (isFinalLabel(info.text)) return true;
  if (STEP.test(info.text)) return false;
  return info.type === 'submit' || (info.tag === 'BUTTON' && !info.type); // a form's default button with no step word: treat as final
}
/** Filing a real request needs submit: true in the config AND the explicit go-ahead (flag or typed YES). */
export async function mayFile(cfg, { yesFileRealRequest = false, ask } = {}) {
  if (cfg.submit !== true) return false;
  if (yesFileRealRequest) return true;
  if (ask) return !!(await ask());
  if (!process.stdin.isTTY) return false;
  const rl = (await import('node:readline')).createInterface({ input: process.stdin, output: process.stderr });
  const answer = await new Promise((ok) => rl.question('This crawl will FILE A REAL REQUEST on the live service. Type YES to go ahead: ', ok));
  rl.close();
  return answer.trim() === 'YES';
}

async function robotsAllows(page, url, ua = '*') {
  const u = new URL(url);
  let txt = '';
  try { const r = await page.request.get(`${u.origin}/robots.txt`, { timeout: 8000 }); if (r.ok()) txt = await r.text(); } catch { return true; }
  let active = false;
  const dis = [];
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    const m = /^(user-agent|disallow|allow)\s*:\s*(.*)$/i.exec(line);
    if (!m) continue;
    if (m[1].toLowerCase() === 'user-agent') active = m[2] === '*' || m[2].toLowerCase() === ua;
    else if (active && m[1].toLowerCase() === 'disallow' && m[2]) dis.push(m[2]);
  }
  return !dis.some((d) => u.pathname.startsWith(d));
}

/** Press like a person: focus + Enter (or Space for checkables), a click only if that did nothing. */
async function press(page, selector, { timeout = 10000 } = {}) {
  const el = page.locator(selector).first();
  await el.waitFor({ state: 'visible', timeout });
  const before = page.url() + (await page.content()).length;
  await el.focus();
  const tag = await el.evaluate((e) => `${e.tagName}:${e.type || ''}`);
  await page.keyboard.press(/INPUT:(checkbox|radio)/i.test(tag) ? 'Space' : 'Enter');
  await page.waitForLoadState('domcontentloaded').catch(() => {});
  await page.waitForTimeout(150);
  if (page.url() + (await page.content()).length === before) await el.click({ timeout }).catch(() => {});
}

async function pauses(page, rules, log) {
  for (const r of rules || []) {
    if (!(await page.locator(r.selector).first().isVisible().catch(() => false))) continue;
    log(`PAUSED: ${r.message || 'waiting for the human'} (${r.selector})`);
    const until = r.until || 'gone';
    if (until === 'gone') await page.locator(r.selector).first().waitFor({ state: 'detached', timeout: r.timeoutMs ?? 300000 });
    else await page.locator(until).first().waitFor({ state: 'visible', timeout: r.timeoutMs ?? 300000 });
    await page.waitForLoadState('domcontentloaded').catch(() => {});
    log('RESUMED');
  }
}

/** Everything the page shows about the service before the form: h1 / p / dl / two-cell tables, and the
 * SPA patterns: label/value pairs in divs, PrimeNG cards, panels, fieldsets and tabs, description blocks,
 * fee / duration / steps lists. `map` (config `card`) names the selectors when the page needs it:
 * { root, title, description, item, label, value, lists }. */
async function readCard(page, scope, map = {}) {
  return page.evaluate(({ scope, map }) => {
    const NOISE = 'header, nav, footer, [role="banner"], [role="navigation"], [role="contentinfo"], .p-menubar, .layout-topbar, .topbar';
    const root = (map.root && document.querySelector(map.root)) || (scope && document.querySelector(scope)) || document.querySelector('main, [role="main"], app-root, body') || document.body;
    const t = (e) => (e?.innerText || e?.textContent || '').replace(/\s+/g, ' ').trim();
    const ok = (e) => e && !e.closest(NOISE);
    const all = (sel) => [...root.querySelectorAll(sel)].filter(ok);
    const pairs = [];
    const add = (k, v) => { k = String(k || '').replace(/[:：]\s*$/, '').trim(); v = String(v || '').trim(); if (k && v && k !== v && k.length <= 80 && !pairs.some(([a]) => a === k)) pairs.push([k, v]); };
    if (map.item) all(map.item).forEach((it) => add(t(it.querySelector(map.label || '.label, [class*="label"], dt, th, strong, b')), t(it.querySelector(map.value || '.value, [class*="value"], dd, td, span:last-child'))));
    all('dl').forEach((dl) => dl.querySelectorAll('dt').forEach((dt) => add(t(dt), t(dt.nextElementSibling))));
    all('table').forEach((tb) => tb.querySelectorAll('tr').forEach((tr) => { const c = tr.querySelectorAll('th,td'); if (c.length === 2) add(t(c[0]), t(c[1])); }));
    // label/value siblings in divs: <x class="…label…">Fee</x><y class="…value…">Free</y>, or "Fee:" then the value
    all('[class*="label"], [class*="title"]:not(h1), [class*="key"], strong, b, .p-text-bold, .font-bold').forEach((k) => {
      const v = k.nextElementSibling;
      if (!v || v.querySelector('input, select, textarea, button')) return;
      if (/value|content|text|desc|data/i.test(v.className || '') || /[:：]\s*$/.test(t(k))) add(t(k), t(v));
    });
    // description blocks and lists: PrimeNG cards, panels, fieldsets, tab panels; any heading followed by a list
    const blocks = [];
    const lists = [];
    const section = (title, body) => {
      if (!body) return;
      const items = [...body.querySelectorAll('li')].map(t).filter(Boolean);
      if (items.length) lists.push({ title, items });
      const text = [...body.querySelectorAll('p, .p-card-content > div, .description, [class*="desc"]')].map(t).filter(Boolean);
      const plain = text.length ? text : (!items.length && t(body) ? [t(body)] : []);
      for (const x of plain) if (x && x.length > 3 && !blocks.includes(x)) blocks.push(x);
    };
    all('.p-card').forEach((c) => section(t(c.querySelector('.p-card-title')), c.querySelector('.p-card-content, .p-card-body')));
    all('.p-panel').forEach((c) => section(t(c.querySelector('.p-panel-title, .p-panel-header')), c.querySelector('.p-panel-content')));
    all('.p-fieldset').forEach((c) => section(t(c.querySelector('.p-fieldset-legend, legend')), c.querySelector('.p-fieldset-content')));
    const tabs = all('.p-tabview-nav li, [role="tab"]').map(t);
    all('.p-tabview-panel, [role="tabpanel"]').forEach((c, i) => section(tabs[i] || '', c));
    if (map.lists) all(map.lists).forEach((c) => section(t(c.previousElementSibling), c));
    // a heading (or title) followed by its value or its list: fees, duration, recipients, channels…
    all('h2, h3, h4, h5, h6, [class*="title"]:not(h1):not(.p-card-title):not(.p-panel-title)').forEach((h) => {
      const n = h.nextElementSibling;
      if (!n || n.querySelector('input, select, textarea, button')) return;
      if (n.matches('ul, ol')) { section(t(h), n); add(t(h), [...n.querySelectorAll('li')].map(t).filter(Boolean).join('، ')); }
      else if (t(n) && t(n).length <= 160 && !n.querySelector('h1, h2, h3, h4, h5, h6')) add(t(h), t(n));
    });
    const paras = (map.description ? all(map.description) : all('p')).map(t).filter(Boolean);
    return {
      title: t((map.title && document.querySelector(map.title)) || root.querySelector('h1') || document.querySelector('h1, .p-card-title, h2')) || document.title,
      description: [...paras, ...blocks.filter((b) => !paras.includes(b))].slice(0, 12),
      facts: pairs,
      lists,
    };
  }, { scope, map });
}

/** The visible form controls of the current step, as a user reads them. Native controls and the
 * PrimeNG-style components of SPA portals (p-dropdown / p-select / p-multiselect / p-calendar /
 * p-datepicker / p-radiobutton / p-checkbox / p-inputnumber). Each control is tagged with
 * data-bw-field so it can be filled by that tag when it has no id or name. Labels come from the
 * control's own label (for/id, wrapping label, aria-labelledby, aria-label), then the label of its
 * field container or the label just before it, then the placeholder; never the section title. */
async function readFields(page, scope = {}) {
  return page.evaluate(({ formRoot, exclude }) => {
    const t = (e) => (e?.innerText || e?.textContent || '').replace(/\s+/g, ' ').trim();
    const bare = (s) => String(s || '').replace(/\s*[*＊]\s*/g, ' ').replace(/\s+/g, ' ').trim();
    const starred = (s) => /[*＊]/.test(String(s || ''));
    const cssStar = (l) => !!l && [l, ...l.querySelectorAll('*')].some((x) => ['::after', '::before'].some((pe) => /[*＊]/.test(getComputedStyle(x, pe).content || '')));
    const shown = (e) => !!(e.offsetWidth || e.offsetHeight || e.getClientRects().length) && getComputedStyle(e).visibility !== 'hidden';
    const PRIME = 'p-dropdown, p-select, p-multiselect, p-calendar, p-datepicker, p-radiobutton, p-checkbox, p-inputnumber, p-inputswitch, p-autocomplete';
    const FIELDBOX = '.p-field, .field, .form-group, .form-field, .p-float-label, mat-form-field, [class*="col-"]';
    // only the form: never the header's language switcher, the navigation, the footer, or what the config excludes
    const NOISE = ['header', 'nav', 'footer', '[role="banner"]', '[role="navigation"]', '[role="contentinfo"]', '.p-menubar', '.layout-topbar', '.topbar', ...(exclude || [])].join(', ');
    const CONTROLS = 'input, select, textarea, ' + PRIME;
    const forms = [...document.querySelectorAll('form')].filter((f) => !f.closest(NOISE));
    // the scope: the configured root, else the container shared by every form on the page (an attachments
    // form or section often sits beside the main one), else main. Header, nav, footer and `exclude` stay out.
    const common = (els) => { if (!els.length) return null; let c = els[0]; while (c && !els.every((x) => c.contains(x))) c = c.parentElement; return c; };
    const ROOT = (formRoot && document.querySelector(formRoot)) || (forms.length > 1 ? common(forms) : forms[0]) || document.querySelector('main, [role="main"]') || document.body;
    const main = document.querySelector('main, [role="main"], app-root') || document.body;
    const inScope = (e) => (ROOT.contains(e) || (e.type === 'file' && main.contains(e))) && !e.closest(NOISE);
    const CAPTCHA = /captcha|recaptcha|turnstile|hcaptcha/i;
    const isCaptcha = (e) => e.type !== 'file' && (CAPTCHA.test(`${e.name || ''} ${e.id || ''}`) || !!e.closest('.g-recaptcha, .h-captcha, .cf-turnstile'));
    const CAPTION = '.p-panel-header, .p-panel-title, .p-card-title, .p-card-header, .p-fieldset-legend, legend, h1, h2, h3, h4, h5, h6, .p-tabview-nav';
    const fcn = (e) => e.getAttribute('formcontrolname') || e.closest('[formcontrolname]')?.getAttribute('formcontrolname') || '';
    const labelEl = (e) => {
      if (e.id) { const l = document.querySelector(`label[for="${CSS.escape(e.id)}"]`); if (l) return l; }
      const inner = e.querySelector?.('input[id]');
      if (inner) { const l = document.querySelector(`label[for="${CSS.escape(inner.id)}"]`); if (l) return l; }
      const wrap = e.closest('label'); if (wrap) return wrap;
      const by = e.getAttribute('aria-labelledby') || e.querySelector?.('[aria-labelledby]')?.getAttribute('aria-labelledby');
      if (by) { const l = document.getElementById(by.split(/\s+/)[0]); if (l) return l; }
      // the field's own container: the highest ancestor that holds no other control. Its label wins (before
      // the control, else after it); otherwise the label just before that container. Never a panel caption.
      const mine = (c) => c === e || e.contains(c) || c.contains(e) || (c.closest(PRIME) && c.closest(PRIME).contains(e)) || (e.closest(PRIME) && e.closest(PRIME).contains(c));
      const others = (n) => [...n.querySelectorAll(CONTROLS)].some((c) => !mine(c) && !isCaptcha(c) && c.type !== 'hidden');
      const LABELISH = 'label, .p-field-label, .field-label, .form-label, [class*="label"]:not(.p-dropdown-label):not(.p-multiselect-label):not(.p-button-label):not(.p-checkbox-label)';
      const usable = (x) => !x.closest(CAPTION) && !x.matches(CONTROLS) && !x.querySelector(CONTROLS) && t(x);
      let box = e;
      for (let n = e.parentElement; n && n !== document.body && n !== ROOT && !others(n); n = n.parentElement) box = n;
      const inBox = [...box.querySelectorAll(LABELISH)].filter(usable);
      const before = inBox.filter((x) => x.compareDocumentPosition(e) & Node.DOCUMENT_POSITION_FOLLOWING);
      if (before.length) return before.at(-1);
      if (inBox.length) return inBox[0];
      for (let p = box.previousElementSibling; p && !p.matches(CONTROLS) && !p.querySelector(CONTROLS); p = p.previousElementSibling) {
        if (p.closest(CAPTION) || p.matches(CAPTION)) break;
        if (p.matches(LABELISH) && usable(p)) return p;
        const l = [...p.querySelectorAll(LABELISH)].filter(usable).at(-1);
        if (l) return l;
      }
      return null;
    };
    const describe = (e, kind) => {
      const l = labelEl(e);
      const raw = l ? t(l) : e.getAttribute('aria-label') || e.getAttribute('placeholder') || e.querySelector?.('[placeholder]')?.getAttribute('placeholder') || '';
      const box = e.closest(FIELDBOX) || e.parentElement;
      const inner = e.matches('input,select,textarea') ? e : e.querySelector('input,select,textarea');
      const empty = !inner || !inner.value;
      const required = !!(inner?.required || e.hasAttribute('required') || e.getAttribute('aria-required') === 'true' || inner?.getAttribute('aria-required') === 'true'
        || starred(raw) || cssStar(l) || !!l?.querySelector('.required, .p-required, .text-danger, .asterisk')
        // Angular marks an empty control that has a required validator ng-invalid before anyone touches it
        || (empty && (e.classList.contains('ng-invalid') || !!inner?.classList.contains('ng-invalid'))));
      return { label: bare(raw), required };
    };
    let n = 0;
    const tag = (e) => { if (!e.dataset.bwField) e.dataset.bwField = String((window.__bwSeq = (window.__bwSeq || 0) + 1)); return `[data-bw-field="${e.dataset.bwField}"]`; };
    const keyOf = (e, label) => e.getAttribute('name') || e.id || fcn(e) || label.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || `field-${n}`;
    const out = [];
    const seen = new Set();
    // PrimeNG-style components first; their inner inputs are not fields of their own
    document.querySelectorAll(PRIME).forEach((e) => {
      if (!inScope(e)) return;
      const name = e.tagName.toLowerCase();
      const kind = name === 'p-multiselect' ? 'multiselect' : /dropdown|select|autocomplete/.test(name) ? 'select' : /calendar|datepicker/.test(name) ? 'date' : name === 'p-radiobutton' ? 'radio' : /checkbox|switch/.test(name) ? 'checkbox' : 'number';
      if (kind === 'radio') {
        const group = fcn(e) || e.getAttribute('name') || e.querySelector('input')?.name || '';
        const gk = `radio:${group}`;
        if (seen.has(gk)) return;
        seen.add(gk);
        const members = [...document.querySelectorAll('p-radiobutton')].filter((r) => (fcn(r) || r.getAttribute('name') || r.querySelector('input')?.name || '') === group);
        const optLabel = (r) => { const l = r.nextElementSibling?.matches('label') ? r.nextElementSibling : r.parentElement?.querySelector('label'); return bare(t(l)) || r.getAttribute('value') || ''; };
        const box = e.closest(FIELDBOX)?.parentElement?.closest(FIELDBOX) || e.closest('fieldset') || e.closest(FIELDBOX);
        const gl = box?.querySelector(':scope > label, :scope > .p-field-label, :scope > legend, :scope > .field-label');
        const raw = gl ? t(gl) : group;
        out.push({ key: group || keyOf(e, raw), selector: tag(members[0] || e), selectors: members.map(tag), type: 'radio', label: bare(raw), required: starred(raw) || members.some((r) => r.classList.contains('ng-invalid')), options: members.map(optLabel), visible: members.some(shown) });
        return;
      }
      const d = describe(e, kind);
      out.push({ key: keyOf(e, d.label), selector: tag(e), type: kind, label: d.label, required: d.required, visible: shown(e), prime: true });
    });
    const inPrime = (e) => !!e.closest(PRIME);
    const seenRadio = new Set();
    document.querySelectorAll('input, select, textarea').forEach((e) => {
      if (inPrime(e) || !inScope(e) || isCaptcha(e)) return;
      const type = e.tagName === 'SELECT' ? 'select' : e.tagName === 'TEXTAREA' ? 'textarea' : (e.type || 'text');
      if (['hidden', 'submit', 'button', 'reset', 'image'].includes(type)) return;
      if (type === 'radio') {
        const key = e.name || fcn(e) || e.id;
        if (seenRadio.has(key)) return;
        seenRadio.add(key);
        const group = [...document.querySelectorAll('input[type=radio]')].filter((g) => (g.name || fcn(g) || g.id) === key);
        const fs = e.closest('fieldset');
        const raw = fs?.querySelector('legend') ? t(fs.querySelector('legend')) : (labelEl(e.closest(FIELDBOX) || e) && t(labelEl(e.closest(FIELDBOX) || e))) || key;
        out.push({ key, selector: tag(e), selectors: group.map(tag), type, label: bare(raw), required: group.some((g) => g.required) || starred(raw), options: group.map((g) => bare(t(labelEl(g))) || g.value), visible: group.some(shown) });
        return;
      }
      const d = describe(e, type);
      out.push({
        key: keyOf(e, d.label),
        selector: tag(e),
        type,
        label: d.label || e.name || e.id || '',
        required: d.required,
        options: type === 'select' ? [...e.options].filter((o) => o.value !== '').map((o) => t(o)) : undefined,
        accept: type === 'file' ? e.accept || '' : undefined,
        visible: shown(e),
      });
    });
    // in the order the user meets them
    const at = (f) => document.querySelector(f.selector);
    return out.sort((a, b) => (at(a) && at(b) && at(a).compareDocumentPosition(at(b)) & Node.DOCUMENT_POSITION_PRECEDING ? 1 : -1));
  }, { formRoot: scope.formRoot || '', exclude: scope.exclude || [] });
}

const OVERLAY_OPTIONS = '.p-dropdown-item, .p-select-option, .p-multiselect-item, .p-autocomplete-item, [role="option"]';
/** A component's options live in an overlay that only exists while it is open: open, read, close. */
async function primeOptions(page, fields) {
  for (const f of fields.filter((x) => x.prime && x.visible && (x.type === 'select' || x.type === 'multiselect'))) {
    const el = page.locator(f.selector).first();
    try {
      await el.locator('.p-dropdown, .p-select, .p-multiselect, .p-autocomplete-dropdown, [role="combobox"]').first().click({ timeout: 3000 }).catch(() => el.click({ timeout: 3000 }));
      await page.locator(OVERLAY_OPTIONS).first().waitFor({ state: 'visible', timeout: 3000 });
      f.options = (await page.locator(OVERLAY_OPTIONS).allInnerTexts()).map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
    } catch { f.options = f.options || []; }
    await page.keyboard.press('Escape').catch(() => {});
    await page.locator(OVERLAY_OPTIONS).first().waitFor({ state: 'hidden', timeout: 1500 }).catch(() => {});
  }
  return fields.filter((f) => !isLanguageSwitch(f.options));
}

async function readMessages(page) {
  return page.evaluate(() => {
    const t = (e) => (e?.innerText || '').replace(/\s+/g, ' ').trim();
    const shown = (e) => !!(e.offsetWidth || e.offsetHeight);
    const msgs = [...document.querySelectorAll('[role="alert"], .error, .invalid-feedback, .field-error, .validation-message, .p-error, small.p-invalid, .p-message-error, .p-inline-message-error, .p-toast-message, mat-error')].filter(shown).map(t).filter(Boolean);
    // the site's own messages first; the browser's built-in ones only when the site shows none
    if (!msgs.length) document.querySelectorAll('input:invalid, select:invalid, textarea:invalid').forEach((e) => { if (e.validationMessage && shown(e)) msgs.push(e.validationMessage); });
    return [...new Set(msgs)];
  });
}

const SAMPLE = { email: 'name@example.com', number: '1', tel: '0700000000', date: '2026-11-15', url: 'https://example.com', text: 'Sample', textarea: 'Sample text' };
async function fill(page, fields, cfg, outDir) {
  for (const f of fields.filter((x) => x.visible && (x.required || cfg.fillOptional))) {
    const given = cfg.values?.[f.key] ?? cfg.values?.[f.label];
    const el = page.locator(f.selector).first();
    try {
      if (f.prime && (f.type === 'select' || f.type === 'multiselect')) {
        await el.locator('.p-dropdown, .p-select, .p-multiselect, [role="combobox"]').first().click({ timeout: 3000 }).catch(() => el.click({ timeout: 3000 }));
        const opts = page.locator(OVERLAY_OPTIONS);
        await opts.first().waitFor({ state: 'visible', timeout: 3000 });
        const want = given !== undefined ? opts.filter({ hasText: resolveValue(given) }).first() : opts.first();
        await want.click({ timeout: 3000 });
        if (f.type === 'multiselect') await page.keyboard.press('Escape');
      } else if (f.prime && f.type === 'date') {
        const input = el.locator('input').first();
        await input.fill(given !== undefined ? resolveValue(given) : SAMPLE.date);
        await page.keyboard.press('Escape');
      } else if (f.prime && f.type === 'checkbox') await el.locator('.p-checkbox-box, .p-inputswitch, input').first().click({ timeout: 3000 });
      else if (f.prime && f.type === 'number') await el.locator('input').first().fill(given !== undefined ? resolveValue(given) : SAMPLE.number);
      else if (f.type === 'radio') {
        const first = page.locator((f.selectors || [f.selector])[0]).first();
        const box = first.locator('.p-radiobutton-box').first();
        if (await box.count()) await box.click({ timeout: 3000 });
        else { await first.focus(); await page.keyboard.press('Space'); }
      } else if (f.type === 'select') { const v = await el.evaluate((e) => [...e.options].find((o) => o.value !== '')?.value); if (v) await el.selectOption(given ? resolveValue(given) : v); }
      else if (f.type === 'checkbox') { await el.focus(); await page.keyboard.press('Space'); }
      else if (f.type === 'file') {
        const sample = path.join(outDir, 'sample-attachment.pdf');
        if (!fs.existsSync(sample)) fs.writeFileSync(sample, '%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');
        await el.setInputFiles(sample);
      } else if (given !== undefined) await el.fill(resolveValue(given));
      else if (f.type !== 'password') await el.fill(SAMPLE[f.type] || SAMPLE.text); // a secret field is typed only from the config
    } catch { /* a control that refuses a sample value: the validation step reports it */ }
  }
}

/** Option by option, which hidden fields a choice reveals, and which attachment-list entries it adds (`doc:<entry>`). */
const ATTACH_LIST = /(اسم|نوع)s*المرفق|attachments*(name|type)|documents*(name|type)/i;
async function conditions(page, fields, scope) {
  const out = {};
  const visibleKeys = async () => new Set((await readFields(page, scope)).filter((x) => x.visible).map((x) => x.key));
  // the attachment picker re-read after every choice: §2.6 is the union of what each branch asks for
  const docsNow = async () => new Set((await readFields(page, scope)).filter((x) => x.visible && x.type === 'select' && ATTACH_LIST.test(x.label || '')).flatMap((x) => x.options || []));
  if (fields.some((x) => x.type === 'select' && ATTACH_LIST.test(x.label || ''))) out.__branchRead = true;
  // a language switcher is never cycled: choosing an option would switch the portal's language
  for (const f of fields.filter((x) => x.visible && (x.type === 'select' || x.type === 'radio') && !isLanguageSwitch(x.options))) {
    const base = await visibleKeys();
    const baseDocs = out.__branchRead ? await docsNow() : new Set();
    const choose = [];
    if (f.type === 'radio') (f.selectors || [f.selector]).forEach((sel, i) => choose.push([f.options?.[i] || String(i + 1), async () => {
      const m = page.locator(sel).first();
      const box = m.locator('.p-radiobutton-box').first();
      if (await box.count()) await box.click({ timeout: 3000 }); else await m.check({ timeout: 3000 });
    }]));
    else if (f.prime) (f.options || []).forEach((o, i) => choose.push([o, async () => {
      await page.locator(f.selector).first().locator('.p-dropdown, .p-select, [role="combobox"]').first().click({ timeout: 3000 });
      await page.locator(OVERLAY_OPTIONS).nth(i).click({ timeout: 3000 });
    }]));
    else {
      const values = await page.locator(f.selector).first().evaluate((e) => [...e.options].filter((o) => o.value !== '').map((o) => [o.value, (o.innerText || o.textContent).trim()]));
      for (const [v, lab] of values) choose.push([lab, () => page.locator(f.selector).first().selectOption(v)]);
    }
    for (const [lab, act] of choose) {
      try { await act(); } catch { continue; }
      await page.waitForTimeout(120);
      for (const k of await visibleKeys()) if (!base.has(k)) (out[k] ||= []).push(`${f.label} = ${lab}`);
      if (out.__branchRead) for (const o of await docsNow()) if (!baseDocs.has(o)) (out[`doc:${o}`] ||= []).push(`${f.label} = ${lab}`);
    }
    if (f.type === 'select' && !f.prime) await page.locator(f.selector).first().selectOption({ index: 0 }).catch(() => {});
  }
  return out;
}

export async function crawl(cfg, { log = (m) => process.stderr.write(`${m}\n`), browser: shared, yesFileRealRequest = false, ask } = {}) {
  const filing = await mayFile(cfg, { yesFileRealRequest, ask });
  if (cfg.submit === true && !filing) log('submit: true without the go-ahead (--yes-file-real-request or a typed YES): running as a dry run');
  const outDir = path.resolve(cfg.outDir || path.join(REPO, 'out', 'harvest', String(cfg.name || 'service').replace(/[^\w-]+/g, '-')));
  fs.mkdirSync(outDir, { recursive: true });
  const { chromium } = await loadPlaywright();
  const browser = shared || (await chromium.launch({ ...launchOptions(), headless: cfg.headed === false }));
  const raw = { kind: 'bw-harvest', version: 1, name: cfg.name || '', harvestedAt: new Date().toISOString(), languages: {} };
  const delay = Math.max(0, cfg.delayMs ?? 400);
  const save = () => fs.writeFileSync(path.join(outDir, 'harvest.json'), JSON.stringify(raw, null, 1));
  try {
    for (const lang of cfg.languages || [{ code: cfg.locale || 'ar', startUrl: cfg.startUrl }]) {
      const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, locale: lang.code === 'ar' ? 'ar' : 'en-US' });
      const page = await ctx.newPage(); // one tab per language, never more
      const shot = async (label) => {
        const file = path.join(outDir, `${lang.code}-${String(Object.keys(raw.languages[lang.code]?.shots || {}).length + 1).padStart(2, '0')}-${label}.png`);
        await page.screenshot({ path: file }); // viewport only, never full page
        (raw.languages[lang.code].shots ||= {})[label] = path.basename(file);
      };
      raw.languages[lang.code] = { startUrl: lang.startUrl, steps: [], statuses: [], shots: {} };
      const L = raw.languages[lang.code];
      if (cfg.respectRobots !== false && !(await robotsAllows(page, lang.startUrl))) throw new Error(`robots.txt disallows ${lang.startUrl}`);
      const wait = () => page.waitForTimeout(delay);
      const base = lang.startUrl;
      // an SPA renders after load: wait for the network to settle and for the page's ready selector
      const ready = async (where) => {
        await page.waitForLoadState('networkidle', { timeout: cfg.idleMs ?? 8000 }).catch(() => {});
        const sel = typeof cfg.waitFor === 'string' ? cfg.waitFor : cfg.waitFor?.[where];
        if (sel) await page.locator(sel).first().waitFor({ state: 'visible', timeout: cfg.waitForMs ?? 30000 });
      };
      // login: either steps run up front (`login: [...]`), or run when its form appears (`login: {when, steps}`)
      const loginSteps = Array.isArray(cfg.login) ? cfg.login : cfg.login?.steps || [];
      let loggedIn = false;
      // one step grammar for login and preForm: goto, fill, press, check (tick once), waitFor, login (sign in again), ready
      const runSteps = async (steps) => {
        for (const step of steps) {
          if (step.goto) { await page.goto(new URL(step.goto, base).href); await ready('card'); }
          if (step.fill) await page.locator(step.fill).first().fill(resolveValue(step.value));
          if (step.check) {
            const box = page.locator(step.check).first();
            await box.waitFor({ state: 'visible', timeout: step.timeoutMs ?? 30000 });
            const on = await box.evaluate((e) => (e.matches('input') ? e.checked : !!e.querySelector('input:checked') || e.getAttribute('aria-checked') === 'true' || e.classList.contains('p-highlight') || e.classList.contains('p-checkbox-checked')));
            if (!on) await press(page, step.check);
          }
          if (step.press) await press(page, step.press);
          if (step.waitFor) await page.locator(step.waitFor).first().waitFor({ timeout: step.timeoutMs ?? 30000 });
          if (step.login) { loggedIn = false; await runLogin(); }
          if (step.ready) await ready(step.ready === true ? 'form' : step.ready);
          await wait();
        }
      };
      const runLogin = async () => {
        await runSteps(loginSteps);
        loggedIn = true;
        log('login steps done');
      };
      const maybeLogin = async () => {
        if (loggedIn || !cfg.login?.when) return;
        if (await page.locator(cfg.login.when).first().isVisible().catch(() => false)) { await runLogin(); await pauses(page, cfg.pause, log); }
      };
      if (Array.isArray(cfg.login)) { await runLogin(); await pauses(page, cfg.pause, log); }
      await page.goto(base);
      await ready('card');
      await pauses(page, cfg.pause, log);
      L.card = await readCard(page, cfg.cardSelector, cfg.card || {});
      const lang0 = await page.evaluate(() => (document.documentElement.lang || '').slice(0, 2).toLowerCase());
      await shot('card');
      save();
      if (cfg.openForm) { await press(page, cfg.openForm); await wait(); await maybeLogin(); await pauses(page, cfg.pause, log); }
      if (cfg.preForm?.length) { await runSteps(cfg.preForm); await maybeLogin(); await pauses(page, cfg.pause, log); }
      await ready('form').catch((e) => log(`form not ready: ${e.message.split('\n')[0]}`));
      for (let n = 0; n < (cfg.maxSteps ?? 10); n += 1) {
        await maybeLogin();
        await pauses(page, cfg.pause, log);
        const scope = { formRoot: cfg.formRoot, exclude: cfg.exclude };
        const fields = await primeOptions(page, await readFields(page, scope));
        if (!fields.some((f) => f.visible)) break; // past the forms
        const cond = await conditions(page, fields, scope);
        const all = await primeOptions(page, await readFields(page, scope));
        const title = await page.evaluate(() => (document.querySelector('form h2, main h2, h2, .p-steps-current, .p-card-title, legend, h1')?.innerText || '').trim());
        await shot(`step${n + 1}`);
        // empty attempt: the validation messages a user meets. On a final action (Send / Submit / Pay…) the dry
        // run never presses it: it touches each field instead (focus + blur), which shows the same messages.
        const next = cfg.next || 'button[type=submit]';
        let messages = [];
        const hasNext = await page.locator(next).first().isVisible().catch(() => false);
        const finalStep = hasNext && (await isFinalAction(page, next));
        // the safe trigger first, on every step: focus and leave each field (Tab), as a user would
        for (const f of all.filter((x) => x.visible && x.type !== 'file')) {
          const el = page.locator(f.prime ? `${f.selector} input, ${f.selector} [tabindex]` : f.selector).first();
          await el.focus().catch(() => {});
          await page.keyboard.press('Tab').catch(() => {});
          await el.evaluate((x) => { x.dispatchEvent(new FocusEvent('blur')); x.dispatchEvent(new FocusEvent('focusout', { bubbles: true })); }).catch(() => {});
        }
        await page.waitForTimeout(150);
        {
          if (hasNext && !(finalStep && !filing)) await press(page, next); // a Next that is not a final action, or filing was asked for
          await page.waitForTimeout(200);
          messages = await readMessages(page);
          if (messages.length) await shot(`step${n + 1}-validation`);
          // required, as the site itself says after an empty attempt: an error shown in the field's own box,
          // the control ng-invalid once touched, or the field's label named in a validation message
          const flagged = await page.evaluate((sels) => sels.map((sel) => {
            const e = document.querySelector(sel);
            if (!e) return false;
            // the field's message wherever the site puts it: its own box, the element its aria-describedby names,
            // or the error just after its box (a textarea's message often sits outside the field wrapper)
            const ERR = '.p-error, small.p-invalid, .invalid-feedback, .field-error, mat-error, [role="alert"], .error-message, .text-danger';
            const seen = (x) => !!x && !!(x.offsetWidth || x.offsetHeight) && !!x.innerText.trim();
            const inner = e.matches('input,select,textarea') ? e : e.querySelector('input,select,textarea');
            const box = e.closest('.p-field, .field, .form-group, .form-field, mat-form-field') || e.parentElement;
            const describedBy = [e, inner].flatMap((x) => (x?.getAttribute('aria-describedby') || '').split(/\s+/)).filter(Boolean).map((id) => document.getElementById(id));
            const after = [box?.nextElementSibling, e.nextElementSibling, inner?.nextElementSibling].filter((x) => x && x.matches(ERR));
            const found = [...(box ? box.querySelectorAll(ERR) : []), ...describedBy, ...after].find(seen);
            const ng = [e, inner].some((x) => x && (x.classList.contains('ng-invalid') || x.getAttribute('aria-invalid') === 'true') && (x.classList.contains('ng-touched') || x.classList.contains('ng-dirty') || !!x.closest('form.ng-submitted')));
            return { on: !!(found || ng), message: found ? found.innerText.replace(/\s+/g, ' ').trim() : '' };
          }), all.map((f) => f.selector));
          const named = requiredByMessage(all.map((f) => f.label), messages);
          all.forEach((f, i) => { if (flagged[i]?.on || named.has(f.label)) f.required = true; if (flagged[i]?.message) f.message = flagged[i].message; });
        }
        const step = { title, url: page.url(), fields: all.map(({ selector, selectors, prime, ...f }) => ({ ...f, shownWhen: cond[f.key] })), validations: messages };
        if (cond.__branchRead) step.docBranches = Object.fromEntries(Object.entries(cond).filter(([k]) => k.startsWith('doc:')).map(([k, v]) => [k.slice(4), v]));
        // the same form read twice (it did not advance): one step, the richer reading of each field
        const sig = (x) => x.fields.map((f) => `${f.key}:${f.type}`).join('|');
        const prev = L.steps.at(-1);
        if (prev && sig(prev) === sig(step)) {
          prev.fields = prev.fields.map((f, i) => { const g = step.fields[i]; return { ...g, ...f, options: (f.options?.length || 0) >= (g.options?.length || 0) ? f.options : g.options, required: f.required || g.required, shownWhen: f.shownWhen || g.shownWhen }; });
          prev.validations = [...new Set([...prev.validations, ...step.validations])];
          log(`stopped: step ${n + 1} is the same form again`);
          save();
          break;
        }
        L.steps.push(step);
        save(); // a crash later keeps what was read
        const langNow = await page.evaluate(() => (document.documentElement.lang || '').slice(0, 2).toLowerCase());
        if (lang0 && langNow && langNow !== lang0) throw new Error(`the page switched language during the ${lang.code} run (${lang0} → ${langNow}); add the switcher to "exclude" or set "formRoot"`);
        const wrong = wrongLanguage(lang.code, L);
        if (wrong) throw new Error(`${wrong}; the portal language may have switched: check "exclude" / "formRoot" and the start URL`);
        await fill(page, all.filter((f) => f.visible || cond[f.key]), cfg, outDir);
        await wait();
        const before = page.url();
        if (!(await page.locator(next).first().isVisible().catch(() => false))) break;
        if (finalStep && !filing) { log('stopped before submit (dry run: nothing was filed; set submit: true and pass --yes-file-real-request to file a real request)'); L.stoppedBeforeSubmit = true; break; }
        if (finalStep) log('FILING A REAL REQUEST (submit: true and the go-ahead were given)');
        await press(page, next);
        await page.waitForLoadState('domcontentloaded').catch(() => {});
        await ready('form').catch(() => {});
        await wait();
        if (page.url() === before && (await readMessages(page)).length) { log(`stopped: the form refused the sample values at step ${n + 1}`); break; }
      }
      await pauses(page, cfg.pause, log);
      const statusesFrom = async () => page.evaluate((sel) => {
        const t = (e) => (e?.innerText || '').replace(/\s+/g, ' ').trim();
        const scope = (sel && document.querySelector(sel)) || document;
        const rows = [...scope.querySelectorAll(sel ? 'li, tr td:first-child' : '[data-status], .status, table.statuses td:first-child, ul.statuses li')].map(t).filter(Boolean);
        return [...new Set(rows)];
      }, cfg.statusesSelector);
      // the statuses: from the page after sending (only when filing), else the config's list (or the model, in a merge)
      const given = Array.isArray(cfg.statuses) ? cfg.statuses : cfg.statuses?.[lang.code] || [];
      if (!L.stoppedBeforeSubmit) {
        L.after = { title: await page.evaluate(() => (document.querySelector('h1, h2')?.innerText || '').trim()), url: page.url() };
        L.statuses = await statusesFrom();
      }
      if (cfg.statusesUrl && !L.statuses.length) { await page.goto(new URL(cfg.statusesUrl, base).href); await wait(); L.statuses = await statusesFrom(); }
      if (!L.statuses.length) L.statuses = given;
      await shot(L.stoppedBeforeSubmit ? 'stopped-before-submit' : 'after-submit');
      save();
      await ctx.close();
    }
  } finally {
    save();
    if (!shared) await browser.close();
  }
  return { raw, outDir };
}

export { harvestToDocument } from './docs.mjs';
import { requiredByMessage } from './docs.mjs';
