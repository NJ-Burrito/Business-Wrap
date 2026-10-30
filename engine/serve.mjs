// Local server for one-click PDF + DOCX export from the editor.
//
//   node engine/serve.mjs [<editor.html>] [--port 4317] [--out <exports folder>]
//   npm run serve        no editor given: the sample editor (out/sample/event-permit.editor.html), built first
//                        when it is missing (BW_SAMPLE_EDITOR overrides the path, for tests).
//
// Exports go to --out, or to an «exports» folder beside the editor file: never into this repository.
//
// Binds 127.0.0.1 only. Serves the editor at /, exports at POST /api/export,
// and the exported files under /files/. Stdlib only.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fileURLToPath as toPath, pathToFileURL } from 'node:url';
import { registerServer, unregisterServer } from './server-registry.mjs';
import { exportPdf, exportDocx, pageThumbs, loadTheme, fontsFor, REPO, i18n, fileStem, userCwd } from './export.mjs';
import { checkForUpdate, token, settings as updateSettings } from '../update/check.mjs';
import { applyUpdate, STAGES } from '../update/apply.mjs';
import { rewrapEditorHtml, aboutInfo } from './build-editor.mjs';
import { fork, spawnSync } from 'node:child_process';
import { crawl, harvestToDocument } from './harvest/crawl.mjs';
import { learningRoute } from './learning/http.mjs';
import { printApi } from './printers.mjs';
import { workspace as liveWorkspace, ensure as ensureWorkspace, outName, uniquePath, docTitle, inHistory, localDir } from './workspace.mjs';


/** Re-wraps an older file in this editor. If that cannot be done without losing history (a newer format, a failing
 *  migration, the history check in rewrapEditorHtml) the file on disk stays as it is, a byte-for-byte copy goes to
 *  <HISTORY|.local>/backups/, and an error page is returned instead of an editor that would look fine and be empty. */
function openOrRefuse(text, file, ws) {
  try { return { html: rewrapEditorHtml(text) }; } catch (e) {
    let kept = '';
    try {
      const dir = (ws ? ensureWorkspace(ws).dirs.backups : path.join(localDir(), 'backups'));
      fs.mkdirSync(dir, { recursive: true });
      kept = path.join(dir, `${new Date().toISOString().replace(/[:.]/g, '-')}-${path.basename(file)}`);
      fs.copyFileSync(file, kept);
    } catch { kept = ''; }
    const esc = (x) => String(x).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
    const page = `<!doctype html><meta charset="utf-8"><title>Business-Wrap</title><body style="font:16px system-ui;max-width:42em;margin:3em auto"><h1>This file was not opened</h1><p>${esc(e.message)}</p><p>Your file is untouched${kept ? `; a copy is at <code>${esc(kept)}</code>` : ''}.</p>`;
    return { refused: page };
  }
}

const MAX_BODY = 60 * 1024 * 1024;
const slug = fileStem;

