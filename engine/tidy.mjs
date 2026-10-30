// Business-Wrap 0.13.3: moves an old save folder (PDF\, DOCX\, HTML\, HISTORY\ by type, uuid history names) into the tree
//   Documents\<title>\{<title>.html, Exports\, Versions\}, Documents\_Unsorted\, .system\{history,backups,sessions,library}
// Moves, never deletes: every file is accounted for (before = after), the log is .system\migration-0.13.3.json, history stays
// resolvable by id (.system\history\index.json). Idempotent: a second run finds nothing to move.
//   business-wrap tidy --dry-run     prints the plan, changes nothing
//   business-wrap tidy               applies it (also run once by ensure() on the first start of 0.13.3)
import fs from 'node:fs';
import path from 'node:path';
import {
  workspace, dirsOf, UNSORTED_NAME, LEGACY, UNTITLED, LANG_WORD, readIndex, writeIndex, allocFolder, stemFor,
  htmlInfo, titlesOf, stamp, titleStem,
} from './workspace.mjs';

export const MIGRATION_LOG = 'migration-0.13.3.json';
const walk = (d) => (fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)])) : []);
const list = (d) => (fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }) : []);
/** The real folder of a legacy name on a case-insensitive disk (Windows) or exactly (elsewhere). */
const legacyDir = (root, name) => path.join(root, name);
const NAME = /^(.*?)-(\d{4}-\d{2}-\d{2})-(AR|ENG)(?:-(\d+))?(\.print)?\.(pdf|docx|html)$/i;
const REPORT_TITLES = ['تقرير الأداء', 'Performance report'];

