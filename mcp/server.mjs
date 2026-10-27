// Business-Wrap MCP server (stdio). Exposes the editor pipeline to a coding agent:
// build the interactive editor for document JSON files, validate and apply an
// edits file, export PDF + DOCX, export a design pack, and report the fonts.
// Local only: reads and writes the paths it is given, opens no network port.
import fs from 'node:fs';
import path from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { buildEditor } from '../engine/build-editor.mjs';
import { exportPdf, exportDocx, loadTheme, fontsFor, REPO } from '../engine/export.mjs';
import { applyOps, migrate, validateEdits } from '../engine/edits.mjs';

const pkg = JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf8'));
const readJson = (p) => JSON.parse(fs.readFileSync(path.resolve(p), 'utf8'));
const ok = (data) => ({ content: [{ type: 'text', text: JSON.stringify(data, null, 1) }], structuredContent: data });
const fail = (msg) => ({ isError: true, content: [{ type: 'text', text: msg }] });
const out = (p, ext) => {
  const f = path.resolve(p);
  if (!f.toLowerCase().endsWith(ext)) throw new Error(`output must end in ${ext}: ${p}`);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  return f;
};
const localeOf = (file, doc, given) => given || (/\.en\.json$/i.test(file) ? 'en' : /\.ar\.json$/i.test(file) ? 'ar' : /[؀-ۿ]/.test(doc.control?.title || '') ? 'ar' : 'en');
function loadDocument(file, editsFile) {
  const doc = readJson(file);
  if (!doc.chapters || !doc.control) throw new Error(`not a document JSON (needs control + chapters): ${file}`);
  if (!editsFile) return { doc, ops: 0 };
  const edits = migrate(readJson(editsFile));
  const errs = validateEdits(edits);
  if (errs.length) throw new Error(`edits file invalid: ${errs.join('; ')}`);
  return { doc: applyOps(doc, edits.ops), ops: edits.ops.length };
}
const guard = (fn) => async (args) => {
  try { return ok(await fn(args)); } catch (e) { return fail(String(e?.message || e)); }
};

export function createServer() {
  const server = new McpServer({ name: 'business-wrap', version: pkg.version });

  server.registerTool('build_editor', {
    title: 'Build the HTML editor',
    description: 'Build the single-file interactive editor (the print layout itself) for one or more document JSON files or folders; *.ar.json / *.en.json become the two editions of a service. Returns the editor path.',
    inputSchema: {
      documents: z.array(z.string()).min(1).describe('Document JSON files or folders holding them'),
      out: z.string().describe('Output .html path'),
      theme: z.string().optional().describe('Theme / design-pack JSON (default: the bundled neutral theme)'),
      embed_fonts: z.boolean().optional().describe('Embed the fonts as base64 (default false: local file links)'),
      ui: z.enum(['ar', 'en']).optional().describe('Editor UI language (default ar)'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  }, guard(({ documents, out: o, theme, embed_fonts, ui }) => {
    const r = buildEditor({ inputs: documents.map((d) => path.resolve(d)), out: out(o, '.html'), themeFile: theme && path.resolve(theme), embedFonts: !!embed_fonts, watermarkDir: null, ui });
    return { editor: r.out, services: r.services, fonts: r.fonts, kb: Math.round(r.bytes / 1024) };
  }));

  server.registerTool('validate_edits', {
    title: 'Validate an edits file',
    description: 'Check an edits file against the v1 contract (after migrating older versions). Returns the list of problems, empty when valid.',
    inputSchema: { edits: z.string().describe('Edits JSON path') },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, guard(({ edits }) => {
    const file = migrate(readJson(edits));
    const errors = validateEdits(file);
    return { valid: errors.length === 0, errors, ops: file.ops?.length ?? 0, locale: file.locale, document: file.document };
  }));

  server.registerTool('apply_edits', {
    title: 'Apply an edits file',
    description: 'Replay an edits file on its base document JSON and write the edited document JSON.',
    inputSchema: {
      document: z.string().describe('Base document JSON path'),
      edits: z.string().describe('Edits JSON path'),
      out: z.string().describe('Output .json path for the edited document'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  }, guard(({ document, edits, out: o }) => {
    const { doc, ops } = loadDocument(document, edits);
    const f = out(o, '.json');
    fs.writeFileSync(f, JSON.stringify(doc, null, 1) + '\n', 'utf8');
    return { document: f, ops_applied: ops };
  }));

  server.registerTool('export_document', {
    title: 'Export PDF and DOCX',
    description: 'Print the PDF (headless Chrome, the editor markup) and build the DOCX from a document JSON, optionally after replaying an edits file.',
    inputSchema: {
      document: z.string().describe('Document JSON path'),
      edits: z.string().optional().describe('Edits JSON to replay first'),
      locale: z.enum(['ar', 'en']).optional().describe('Edition (default: from the file name or the title script)'),
      out_dir: z.string().describe('Folder for the outputs'),
      theme: z.string().optional().describe('Theme / design-pack JSON'),
      docx: z.boolean().optional().describe('Also build the DOCX (default true)'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  }, guard(async ({ document, edits, locale, out_dir, theme, docx }) => {
    const { doc, ops } = loadDocument(document, edits);
    const ed = localeOf(document, doc, locale);
    const th = loadTheme(theme && path.resolve(theme));
    const stem = `${doc.service || 'document'}.${ed}`;
    const dir = path.resolve(out_dir);
    const pdf = await exportPdf(doc, { locale: ed, theme: th, pdfPath: path.join(dir, `${stem}.pdf`) });
    const res = { locale: ed, ops_applied: ops, pdf: pdf.pdf, post: pdf.post };
    if (docx !== false) res.docx = exportDocx(doc, { locale: ed, theme: th, docxPath: path.join(dir, `${stem}.docx`) }).docx;
    return res;
  }));

  server.registerTool('export_design_pack', {
    title: 'Export a design pack',
    description: 'Write the theme (fonts, sizes, colour variables, brand lines, logo slots) as a bw-design-pack JSON that the editor can import.',
    inputSchema: {
      out: z.string().describe('Output .json path'),
      theme: z.string().optional().describe('Theme JSON to start from (default: the bundled neutral theme)'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  }, guard(({ out: o, theme }) => {
    const th = loadTheme(theme && path.resolve(theme));
    const f = out(o, '.json');
    fs.writeFileSync(f, JSON.stringify({ kind: 'bw-design-pack', version: 1, ...th }, null, 1) + '\n', 'utf8');
    return { design_pack: f, fonts: th.fonts, vars: Object.keys(th.vars).length };
  }));

  server.registerTool('check_fonts', {
    title: 'Check the fonts',
    description: 'Report which faces of the theme resolve on this machine and in which format (TrueType prints as real fonts; CFF/woff2 would print as Type 3).',
    inputSchema: { theme: z.string().optional().describe('Theme JSON (default: the bundled neutral theme)') },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, guard(({ theme }) => {
    const th = loadTheme(theme && path.resolve(theme));
    const { used, missing } = fontsFor(th);
    return {
      text: th.fonts.text,
      display: th.fonts.display,
      found: used.map((c) => ({ family: c.family, weight: c.weight, format: c.format })),
      missing,
      type3_risk: used.some((c) => c.format !== 'truetype'),
    };
  }));

  return server;
}
