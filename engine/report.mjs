// A12 manager report: performance over a chosen period, from the bwlog v1 logs only (one fact, one list).
// PDF through headless Chrome: cover, KPI tiles, three inline-SVG charts (active hours per week, edits per document,
// document status), a per-person table and a story-telling summary written by templates (no AI). Thmanyah only, TrueType.
import fs from 'node:fs';
import path from 'node:path';
import { BWLOG1 } from './ledger-v1.mjs';
import { fontsFor, loadTheme, launchOptions, loadPlaywright } from './export.mjs';
import { fontFaceCss } from './fonts.mjs';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const WEEK = 7 * 864e5;
const weekOf = (iso) => { const d = new Date(iso); d.setUTCHours(0, 0, 0, 0); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10); };

/** logs: [{doc, entries}] (decrypted). Returns the report model for the period [from, to] (ISO dates), optionally for some people. */
export function reportData(logs, { from, to, people = null } = {}) {
  const lo = from ? `${from}T00:00:00.000Z` : '';
  const hi = to ? `${to}T23:59:59.999Z` : '￿';
  const P = {};
  const docs = [];
  // a document saved from a template, or copied, starts with a copy of that log: each entry counts once, for the
  // longest log that holds it (the one that went on)
  const seen = new Set();
  for (const log of [...logs].sort((a, b) => b.entries.length - a.entries.length)) {
    const own = log.entries.filter((e) => !seen.has(e.hash));
    for (const e of own) seen.add(e.hash);
    const m = BWLOG1.metrics(own, { from: lo, to: hi });
    // the title as the document says it now: a live `docTitle` (G1) wins, else the last cover/title edit (G3), else the open title
    const live = [...log.entries].reverse().find((e) => e.data?.docTitle)?.data.docTitle;
    const lastSet = (re) => { const v = [...log.entries].reverse().find((e) => e.kind === 'op' && re.test(e.data?.op?.path || ''))?.data.op.value; return typeof v === 'string' ? v : v?.text; };
    const full = String(lastSet(/^\/control\/coverTitle$/) || lastSet(/^\/control\/title$/) || [...log.entries].reverse().find((e) => e.kind === 'open' && e.data?.title)?.data.title || log.doc);
    const title = live ? String(live) : full.split(/\s*[:—]\s+/).slice(1).join(': ') || full; // the service name, not the document kind
    const lastLock = [...log.entries].reverse().find((e) => e.kind === 'lock' || e.kind === 'unlock');
    const status = lastLock?.kind === 'lock' ? 'locked' : log.entries.some((e) => e.kind === 'sign') ? 'signed' : 'progress';
    let docEdits = 0, worked = false;
    for (const p of Object.values(m)) {
      if (people && !people.includes(p.id)) continue;
      if (!(p.edits + p.saves + p.exports + p.signs + p.locks)) continue; // only opening a document (a template at launch) is not work on it
      const x = (P[p.id] ||= { id: p.id, name: p.name, names: [], docs: new Set(), edits: 0, activeMs: 0, sessions: 0, saves: 0, exports: 0, signs: 0, added: 0, removed: 0, weeks: {} });
      if (p.name) x.name = p.name;
      for (const nm of p.names || []) if (!x.names.includes(nm)) x.names.push(nm); // one profile key, every name it used (review2 #12)
      x.docs.add(log.doc);
      for (const k of ['edits', 'activeMs', 'sessions', 'saves', 'exports', 'signs', 'added', 'removed']) x[k] += p[k];
      docEdits += p.edits;
      worked = true;
      // active time per week: this person's entries in this log, bucketed by the week of their day
      const mine = own.filter((e) => e.actor.id === p.id && e.at >= lo && e.at <= hi);
      const share = mine.length ? p.activeMs / mine.length : 0;
      for (const e of mine) x.weeks[weekOf(e.at)] = (x.weeks[weekOf(e.at)] || 0) + share;
    }
    if (worked) docs.push({ doc: log.doc, title, edits: docEdits, status });
  }
  const list = Object.values(P).map((p) => ({ ...p, docs: p.docs.size })).sort((a, b) => b.activeMs - a.activeMs);
  const weeks = [...new Set(list.flatMap((p) => Object.keys(p.weeks)))].sort();
  return { from, to, people: list, docs, weeks };
}

