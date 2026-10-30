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
    if (worked) docs.push({ doc: log.doc, title, status }); // no edit count: the report does not show or chart edits (0.14.0)
  }
  const list = Object.values(P).map(({ edits, ...p }) => ({ ...p, docs: p.docs.size })).sort((a, b) => b.activeMs - a.activeMs);
  const weeks = [...new Set(list.flatMap((p) => Object.keys(p.weeks)))].sort();
  return { from, to, people: list, docs, weeks };
}

const T = {
  ar: { title: 'تقرير الأداء', period: 'الفترة', people: 'الأشخاص', docs: 'الوثائق', hours: 'ساعات العمل', edits: 'التعديلات', sessions: 'الجلسات', saves: 'الحفظ', exports: 'التصدير', signs: 'التواقيع', words: 'الكلمات (+/−)', perWeek: 'ساعات العمل عبر الأسابيع', perPerson: 'ساعات العمل لكل شخص', heat: 'الأشخاص والأسابيع (ساعات)', output: 'الجلسات والحفظ والتصدير والتواقيع', share: 'حصة كل حالة من الوثائق', status: 'حالة الوثائق', locked: 'مقفلة', signed: 'موقّعة', progress: 'قيد العمل', name: 'الاسم', aka: 'وباسم:', summary: 'الخلاصة', none: 'لا يوجد نشاط مسجّل في هذه الفترة.', source: 'المصدر: سجلات المصدر (bwlog v1) لهذه الوثائق؛ الوقت الفعلي يُحسب من فجوات النشاط التي لا تزيد عن خمس دقائق.' },
  en: { title: 'Performance report', period: 'Period', people: 'People', docs: 'Documents', hours: 'Active hours', edits: 'Edits', sessions: 'Sessions', saves: 'Saves', exports: 'Exports', signs: 'Signatures', words: 'Words (+/−)', perWeek: 'Active hours across the weeks', perPerson: 'Active hours per person', heat: 'People by week (hours)', output: 'Sessions, saves, exports and signatures', share: 'Share of each document status', status: 'Document status', locked: 'Locked', signed: 'Signed', progress: 'In progress', name: 'Name', aka: 'also:', summary: 'Summary', none: 'No recorded activity in this period.', source: 'Source: the provenance logs (bwlog v1) of these documents; active time counts gaps of five minutes or less between actions.' },
};
const iso = (s) => `⁦${s}⁩`; // a date stays left-to-right inside Arabic text
const hrs = (ms) => (ms / 36e5).toFixed(1);

