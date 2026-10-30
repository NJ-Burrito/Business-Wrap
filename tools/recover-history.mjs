// Re-attach a lost work history. A re-wrap before b24678c (and v0.13.0's own) dropped the sealed log from a saved HTML;
// the machine's history log (.system\history\<title> (<id8>).bwlog; before 0.13.3 HISTORY\<doc-id>.bwlog) still has it. This matches the two and, only for pairs you approve, writes it back.
//
//   node tools/recover-history.mjs [--folder <save folder>] [--report <file.md>]        dry run (default): writes the report only
//   node tools/recover-history.mjs [--folder ...] --apply <pairId>,<pairId>              re-attaches those pairs, nothing else
//
// folder = the Business-Wrap save folder (default: the one the app uses): Documents\*\*.html + .system\history\*.bwlog
// (an older folder with HTML\*.html + HISTORY\*.bwlog still works). The dry-run report is written inside .system, not in Downloads.
// Match: exact = a log entry's docHash equals the document's state hash (score 1.0; the log is cut after that entry).
//        partial = share of the document's edit ids found in the log (x0.6) + title seen in the log (x0.3); never above 0.89;
//        a partial pair is attached whole and the editor will say plainly that the file and log do not line up.
// Apply: original copied to .system\backups first; the log is written in; the file is re-opened through the current
// migration path (rewrapEditorHtml) and must show the expected entry count, else the original is put back.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { BWLOG1 as L } from '../engine/ledger-v1.mjs';
import { rewrapEditorHtml } from '../engine/build-editor.mjs';
import { dataOf, describe } from './fixtures/history.mjs';

const BLOCK = /(<script type="application\/json" id="bw-data">)([\s\S]*?)(<\/script>)/;
const sha = (s) => `sha256:${crypto.createHash('sha256').update(s).digest('hex')}`;
const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();
const pid = (...x) => crypto.createHash('sha1').update(x.join('|')).digest('hex').slice(0, 8);

/** Documents (a service of an HTML file) with no readable history, and the facts to match on. */
/** The Save-HTML files of a save folder: Documents\<title>\<title>.html, else (before 0.13.3) HTML\*.html. → relative paths below the folder. */
export function htmlFiles(folder) {
  const docs = fs.readdirSync(folder, { withFileTypes: true }).find((e) => e.isDirectory() && /^(المستندات - Documents|Documents)$/i.test(e.name));
  const html = (d) => (fs.existsSync(d) ? fs.readdirSync(d).filter((x) => /\.html?$/i.test(x)).map((x) => path.relative(folder, path.join(d, x))) : []);
  if (docs) return fs.readdirSync(path.join(folder, docs.name), { withFileTypes: true }).filter((e) => e.isDirectory()).flatMap((e) => html(path.join(folder, docs.name, e.name)));
  return html(path.join(folder, 'HTML'));
}
/** The file a record names: below HTML\ in an older folder (the record keeps the bare name), else below the folder. */
const fileOf = (folder, f) => (fs.existsSync(path.join(folder, 'HTML', f)) ? path.join(folder, 'HTML', f) : path.join(folder, f));
const historyDir = (folder) => (fs.existsSync(path.join(folder, '.system', 'history')) ? path.join(folder, '.system', 'history') : path.join(folder, 'HISTORY'));
const backupDir = (folder) => (fs.existsSync(path.join(folder, '.system')) ? path.join(folder, '.system', 'backups') : path.join(folder, 'HISTORY', 'backups'));

