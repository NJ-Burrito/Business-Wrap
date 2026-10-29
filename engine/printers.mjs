// The Export & Print centre's server side (0.11.0): the machine's printers, silent printing of the engine's PDF,
// and one-format exports. Mounted by engine/serve.mjs under /api/print/* and /api/export/* (localhost only).
//
// Printers
//   Windows  WMI (Win32_Printer: name, default, status) + .NET PrinterSettings (paper sizes, duplex, colour),
//            one constant PowerShell script.
//   macOS / Linux  `lpstat -p -d` (+ `lpoptions -p <name> -l` for the paper sizes).
// Printing (the PDF the engine printed, never the browser's copy)
//   Windows  1. SumatraPDF when it is on this machine (vector, silent): -print-to <name> -print-settings ... -silent
//            2. otherwise the built-in path: the pages are rasterised at 300 dpi (PyMuPDF, already an engine
//               dependency) and sent by .NET PrintDocument (System.Drawing.Printing), which takes every option
//               natively (copies, duplex, colour, paper, per-page orientation) and can print to a file
//               (virtual printers such as «Microsoft Print to PDF»). No third-party binary is needed.
//            (Start-Process -Verb PrintTo is not used: it depends on the PDF handler and is not silent.)
//   macOS / Linux  `lp -d <name> -n <copies> -P <range> -o sides=... -o media=... -o print-color-mode=...`
// Security: every command is spawned with an argument array (no shell); the printer name must be one of the
// names the OS listed; range, copies, paper and the enums are validated; job values reach PowerShell only as
// JSON in an environment variable, read by a constant script.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { exportPdf, exportDocx, printHtml, loadTheme, fileStem } from './export.mjs';
import { config } from './config.mjs';
import { py } from './py.mjs';
import { ensure as ensureWorkspace, outName, uniquePath, docTitle, inHistory } from './workspace.mjs';

/** The command runner: (cmd, args, {env, input, timeout}) → Promise<{status, stdout, stderr}>. Tests swap it. */
const defaultRun = (cmd, args, { env, timeout = 120000 } = {}) => new Promise((ok) => {
  let stdout = '';
  let stderr = '';
  let p;
  try { p = spawn(cmd, args, { env: { ...process.env, ...(env || {}) }, windowsHide: true, shell: false }); } catch (e) { ok({ status: -1, stdout: '', stderr: String(e.message) }); return; }
  const t = setTimeout(() => p.kill(), timeout);
  p.stdout.on('data', (d) => { stdout += d; });
  p.stderr.on('data', (d) => { stderr += d; });
  p.on('error', (e) => { clearTimeout(t); ok({ status: -1, stdout, stderr: stderr + String(e.message) }); });
  p.on('close', (status) => { clearTimeout(t); ok({ status, stdout, stderr }); });
});
let RUN = defaultRun;
let PLATFORM = process.platform;
/** Tests: a mock runner and platform; no argument puts the real ones back. */
export function setRunner(run, platform) { RUN = run || defaultRun; PLATFORM = platform || process.platform; CACHE = null; }

const PS = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command'];
const LIST_PS = `$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
$o = foreach ($p in Get-CimInstance Win32_Printer) {
  $s = New-Object System.Drawing.Printing.PrinterSettings; $s.PrinterName = $p.Name
  $paper = @(); try { $paper = @($s.PaperSizes | ForEach-Object { $_.PaperName }) } catch {}
  [pscustomobject]@{ name=$p.Name; default=[bool]$p.Default; printerStatus=[int]$p.PrinterStatus; workOffline=[bool]$p.WorkOffline; errorState=[int]$p.DetectedErrorState; paper=$paper; duplex=[bool]$s.CanDuplex; color=[bool]$s.SupportsColor; port=[string]$p.PortName }
}
ConvertTo-Json -InputObject @($o) -Depth 3 -Compress`;