/** The story, by template: one paragraph per person, then one for the team. */
export function story(d, lang) {
  const ar = lang === 'ar';
  const per = (ar ? iso : String)(`${d.from || '…'} – ${d.to || '…'}`);
  if (!d.people.length) return [T[lang].none];
  const out = d.people.map((p) => (ar
    ? `خلال ${per} عمل ${p.name || 'شخص بلا اسم'} على ${p.docs} ${p.docs === 1 ? 'وثيقة' : 'وثائق'} لمدة ${hrs(p.activeMs)} ساعة في ${p.sessions} ${p.sessions === 1 ? 'جلسة' : 'جلسات'}، وأضاف ${p.added} كلمة وحذف ${p.removed}${p.saves ? `، وحفظ ${p.saves} مرة` : ''}${p.exports ? `، وصدّر ${p.exports} مرة` : ''}${p.signs ? `، ووقّع ${p.signs} مرة` : ''}.`
    : `During ${per}, ${p.name || 'an unnamed person'} worked on ${p.docs} document${p.docs === 1 ? '' : 's'} for ${hrs(p.activeMs)} hours over ${p.sessions} session${p.sessions === 1 ? '' : 's'}, added ${p.added} words and removed ${p.removed}${p.saves ? `, saved ${p.saves} time${p.saves === 1 ? '' : 's'}` : ''}${p.exports ? `, exported ${p.exports} time${p.exports === 1 ? '' : 's'}` : ''}${p.signs ? `, and signed ${p.signs} time${p.signs === 1 ? '' : 's'}` : ''}.`));
  return out; // no edit counts (0.14.0, owner: they are useless and inflate the charts)
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

// ── four more chart kinds (0.14.0): line over time, donut share, vertical columns, heat map. Inline SVG, no script, vector in
// the PDF. They state direction="ltr": time, numbers and axes read left to right in both editions, every label is anchored
// "start" / "middle" / "end" explicitly and an Arabic run still lays out right to left inside its own box.
export const PALETTE = ['#12355b', '#c8962e', '#2e7d32', '#8d5b00', '#5b7fa6', '#a33a3a', '#6b4c9a', '#2a9d8f', '#7a8793', '#d17b3a'];
const svgOpen = (W, H) => `<svg class="chart" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" direction="ltr" style="direction:ltr" xmlns="http://www.w3.org/2000/svg">`;
const num1 = (v) => (Number.isInteger(v) ? String(v) : v.toFixed(1));
/** A round axis maximum (1, 2, 2.5, 5 × 10^n) at or above v, and the tick step for four gridlines. */
export function niceMax(v) { if (!(v > 0)) return 1; const e = 10 ** Math.floor(Math.log10(v)); const m = [1, 2, 2.5, 5, 10].find((x) => x * e >= v - 1e-9); return m * e; }
const short = (w) => String(w).slice(5); // 2026-10-05 → 10-05
/** Every k-th label so labels at least `gap` apart in the plot never touch. */
const every = (n, plot, gap = 44) => Math.max(1, Math.ceil(n / Math.max(1, Math.floor(plot / gap))));

/** Line (with area) of one value per time step. rows: [{k, v}]. */
export function lineChart(rows) {
  const W = 640, H = 210, l = 44, r = 20, t = 16, b = 34, pw = W - l - r, ph = H - t - b;
  const top = niceMax(Math.max(0, ...rows.map((x) => x.v)));
  const px = (i) => l + (rows.length === 1 ? pw / 2 : (i / (rows.length - 1)) * pw), py = (v) => t + ph - (v / top) * ph;
  const grid = [0, 1, 2, 3, 4].map((i) => { const v = (top / 4) * i, y = py(v); return `<line x1="${l}" x2="${W - r}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}" stroke="#d9e1ea" stroke-width="1"/><text x="${l - 6}" y="${(y + 4).toFixed(1)}" text-anchor="end" fill="#555">${num1(v)}</text>`; }).join('');
  const pts = rows.map((x, i) => `${px(i).toFixed(1)},${py(x.v).toFixed(1)}`);
  const area = rows.length > 1 ? `<polygon points="${l},${py(0)} ${pts.join(' ')} ${px(rows.length - 1).toFixed(1)},${py(0)}" fill="#12355b" fill-opacity="0.12"/>` : '';
  const line = rows.length > 1 ? `<polyline points="${pts.join(' ')}" fill="none" stroke="#12355b" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>` : '';
  const k = every(rows.length, pw);
  const dots = rows.map((x, i) => `<circle cx="${px(i).toFixed(1)}" cy="${py(x.v).toFixed(1)}" r="3.6" fill="#c8962e" stroke="#fff" stroke-width="1.2"/>${i % k === 0 || i === rows.length - 1 ? `<text x="${px(i).toFixed(1)}" y="${H - 12}" text-anchor="middle" fill="#555" direction="ltr">${esc(short(x.k))}</text>` : ''}${rows.length <= 14 ? `<text x="${px(i).toFixed(1)}" y="${(py(x.v) - 8).toFixed(1)}" text-anchor="middle" fill="#12355b" font-weight="700">${num1(+x.v.toFixed(1))}</text>` : ''}`).join('');
  return `${svgOpen(W, H)}${grid}${area}${line}${dots}</svg>`;
}

/** Donut of shares. rows: [{k, v, c}]; the centre says the total, the legend names each slice and its count. */
export function donutChart(rows) {
  const W = 640, H = 190, cx = 120, cy = 95, R = 66, sw = 26, C = 2 * Math.PI * R;
  const total = rows.reduce((s, x) => s + x.v, 0);
  let off = 0;
  const arcs = total ? rows.filter((x) => x.v > 0).map((x) => { const len = (x.v / total) * C; const s = `<circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="${x.c}" stroke-width="${sw}" stroke-dasharray="${len.toFixed(2)} ${(C - len).toFixed(2)}" stroke-dashoffset="${(-off).toFixed(2)}" transform="rotate(-90 ${cx} ${cy})"/>`; off += len; return s; }).join('') : `<circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="#e3e9f0" stroke-width="${sw}"/>`;
  const leg = rows.map((x, i) => { const y = 52 + i * 34; return `<rect x="270" y="${y - 12}" width="16" height="16" rx="3" fill="${x.c}"/><text x="296" y="${y + 1}" text-anchor="start">${esc(clip(x.k, 24))}</text><text x="520" y="${y + 1}" text-anchor="end" font-weight="700" fill="#12355b">${x.v}</text><text x="570" y="${y + 1}" text-anchor="end" fill="#555">${total ? Math.round((x.v / total) * 100) : 0}%</text>`; }).join('');
  return `${svgOpen(W, H)}${arcs}<text x="${cx}" y="${cy + 2}" text-anchor="middle" font-size="26" font-weight="900" fill="#12355b">${total}</text>${leg}</svg>`;
}

/** Vertical columns, one per row: [{k, v, label?}] (top rows only; the caller trims). */
export function columnChart(rows, { unit = '' } = {}) {
  const W = 640, H = 230, l = 44, r = 16, t = 20, b = 44, pw = W - l - r, ph = H - t - b;
  const top = niceMax(Math.max(0, ...rows.map((x) => x.v)));
  const slot = pw / Math.max(1, rows.length), bw = Math.min(54, slot * 0.6);
  const grid = [0, 1, 2, 3, 4].map((i) => { const v = (top / 4) * i, y = t + ph - (v / top) * ph; return `<line x1="${l}" x2="${W - r}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}" stroke="#d9e1ea" stroke-width="1"/><text x="${l - 6}" y="${(y + 4).toFixed(1)}" text-anchor="end" fill="#555">${num1(v)}</text>`; }).join('');
  const cols = rows.map((x, i) => { const h = Math.max(1.5, (x.v / top) * ph), cx = l + slot * i + slot / 2, y = t + ph - h; return `<rect x="${(cx - bw / 2).toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="3" fill="${x.c || PALETTE[i % PALETTE.length]}"/><text x="${cx.toFixed(1)}" y="${(y - 5).toFixed(1)}" text-anchor="middle" font-weight="700" fill="#12355b">${esc(x.label ?? num1(+x.v.toFixed(1)))}${unit}</text><text x="${cx.toFixed(1)}" y="${H - 22}" text-anchor="middle" fill="#333">${esc(clip(x.k, slot > 90 ? 16 : 9))}</text>`; }).join('');
  return `${svgOpen(W, H)}${grid}${cols}</svg>`;
}

/** Heat map: people (rows) by weeks (columns), shade = hours. rows: [{k, cells:[number]}], cols: [label]. */
export function heatChart(rows, cols) {
  const lab = 150, W = 640, top = 26, cell = 24, H = top + Math.max(1, rows.length) * cell + 10, pw = W - lab - 10;
  const cw = Math.min(54, pw / Math.max(1, cols.length)), max = Math.max(0.0001, ...rows.flatMap((x) => x.cells));
  const shade = (v) => { const u = v / max, a = [238, 243, 248], z = [18, 53, 91]; return `rgb(${a.map((c, i) => Math.round(c + (z[i] - c) * u)).join(',')})`; };
  const k = every(cols.length, cols.length * cw, 40);
  const head = cols.map((c, j) => (j % k === 0 ? `<text x="${(lab + j * cw + cw / 2).toFixed(1)}" y="16" text-anchor="middle" fill="#555" direction="ltr">${esc(short(c))}</text>` : '')).join('');
  const body = rows.map((x, i) => `<text x="6" y="${top + i * cell + 16}" text-anchor="start">${esc(clip(x.k, 20))}</text>${x.cells.map((v, j) => `<rect x="${(lab + j * cw + 1).toFixed(1)}" y="${top + i * cell + 1}" width="${(cw - 2).toFixed(1)}" height="${cell - 2}" rx="3" fill="${shade(v)}"${v ? '' : ' stroke="#d9e1ea" stroke-width="0.6"'}/>${v && cw >= 26 ? `<text x="${(lab + j * cw + cw / 2).toFixed(1)}" y="${top + i * cell + 16}" text-anchor="middle" font-size="10" fill="${v / max > 0.5 ? '#fff' : '#12355b'}">${num1(+v.toFixed(1))}</text>` : ''}`).join('')}`).join('');
  return `${svgOpen(W, H)}${head}${body}</svg>`;
}

export function reportHtml(d, { lang = 'ar', fontCss = '' } = {}) {
  const L = T[lang], rtl = lang === 'ar';
  const tot = (k) => d.people.reduce((s, p) => s + p[k], 0);
  // the tiles carry no edit count (0.14.0): people, documents, hours, exports, signatures
  const tiles = [[L.people, d.people.length], [L.docs, d.docs.length], [L.hours, hrs(tot('activeMs'))], [L.exports, tot('exports')], [L.signs, tot('signs')]];
  const weekRows = d.weeks.map((w) => ({ k: w, v: d.people.reduce((s, p) => s + (p.weeks[w] || 0), 0) / 36e5 }));
  const st = ['progress', 'signed', 'locked'].map((s, i) => ({ k: L[s], v: d.docs.filter((x) => x.status === s).length, c: ['#1f4e79', '#2e7d32', '#c8962e'][i] }));
  const shown = d.people.slice(0, 10); // by active time, longest first (reportData sorts)
  const perPerson = shown.map((p, i) => ({ k: p.name || '—', v: p.activeMs / 36e5, c: PALETTE[i % PALETTE.length] }));
  const heatCols = d.weeks.slice(-12);
  const heat = shown.map((p) => ({ k: p.name || '—', cells: heatCols.map((w) => (p.weeks[w] || 0) / 36e5) }));
  const output = [['sessions', 'sessions'], ['saves', 'saves'], ['exports', 'exports'], ['signs', 'signs']].map(([k, key], i) => ({ k: L[k], v: tot(key), c: PALETTE[i] }));
  const has = d.people.length > 0;
  const sec = (title, svg) => (has ? `<section><h2>${esc(title)}</h2>${svg}</section>` : '');
  const aka = (p) => { const o = (p.names || []).filter((n) => n !== p.name); return o.length ? ` (${L.aka} ${o.join(rtl ? '، ' : ', ')})` : ''; };
  const rows = d.people.map((p) => `<tr><td>${esc((p.name || '—') + aka(p))}</td><td>${p.docs}</td><td>${hrs(p.activeMs)}</td><td>${p.sessions}</td><td>${p.saves}</td><td>${p.exports}</td><td>${p.signs}</td><td>+${p.added} / −${p.removed}</td></tr>`).join('');
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
${sec(L.perWeek, lineChart(weekRows))}
${sec(L.perPerson, columnChart(perPerson, { unit: '' }))}
${sec(L.share, donutChart(st))}
${sec(L.heat, heatChart(heat, heatCols))}
${sec(L.output, bars(output, { rtl }))}
<section><h2>${esc(L.people)}</h2><table><thead><tr><th>${esc(L.name)}</th><th>${esc(L.docs)}</th><th>${esc(L.hours)}</th><th>${esc(L.sessions)}</th><th>${esc(L.saves)}</th><th>${esc(L.exports)}</th><th>${esc(L.signs)}</th><th>${esc(L.words)}</th></tr></thead><tbody>${rows}</tbody></table></section>
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
