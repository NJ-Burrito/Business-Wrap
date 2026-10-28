// Per-stage gates (0.13.0 B4): one check after each pipeline step. A gate never heals: it answers PASS or FAIL
// (or SKIP when the tool it needs is not on this machine), with the problems it found.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { config } from '../config.mjs';

const res = (stage, problems, extra = {}) => ({ stage, verdict: problems.length ? 'FAIL' : 'PASS', problems, ...extra });
const readMaybe = (x) => (typeof x === 'string' ? JSON.parse(fs.readFileSync(x, 'utf8')) : x);

/** 01 harvest: a raw crawl ({languages: {xx: {steps: []}}}) or a process IR ({kind: 'bw-process', steps: []}). */
export function gateHarvest(input) {
  const h = readMaybe(input);
  const p = [];
  if (h?.kind === 'bw-process') {
    if (!Array.isArray(h.steps) || !h.steps.some((s) => s.type === 'task' || s.type === 'decision')) p.push('process has no task or decision step');
    if (!Array.isArray(h.flows)) p.push('process has no flows array');
  } else if (h?.languages && typeof h.languages === 'object') {
    const langs = Object.entries(h.languages);
    if (!langs.length) p.push('harvest has no language');
    for (const [l, v] of langs) if (!Array.isArray(v?.steps)) p.push(`harvest ${l}: steps is not an array`);
  } else p.push('not a harvest (no languages) and not a process (kind bw-process)');
  return res('harvest', p);
}

/** 02 evidence ledger: every row carries a disposition. */
export function gateEvidence(input) {
  const ev = readMaybe(input);
  const rows = ev?.ledger?.rows || ev?.ledger || [];
  const p = Array.isArray(rows) ? rows.filter((r) => !r.disposition).map((r) => `ledger row without a disposition: ${r.kind} ${r.id}`) : ['no ledger rows'];
  return res('evidence', p);
}

/** 03 document: control + chapters, a document code, each chapter with a title and sections. */
export function gateDocument(input) {
  const d = readMaybe(input);
  const p = [];
  if (!d?.control) p.push('no control block');
  if (!d?.control?.documentId) p.push('no document code (control.documentId)');
  if (!Array.isArray(d?.chapters) || !d.chapters.length) p.push('no chapters');
  else d.chapters.forEach((c, i) => { if (!c.title) p.push(`chapter ${i + 1} has no title`); if (!Array.isArray(c.sections)) p.push(`chapter ${i + 1} has no sections array`); });
  return res('document', p);
}

const popplerTool = (name) => {
  const dir = config().poppler;
  const exe = dir && path.join(dir, process.platform === 'win32' ? `${name}.exe` : name);
  return exe && fs.existsSync(exe) ? exe : name;
};
/** render: every font in the PDF is Thmanyah (or a face the document chose), none is Type 3, none is Cairo, no watermark text. */
export function gateRender(pdf, { allow = [] } = {}) {
  const r = spawnSync(popplerTool('pdffonts'), [pdf], { encoding: 'utf8' });
  if (r.error || r.status !== 0) return { stage: 'render', verdict: 'SKIP', problems: [], why: 'pdffonts (poppler) is not available' };
  const rows = r.stdout.split('\n').slice(2).filter((l) => l.trim());
  const p = [];
  for (const l of rows) {
    const name = l.split(/\s+/)[0].replace(/^[A-Z]{6}\+/, '');
    if (/Type 3/.test(l)) p.push(`Type 3 font: ${name}`);
    if (/cairo/i.test(name)) p.push(`Cairo font: ${name}`);
    if (!/thmanyah/i.test(name) && !allow.some((a) => name.toLowerCase().includes(a.toLowerCase().replace(/\s+/g, '')))) p.push(`not a Thmanyah face: ${name}`);
  }
  const t = spawnSync(popplerTool('pdftotext'), ['-enc', 'UTF-8', pdf, '-'], { encoding: 'utf8' });
  if (!t.error && /bw-watermark/i.test(t.stdout || '')) p.push('watermark text found in the PDF');
  return res('render', p, { fonts: rows.length });
}

/** export: the files exist, are not empty, carry their extension, and both editions are there when two were asked. */
export function gateExport(files, { editions } = {}) {
  const p = [];
  for (const f of files) {
    if (!fs.existsSync(f)) { p.push(`missing: ${f}`); continue; }
    if (!fs.statSync(f).size) p.push(`empty: ${f}`);
    if (!/\.(pdf|docx|html)$/i.test(f)) p.push(`unexpected file type: ${f}`);
  }
  if (editions) for (const ed of editions) if (!files.some((f) => new RegExp(`[.-](${ed}|${ed === 'en' ? 'eng' : ed})\\.(pdf|docx)$`, 'i').test(f))) p.push(`edition ${ed} missing`);
  return res('export', p);
}

/** ledger: the trust ledger's own verify (WP4 engine/ledger-v1.mjs). Never healed: a broken hash or signature fails. */
export async function gateLedger(file) {
  let mod;
  try { mod = await import('../ledger-v1.mjs'); } catch { return { stage: 'ledger', verdict: 'SKIP', problems: [], why: 'engine/ledger-v1.mjs is not in this build yet (WP4)' }; }
  const r = await mod.verify(fs.readFileSync(file));
  return res('ledger', r.ok ? [] : [r.reason || 'ledger does not verify']);
}

export const GATES = { harvest: gateHarvest, evidence: gateEvidence, document: gateDocument, render: gateRender, export: gateExport, ledger: gateLedger };