/** Win32_Printer → online / offline / error (PrinterStatus 7 = offline, 6 = stopped; DetectedErrorState 9 = offline, 4/6/7/8/10/11 = a fault). */
export function parseWindows(json) {
  let rows = JSON.parse(String(json || '[]').trim() || '[]');
  if (!Array.isArray(rows)) rows = [rows];
  return rows.filter((r) => r && r.name).map((r) => {
    const status = r.workOffline || r.printerStatus === 7 || r.errorState === 9 ? 'offline' : r.printerStatus === 6 || [4, 6, 7, 8, 10, 11].includes(r.errorState) ? 'error' : 'online';
    return { name: String(r.name), default: !!r.default, status, paper: (r.paper || []).map(String), duplex: !!r.duplex, color: r.color !== false, virtual: isVirtual(r.name, r.port) };
  });
}
/** `lpstat -p -d` → printers (+ paper sizes from `lpoptions -l`, keyed by name). */
export function parseLpstat(text, paperByName = {}) {
  const lines = String(text || '').split(/\r?\n/);
  const def = lines.map((l) => /^system default destination:\s*(\S+)/.exec(l)?.[1]).find(Boolean) || '';
  return lines.map((l) => /^printer\s+(\S+)\s+(.*)$/.exec(l)).filter(Boolean).map(([, name, rest]) => ({
    name,
    default: name === def,
    status: /disabled|not accepting/i.test(rest) ? 'offline' : /error|fault|stopped/i.test(rest) ? 'error' : 'online',
    paper: paperByName[name] || [],
    duplex: true,
    color: true,
    virtual: isVirtual(name),
  }));
}
/** `lpoptions -p X -l` → the PageSize choices (the * marks the current one). */
export const parseLpoptions = (text) => (/^(?:PageSize|media)[^:]*:\s*(.+)$/m.exec(String(text || ''))?.[1] || '').split(/\s+/).filter(Boolean).map((s) => s.replace(/^\*/, ''));
const isVirtual = (name, port = '') => /print to pdf|xps|onenote|pdf|fax/i.test(name) || /^(PORTPROMPT:|nul:|FILE:)/i.test(port);

let CACHE = null;
/** The OS printers: {printers, at, platform, method}. refresh → asked again; otherwise the last answer. */
export async function listPrinters({ refresh = false } = {}) {
  if (CACHE && !refresh) return CACHE;
  let printers = [];
  let error = '';
  if (PLATFORM === 'win32') {
    const r = await RUN('powershell.exe', [...PS, LIST_PS], { timeout: 60000 });
    if (r.status === 0) printers = parseWindows(r.stdout); else error = (r.stderr || 'printer listing failed').slice(0, 300);
  } else {
    const r = await RUN('lpstat', ['-p', '-d']);
    if (r.status === 0 || r.stdout) {
      const names = parseLpstat(r.stdout).map((p) => p.name);
      const paper = {};
      for (const n of names) { const o = await RUN('lpoptions', ['-p', n, '-l']); if (o.status === 0) paper[n] = parseLpoptions(o.stdout); }
      printers = parseLpstat(r.stdout, paper);
    } else error = (r.stderr || 'lpstat failed').slice(0, 300);
  }
  CACHE = { printers, at: new Date().toISOString(), platform: PLATFORM, method: printMethod(), ...(error ? { error } : {}) };
  return CACHE;
}

/** SumatraPDF on this machine (config, the usual install folders), or ''. */
export function sumatraPath() {
  if (PLATFORM !== 'win32') return '';
  const c = [config().sumatra, process.env.BW_SUMATRA, path.join(process.env.LOCALAPPDATA || '', 'SumatraPDF', 'SumatraPDF.exe'), 'C:/Program Files/SumatraPDF/SumatraPDF.exe', 'C:/Program Files (x86)/SumatraPDF/SumatraPDF.exe'];
  return c.find((p) => p && fs.existsSync(p)) || '';
}
export const printMethod = () => (PLATFORM === 'win32' ? (sumatraPath() ? 'sumatra' : 'dotnet') : 'lp');

const RANGE = /^\d{1,4}(-\d{1,4})?(,\d{1,4}(-\d{1,4})?)*$/;
/** A print/export request's options, validated. Throws on anything outside the allowed values. */
export function checkOptions(o, printers) {
  const bad = (m) => { const e = new Error(m); e.code = 400; throw e; };
  const out = {
    copies: o.copies === undefined ? 1 : Number(o.copies),
    range: String(o.range || '').replace(/\s+/g, ''),
    color: o.color === 'mono' ? 'mono' : 'color',
    duplex: o.duplex || 'one',
    paper: String(o.paper || ''),
    orientation: o.orientation || 'auto',
  };
  if (!Number.isInteger(out.copies) || out.copies < 1 || out.copies > 99) bad('copies: 1 to 99');
  if (out.range && !RANGE.test(out.range)) bad('page range: like 1-3,5');
  if (!['one', 'long', 'short'].includes(out.duplex)) bad('duplex: one, long or short');
  if (!['auto', 'portrait', 'landscape'].includes(out.orientation)) bad('orientation: auto, portrait or landscape');
  if (printers) {
    const p = printers.find((x) => x.name === o.printer);
    if (!p) bad('unknown printer: choose one from the list');
    out.printer = p.name;
    if (out.paper && p.paper.length && !p.paper.includes(out.paper)) bad('paper size: not offered by this printer');
  }
  if (out.paper && !/^[\p{L}\p{N} ._()x×/-]{1,64}$/u.test(out.paper)) bad('paper size: bad name');
  return out;
}