const T = {
  ar: { title: 'تقرير الأداء', period: 'الفترة', people: 'الأشخاص', docs: 'الوثائق', hours: 'ساعات العمل', edits: 'التعديلات', sessions: 'الجلسات', saves: 'الحفظ', exports: 'التصدير', signs: 'التواقيع', words: 'الكلمات (+/−)', perWeek: 'ساعات العمل في كل أسبوع', perDoc: 'التعديلات في كل وثيقة', status: 'حالة الوثائق', locked: 'مقفلة', signed: 'موقّعة', progress: 'قيد العمل', name: 'الاسم', aka: 'وباسم:', summary: 'الخلاصة', none: 'لا يوجد نشاط مسجّل في هذه الفترة.', source: 'المصدر: سجلات المصدر (bwlog v1) لهذه الوثائق؛ الوقت الفعلي يُحسب من فجوات النشاط التي لا تزيد عن خمس دقائق.' },
  en: { title: 'Performance report', period: 'Period', people: 'People', docs: 'Documents', hours: 'Active hours', edits: 'Edits', sessions: 'Sessions', saves: 'Saves', exports: 'Exports', signs: 'Signatures', words: 'Words (+/−)', perWeek: 'Active hours per week', perDoc: 'Edits per document', status: 'Document status', locked: 'Locked', signed: 'Signed', progress: 'In progress', name: 'Name', aka: 'also:', summary: 'Summary', none: 'No recorded activity in this period.', source: 'Source: the provenance logs (bwlog v1) of these documents; active time counts gaps of five minutes or less between actions.' },
};
const iso = (s) => `⁦${s}⁩`; // a date stays left-to-right inside Arabic text
const hrs = (ms) => (ms / 36e5).toFixed(1);

/** The story, by template: one paragraph per person, then one for the team. */
export function story(d, lang) {
  const ar = lang === 'ar';
  const per = (ar ? iso : String)(`${d.from || '…'} – ${d.to || '…'}`);
  if (!d.people.length) return [T[lang].none];
  const out = d.people.map((p) => (ar
    ? `خلال ${per} عمل ${p.name || 'شخص بلا اسم'} على ${p.docs} ${p.docs === 1 ? 'وثيقة' : 'وثائق'} لمدة ${hrs(p.activeMs)} ساعة، وأجرى ${p.edits} تعديلًا في ${p.sessions} ${p.sessions === 1 ? 'جلسة' : 'جلسات'}، وأضاف ${p.added} كلمة وحذف ${p.removed}${p.saves ? `، وحفظ ${p.saves} مرة` : ''}${p.exports ? `، وصدّر ${p.exports} مرة` : ''}${p.signs ? `، ووقّع ${p.signs} مرة` : ''}.`
    : `During ${per}, ${p.name || 'an unnamed person'} worked on ${p.docs} document${p.docs === 1 ? '' : 's'} for ${hrs(p.activeMs)} hours, made ${p.edits} edit${p.edits === 1 ? '' : 's'} over ${p.sessions} session${p.sessions === 1 ? '' : 's'}, added ${p.added} words and removed ${p.removed}${p.saves ? `, saved ${p.saves} time${p.saves === 1 ? '' : 's'}` : ''}${p.exports ? `, exported ${p.exports} time${p.exports === 1 ? '' : 's'}` : ''}${p.signs ? `, and signed ${p.signs} time${p.signs === 1 ? '' : 's'}` : ''}.`));
  const top = d.docs.slice().sort((a, b) => b.edits - a.edits)[0];
  if (top?.edits) out.push(ar ? `أكثر الوثائق نشاطًا «${top.title}» بـ ${top.edits} تعديلًا.` : `The busiest document was “${top.title}” with ${top.edits} edits.`);
  return out;
}

/** A chart label for the fixed 210-unit column: at most n characters, an ellipsis where it was cut. */
export const clip = (s, n = 30) => { const a = [...String(s)]; return a.length > n ? `${a.slice(0, n - 1).join('').trim()}…` : a.join(''); };
/** A horizontal bar chart as inline SVG (no script, prints as vector). The svg states its own direction: under RTL,
 *  text-anchor «start» is the right edge, so a label grows leftwards inside its column (with «end» it grew out of the
 *  viewBox and printed as one letter). */
function bars(rows, { unit = '', rtl }) {
  const W = 640, row = 26, H = Math.max(1, rows.length) * row + 8, max = Math.max(1, ...rows.map((r) => r.v));
  const lab = 210, plot = W - lab - 60;
  const g = rows.map((r, i) => {
    const w = Math.max(2, (r.v / max) * plot), y = 4 + i * row;
    const x = rtl ? W - lab - w : lab;
    return `<text x="${rtl ? W - 6 : 6}" y="${y + 17}" text-anchor="start">${esc(clip(r.k))}</text><rect x="${x}" y="${y + 4}" width="${w.toFixed(1)}" height="16" rx="3" fill="${r.c || '#1f4e79'}"/><text x="${rtl ? x - 6 : x + w + 6}" y="${y + 17}" text-anchor="start">${esc(r.label ?? r.v)}${unit}</text>`;
  }).join('');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" direction="${rtl ? 'rtl' : 'ltr'}" style="direction:${rtl ? 'rtl' : 'ltr'}" xmlns="http://www.w3.org/2000/svg">${g}</svg>`;
}