export async function scanDocs(folder) {
  const docs = [], withHistory = [];
  for (const f of htmlFiles(folder)) {
    let d;
    const legacy = /^HTML[\\/]/.test(f), name = legacy ? path.basename(f) : f;
    try { d = dataOf(fs.readFileSync(path.join(folder, f), 'utf8')); } catch { continue; }
    for (const s of d.services || []) {
      const eds = Object.fromEntries(Object.entries(s.editions || {}).map(([ed, e]) => [ed, { hash: sha(e.raw || ''), ops: e.ops || [] }]));
      let has = false;
      if (d.prov?.[s.id]?.log) { try { has = (await L.unseal(d.prov[s.id].log, d.prov[s.id].doc)).entries.length > 0; } catch { has = false; } }
      const ops = Object.values(s.editions || {}).flatMap((e) => (e.ops || []).map((o) => o.id)).filter(Boolean);
      const titles = new Set();
      for (const e of Object.values(s.editions || {})) {
        try { const c = JSON.parse(e.raw).control || {}; [c.title, c.coverTitle].forEach((t) => t && titles.add(norm(t))); } catch { /* base unreadable */ }
        for (const o of e.ops || []) if (/^\/control\/(title|coverTitle)$/.test(o.path || '') && typeof o.value === 'string') titles.add(norm(o.value));
      }
      const rec = { file: name, svc: s.id, state: await L.docHash(eds), ops, titles: [...titles].filter(Boolean) };
      (has ? withHistory : docs).push(rec);
    }
  }
  return { docs, withHistory };
}

/** The history logs (*.bwlog) opened and summarised. Unreadable ones are listed, not dropped. */
export async function scanLogs(folder) {
  const dir = historyDir(folder);
  const logs = [], bad = [];
  for (const f of fs.existsSync(dir) ? fs.readdirSync(dir).filter((x) => x.endsWith('.bwlog')) : []) {
    const text = fs.readFileSync(path.join(dir, f), 'utf8');
    let doc = f.slice(0, -6);
    try { const h = JSON.parse(fs.readFileSync(path.join(dir, `${doc}.heads.json`), 'utf8')); if (h.doc) doc = h.doc; } catch { /* the stem is the id */ }
    try {
      const u = await L.unseal(text, doc);
      const opIds = new Set(u.entries.map((e) => e.data?.op?.id).filter(Boolean));
      const titles = new Set(u.entries.flatMap((e) => [e.data?.docTitle, e.data?.title, /^\/control\/(title|coverTitle)$/.test(e.data?.op?.path || '') ? e.data.op.value : null]).filter((t) => typeof t === 'string').map(norm).filter(Boolean));
      logs.push({ file: f, doc, text, entries: u.entries, opIds, titles, states: u.entries.map((e) => e.docHash) });
    } catch (e) { bad.push({ file: f, why: e.message }); }
  }
  return { logs, bad };
}

/** Every doc x log pair that has any evidence, best first. */
export function match(docs, logs) {
  const pairs = [];
  for (const d of docs) for (const g of logs) {
    const at = d.state && g.states.lastIndexOf(d.state);
    const title = d.titles.some((t) => g.titles.has(t));
    let score, how;
    if (at >= 0) { score = 1; how = `state hash equals log entry #${at}`; }
    else {
      const c = d.ops.length ? d.ops.filter((o) => g.opIds.has(o)).length / d.ops.length : 0;
      score = Math.min(0.89, 0.6 * c + 0.3 * (title ? 1 : 0));
      how = `${Math.round(c * 100)}% of ${d.ops.length} edit ids in the log; title ${title ? 'seen' : 'not seen'}`;
    }
    if (score >= 0.3) pairs.push({ id: pid(d.file, d.svc, g.doc), doc: d, log: g, score: +score.toFixed(2), how, cut: at >= 0 ? at + 1 : g.entries.length });
  }
  return pairs.sort((a, b) => b.score - a.score);
}