const pagesOf = (range) => range.split(',').flatMap((r) => { const [a, b = a] = r.split('-').map(Number); return Array.from({ length: Math.max(0, b - a + 1) }, (_, i) => a + i); });

/** The command for one job: {cmd, args, env}. file = the PDF; images = rasterised pages (dotnet path). */
export function printCommand(method, job, { file, images = [], output = '', docName = 'Business-Wrap' } = {}) {
  if (method === 'lp') {
    return { cmd: 'lp', args: ['-d', job.printer, '-n', String(job.copies), ...(job.range ? ['-P', job.range] : []),
      '-o', `sides=${{ one: 'one-sided', long: 'two-sided-long-edge', short: 'two-sided-short-edge' }[job.duplex]}`,
      '-o', `print-color-mode=${job.color === 'mono' ? 'monochrome' : 'color'}`,
      ...(job.paper ? ['-o', `media=${job.paper}`] : []),
      ...(job.orientation !== 'auto' ? ['-o', `orientation-requested=${job.orientation === 'landscape' ? 4 : 3}`] : []),
      '-t', docName, '--', file] };
  }
  if (method === 'sumatra') {
    const s = [job.range, `${job.copies}x`, job.color === 'mono' ? 'monochrome' : 'color', { one: 'simplex', long: 'duplexlong', short: 'duplexshort' }[job.duplex], job.paper && `paper=${job.paper}`, job.orientation !== 'auto' && job.orientation, 'fit'].filter(Boolean);
    return { cmd: sumatraPath() || 'SumatraPDF.exe', args: ['-print-to', job.printer, '-print-settings', s.join(','), '-silent', file] };
  }
  return { cmd: 'powershell.exe', args: [...PS, PRINT_PS], env: { BW_JOB: JSON.stringify({ printer: job.printer, copies: job.copies, duplex: job.duplex, color: job.color !== 'mono', paper: job.paper, orientation: job.orientation, images, output, docName }) } };
}

// .NET PrintDocument: one image per sheet, fitted to the paper; auto orientation follows each page (landscape figure pages stay landscape)
const PRINT_PS = `$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
$j = $env:BW_JOB | ConvertFrom-Json
$pd = New-Object System.Drawing.Printing.PrintDocument
$pd.DocumentName = $j.docName
$ps = $pd.PrinterSettings
$ps.PrinterName = $j.printer
if (-not $ps.IsValid) { throw 'printer not found' }
$ps.Copies = [int16]$j.copies; $ps.Collate = $true
$ps.Duplex = @{ one = 'Simplex'; long = 'Vertical'; short = 'Horizontal' }[$j.duplex]
if ($j.output) { $ps.PrintToFile = $true; $ps.PrintFileName = $j.output }
$pd.DefaultPageSettings.Color = [bool]$j.color
if ($j.paper) { $p = $ps.PaperSizes | Where-Object { $_.PaperName -eq $j.paper } | Select-Object -First 1; if ($p) { $pd.DefaultPageSettings.PaperSize = $p } }
$st = @{ i = 0; imgs = @($j.images); o = $j.orientation }
$pd.add_QueryPageSettings({ param($s, $e)
  $img = [System.Drawing.Image]::FromFile($st.imgs[$st.i])
  $e.PageSettings.Landscape = if ($st.o -eq 'auto') { $img.Width -gt $img.Height } else { $st.o -eq 'landscape' }
  $img.Dispose() })
$pd.add_PrintPage({ param($s, $e)
  $img = [System.Drawing.Image]::FromFile($st.imgs[$st.i])
  $b = $e.PageBounds; $hx = $e.PageSettings.HardMarginX; $hy = $e.PageSettings.HardMarginY
  $k = [Math]::Min($b.Width / $img.Width, $b.Height / $img.Height)
  $w = $img.Width * $k; $h = $img.Height * $k
  $e.Graphics.DrawImage($img, [single](($b.Width - $w) / 2 - $hx), [single](($b.Height - $h) / 2 - $hy), [single]$w, [single]$h)
  $img.Dispose(); $st.i++; $e.HasMorePages = $st.i -lt $st.imgs.Count })
$def = $null; try { $def = (Get-CimInstance Win32_Printer -Filter 'Default=TRUE').Name } catch {}
$pd.Print()
# Windows may make the printer just used the default ("let Windows manage my default printer"): put the user's back
if ($def) { try { Start-Sleep -Milliseconds 800; $now = (Get-CimInstance Win32_Printer -Filter 'Default=TRUE').Name; if ($now -ne $def) { Get-CimInstance Win32_Printer | Where-Object { $_.Name -eq $def } | Invoke-CimMethod -MethodName SetDefaultPrinter | Out-Null } } catch {} }
$id = $null; try { $id = (Get-PrintJob -PrinterName $j.printer | Where-Object { $_.DocumentName -eq $j.docName } | Select-Object -Last 1).Id } catch {}
ConvertTo-Json -Compress @{ ok = $true; jobId = $id }`;

