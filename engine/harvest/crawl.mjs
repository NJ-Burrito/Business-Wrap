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

/** The visible form controls of the current step, grouped radios, labels as the user reads them. */
async function readFields(page) {
  return page.evaluate(() => {
    const t = (e) => (e?.innerText || e?.textContent || '').replace(/\s+/g, ' ').replace(/\s*\*\s*$/, '').trim();
    const shown = (e) => !!(e.offsetWidth || e.offsetHeight || e.getClientRects().length) && getComputedStyle(e).visibility !== 'hidden';
    const labelOf = (e) => {
      if (e.id) { const l = document.querySelector(`label[for="${CSS.escape(e.id)}"]`); if (l) return t(l); }
      const wrap = e.closest('label'); if (wrap) return t(wrap);
      if (e.getAttribute('aria-label')) return e.getAttribute('aria-label');
      const by = e.getAttribute('aria-labelledby'); if (by) return t(document.getElementById(by));
      const fs = e.closest('fieldset'); if (fs && fs.querySelector('legend')) return t(fs.querySelector('legend'));
      return e.name || e.id || '';
    };
    const out = [];
    const seenRadio = new Set();
    document.querySelectorAll('input, select, textarea').forEach((e) => {
      const type = e.tagName === 'SELECT' ? 'select' : e.tagName === 'TEXTAREA' ? 'textarea' : (e.type || 'text');
      if (['hidden', 'submit', 'button', 'reset', 'image'].includes(type)) return;
      const key = e.name || e.id;
      if (type === 'radio') {
        if (seenRadio.has(key)) return;
        seenRadio.add(key);
        const group = [...document.querySelectorAll(`input[type=radio][name="${CSS.escape(e.name)}"]`)];
        const fs = e.closest('fieldset');
        out.push({ key, selector: `input[name="${e.name}"]`, type, label: fs?.querySelector('legend') ? t(fs.querySelector('legend')) : key, required: group.some((g) => g.required), options: group.map((g) => labelOf(g)), visible: group.some(shown) });
        return;
      }
      out.push({
        key,
        selector: e.id ? `#${CSS.escape(e.id)}` : `[name="${e.name}"]`,
        type,
        label: labelOf(e),
        required: e.required || e.getAttribute('aria-required') === 'true',
        options: type === 'select' ? [...e.options].filter((o) => o.value !== '').map((o) => t(o)) : undefined,
        accept: type === 'file' ? e.accept || '' : undefined,
        visible: shown(e),
      });
    });
    return out;
  });
}
async function readMessages(page) {
  return page.evaluate(() => {
    const t = (e) => (e?.innerText || '').replace(/\s+/g, ' ').trim();
    const shown = (e) => !!(e.offsetWidth || e.offsetHeight);
    const msgs = [...document.querySelectorAll('[role="alert"], .error, .invalid-feedback, .field-error, .validation-message')].filter(shown).map(t).filter(Boolean);
    // the site's own messages first; the browser's built-in ones only when the site shows none
    if (!msgs.length) document.querySelectorAll('input:invalid, select:invalid, textarea:invalid').forEach((e) => { if (e.validationMessage && shown(e)) msgs.push(e.validationMessage); });
    return [...new Set(msgs)];
  });
}

const SAMPLE = { email: 'name@example.com', number: '1', tel: '0700000000', date: '2026-11-15', url: 'https://example.com', text: 'Sample', textarea: 'Sample text' };
async function fill(page, fields, cfg, outDir) {
  for (const f of fields.filter((x) => x.visible && (x.required || cfg.fillOptional))) {
    const given = cfg.values?.[f.key] ?? cfg.values?.[f.selector];
    const el = page.locator(f.selector).first();
    if (f.type === 'select') { const v = await el.evaluate((e) => [...e.options].find((o) => o.value !== '')?.value); if (v) await el.selectOption(given ? resolveValue(given) : v); }
    else if (f.type === 'radio') { await el.focus(); await page.keyboard.press('Space'); }
    else if (f.type === 'checkbox') { await el.focus(); await page.keyboard.press('Space'); }
    else if (f.type === 'file') {
      const sample = path.join(outDir, 'sample-attachment.pdf');
      if (!fs.existsSync(sample)) fs.writeFileSync(sample, '%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');
      await el.setInputFiles(sample);
    } else if (given !== undefined) await el.fill(resolveValue(given));
    else if (f.type !== 'password') await el.fill(SAMPLE[f.type] || SAMPLE.text); // a secret field is typed only from the config
  }
}

