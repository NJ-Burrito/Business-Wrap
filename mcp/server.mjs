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
import { checkForUpdate, oneLiner, token, currentVersion } from '../update/check.mjs';
import { applyUpdate } from '../update/apply.mjs';
import { harvestModel, harvestCrawl, harvestMerge } from '../engine/harvest/cli.mjs';

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
// update_available rides once per session on the first tool result, so any MCP client's model sees it.
let decorate = (d) => d;
const guard = (fn) => async (args) => {
  try { return ok(decorate(await fn(args))); } catch (e) { return fail(String(e?.message || e)); }
};

const BASE_INSTRUCTIONS = 'Business-Wrap: bilingual (AR RTL / EN LTR) requirements documents. build_editor makes the HTML editor; '
  + 'apply_edits / validate_edits work on edits files (contract v1; a newer edits version is refused until Business-Wrap is updated); '
  + 'export_document prints PDF + DOCX. check_update reports a newer release; apply_update installs it only with confirm: true after the user agreed.';

/** The notice an agent shows its user: version, three highlights, the update command; migration notes for the agent itself. */
export function updateNotice(u) {
  if (!u || u.status !== 'available') return null;
  return { current: u.current, latest: u.latest, highlights: u.highlights || [], migration_notes: u.migration || [], command: 'npx business-wrap update --apply --yes', url: u.url, message_en: oneLiner(u, 'en'), message_ar: oneLiner(u, 'ar') };
}

