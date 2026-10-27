// Local server for one-click PDF + DOCX export from the editor.
//
//   node engine/serve.mjs <editor.html> [--port 4317]
//
// Binds 127.0.0.1 only. Serves the editor at /, exports at POST /api/export,
// and the exported files under /files/. Stdlib only.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fileURLToPath as toPath } from 'node:url';
import { exportPdf, exportDocx, loadTheme, fontsFor, REPO } from './export.mjs';

const MAX_BODY = 60 * 1024 * 1024;
const OUT = path.join(REPO, 'out', 'exports');
const slug = (s) => String(s || 'document').replace(/[^\w.-]+/g, '-').slice(0, 80);

export function serve(editorFile, port = 4317) {
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
        const html = fs.readFileSync(editorFile, 'utf8').replace(/file:\/\/\/[^)"'\s]+\.(ttf|woff2)/g, (m) => `/font/${encodeURIComponent(m)}`);
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
        try { docx = exportDocx(body.doc, { locale, theme, docxPath: path.join(dir, `${stem}.docx`) }).docx; } catch (e) { docxError = String(e.message).slice(0, 400); }
        const rel = (f) => `/files/${path.relative(OUT, f).split(path.sep).map(encodeURIComponent).join('/')}`;
        return send(200, { pdf: pdf.pdf, docx, docxError, pdfUrl: rel(pdf.pdf), docxUrl: docx && rel(docx) });
      }
      send(404, { error: 'not found' });
    } catch (e) {
      send(500, { error: String(e.message || e).slice(0, 400) });
    }
  });
  return new Promise((ok) => server.listen(port, '127.0.0.1', () => ok(server)));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const file = process.argv[2];
  const port = Number(process.argv[process.argv.indexOf('--port') + 1]) || 4317;
  if (!file || !fs.existsSync(file)) { console.error('usage: node engine/serve.mjs <editor.html> [--port 4317]'); process.exit(2); }
  await serve(path.resolve(file), port);
  console.log(`Business-Wrap editor on http://127.0.0.1:${port}/  (Ctrl+C to stop)`);
}