export function reportHtml(d, { lang = 'ar', fontCss = '' } = {}) {
  const L = T[lang], rtl = lang === 'ar';
  const tot = (k) => d.people.reduce((s, p) => s + p[k], 0);
  const tiles = [[L.people, d.people.length], [L.docs, d.docs.length], [L.hours, hrs(tot('activeMs'))], [L.edits, tot('edits')], [L.exports, tot('exports')], [L.signs, tot('signs')]];
  const week = d.weeks.map((w) => ({ k: rtl ? iso(w) : w, v: d.people.reduce((s, p) => s + (p.weeks[w] || 0), 0) / 36e5 })).map((r) => ({ ...r, label: r.v.toFixed(1) }));
  const perDoc = d.docs.map((x) => ({ k: x.title, v: x.edits }));
  const st = ['progress', 'signed', 'locked'].map((s, i) => ({ k: L[s], v: d.docs.filter((x) => x.status === s).length, c: ['#1f4e79', '#2e7d32', '#8d5b00'][i] }));
  const aka = (p) => { const o = (p.names || []).filter((n) => n !== p.name); return o.length ? ` (${L.aka} ${o.join(rtl ? '، ' : ', ')})` : ''; };
  const rows = d.people.map((p) => `<tr><td>${esc((p.name || '—') + aka(p))}</td><td>${p.docs}</td><td>${hrs(p.activeMs)}</td><td>${p.edits}</td><td>${p.sessions}</td><td>${p.saves}</td><td>${p.exports}</td><td>${p.signs}</td><td>+${p.added} / −${p.removed}</td></tr>`).join('');
  return `<!doctype html><html lang="${lang}" dir="${rtl ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><title>${esc(L.title)}</title><style>${fontCss}
@page { size: A4; margin: 16mm 15mm; }
body { font-family: 'Thmanyah Serif Text', serif; color: #1b1b1b; font-size: 10.5pt; line-height: 1.6; margin: 0; }
h1, h2 { font-family: 'Thmanyah Serif Display', serif; font-weight: 700; color: #12355b; margin: 0 0 6pt; }
h1 { font-size: 26pt; font-weight: 900; } h2 { font-size: 14pt; margin-top: 14pt; }
.cover { border-bottom: 2pt solid #12355b; padding-bottom: 10pt; margin-bottom: 12pt; }
.tiles { display: flex; gap: 8pt; flex-wrap: wrap; }
.tile { flex: 1 1 0; border: 0.8pt solid #c8d3df; border-radius: 6pt; padding: 6pt 8pt; }
.tile b { display: block; font-family: 'Thmanyah Serif Display', serif; font-size: 18pt; color: #12355b; }
.chart { font-family: 'Thmanyah Serif Text', serif; font-size: 11px; max-width: 100%; height: auto; }
table { border-collapse: collapse; width: 100%; } th, td { border: 0.6pt solid #c8d3df; padding: 3pt 5pt; text-align: start; }
th { background: #eef3f8; font-weight: 700; } .src { color: #555; font-size: 9pt; margin-top: 12pt; }
section { break-inside: avoid; }
</style></head><body>
<div class="cover"><h1>${esc(L.title)}</h1><p>${esc(L.period)}: <bdi dir="ltr">${esc(d.from || '…')} – ${esc(d.to || '…')}</bdi></p></div>
<div class="tiles">${tiles.map(([k, v]) => `<div class="tile"><b>${esc(v)}</b>${esc(k)}</div>`).join('')}</div>
<section><h2>${esc(L.summary)}</h2>${story(d, lang).map((s) => `<p>${esc(s)}</p>`).join('')}</section>
<section><h2>${esc(L.perWeek)}</h2>${bars(week, { rtl })}</section>
<section><h2>${esc(L.perDoc)}</h2>${bars(perDoc, { rtl })}</section>
<section><h2>${esc(L.status)}</h2>${bars(st, { rtl })}</section>
<section><h2>${esc(L.people)}</h2><table><thead><tr><th>${esc(L.name)}</th><th>${esc(L.docs)}</th><th>${esc(L.hours)}</th><th>${esc(L.edits)}</th><th>${esc(L.sessions)}</th><th>${esc(L.saves)}</th><th>${esc(L.exports)}</th><th>${esc(L.signs)}</th><th>${esc(L.words)}</th></tr></thead><tbody>${rows}</tbody></table></section>
<p class="src">${esc(L.source)}</p>
</body></html>`;
}

/** Reads every `<doc>.bwlog` (+ `<doc>.heads.json` for its document id) in a HISTORY folder. */
export async function readHistory(dir) {
  if (!dir || !fs.existsSync(dir)) return [];
  const out = [];
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.heads.json'))) {
    try {
      const h = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      const env = fs.readFileSync(path.join(dir, f.replace(/\.heads\.json$/, '.bwlog')), 'utf8');
      out.push(await BWLOG1.unseal(env, h.doc));
    } catch { /* an unreadable log is skipped, never guessed */ }
  }
  return out;
}

/** The report PDF. Returns { pdf, html, data }. */
export async function exportReport(logs, { from, to, people, lang = 'ar', pdfPath }) {
  const data = reportData(logs, { from, to, people });
  const theme = loadTheme();
  const fontCss = fontFaceCss(fontsFor(theme).used, { embed: true });
  const html = reportHtml(data, { lang, fontCss });
  const browser = await (await loadPlaywright()).chromium.launch(launchOptions());
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready.then(() => true));
    fs.mkdirSync(path.dirname(pdfPath), { recursive: true });
    await page.pdf({ path: pdfPath, preferCSSPageSize: true, printBackground: true, tagged: true });
  } finally { await browser.close(); }
  return { pdf: pdfPath, html, data };
}