export function createServer({ update = null } = {}) {
  const notice = updateNotice(update);
  const instructions = notice
    ? `${BASE_INSTRUCTIONS}
UPDATE AVAILABLE: Business-Wrap ${notice.latest} (installed ${notice.current}). Tell the user in one line with these highlights: ${notice.highlights.join(' | ')}. Offer: ${notice.command}. Never update without the user's consent.${notice.migration_notes.length ? ` Migration notes for you: ${notice.migration_notes.join(' | ')}` : ''}`
    : BASE_INSTRUCTIONS;
  let told = false;
  decorate = (d) => (notice && !told && d && typeof d === 'object' ? ((told = true), { ...d, update_available: notice }) : d);
  const server = new McpServer({ name: 'business-wrap', version: pkg.version }, { instructions });

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

  server.registerTool('harvest_model', {
    title: 'Harvest from a process model',
    description: 'Turn a BPMN 2.0 file (Flowable, Camunda, Activiti), a monitoring-graph JSON, a draw.io diagram or a YAML/JSON step list into the Arabic and English document JSON (actors, workflow figure of the steps people do, steps, rules, user stories, statuses) and build the editor for it.',
    inputSchema: {
      model: z.string().describe('Path of the .bpmn / .xml / .drawio / .yaml / .json file'),
      out_dir: z.string().describe('Folder for the documents and the editor'),
      name: z.string().optional().describe('Service name (wins over the name in the model)'),
      roles: z.string().optional().describe('Path of a roles mapping JSON: readable names (string or {ar, en}) for expression assignees and raw keys'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  }, guard(async ({ model, out_dir, name, roles }) => {
    const r = await harvestModel(path.resolve(model), { out: path.resolve(out_dir), name, roles: roles && path.resolve(roles) });
    return { documents: r.documents, editor: r.editor, actors: r.ir.actors.length, unresolved_roles: r.ir.actors.filter((a) => a.unresolved).map((a) => a.raw), steps: r.ir.steps.filter((s) => s.type === 'task').length };
  }));

  server.registerTool('harvest_merge', {
    title: 'Merge a crawl harvest with a process model',
    description: 'The union of a crawl harvest (what the applicant meets: card, inputs, attachments, validations) and a process model (actors, workflow, rules, tasks, statuses) into one Arabic and English document, each chapter and status row marked with its source; where the two disagree the crawl wording is kept and the other is listed as a conflict.',
    inputSchema: {
      crawl: z.string().describe('Path of the raw crawl harvest (harvest.json) or its folder'),
      model: z.string().describe('Path of process.json or a model file (BPMN, monitoring-graph JSON, draw.io, YAML)'),
      out_dir: z.string().describe('Folder for the documents and the editor'),
      name: z.string().optional().describe('Service name for both editions'),
      roles: z.string().optional().describe('Path of a roles mapping JSON'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  }, guard(async ({ crawl, model, out_dir, name, roles }) => {
    const r = await harvestMerge(path.resolve(crawl), path.resolve(model), { out: path.resolve(out_dir), name, roles: roles && path.resolve(roles) });
    return { documents: r.documents, editor: r.editor, conflicts: r.conflicts };
  }));

  server.registerTool('harvest_crawl', {
    title: 'Harvest by walking the live service',
    description: 'Walk an e-service in a real browser from a crawl config (start URL per language, optional login steps with $env: / $secret: values, OTP pause rule) and turn what it shows into the document JSON + the editor. Opens a visible Chrome unless the config says headed: false; an OTP or captcha pause waits for the human. It never files a request: it stops before Send / Submit / Pay (a dry run).',
    inputSchema: {
      config: z.string().describe('Path of the crawl config JSON (see bible/contracts/harvest.schema.json#/$defs/crawlConfig)'),
      out_dir: z.string().describe('Folder for the raw harvest, screenshots, documents and the editor'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  }, guard(async ({ config, out_dir }) => {
    // never files a request from an agent: a dry run that stops before Send / Submit / Pay
    const r = await harvestCrawl(path.resolve(config), { out: path.resolve(out_dir), log: () => {}, ask: async () => false });
    return { documents: r.documents, editor: r.editor, raw: path.join(r.rawDir, 'harvest.json'), languages: Object.keys(r.raw.languages), steps: Object.values(r.raw.languages)[0]?.steps.length ?? 0 };
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

  server.registerTool('check_update', {
    title: 'Check for a Business-Wrap update',
    description: 'Report whether a newer Business-Wrap release exists (cached; at most one request a day unless force). Returns status (available | current | unknown | off), the versions, three highlights, migration notes and a one-line message in English and Arabic to show the user.',
    inputSchema: { force: z.boolean().optional().describe('Ignore the one-day cache') },
    annotations: { readOnlyHint: true, openWorldHint: true },
  }, guard(async ({ force }) => {
    const u = await checkForUpdate({ force: !!force });
    return { ...u, message_en: oneLiner(u, 'en'), message_ar: oneLiner(u, 'ar') };
  }));

  server.registerTool('apply_update', {
    title: 'Install the Business-Wrap update',
    description: "Install the newer release into this Business-Wrap folder, keeping the user's settings, design packs, logos, fonts and drafts; one backup is kept and restored on failure. Ask the user first: without confirm: true it only describes what would happen.",
    inputSchema: { confirm: z.boolean().optional().describe('true only after the user agreed to update') },
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
  }, guard(async ({ confirm }) => {
    const u = await checkForUpdate({ force: true });
    if (u.status !== 'available') return { applied: false, status: u.status, current: u.current };
    if (confirm !== true) return { applied: false, needs_confirmation: true, would_update: { from: u.current, to: u.latest }, keeps: ['.local', 'design/custom', 'logos', 'fonts/custom', 'drafts', 'out'], ask_user: oneLiner(u, 'en') };
    const repo = JSON.parse(fs.readFileSync(path.join(REPO, 'update', 'source.json'), 'utf8')).repo;
    const r = await applyUpdate({ dir: REPO, release: { version: u.latest, zip: u.zip, zipApi: u.zipApi, sha256: u.sha256 }, repo, token: token(), current: currentVersion() });
    return { applied: !!r.ok, ...r, migration_notes: u.migration || [], restart: 'restart the MCP server to load the new version' };
  }));

  return server;
}
