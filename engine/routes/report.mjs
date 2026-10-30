// A12: POST /api/report { from, to, people?, lang } → the performance report PDF from the HISTORY logs → { pdf, people, docs }
import fs from 'node:fs';
import { dirsOf, body } from './history.mjs';
import { readHistory, exportReport } from '../report.mjs';
import { reportPath } from '../workspace.mjs';

export default async (req, url, send, ctx) => {
  if (url.pathname !== '/api/report') return false;
  if (req.method === 'GET') { // who appears in the logs on this machine (the people picker)
    const logs = await readHistory((await dirsOf(ctx)).history);
    const people = {};
    for (const l of logs) for (const e of l.entries) if (e.actor?.id) people[e.actor.id] = e.actor.name || people[e.actor.id] || '';
    send(200, { people: Object.entries(people).map(([id, name]) => ({ id, name })), docs: logs.length });
    return true;
  }
  if (req.method !== 'POST') return send(405, { error: 'method' }), true;
  try {
    const b = await body(req);
    const d = (s) => (/^\d{4}-\d{2}-\d{2}$/.test(s || '') ? s : '');
    const lang = b.lang === 'en' ? 'en' : 'ar';
    const dirs = await dirsOf(ctx);
    const logs = await readHistory(dirs.history);
    fs.mkdirSync(dirs.pdf, { recursive: true });
    const pdf = reportPath(dirs.docs || dirs.pdf, lang); // the tree: Documents\<report title>\Exports\<date> <title> - <language>.pdf
    const r = await exportReport(logs, { from: d(b.from), to: d(b.to), people: Array.isArray(b.people) && b.people.length ? b.people.map(String) : null, lang, pdfPath: pdf });
    send(200, { pdf: r.pdf, people: r.data.people.length, docs: r.data.docs.length });
  } catch (e) { send(500, { error: String(e.message || e) }); }
  return true;
};