/** Plan (and, unless dryRun, do) the move of an old layout under `ws.root`. → {dryRun, moves, unmatched, failed, before, after, lines}. */
export function tidy(ws = workspace(), { dryRun = false } = {}) {
  const root = ws.root;
  const D = dirsOf(root);
  const idx = readIndex(D.history);
  const moves = [], unmatched = [], failed = [];
  const taken = new Set();
  const uniquePlan = (to) => {
    const dir = path.dirname(to), file = path.basename(to);
    const ext = /(\.print|\.shared)?\.[^.]+$/.exec(file)?.[0] || '', stem = file.slice(0, file.length - ext.length);
    let f = to;
    for (let n = 2; fs.existsSync(f) || taken.has(f.toLowerCase()); n++) f = path.join(dir, `${stem} (${n})${ext}`);
    taken.add(f.toLowerCase());
    return f;
  };
  const move = (from, to, kind) => {
    to = uniquePlan(to);
    const row = { from, to, kind };
    moves.push(row);
    if (dryRun) return to;
    try {
      fs.mkdirSync(path.dirname(to), { recursive: true });
      try { fs.renameSync(from, to); } catch (e) { if (e.code !== 'EXDEV') throw e; fs.copyFileSync(from, to); if (fs.statSync(to).size !== fs.statSync(from).size) throw e; fs.unlinkSync(from); }
    } catch (e) { failed.push({ from, to, error: String(e.message || e) }); }
    return to;
  };
  const moveTree = (src, dst, kind) => { for (const f of walk(src)) move(f, path.join(dst, path.relative(src, f)), kind); };

  const legacyFiles = LEGACY.flatMap((n) => walk(legacyDir(root, n)));
  const before = legacyFiles.length;
  const stampOf = (name, mtime) => `${name || stamp(mtime).slice(0, 10)} ${stamp(mtime).slice(11)}`;

  /* A. the Save-HTML files, grouped by document (shared ids, shared history ids, else the same title) */
  const groups = [];
  const nameTitle = (f) => { const m = NAME.exec(path.basename(f)); return m ? m[1] : path.basename(f).replace(/(\.editor|\.print)?\.html?$/i, ''); };
  for (const e of list(legacyDir(root, 'HTML'))) {
    if (!e.isFile() || !/\.html?$/i.test(e.name) || /\.print\.html?$/i.test(e.name)) continue;
    const file = path.join(legacyDir(root, 'HTML'), e.name);
    let text = '';
    try { text = fs.readFileSync(file, 'utf8'); } catch { /* unreadable: Unsorted below */ }
    const info = htmlInfo(text);
    const g = { files: [{ file, mtime: fs.statSync(file).mtime }], ids: new Set(info.ids), hist: new Set(info.hist), titles: titlesOf(info, '') };
    if (!g.titles.length && !g.ids.size && !g.hist.size) { unmatched.push(file); move(file, path.join(D.docs, UNSORTED_NAME, e.name), 'unsorted'); continue; } // not a Save-HTML: we cannot tell whose it is
    groups.push(g);
  }
  for (let again = true; again;) { // merge groups that share an id, a history id or a title
    again = false;
    for (let i = 0; i < groups.length && !again; i++) for (let j = i + 1; j < groups.length && !again; j++) {
      const a = groups[i], b = groups[j];
      const share = [...a.ids].some((x) => b.ids.has(x)) || [...a.hist].some((x) => b.hist.has(x)) || ((!a.ids.size && !b.ids.size) && a.titles.some((x) => b.titles.some((y) => titleStem(x).toLowerCase() === titleStem(y).toLowerCase())));
      if (share) { a.files.push(...b.files); b.ids.forEach((x) => a.ids.add(x)); b.hist.forEach((x) => a.hist.add(x)); a.titles = [...new Set([...a.titles, ...b.titles])]; groups.splice(j, 1); again = true; }
    }
  }
  for (const g of groups) {
    const folder = allocFolder(idx, D.docs, { ids: [...g.ids], titles: g.titles, hist: [...g.hist] });
    g.files.sort((a, b) => b.mtime - a.mtime);
    const dir = path.join(D.docs, folder);
    g.files.forEach((f, i) => {
      const main = path.join(dir, `${folder}.html`);
      if (i === 0 && !fs.existsSync(main) && !taken.has(main.toLowerCase())) move(f.file, main, 'document');
      else move(f.file, path.join(dir, 'Versions', `${stamp(f.mtime)} ${folder}.html`), 'version');
    });
  }

  /* B. PDF, DOCX and print pages: into their document's Exports\ (found by title), else Unsorted */
  const folderOfTitle = (t) => {
    const x = titleStem(t).toLowerCase();
    return Object.keys(idx.folders).find((f) => f.toLowerCase() === x || idx.folders[f].titles.some((y) => y.toLowerCase() === x));
  };
  for (const n of ['PDF', 'DOCX', 'HTML']) for (const e of list(legacyDir(root, n))) {
    if (!e.isFile()) continue;
    const file = path.join(legacyDir(root, n), e.name);
    if (n === 'HTML' && !/\.print\.html?$/i.test(e.name) && /\.html?$/i.test(e.name)) continue; // section A
    const m = NAME.exec(e.name);
    const mtime = fs.statSync(file).mtime;
    if (!m) { unmatched.push(file); move(file, path.join(D.docs, UNSORTED_NAME, e.name), 'unsorted'); continue; }
    const [, title, date, lang, , print, ext] = m;
    let folder = folderOfTitle(title);
    if (!folder && REPORT_TITLES.includes(title)) folder = allocFolder(idx, D.docs, { titles: [title] });
    const word = LANG_WORD[/^eng$/i.test(lang) ? 'en' : 'ar'];
    const tail = `${print ? '.print' : ''}.${ext.toLowerCase()}`;
    if (folder) move(file, path.join(D.docs, folder, 'Exports', `${stampOf(date, mtime)} ${folder} - ${word}${tail}`), 'export');
    else { unmatched.push(file); move(file, path.join(D.docs, UNSORTED_NAME, `${stampOf(date, mtime)} ${titleStem(title)} - ${word}${tail}`), 'unsorted'); }
  }

  /* C. HISTORY: logs get "<Document title> (<first 8 of id>)", the rest goes to its place under .system */
  const H = legacyDir(root, 'HISTORY');
  const folderOfHist = (id) => Object.keys(idx.folders).find((f) => idx.folders[f].history.includes(id));
  const logs = new Map(); // stem → {id}
  for (const e of list(H)) {
    if (!e.isFile()) continue;
    const m = /^(.*)\.(bwlog|heads\.json)$/.exec(e.name);
    if (m) {
      const key = m[1];
      if (!logs.has(key)) {
        let id = key;
        try { id = JSON.parse(fs.readFileSync(path.join(H, `${key}.heads.json`), 'utf8')).doc || key; } catch { /* a log without heads: its name is the id */ }
        logs.set(key, id);
      }
    }
  }
  for (const [key, id] of logs) {
    const folder = folderOfHist(id) || null;
    const known = idx.history[id];
    const stem = known?.stem || stemFor(idx, id, folder || UNTITLED);
    idx.history[id] = { stem, folder };
    for (const ext of ['bwlog', 'heads.json']) { const f = path.join(H, `${key}.${ext}`); if (fs.existsSync(f)) move(f, path.join(D.history, `${stem}.${ext}`), 'history'); }
  }
  for (const e of list(H)) {
    const f = path.join(H, e.name);
    if (e.isDirectory()) { moveTree(f, e.name === 'sessions' ? D.sessions : e.name === 'backups' ? D.backups : e.name === 'library' ? D.library : path.join(D.history, e.name), 'state'); continue; }
    if (/\.(bwlog|heads\.json)$/.test(e.name)) continue; // moved above
    move(f, path.join(['projects.json', 'profile.json.gz'].includes(e.name) ? D.system : D.history, e.name), 'state');
  }
  // what code that still says "history\backups" wrote since: kept apart from the logs
  if (fs.existsSync(path.join(D.history, 'backups'))) moveTree(path.join(D.history, 'backups'), D.backups, 'state');

  /* D. finish: empty old folders go, the index and the log are written */
  let after = 0;
  if (!dryRun) {
    after = moves.filter((r) => fs.existsSync(r.to) && !fs.existsSync(r.from)).length;
    for (const n of LEGACY) {
      const top = legacyDir(root, n);
      const dirs = (d) => list(d).filter((e) => e.isDirectory()).flatMap((e) => [...dirs(path.join(d, e.name)), path.join(d, e.name)]);
      for (const d of [...dirs(top), top]) { try { fs.rmdirSync(d); } catch { /* not empty: left as it is */ } }
    }
    if (moves.length) {
      writeIndex(D.history, idx);
      const logFile = path.join(D.system, MIGRATION_LOG);
      let runs = [];
      try { runs = JSON.parse(fs.readFileSync(logFile, 'utf8')).runs || []; } catch { /* first run */ }
      runs.push({ at: new Date().toISOString(), before, moved: after, unmatched, failed, moves });
      fs.mkdirSync(D.system, { recursive: true });
      fs.writeFileSync(logFile, JSON.stringify({ version: '0.13.3', runs }, null, 1));
    }
  }
  const lines = moves.map((r) => `${r.kind.padEnd(9)} ${r.from}  →  ${r.to}`);
  return { dryRun, before, moved: dryRun ? moves.length : after, moves: moves.length, unmatched: unmatched.length, failed: failed.length, lines };
}

/** ensure() calls this on the first start of 0.13.3 for a folder in the old layout: never throws, never blocks the start. */
export function tidyNow(ws) {
  try { return tidy(ws); } catch (e) { console.error(`business-wrap tidy: ${e.message}`); return null; }
}