/** PDF pages → PNG files (300 dpi, the selected range only). */
async function rasterise(pdf, range, dir) {
  const code = 'import pymupdf,sys,json\nd=pymupdf.open(sys.argv[1]);sel=json.loads(sys.argv[3]) or list(range(1,len(d)+1));out=[]\nfor n in sel:\n    if 1<=n<=len(d):\n        f=sys.argv[2]+"/p%04d.png"%n;d[n-1].get_pixmap(dpi=300).save(f);out.append(f)\nprint(json.dumps(out))';
  const r = await RUN(...py(['-c', code, pdf, dir, JSON.stringify(range ? pagesOf(range) : [])]), { env: { PYTHONUTF8: '1' } });
  if (r.status !== 0) throw new Error(`rasterise failed: ${r.stderr.slice(-300)}`);
  return JSON.parse(r.stdout.trim());
}

/** Sends a PDF to a listed printer. output: print to this file instead (virtual printers, the local proof). */
export async function printPdf(file, opts, { output = '', docName } = {}) {
  const { printers } = await listPrinters();
  const job = checkOptions(opts, printers);
  const method = output ? (PLATFORM === 'win32' ? 'dotnet' : 'lp') : printMethod();
  docName = docName || path.basename(file);
  let tmp = '';
  try {
    let images = [];
    if (method === 'dotnet') { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-print-')); images = await rasterise(file, job.range, tmp); if (!images.length) throw Object.assign(new Error('page range: no such pages'), { code: 400 }); }
    const c = printCommand(method, job, { file, images, output, docName });
    const r = await RUN(c.cmd, c.args, { env: c.env, timeout: 300000 });
    if (r.status !== 0) throw new Error(`print failed (${method}): ${(r.stderr || r.stdout).slice(-400)}`);
    const jobId = method === 'lp' ? /request id is (\S+)/.exec(r.stdout)?.[1] || null : method === 'dotnet' ? (() => { try { return JSON.parse(r.stdout.trim()).jobId ?? null; } catch { return null; } })() : null;
    return { ok: true, queued: true, printer: job.printer, jobId, method, pages: images.length || null, ...(output ? { output } : {}) };
  } finally {
    if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
  }
}

/** Cuts a PDF to a page range in place (PyMuPDF select). */
async function cutPdf(pdf, range) {
  const code = 'import pymupdf,sys,json\nd=pymupdf.open(sys.argv[1]);sel=[n-1 for n in json.loads(sys.argv[2]) if 1<=n<=len(d)]\nif not sel: sys.exit("no such pages")\nd.select(sel);d.save(sys.argv[1]+".cut");d.close()';
  const r = await defaultRun(...py(['-c', code, pdf, JSON.stringify(pagesOf(range))]), { env: { PYTHONUTF8: '1' } });
  if (r.status !== 0) throw Object.assign(new Error(`page range: ${r.stderr.trim().slice(-200)}`), { code: 400 });
  fs.renameSync(pdf + '.cut', pdf);
}

/** The document as the request asks: the cover left out by the layout's own «hide» list. */
function docFor(body) {
  const doc = JSON.parse(JSON.stringify(body.doc));
  if (body.cover === false) doc.layout = { ...(doc.layout || {}), hide: [...new Set([...(doc.layout?.hide || []), 'cover'])] };
  return doc;
}
const themeOf = (t) => { const base = loadTheme(); return { ...base, ...t, vars: { ...base.vars, ...(t?.vars || {}) } }; };

async function readJson(req, max) {
  const chunks = [];
  let size = 0;
  for await (const c of req) { size += c.length; if (size > max) throw Object.assign(new Error('too large'), { code: 413 }); chunks.push(c); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

/** /api/print/* and /api/export/*. Returns true when it answered. */
export async function printApi(req, res, url, { send, OUT, maxBody, ws = () => null, filesRoot = () => OUT }) {
  if (!/^\/api\/(print|export)\//.test(url.pathname)) return false;
  if (req.headers.origin && !/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(req.headers.origin)) { send(403, { error: 'origin' }); return true; }
  try {
    if (req.method === 'GET' && url.pathname === '/api/print/printers') { send(200, await listPrinters({ refresh: url.searchParams.get('refresh') === '1' })); return true; }
    if (req.method !== 'POST') { send(404, { error: 'not found' }); return true; }
    const body = await readJson(req, maxBody);
    if (url.pathname === '/api/print/check') { const { printers } = await listPrinters(); send(200, { ok: true, options: checkOptions(body, printers) }); return true; }
    if (!body.doc?.chapters || !body.doc?.control) { send(400, { error: 'no document' }); return true; }
    const locale = body.locale === 'en' ? 'en' : 'ar';
    const theme = themeOf(body.theme);
    const stem = `${fileStem(body.service)}.${locale}`;
    if (url.pathname === '/api/print/job') {
      const { printers } = await listPrinters();
      checkOptions(body, printers); // refuse before the PDF is printed
      const pdf = path.join(OUT, '.print', `${stem}-${Date.now()}.pdf`);
      try {
        await exportPdf(docFor(body), { locale, theme, pdfPath: pdf });
        send(200, await printPdf(pdf, body, { docName: `${stem}.pdf` }));
      } finally { fs.rmSync(pdf, { force: true }); }
      return true;
    }
    if (url.pathname === '/api/export/file') {
      const format = body.format;
      if (!['pdf', 'docx', 'printHtml'].includes(format)) { send(400, { error: 'format: pdf, docx or printHtml' }); return true; }
      const range = String(body.range || '').replace(/\s+/g, '');
      if (range && !RANGE.test(range)) { send(400, { error: 'page range: like 1-3,5' }); return true; }
      // a chosen folder (absolute, on this machine); else the save folder (A11: PDF\ DOCX\ HTML\, "<title>-<date>-<AR|ENG>",
      // a clash gets -2, -3, never an overwrite); else, with --out, the exports folder as before
      const ext = { pdf: 'pdf', docx: 'docx', printHtml: 'print.html' }[format];
      const w = !body.folder && ws();
      let dir = path.join(OUT, fileStem(body.service), locale);
      if (body.folder) {
        if (typeof body.folder !== 'string' || !path.isAbsolute(body.folder) || /[\u0000-\u001f]/.test(body.folder)) { send(400, { error: 'folder: an absolute path' }); return true; }
        dir = path.resolve(body.folder);
      } else if (w) { ensureWorkspace(w); dir = { pdf: w.dirs.pdf, docx: w.dirs.docx, printHtml: w.dirs.html }[format]; }
      fs.mkdirSync(dir, { recursive: true });
      const doc = docFor(body);
      const file = w ? uniquePath(dir, outName(docTitle(doc, body.service), new Date(), locale, ext)) : path.join(dir, `${stem}.${ext}`);
      if (format === 'pdf') { await exportPdf(doc, { locale, theme, pdfPath: file }); if (range) await cutPdf(file, range); }
      else if (format === 'docx') exportDocx(doc, { locale, theme, docxPath: file, embedFonts: body.embedFonts !== false });
      else fs.writeFileSync(file, printHtml(doc, { locale, theme }).html, 'utf8');
      const base = filesRoot();
      const served = file.startsWith(base + path.sep) && !inHistory(base, file);
      send(200, { ok: true, file, bytes: fs.statSync(file).size, url: served ? `/files/${path.relative(base, file).split(path.sep).map(encodeURIComponent).join('/')}` : null });
      return true;
    }
    send(404, { error: 'not found' });
  } catch (e) {
    send(e.code === 400 || e.code === 413 ? e.code : 500, { error: String(e.message || e).slice(0, 400) });
  }
  return true;
}