/** Option by option, which hidden fields a choice reveals. */
async function conditions(page, fields) {
  const out = {};
  const visibleKeys = async () => new Set((await readFields(page)).filter((x) => x.visible).map((x) => x.key));
  for (const f of fields.filter((x) => x.visible && (x.type === 'select' || x.type === 'radio'))) {
    const base = await visibleKeys();
    const values = f.type === 'select'
      ? await page.locator(f.selector).first().evaluate((e) => [...e.options].filter((o) => o.value !== '').map((o) => [o.value, (o.innerText || o.textContent).trim()]))
      : await page.locator(f.selector).evaluateAll((els) => els.map((e) => [e.value, (document.querySelector(`label[for="${e.id}"]`)?.innerText || e.value).trim()]));
    for (const [v, lab] of values) {
      if (f.type === 'select') await page.locator(f.selector).first().selectOption(v);
      else await page.locator(`${f.selector}[value="${v}"]`).first().check();
      await page.waitForTimeout(120);
      for (const k of await visibleKeys()) if (!base.has(k)) (out[k] ||= []).push(`${f.label} = ${lab}`);
    }
    if (f.type === 'select') await page.locator(f.selector).first().selectOption({ index: 0 }).catch(() => {});
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
      // login: either steps run up front (`login: [...]`), or run when its form appears (`login: {when, steps}`)
      const loginSteps = Array.isArray(cfg.login) ? cfg.login : cfg.login?.steps || [];
      let loggedIn = false;
      const runLogin = async () => {
        for (const step of loginSteps) {
          if (step.goto) await page.goto(new URL(step.goto, base).href);
          if (step.fill) await page.locator(step.fill).first().fill(resolveValue(step.value));
          if (step.press) await press(page, step.press);
          if (step.waitFor) await page.locator(step.waitFor).first().waitFor({ timeout: step.timeoutMs ?? 30000 });
          await wait();
        }
        loggedIn = true;
        log('login steps done');
      };
      const maybeLogin = async () => {
        if (loggedIn || !cfg.login?.when) return;
        if (await page.locator(cfg.login.when).first().isVisible().catch(() => false)) { await runLogin(); await pauses(page, cfg.pause, log); }
      };
      if (Array.isArray(cfg.login)) { await runLogin(); await pauses(page, cfg.pause, log); }
      await page.goto(base);
      await pauses(page, cfg.pause, log);
      L.card = await readCard(page, cfg.cardSelector);
      await shot('card');
      if (cfg.openForm) { await press(page, cfg.openForm); await wait(); await maybeLogin(); await pauses(page, cfg.pause, log); }
      for (let n = 0; n < (cfg.maxSteps ?? 10); n += 1) {
        await maybeLogin();
        await pauses(page, cfg.pause, log);
        const fields = await readFields(page);
        if (!fields.some((f) => f.visible)) break; // past the forms
        const cond = await conditions(page, fields);
        const all = await readFields(page);
        const title = await page.evaluate(() => (document.querySelector('form h2, main h2, h2, h1')?.innerText || '').trim());
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
        L.steps.push({ title, url: page.url(), fields: all.map(({ selector, ...f }) => ({ ...f, shownWhen: cond[f.key] })), validations: messages });
        await fill(page, all.filter((f) => f.visible || cond[f.key]), cfg, outDir);
        await wait();
        const before = page.url();
        if (!(await page.locator(next).first().isVisible().catch(() => false))) break;
        await press(page, next);
        await page.waitForLoadState('domcontentloaded').catch(() => {});
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
      await ctx.close();
    }
  } finally {
    if (!shared) await browser.close();
  }
  fs.writeFileSync(path.join(outDir, 'harvest.json'), JSON.stringify(raw, null, 1));
  return { raw, outDir };
}

