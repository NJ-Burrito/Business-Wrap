// Local server for one-click PDF + DOCX export from the editor.
//
//   node engine/serve.mjs <editor.html> [--port 4317] [--out <exports folder>]
//
// Exports go to --out, or to an «exports» folder beside the editor file: never into this repository.
//
// Binds 127.0.0.1 only. Serves the editor at /, exports at POST /api/export,
// and the exported files under /files/. Stdlib only.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fileURLToPath as toPath } from 'node:url';
import { exportPdf, exportDocx, pageThumbs, loadTheme, fontsFor, REPO, i18n, fileStem, userCwd } from './export.mjs';
import { checkForUpdate, token, settings as updateSettings } from '../update/check.mjs';
import { applyUpdate, STAGES } from '../update/apply.mjs';
import { rewrapEditorHtml, aboutInfo } from './build-editor.mjs';
import { fork } from 'node:child_process';
import { crawl, harvestToDocument } from './harvest/crawl.mjs';

const MAX_BODY = 60 * 1024 * 1024;
const slug = fileStem;

/** Exit code that asks the supervisor (the CLI below) to start the server again, on the new version. */
export const RESTART_CODE = 75;
const LOCAL_ORIGIN = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/;

/**
 * @param {string} editorFile
 * @param {number} port
 * @param {{out?: string, installDir?: string, onUpdated?: (r: object) => void}} o  `installDir`: the folder the
 *   updater replaces (default: this repository); `onUpdated`: called after a successful update (the CLI restarts).
 */
export function serve(editorFile, port = 4317, { out, installDir = REPO, onUpdated = () => {} } = {}) {
  const OUT = path.resolve(out || path.join(path.dirname(editorFile), 'exports'));
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
        const html = rewrapEditorHtml(fs.readFileSync(editorFile, 'utf8')).replace(/file:\/\/\/[^)"'\s]+\.(ttf|woff2)/g, (m) => `/font/${encodeURIComponent(m)}`);
        return send(200, html, 'text/html; charset=utf-8');
      }
      if (req.method === 'GET' && url.pathname.startsWith('/font/')) {
        const f = path.resolve(toPath(decodeURIComponent(url.pathname.slice(6))));
        if (!fontFiles.has(f)) return send(404, { error: 'not found' });
        return send(200, fs.readFileSync(f), f.endsWith('.ttf') ? 'font/ttf' : 'font/woff2');
      }
      if (req.method === 'GET' && url.pathname.startsWith('/files/')) {
        const f = path.resolve(OUT, '.' + decodeURIComponent(url.pathname.slice(6)));
        if (!f.startsWith(OUT + path.sep) || !fs.existsSync(f)) return send(404, { error: 'not found' });
        const type = f.endsWith('.pdf') ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        return send(200, fs.readFileSync(f), type);
      }
      if (url.pathname === '/api/version' || url.pathname.startsWith('/api/update')) {
        // the editor's Settings page and update popup (editor/update.js, editor/settings.js). The check runs here,
        // with the user's gh auth or token: the page never holds a token and never calls GitHub itself.
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
        const pdf = await exportPdf(body.doc, { locale, theme, pdfPath: path.join(dir, `${stem}.pdf`) });
        let docx = null;
        let docxError = null;
        let fontNotes = [];
        try { ({ docx, fontNotes } = exportDocx(body.doc, { locale, theme, docxPath: path.join(dir, `${stem}.docx`), embedFonts: body.embedFonts !== false })); } catch (e) { docxError = String(e.message).slice(0, 400); }
        const rel = (f) => `/files/${path.relative(OUT, f).split(path.sep).map(encodeURIComponent).join('/')}`;
        return send(200, { pdf: pdf.pdf, docx, docxError, fontNotes, pdfUrl: rel(pdf.pdf), docxUrl: docx && rel(docx) });
      }
      send(404, { error: 'not found' });
    } catch (e) {
      send(500, { error: String(e.message || e).slice(0, 400) });
    }
  });
  return new Promise((ok) => server.listen(port, '127.0.0.1', () => ok(server)));
}

// run as the entry point, also when started through a junction or a symlink (compare real paths)
const real = (f) => { try { return fs.realpathSync.native(path.resolve(f)); } catch { return path.resolve(f); } };
if (process.argv[1] && real(process.argv[1]) === real(fileURLToPath(import.meta.url))) {
  const args = process.argv.slice(2);
  const opt = (k) => { const i = args.indexOf(`--${k}`); return i < 0 ? undefined : args[i + 1]; };
  const file = args.find((a, i) => !a.startsWith('--') && !['--port', '--out'].includes(args[i - 1]));
  const port = opt('port') !== undefined ? Number(opt('port')) : 4317;
  if (!file) { console.error('usage: node engine/serve.mjs <editor.html> [--port 4317] [--out <exports folder>]'); process.exit(2); }
  const editor = path.resolve(userCwd(), file);
  if (!fs.existsSync(editor)) { console.error(`editor file not found: ${editor}
usage: node engine/serve.mjs <editor.html> [--port 4317] [--out <exports folder>]`); process.exit(2); }
  if (!process.env.BW_SERVE_CHILD) {
    // the supervisor: runs the server as a child and starts it again (on the new code) after an in-editor update
    const start = () => fork(fileURLToPath(import.meta.url), args, { cwd: process.cwd(), env: { ...process.env, BW_SERVE_CHILD: '1' }, stdio: 'inherit' })
      .on('exit', (code) => { if (code === RESTART_CODE) { console.log('Business-Wrap updated: restarting the server on the new version…'); start(); } else process.exitCode = code ?? 0; });
    start();
  } else {
    try {
      const server = await serve(editor, Number.isFinite(port) ? port : 4317, {
        out: opt('out') && path.resolve(userCwd(), opt('out')),
        onUpdated: () => { server.close(() => process.exit(RESTART_CODE)); server.closeAllConnections?.(); setTimeout(() => process.exit(RESTART_CODE), 3000).unref(); },
      });
      console.log(`Business-Wrap editor on http://127.0.0.1:${server.address().port}/  (Ctrl+C to stop)`);
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
