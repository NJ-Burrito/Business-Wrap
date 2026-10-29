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

/**
 * ledger: the trust ledger's full verify, the same check the editor runs on open (31-provenance pvLoad) and the one
 * `business-wrap verify-history` runs. Never healed. Chain, hashes, signatures; for a Save-HTML also the document state
 * against the log's last docHash (hash taken from each edition's own text), a log whose last entry is not its «saveHtml»
 * (tail cut), an edited service with no log (stripped; or, with no 0.13 trace at all — BWLOG1.traces — made before 0.13), and this machine's
 * HISTORY head when it knows the document. A .bwlog is checked against its <doc>.heads.json.
 */
export async function gateLedger(file, { history } = {}) {
  let mod;
  try { mod = await import('../ledger-v1.mjs'); } catch { return { stage: 'ledger', verdict: 'SKIP', problems: [], why: 'engine/ledger-v1.mjs is not in this build yet (WP4)' }; }
  const { BWLOG1 } = mod;
  const problems = [];
  let hist = history;
  if (hist === undefined) { try { hist = (await import('../workspace.mjs')).workspace().dirs.history; } catch { hist = null; } }
  const headsOf = (doc) => { try { return JSON.parse(fs.readFileSync(path.join(hist, `${String(doc).replace(/:/g, '_')}.heads.json`), 'utf8')); } catch { return null; } };
  const sha = async (s) => `sha256:${BWLOG1.hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))))}`;
  try {
    const text = fs.readFileSync(file, 'utf8');
    if (/\.bwlog$/i.test(file)) {
      const hf = file.replace(/\.bwlog$/i, '.heads.json');
      if (!fs.existsSync(hf)) return res('ledger', [`no document id: ${path.basename(hf)} is not beside the log`]);
      const heads = JSON.parse(fs.readFileSync(hf, 'utf8'));
      const L = await BWLOG1.unseal(text, heads.doc);
      for (const i of (await BWLOG1.verify(L, { mirror: heads })).issues) problems.push(`${L.doc} entry ${i.seq}: ${i.reason}`);
      return res('ledger', problems);
    }
    const m = /<script type="application\/json" id="bw-data">([\s\S]*?)<\/script>/.exec(text);
    if (!m) return res('ledger', ['not a bwlog file or a Save-HTML editor file']);
    const data = JSON.parse(m[1]);
    const prov = data.prov || {};
    let legacy = false;
    for (const s of data.services || []) {
      const editions = {};
      for (const [ed, e] of Object.entries(s.editions || {})) editions[ed] = { hash: typeof e.raw === 'string' ? await sha(e.raw) : e.hash, ops: e.ops || [] };
      const x = prov[s.id];
      if (!x?.log) {
        if (!Object.values(editions).some((e) => e.ops.length)) continue;
        // review2 #17: any 0.13 trace (the mark, the timeline's marks, the head meta, the <html> attribute, the CSP hash, the
        // file's own version) or this machine's HISTORY knowing the document = «stripped»; only a file with none is «made before 0.13»
        const tr = BWLOG1.traces(data, s.id, text, { version: true });
        const known = hist && (headsOf(s.id) || (BWLOG1.traceDoc(text) && headsOf(BWLOG1.traceDoc(text))));
        if (tr.length || known) problems.push(`${s.id}: stripped (edited, no history; 0.13 traces: ${[...tr, ...(known ? ['HISTORY'] : [])].join(', ')})`); else legacy = true;
        continue;
      }
      const L = await BWLOG1.unseal(x.log, x.doc);
      for (const i of (await BWLOG1.verify(L, { editions, saved: true, mirror: hist ? headsOf(x.doc) : null })).issues) problems.push(`${L.doc} entry ${i.seq}: ${i.reason}`);
    }
    // nothing to vouch for is never a PASS; a file made before 0.13 says so instead of «stripped»
    if (!Object.keys(prov).length && !problems.length) problems.push(legacy || !BWLOG1.traces(data, null, text, { version: true }).length ? 'no history (made before 0.13)' : 'the file carries no history');
  } catch (e) { problems.push(`unreadable: ${String(e.message || e).slice(0, 120)}`); }
  return res('ledger', problems);
}

export const GATES = { harvest: gateHarvest, evidence: gateEvidence, document: gateDocument, render: gateRender, export: gateExport, ledger: gateLedger };