/** Exit code that asks the supervisor (the CLI below) to start the server again, on the new version. */
export const RESTART_CODE = 75;
const LOCAL_ORIGIN = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/;
/** Extension routes (0.13.0): engine/routes/*.mjs, sorted, each `export default async (req, url, send, ctx) => handled`. */
export const ROUTES_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'routes');
const loadRoutes = (dir) => Promise.all((fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.mjs')).sort() : []).map(async (f) => (await import(pathToFileURL(path.join(dir, f)).href)).default));

/**
 * @param {string} editorFile
 * @param {number} port
 * @param {{out?: string, installDir?: string, onUpdated?: (r: object) => void}} o  `installDir`: the folder the
 *   updater replaces (default: this repository); `onUpdated`: called after a successful update (the CLI restarts).
 */
export function serve(editorFile, port = 4317, { out, installDir = REPO, onUpdated = () => {}, routesDir = ROUTES_DIR, workspace = null, onIdle = null } = {}) {
  // workspace (A11): true = the chosen save folder (engine/workspace.mjs, read on each use), an object = that one; null = none
  const wsOf = () => (workspace === true ? liveWorkspace() : workspace);
  const OUT = path.resolve(out || wsOf()?.root || path.join(path.dirname(editorFile), 'exports'));
  const filesRoot = () => path.resolve((!out && wsOf()?.root) || OUT); // /files/: the save folder as it is now (HISTORY never served)
  const routes = loadRoutes(routesDir);
  const ctx = { OUT, editorFile, get workspace() { return wsOf(); }, onIdle, server: null };
  const versionOf = () => JSON.parse(fs.readFileSync(path.join(installDir, 'package.json'), 'utf8')).version;
  let job = null; // the one update that may run: {stage, stages, ok, error, from, to}
  let last = null; // the last check's answer, for /api/version
  const fontFiles = new Set(fontsFor(loadTheme()).cuts.map((c) => path.resolve(c.file)));
  const server = http.createServer(async (req, res) => {
    const send = (code, body, type = 'application/json') => {
      res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
      res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
    };
    try {
      const url = new URL(req.url, 'http://127.0.0.1');
      if (req.method === 'GET' && url.pathname === '/') {
        // file:// fonts do not load into an http page: route them through /font/, manifest files only.
        // an editor (or a Save-HTML file) from an older version opens in this version's editor; the file itself is never rewritten
        const opened = openOrRefuse(fs.readFileSync(editorFile, 'utf8'), editorFile, wsOf());
        if (opened.refused) return send(500, opened.refused, 'text/html; charset=utf-8');
        let html = opened.html.replace(/file:\/\/\/[^)"'\s]+\.(ttf|woff2)/g, (m) => `/font/${encodeURIComponent(m)}`);
        // the profile kept with the host (engine/routes/session.mjs): a data block, not a script (the page CSP stays as
        // built); editor/ext/12-session.js copies it into an empty localStorage before the profile card would ask
        if (wsOf()) {
          let prof = '';
          try { prof = fs.readFileSync(path.join(localDir(), 'profile.json'), 'utf8'); JSON.parse(prof); } catch { prof = ''; }
          if (prof) html = html.replace(/<\/head>/i, () => `<script type="application/json" id="bw-host-profile">${prof.replace(/</g, '\\u003c')}</script></head>`);
        }
        return send(200, html, 'text/html; charset=utf-8');
      }
      if (req.method === 'GET' && url.pathname.startsWith('/font/')) {
        const f = path.resolve(toPath(decodeURIComponent(url.pathname.slice(6))));
        if (!fontFiles.has(f)) return send(404, { error: 'not found' });
        return send(200, fs.readFileSync(f), f.endsWith('.ttf') ? 'font/ttf' : 'font/woff2');
      }
      // the Export & Print centre (0.11.0): engine/printers.mjs answers /api/print/* and /api/export/*
      if (await printApi(req, res, url, { send, OUT, maxBody: MAX_BODY, ws: () => !out && wsOf(), filesRoot })) return;
      if (req.method === 'GET' && url.pathname.startsWith('/files/')) {
        const base = filesRoot();
        const f = path.resolve(base, '.' + decodeURIComponent(url.pathname.slice(6)));
        if (!f.startsWith(base + path.sep) || inHistory(base, f) || !fs.existsSync(f)) return send(404, { error: 'not found' });
        const type = f.endsWith('.pdf') ? 'application/pdf' : f.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        return send(200, fs.readFileSync(f), type);
      }
      // 0.13.3 Settings › start server: a file:// editor (Origin: null) probes whether any server answers. That one GET, and only
      // that, is readable from a null origin, and only name + version + port are given (no update state, no repository).
      if (req.method === 'GET' && url.pathname === '/api/version' && req.headers.origin === 'null') {
        res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'access-control-allow-origin': 'null', vary: 'Origin' });
        return res.end(JSON.stringify({ name: 'Business-Wrap', version: versionOf(), served: true, port: server.address()?.port ?? null }));
      }
      if (url.pathname === '/api/version' || url.pathname.startsWith('/api/update')) {
        // the editor's Settings page and update popup (editor/update.js, editor/settings.js). The check runs here,
        // from the public release list, no token needed: the page never holds a token and never calls GitHub itself.
        if (req.headers.origin && !LOCAL_ORIGIN.test(req.headers.origin)) return send(403, { error: 'origin' });
        if (req.method === 'GET' && url.pathname === '/api/version') {
          return send(200, { ...aboutInfo(), version: versionOf(), served: true, mode: fs.existsSync(path.join(installDir, '.git')) ? 'git' : 'zip', checks: updateSettings().check, last, updating: !!(job && !job.finished) });
        }
        if (req.method === 'GET' && (url.pathname === '/api/update' || url.pathname === '/api/update/check')) {
          const r = await checkForUpdate({ force: url.searchParams.get('force') === '1', current: versionOf() });
          const { zip, zipApi, sha256, ...pub } = r; // download addresses stay on the server
          last = { status: r.status, latest: r.latest, reason: r.reason, checkedAt: r.checkedAt || Date.now() };
          return send(200, pub);
        }
        if (req.method === 'GET' && url.pathname === '/api/update/progress') return send(200, job || { stage: '', stages: STAGES });
        if (req.method === 'POST' && url.pathname === '/api/update/apply') {
          const chunks = [];
          for await (const c of req) chunks.push(c);
          let body = {};
          try { body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { /* empty */ }
          if (body.confirm !== true) return send(400, { ok: false, error: 'confirm: true required' });
          if (job && !job.finished) return send(409, { ok: false, error: 'an update is already running' });
          const from = versionOf();
          const u = await checkForUpdate({ force: true, current: from });
          if (u.status !== 'available') return send(200, { ok: false, status: u.status, reason: u.reason });
          const repo = JSON.parse(fs.readFileSync(path.join(REPO, 'update', 'source.json'), 'utf8')).repo;
          job = { stage: 'download', stages: STAGES, from, to: u.latest, finished: false };
          // runs on after the answer: the page follows /api/update/progress
          applyUpdate({ dir: installDir, release: { version: u.latest, zip: u.zip, zipApi: u.zipApi, sha256: u.sha256 }, repo, token: token(), current: from, onStage: (st) => { job.stage = st; }, failAt: process.env.BW_UPDATE_FAIL_AT || '' })
            .then((r) => { Object.assign(job, { ok: !!r.ok, error: r.ok ? '' : String(r.error || 'failed').slice(0, 300), rolledBack: !!r.rolledBack, finished: true }); if (r.ok) setTimeout(() => onUpdated(r), 1500); })
            .catch((e) => { Object.assign(job, { ok: false, error: String(e.message || e).slice(0, 300), finished: true }); });
          return send(202, { ok: true, started: true, from, to: u.latest, stages: STAGES });
        }
      }
      // local learning (engine/learning): the journal stays in .local/learning on this machine
      if (url.pathname.startsWith('/api/learning/')) return await learningRoute(req, url, send);
      if (req.method === 'POST' && url.pathname === '/api/harvest/crawl') {
        // the wizard's "walk the live service": a real (headed) browser on this machine; credentials only via $env:/$secret:
        if (req.headers.origin && !/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(req.headers.origin)) return send(403, { error: 'origin' });
        const chunks = [];
        for await (const c of req) chunks.push(c);
        const cfg = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (!Array.isArray(cfg.languages) && !cfg.startUrl) return send(400, { error: 'no start URL' });
        // the editor never files a request: a dry run, whatever the config says
        const { raw } = await crawl({ ...cfg, submit: false, outDir: path.join(OUT, '..', 'harvest', 'raw', slug(cfg.name)) });
        const H = i18n().harvest;
        return send(200, { documents: { ar: harvestToDocument(raw, { locale: 'ar', L: H.ar }), en: harvestToDocument(raw, { locale: 'en', L: H.en }) } });
      }
      if (req.method === 'POST' && url.pathname === '/api/webhook') {
        // the editor's webhooks: the browser cannot reach other origins (CSP connect-src 'self', CORS), so the server delivers
        if (req.headers.origin && !/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(req.headers.origin)) return send(403, { error: 'origin' });
        const chunks = [];
        let size = 0;
        for await (const c of req) { size += c.length; if (size > MAX_BODY) return send(413, { error: 'too large' }); chunks.push(c); }
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        let target;
        try { target = new URL(String(body.url || '')); } catch { return send(400, { ok: false, error: 'bad url' }); }
        if (!/^https?:$/.test(target.protocol)) return send(400, { ok: false, error: 'http or https only' });
        const p = body.payload || {};
        // only the documented fields leave the machine (bible/contracts/webhook.schema.json): never fonts, never the watermark
        const payload = Object.fromEntries(['schema', 'version', 'event', 'service', 'edition', 'timestamp', 'summary', 'document'].filter((k) => k in p).map((k) => [k, p[k]]));
        if (payload.document && typeof payload.document === 'object') { const { learned, ...doc } = payload.document; payload.document = doc; } // learning never leaves the machine
        try {
          const r = await fetch(target, { method: 'POST', headers: { 'content-type': 'application/json', 'user-agent': 'business-wrap-webhook/1' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(8000), redirect: 'manual' });
          return send(200, { ok: r.status >= 200 && r.status < 300, status: r.status });
        } catch (e) {
          return send(200, { ok: false, status: 0, error: String(e.message || e).slice(0, 200) });
        }
      }
      if (req.method === 'POST' && url.pathname === '/api/pages') {
        if (req.headers.origin && !/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(req.headers.origin)) return send(403, { error: 'origin' });
        const chunks = [];
        let size = 0;
        for await (const c of req) { size += c.length; if (size > MAX_BODY) return send(413, { error: 'too large' }); chunks.push(c); }
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (!body.doc?.chapters || !body.doc?.control) return send(400, { error: 'no document' });
        const base = loadTheme();
        const theme = { ...base, ...body.theme, vars: { ...base.vars, ...(body.theme?.vars || {}) } };
        const t0 = Date.now();
        const pages = await pageThumbs(body.doc, { locale: body.locale === 'en' ? 'en' : 'ar', theme });
        return send(200, { pages, ms: Date.now() - t0 });
      }
      if (req.method === 'POST' && url.pathname === '/api/export') {
        if (req.headers.origin && !/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(req.headers.origin)) return send(403, { error: 'origin' });
        let size = 0;
        const chunks = [];
        for await (const c of req) {
          size += c.length;
          if (size > MAX_BODY) return send(413, { error: 'too large' });
          chunks.push(c);
        }
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        const locale = body.locale === 'en' ? 'en' : 'ar';
        if (!body.doc?.chapters || !body.doc?.control) return send(400, { error: 'no document' });
        const base = loadTheme();
        const theme = { ...base, ...body.theme, vars: { ...base.vars, ...(body.theme?.vars || {}) } };
        const stem = `${slug(body.service)}.${locale}`;
        const dir = path.join(OUT, slug(body.service), locale);
        const ws = !out && wsOf();
        // the save folder (A11): PDF\ and DOCX\, "<title>-<date>-<AR|ENG>", a clash gets -2, -3 (never an overwrite)
        if (ws) ensureWorkspace(ws);
        const title = docTitle(body.doc, body.service);
        const pdfPath = ws ? uniquePath(ws.dirs.pdf, outName(title, new Date(), locale, 'pdf')) : path.join(dir, `${stem}.pdf`);
        const docxPath = ws ? uniquePath(ws.dirs.docx, outName(title, new Date(), locale, 'docx')) : path.join(dir, `${stem}.docx`);
        const pdf = await exportPdf(body.doc, { locale, theme, pdfPath });
        let docx = null;
        let docxError = null;
        let fontNotes = [];
        try { ({ docx, fontNotes } = exportDocx(body.doc, { locale, theme, docxPath, embedFonts: body.embedFonts !== false })); } catch (e) { docxError = String(e.message).slice(0, 400); }
        const rel = (f) => `/files/${path.relative(filesRoot(), f).split(path.sep).map(encodeURIComponent).join('/')}`;
        return send(200, { pdf: pdf.pdf, docx, docxError, fontNotes, pdfUrl: rel(pdf.pdf), docxUrl: docx && rel(docx) });
      }
      // extension routes: a request that changes anything must come from this server's own page
      if (req.method !== 'GET' && req.method !== 'HEAD' && req.headers.origin && !LOCAL_ORIGIN.test(req.headers.origin)) return send(403, { error: 'origin' });
      for (const r of await routes) if (await r(req, url, send, ctx, res)) return; // res: for a route that streams (session live connection)
      send(404, { error: 'not found' });
    } catch (e) {
      send(500, { error: String(e.message || e).slice(0, 400) });
    }
  });
  ctx.server = server;
  return new Promise((ok) => server.listen(port, '127.0.0.1', () => ok(server)));
}

// run as the entry point, also when started through a junction or a symlink (compare real paths)
const real = (f) => { try { return fs.realpathSync.native(path.resolve(f)); } catch { return path.resolve(f); } };
if (process.argv[1] && real(process.argv[1]) === real(fileURLToPath(import.meta.url))) {
  const args = process.argv.slice(2);
  const opt = (k) => { const i = args.indexOf(`--${k}`); return i < 0 ? undefined : args[i + 1]; };
  let file = args.find((a, i) => !a.startsWith('--') && !['--port', '--out'].includes(args[i - 1]));
  const port = opt('port') !== undefined ? Number(opt('port')) : 4317;
  if (!file) {
    // `npm run serve` with no editor: serve the sample, building it first when out/ does not have it yet
    file = path.resolve(process.env.BW_SAMPLE_EDITOR || path.join(REPO, 'out', 'sample', 'event-permit.editor.html'));
    if (!fs.existsSync(file) && !process.env.BW_SERVE_CHILD) {
      console.log('No editor built yet: building the sample first (npm run sample)…');
      const b = spawnSync(process.execPath, [path.join(REPO, 'engine', 'build-editor.mjs'), path.join(REPO, 'samples', 'event-permit'), '--out', file, '--set', 'sample'], { stdio: 'inherit' });
      if (b.status !== 0) { console.error('building the sample failed: run npm run sample and read its error'); process.exit(1); }
    }
    args.push(file);
  }
  const editor = path.resolve(userCwd(), file);
  if (!fs.existsSync(editor)) { console.error(`editor file not found: ${editor}
usage: node engine/serve.mjs <editor.html> [--port 4317] [--out <exports folder>]`); process.exit(2); }
  registerServer(); // this state folder owns this process: `close` stops it, a server of another state folder is left alone
  process.on('exit', () => unregisterServer());
  if (!process.env.BW_SERVE_CHILD) {
    // the supervisor: runs the server as a child and starts it again (on the new code) after an in-editor update
    // started in the background by engine/host.mjs (no console of its own): the server gets no window either. An inherited
    // stdio handle makes Windows give the child a console of its own (a visible window), so it pipes into this log instead.
    const hidden = !!process.env.BW_HOST_TOKEN;
    const start = () => {
      const c = fork(fileURLToPath(import.meta.url), args, { cwd: process.cwd(), env: { ...process.env, BW_SERVE_CHILD: '1' }, stdio: hidden ? ['ignore', 'pipe', 'pipe', 'ipc'] : 'inherit', windowsHide: true });
      if (hidden) { c.stdout.pipe(process.stdout); c.stderr.pipe(process.stderr); }
      c.on('exit', (code) => { if (code === RESTART_CODE) { console.log('Business-Wrap updated: restarting the server on the new version…'); start(); } else process.exitCode = code ?? 0; });
    };
    start();
  } else {
    try {
      const server = await serve(editor, Number.isFinite(port) ? port : 4317, {
        out: opt('out') && path.resolve(userCwd(), opt('out')),
        workspace: !opt('out'), // no --out: the chosen save folder, never beside the editor (A11)
        // the background host (engine/host.mjs): the last tab closed → every tab already flushed → exit 0, nothing left
        onIdle: process.env.BW_HOST_TOKEN ? () => { server.close(() => process.exit(0)); server.closeAllConnections?.(); setTimeout(() => process.exit(0), 1500).unref(); } : null,
        onUpdated: () => { server.close(() => process.exit(RESTART_CODE)); server.closeAllConnections?.(); setTimeout(() => process.exit(RESTART_CODE), 3000).unref(); },
      });
      console.log(`Business-Wrap editor on http://127.0.0.1:${server.address().port}/  (Ctrl+C to stop)`);
      console.log('Open that address in Chrome or Edge. Use the editor through this server, not by double-clicking the HTML file: export, print, the printers list and updates need it.');
    } catch (e) {
      console.error(`serve failed: ${e.message}`);
      process.exit(1);
    }
  }
} else if (process.argv[1] && /serve\.mjs$/.test(process.argv[1]) && !process.argv[1].includes('test')) {
  // started as a script but the paths did not match: say so instead of exiting silently
  console.error(`serve.mjs was started as ${process.argv[1]} but resolves to ${fileURLToPath(import.meta.url)}; run it by its real path.`);
  process.exitCode = 1;
}