/* ── raw harvest → document JSON (one edition) ─────────────────────────── */
export function harvestToDocument(raw, { locale = 'en', L, today = new Date().toISOString().slice(0, 10) }) {
  const langs = Object.keys(raw.languages || {});
  const H = raw.languages[locale] || raw.languages[langs[0]] || { steps: [], statuses: [] };
  const name = raw.name || H.card?.title || L.untitled;
  const svc = String(raw.name || H.card?.title || 'service').toLowerCase().normalize('NFKD').replace(/[^\w؀-ۿ]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'service';
  const yn = (b) => (b ? L.yes : L.no);
  const fieldsOf = (s) => s.fields.filter((f) => f.type !== 'file');
  const files = H.steps.flatMap((s) => s.fields.filter((f) => f.type === 'file'));
  const sec = (number, title, blocks) => ({ number, title, blocks });
  const gaps = [];
  if (!raw.languages[locale]) gaps.push({ id: 'Q1', question: L.gapLang.replace('{l}', locale === 'ar' ? 'العربية' : 'English'), owner: L.ownerAnalyst, blocks: '2' });
  const stories = H.steps.map((s, k) => ({
    id: `US-${String(k + 1).padStart(2, '0')}`,
    name: s.title || L.formStep.replace('{n}', k + 1),
    as: L.unassigned,
    want: L.storyWant.replace('{t}', s.title || L.formStep.replace('{n}', k + 1)),
    so: k + 1 < H.steps.length ? L.storySo.replace('{t}', H.steps[k + 1].title || L.formStep.replace('{n}', k + 2)) : L.storySoEnd,
    acceptance: [...s.fields.filter((f) => f.required).map((f) => L.accRequired.replace('{f}', f.label)), ...s.validations],
    dictionary: { columns: [L.colField, L.colType, L.colRequired, L.colOptions], rows: s.fields.map((f) => [f.label, f.type, yn(f.required), (f.options || []).join(L.listSep)]) },
  }));
  return {
    service: svc,
    composedAt: new Date().toISOString(),
    control: { documentId: `BW-SRS-${svc.toUpperCase().slice(0, 24)}`, title: `${L.titlePrefix}: ${name}`, preparedBy: '', documentType: L.docType, classification: L.classification, owner: '', issuedOn: today, version: 'V0.1', status: L.draft, reviewCycle: '' },
    revisions: [['V0.1', today]],
    approvals: [],
    chapters: [
      { number: '1', title: L.chIntro, sections: [sec('1.1', L.secPurpose, [{ kind: 'prose', paragraphs: [L.introCrawl.replace('{name}', name), L.introSource.replace('{s}', L.src_crawl)] }])] },
      { number: '2', title: L.chCard, sections: [sec('2.1', L.secCardInfo, [...(H.card?.description?.length ? [{ kind: 'prose', paragraphs: H.card.description }] : []), { kind: 'table', columns: [L.colItem, L.colValue], rows: H.card?.facts?.length ? H.card.facts : [[L.none, L.none]] }])] },
      { number: '3', title: L.chInputs, sections: H.steps.length ? H.steps.map((s, k) => sec(`3.${k + 1}`, s.title || L.formStep.replace('{n}', k + 1), [{ kind: 'table', columns: [L.colLabel, L.colType, L.colRequired, L.colOptions, L.colConditional], rows: fieldsOf(s).map((f) => [f.label, f.type, yn(f.required), (f.options || []).join(L.listSep), (f.shownWhen || []).join(L.listSep)]) }])) : [sec('3.1', L.chInputs, [{ kind: 'prose', paragraphs: [L.none] }])] },
      { number: '4', title: L.chAttachments, sections: [sec('4.1', L.chAttachments, [files.length ? { kind: 'table', columns: [L.colLabel, L.colRequired, L.colAccept], rows: files.map((f) => [f.label, yn(f.required), f.accept || '']) } : { kind: 'prose', paragraphs: [L.noAttachments] }])] },
      { number: '5', title: L.chValidations, sections: [sec('5.1', L.chValidations, [H.steps.some((s) => s.validations.length) ? { kind: 'table', columns: [L.colMessage, L.colWhere], rows: H.steps.flatMap((s, k) => s.validations.map((m) => [m, s.title || L.formStep.replace('{n}', k + 1)])) } : { kind: 'prose', paragraphs: [L.noValidations] }])] },
      { number: '6', title: L.chStories, sections: [sec('6.1', L.chStories, stories.length ? [{ kind: 'stories', number: '6.1', lead: L.storyCards, items: stories }] : [{ kind: 'prose', paragraphs: [L.noTasks] }])] },
      { number: '7', title: L.chStatuses, sections: [sec('7.1', L.chStatuses, [H.statuses?.length ? { kind: 'table', columns: [L.colStatus], rows: H.statuses.map((s) => [s]) } : { kind: 'prose', paragraphs: [L.noStatuses] }])] },
    ],
    openQuestions: gaps,
  };
}