export function report({ folder, docs, withHistory, logs, bad, pairs }) {
  const used = new Set(pairs.map((p) => `${p.doc.file}|${p.doc.svc}`)), usedL = new Set(pairs.map((p) => p.log.doc));
  const o = [`# History recovery: dry run`, '', `Folder: ${folder}`, `Documents without history: ${docs.length} (with history, left alone: ${withHistory.length}); logs in HISTORY: ${logs.length} (unreadable: ${bad.length})`, '', '## Pairs', '', '| id | confidence | document | log | evidence | entries attached |', '|---|---|---|---|---|---|'];
  for (const p of pairs) o.push(`| ${p.id} | ${p.score} | ${p.doc.file} (${p.doc.svc}) | ${p.log.file} | ${p.how} | ${p.cut} of ${p.log.entries.length} |`);
  if (!pairs.length) o.push('| - | - | none | | | |');
  o.push('', '## Documents with no match', '', ...(docs.filter((d) => !used.has(`${d.file}|${d.svc}`)).map((d) => `- ${d.file} (${d.svc}) ${d.ops.length} edits`)), '', '## Logs with no document', '', ...logs.filter((g) => !usedL.has(g.doc)).map((g) => `- ${g.file}: ${g.entries.length} entries, titles: ${[...g.titles].slice(0, 2).join(' / ') || '-'}`), ...(bad.length ? ['', '## Unreadable logs', '', ...bad.map((b) => `- ${b.file}: ${b.why}`)] : []), '', 'Apply only what you approve: `node tools/recover-history.mjs --apply <id>,<id>`. A confidence below 1 means the log and the file do not line up exactly; check the row first.');
  return o.join('\n') + '\n';
}

/** Re-attach one approved pair. Returns {ok, entries, backup} or throws after putting the original back. */
export async function apply(folder, p) {
  const file = fileOf(folder, p.doc.file);
  const original = fs.readFileSync(file, 'utf8');
  const bdir = backupDir(folder);
  fs.mkdirSync(bdir, { recursive: true });
  const backup = path.join(bdir, `${new Date().toISOString().replace(/[:.]/g, '-')}-${path.basename(p.doc.file)}`);
  fs.copyFileSync(file, backup);
  try {
    const d = dataOf(original);
    const sealed = await L.seal({ doc: p.log.doc, entries: p.log.entries.slice(0, p.cut) });
    d.prov = { ...(d.prov || {}), [p.doc.svc]: { doc: p.log.doc, log: sealed } };
    d.bwlog = 1;
    fs.writeFileSync(file, original.replace(BLOCK, (_, a, _b, c) => a + JSON.stringify(d).replace(/</g, '\\u003c') + c));
    const after = await describe(rewrapEditorHtml(fs.readFileSync(file, 'utf8')));
    const got = after.logs[p.doc.svc]?.entries;
    if (got !== p.cut) throw new Error(`opened with ${got} entries, expected ${p.cut}`);
    return { ok: true, entries: got, backup };
  } catch (e) {
    fs.copyFileSync(backup, file);
    throw new Error(`${p.doc.file}: ${e.message}; original put back (backup kept at ${backup})`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = (k) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? null : process.argv[i + 1]; };
  const folder = path.resolve(arg('folder') || (await import('../engine/workspace.mjs')).workspace().root);
  const { docs, withHistory } = await scanDocs(folder);
  const { logs, bad } = await scanLogs(folder);
  const pairs = match(docs, logs);
  const approve = arg('apply');
  if (!approve) {
    const out = path.resolve(arg('report') || path.join(folder, fs.existsSync(path.join(folder, '.system')) ? '.system' : '', 'recover-history-report.md'));
    fs.writeFileSync(out, report({ folder, docs, withHistory, logs, bad, pairs }));
    console.log(`dry run: ${pairs.length} pair(s), report: ${out}`);
  } else {
    let failed = 0;
    for (const id of approve.split(',').map((x) => x.trim()).filter(Boolean)) {
      const p = pairs.find((x) => x.id === id);
      if (!p) { console.error(`${id}: no such pair (run the dry run again)`); failed += 1; continue; }
      try { const r = await apply(folder, p); console.log(`${id}: ${p.doc.file} now opens with ${r.entries} entries; backup ${r.backup}`); } catch (e) { console.error(e.message); failed += 1; }
    }
    process.exit(failed ? 1 : 0);
  }
}
