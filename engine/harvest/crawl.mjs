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
import { launchOptions, REPO } from '../export.mjs';

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

/** Everything the page shows about the service before the form. */
async function readCard(page, scope) {
  return page.evaluate((scope) => {
    const root = (scope && document.querySelector(scope)) || document.querySelector('main') || document.body;
    const t = (e) => (e?.innerText || '').replace(/\s+/g, ' ').trim();
    const pairs = [];
    root.querySelectorAll('dl').forEach((dl) => dl.querySelectorAll('dt').forEach((dt) => pairs.push([t(dt), t(dt.nextElementSibling)])));
    root.querySelectorAll('table').forEach((tb) => tb.querySelectorAll('tr').forEach((tr) => { const c = tr.querySelectorAll('th,td'); if (c.length === 2) pairs.push([t(c[0]), t(c[1])]); }));
    return {
      title: t(root.querySelector('h1')) || document.title,
      description: [...root.querySelectorAll('p')].map(t).filter(Boolean).slice(0, 6),
      facts: pairs.filter(([k, v]) => k && v),
    };
  }, scope);
}

/** The visible form controls of the current step, as a user reads them. Native controls and the
 * PrimeNG-style components of SPA portals (p-dropdown / p-select / p-multiselect / p-calendar /
 * p-datepicker / p-radiobutton / p-checkbox / p-inputnumber). Each control is tagged with
 * data-bw-field so it can be filled by that tag when it has no id or name. Labels come from the
 * control's own label (for/id, wrapping label, aria-labelledby, aria-label), then the label of its
 * field container or the label just before it, then the placeholder; never the section title. */
async function readFields(page) {
  return page.evaluate(() => {
    const t = (e) => (e?.innerText || e?.textContent || '').replace(/\s+/g, ' ').trim();
    const bare = (s) => String(s || '').replace(/\s*[*＊]\s*/g, ' ').replace(/\s+/g, ' ').trim();
    const starred = (s) => /[*＊]/.test(String(s || ''));
    const shown = (e) => !!(e.offsetWidth || e.offsetHeight || e.getClientRects().length) && getComputedStyle(e).visibility !== 'hidden';
    const PRIME = 'p-dropdown, p-select, p-multiselect, p-calendar, p-datepicker, p-radiobutton, p-checkbox, p-inputnumber, p-inputswitch, p-autocomplete';
    const FIELDBOX = '.p-field, .field, .form-group, .form-field, .p-float-label, mat-form-field, [class*="col-"]';
    const fcn = (e) => e.getAttribute('formcontrolname') || e.closest('[formcontrolname]')?.getAttribute('formcontrolname') || '';
    const labelEl = (e) => {
      if (e.id) { const l = document.querySelector(`label[for="${CSS.escape(e.id)}"]`); if (l) return l; }
      const inner = e.querySelector?.('input[id]');
      if (inner) { const l = document.querySelector(`label[for="${CSS.escape(inner.id)}"]`); if (l) return l; }
      const wrap = e.closest('label'); if (wrap) return wrap;
      const by = e.getAttribute('aria-labelledby') || e.querySelector?.('[aria-labelledby]')?.getAttribute('aria-labelledby');
      if (by) { const l = document.getElementById(by.split(/\s+/)[0]); if (l) return l; }
      // the label just before the control (sibling, or a sibling of an ancestor inside the same field box)
      for (let n = e; n && n !== document.body; n = n.parentElement) {
        let p = n.previousElementSibling;
        while (p && !p.matches('label, .p-field-label, .field-label, .form-label') && !p.querySelector?.('input,select,textarea,' + PRIME)) {
          const l = p.querySelector?.('label'); if (l && !p.querySelector('input,select,textarea,' + PRIME)) return l;
          p = p.previousElementSibling;
        }
        if (p && p.matches('label, .p-field-label, .field-label, .form-label')) return p;
        if (n.matches?.(FIELDBOX)) { const l = n.querySelector('label, .p-field-label, .field-label, .form-label'); if (l) return l; break; }
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
        || starred(raw) || !!l?.querySelector('.required, .p-required, .text-danger, .asterisk')
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
      if (inPrime(e)) return;
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
  });
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
  return fields;
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

/** Option by option, which hidden fields a choice reveals. */
async function conditions(page, fields) {
  const out = {};
  const visibleKeys = async () => new Set((await readFields(page)).filter((x) => x.visible).map((x) => x.key));
  for (const f of fields.filter((x) => x.visible && (x.type === 'select' || x.type === 'radio'))) {
    const base = await visibleKeys();
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
    }
    if (f.type === 'select' && !f.prime) await page.locator(f.selector).first().selectOption({ index: 0 }).catch(() => {});
  }
  return out;
}

export async function crawl(cfg, { log = (m) => process.stderr.write(`${m}\n`), browser: shared } = {}) {
  const outDir = path.resolve(cfg.outDir || path.join(REPO, 'out', 'harvest', String(cfg.name || 'service').replace(/[^\w-]+/g, '-')));
  fs.mkdirSync(outDir, { recursive: true });
  const { chromium } = await import(pathToFileURL(path.join(REPO, 'node_modules', 'playwright-core', 'index.mjs')).href);
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
      L.card = await readCard(page, cfg.cardSelector);
      await shot('card');
      save();
      if (cfg.openForm) { await press(page, cfg.openForm); await wait(); await maybeLogin(); await pauses(page, cfg.pause, log); }
      if (cfg.preForm?.length) { await runSteps(cfg.preForm); await maybeLogin(); await pauses(page, cfg.pause, log); }
      await ready('form').catch((e) => log(`form not ready: ${e.message.split('\n')[0]}`));
      for (let n = 0; n < (cfg.maxSteps ?? 10); n += 1) {
        await maybeLogin();
        await pauses(page, cfg.pause, log);
        const fields = await primeOptions(page, await readFields(page));
        if (!fields.some((f) => f.visible)) break; // past the forms
        const cond = await conditions(page, fields);
        const all = await primeOptions(page, await readFields(page));
        const title = await page.evaluate(() => (document.querySelector('form h2, main h2, h2, .p-steps-current, .p-card-title, legend, h1')?.innerText || '').trim());
        await shot(`step${n + 1}`);
        // empty attempt: the validation messages a user meets
        const next = cfg.next || 'button[type=submit]';
        let messages = [];
        if (await page.locator(next).first().isVisible().catch(() => false)) {
          await press(page, next);
          await page.waitForTimeout(200);
          messages = await readMessages(page);
          if (messages.length) await shot(`step${n + 1}-validation`);
        }
        L.steps.push({ title, url: page.url(), fields: all.map(({ selector, selectors, prime, ...f }) => ({ ...f, shownWhen: cond[f.key] })), validations: messages });
        save(); // a crash later keeps what was read
        await fill(page, all.filter((f) => f.visible || cond[f.key]), cfg, outDir);
        await wait();
        const before = page.url();
        if (!(await page.locator(next).first().isVisible().catch(() => false))) break;
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
      L.after = { title: await page.evaluate(() => (document.querySelector('h1, h2')?.innerText || '').trim()), url: page.url() };
      L.statuses = await statusesFrom();
      if (cfg.statusesUrl && !L.statuses.length) { await page.goto(new URL(cfg.statusesUrl, base).href); await wait(); L.statuses = await statusesFrom(); }
      await shot('after-submit');
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
