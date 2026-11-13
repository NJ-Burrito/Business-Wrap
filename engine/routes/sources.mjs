// The Sources tab over HTTP (engine/sources/jobs.mjs). Same-origin or host token only; files stay in the local save folder.
//   GET  /api/sources                          → {jobs}
//   POST /api/sources            {path|url, prompt?}  → a source the host can already reach (a file, a folder, a web page)
//   POST /api/sources/upload?name=<file>&prompt=…     → the request body IS the file (streamed to disk, any size)
//   GET  /api/sources/<id>                     → {job, previews}
//   POST /api/sources/<id>/(pause|resume|stop)
//   POST /api/sources/<id>/lines  {lines}      → the person's corrected preview; facts rebuilt from it
//   POST /api/sources/<id>/fact   {id, status, text?, note?}
//   POST /api/sources/<id>/enroll {name: [[start, end], …]}  → speaker names from self-introductions (next resume)
import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { readJson } from '../workspace.mjs';
import { kindOf, newJob, start, getJob, listJobs, previews, control, saveLines, setFact, inputDir } from '../sources/jobs.mjs';
import { tokenRefused } from '../host-lifecycle.mjs';

const LOCAL = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/;

export default async (req, url, send) => {
  if (!url.pathname.startsWith('/api/sources')) return false;
  if (req.headers.origin ? !LOCAL.test(req.headers.origin) : req.method !== 'GET' && tokenRefused(req)) { send(403, { error: 'origin' }); return true; }
  try {
    const p = url.pathname;
    if (p === '/api/sources' && req.method === 'GET') { send(200, { jobs: listJobs() }); return true; }
    if (p === '/api/sources' && req.method === 'POST') {
      const b = await readJson(req);
      const input = String(b.url || b.path || '').trim();
      const isDir = !b.url && fs.existsSync(input) && fs.statSync(input).isDirectory();
      if (!b.url && !fs.existsSync(input)) { send(404, { error: `not found: ${input}` }); return true; }
      const kind = kindOf(input, isDir);
      if (!kind) { send(415, { error: `cannot read this kind of file: ${path.extname(input) || input}` }); return true; }
      const job = newJob({ input, kind, prompt: b.prompt || '' });
      start(job.id);
      send(200, { ok: true, job: getJob(job.id) });
      return true;
    }
    if (p === '/api/sources/upload' && req.method === 'POST') {
      const name = path.basename(String(url.searchParams.get('name') || '')).replace(/[<>:"/\\|?*\x00-\x1f]/g, '_');
      const kind = name && kindOf(name);
      if (!kind || kind === 'web') { req.resume(); send(415, { error: `cannot read this kind of file: ${name}` }); return true; }
      const job = newJob({ input: name, name, kind, prompt: url.searchParams.get('prompt') || '' });
      await pipeline(req, fs.createWriteStream(path.join(inputDir(job.id), name)));
      start(job.id);
      send(200, { ok: true, job: getJob(job.id) });
      return true;
    }
    const m = /^\/api\/sources\/([\w-]+)(?:\/(pause|resume|stop|lines|fact|enroll))?$/.exec(p);
    if (!m) { send(404, { error: 'no such route' }); return true; }
    const [, id, verb] = m;
    if (!getJob(id)) { send(404, { error: 'no such source' }); return true; }
    if (!verb && req.method === 'GET') { send(200, { job: getJob(id), previews: previews(id) }); return true; }
    if (req.method !== 'POST') { send(405, { error: 'POST' }); return true; }
    if (/^(pause|resume|stop)$/.test(verb)) { send(200, { ok: true, job: control(id, verb) }); return true; }
    const b = await readJson(req);
    if (verb === 'lines') saveLines(id, b.lines);
    else if (verb === 'fact') setFact(id, b.id, b);
    else if (verb === 'enroll') {
      const ok = b && typeof b === 'object' && Object.values(b).every((w) => Array.isArray(w) && w.every((x) => Array.isArray(x) && x.length === 2 && x.every(Number.isFinite)));
      if (!ok) { send(400, { error: 'enroll: {name: [[start, end], …]} in seconds' }); return true; }
      const dir = path.dirname(inputDir(id));
      fs.writeFileSync(path.join(dir, 'enroll.json'), JSON.stringify(b));
      fs.rmSync(path.join(dir, 'work', 'named.json'), { force: true });
    }
    send(200, { ok: true, previews: previews(id) });
  } catch (e) { send(400, { error: String(e.message || e).slice(0, 400) }); }
  return true;
};
