// Business-Wrap MCP server (stdio). Exposes the editor pipeline to a coding agent:
// build the interactive editor for document JSON files, validate and apply an
// edits file, export PDF + DOCX, export a design pack, and report the fonts.
// Local only: reads and writes the paths it is given, opens no network port.
import fs from 'node:fs';
import path from 'node:path';
import { McpServer, z } from './vendor/sdk.mjs';
import { buildEditor } from '../engine/build-editor.mjs';
import { exportPdf, exportDocx, loadTheme, fontsFor, REPO, renderDiagramPng, diagramWarnings } from '../engine/export.mjs';
import { workspace, ensure, uniquePath, outName, docTitle } from '../engine/workspace.mjs';
import { applyOps, migrate, validateEdits, normaliseNumbers } from '../engine/edits.mjs';
import { assertBase } from '../engine/edits-base.mjs';
import { checkForUpdate, oneLiner, token, currentVersion } from '../update/check.mjs';
import { applyUpdate, PLUGIN_UPDATE_HOW } from '../update/apply.mjs';
import { isPluginInstall } from '../engine/testguard.mjs';
import { BwError, registerEditorTools } from './editor-tools.mjs';
import { harvestModel, harvestCrawl, harvestMerge } from '../engine/harvest/cli.mjs';
import { DIAGRAM } from '../engine/diagram.mjs';
import { modelIn } from '../engine/diagram-cli.mjs';
import { registerLearningTools } from '../engine/learning/mcp-tools.mjs';
import { open as openEditor, close as closeEditors, library } from '../engine/cli.mjs';
import { harvestSources } from '../engine/harvest/sources.mjs';

const pkg = JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf8'));
const readJson = (p) => JSON.parse(fs.readFileSync(path.resolve(p), 'utf8'));
const ok = (data) => ({ content: [{ type: 'text', text: JSON.stringify(data, null, 1) }], structuredContent: data });
const fail = (msg) => ({ isError: true, content: [{ type: 'text', text: msg }] });
/** An error an agent can branch on: {ok:false, code, message, ...}. */
const failData = (data) => ({ isError: true, content: [{ type: 'text', text: JSON.stringify(data, null, 1) }], structuredContent: data });
const out = (p, ext) => {
  const f = path.resolve(p);
  if (!f.toLowerCase().endsWith(ext)) throw new Error(`output must end in ${ext}: ${p}`);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  return f;
};
const localeOf = (file, doc, given) => given || (/\.en\.json$/i.test(file) ? 'en' : /\.ar\.json$/i.test(file) ? 'ar' : /[؀-ۿ]/.test(doc.control?.title || '') ? 'ar' : 'en');
function loadDocument(file, editsFile, force = false) {
  const rawText = fs.readFileSync(path.resolve(file), 'utf8');
  const doc = JSON.parse(rawText);
  if (!doc.chapters || !doc.control) throw new Error(`not a document JSON (needs control + chapters): ${file}`);
  if (!editsFile) return { doc, ops: 0 };
  const rawEdits = readJson(editsFile);
  const edits = migrate(rawEdits);
  const errs = validateEdits(edits);
  if (errs.length) throw new Error(`edits file invalid: ${errs.join('; ')}`);
  assertBase({ file, rawText, doc, edits, bare: Array.isArray(rawEdits), force });
  return { doc: applyOps(doc, edits.ops), ops: edits.ops.length };
}
// update_available rides once per session on the first tool result, so any MCP client's model sees it.
let decorate = (d) => d;
const OPEN = z.boolean().optional().describe('Also open the result in the Business-Wrap editor (starts the local host, opens an Edge tab); default false');
/** open: true puts the documents into the editor through the host; the answer gains opened: {url, doc_id} */
const opened = async (r, open) => (open && r.documents?.length ? { ...r, opened: await openEditor({ inputs: r.documents }) } : r);
// Set by createServer: the startup work (state migration) every tool waits for, and the version the process LOADED.
let ready = Promise.resolve();
/** The version on disk now, null when the folder is gone (Claude Code removes an orphaned version folder after 14 days). */
const diskVersion = () => { try { return JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf8')).version; } catch { return null; } };
/** The process loaded one version's code; when the folder now holds another (an in-place update, a client that swapped the
 *  folder under a running server) the lazily imported modules would come from a mixed tree, so no tool runs: RESTART_REQUIRED. */
export const driftOf = (loaded = pkg.version, installed = diskVersion()) => (installed === loaded ? null
  : { ok: false, code: 'RESTART_REQUIRED', message: installed ? `Business-Wrap ${installed} is installed but this server loaded ${loaded}: reload it` : `the folder this server was started from is gone (it loaded ${loaded})`, loaded, installed, how: 'run /reload-plugins (Claude Code plugin) or restart your MCP client; a stale "not connected" can stay cached for 15 minutes' });
const guard = (fn) => async (args) => {
  try {
    const d = driftOf();
    if (d) return failData(d);
    await ready;
    return ok(decorate(await fn(args)));
  } catch (e) { return e?.bw ? failData({ ok: false, code: e.code, message: e.message, ...e.data }) : fail(String(e?.message || e)); }
};

const BASE_INSTRUCTIONS = 'Business-Wrap: bilingual (AR RTL / EN LTR) requirements documents. build_editor makes the HTML editor; '
  + 'apply_edits / validate_edits work on edits files (contract v1; a newer edits version is refused until Business-Wrap is updated); '
  + 'export_document prints PDF + DOCX. To edit the document the user has OPEN in the editor use editor_list_documents / editor_outline / editor_get / editor_ops (one undo step, signed as you), editor_action, not apply_edits. '
  + 'check_update reports a newer release; apply_update installs it only with confirm: true after the user agreed (a Claude Code plugin is updated by the client: /plugin update, then /reload-plugins). '
  + 'Errors from the editor tools carry a code: NO_HOST NO_DOC TAB_TIMEOUT CONFLICT BAD_OP UNKNOWN_ACTION NO_TAB REFUSED RESTART_REQUIRED. '
  + 'Local learning: call learning_rules before harvesting, authoring or generating and apply the rules; call learning_distill after the user edits or exports; tell the user in one line which learned rules were applied.';

/** The notice an agent shows its user: version, three highlights, the update command; migration notes for the agent itself. */
export function updateNotice(u) {
  if (!u || u.status !== 'available') return null;
  return { current: u.current, latest: u.latest, highlights: u.highlights || [], migration_notes: u.migration || [], command: 'npx business-wrap update --apply --yes', url: u.url, message_en: oneLiner(u, 'en'), message_ar: oneLiner(u, 'ar') };
}

export function createServer({ update = null, ready: startup = null } = {}) {
  ready = Promise.resolve(startup).catch(() => null);
  let notice = updateNotice(update);
  const instructions = notice
    ? `${BASE_INSTRUCTIONS}
UPDATE AVAILABLE: Business-Wrap ${notice.latest} (installed ${notice.current}). Tell the user in one line with these highlights: ${notice.highlights.join(' | ')}. Offer: ${notice.command}. Never update without the user's consent.${notice.migration_notes.length ? ` Migration notes for you: ${notice.migration_notes.join(' | ')}` : ''}`
    : BASE_INSTRUCTIONS;
  let told = false;
  decorate = (d) => (notice && !told && d && typeof d === 'object' ? ((told = true), { ...d, update_available: notice }) : d);
  const server = new McpServer({ name: 'business-wrap', version: pkg.version }, { instructions });
  /** A refresh that finished after the handshake: the notice rides on the next tool result (never on initialize). */
  server.bwSetUpdate = (u) => { const n = updateNotice(u); if (n && !notice) { notice = n; told = false; } };

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
      force: z.boolean().optional().describe('Apply even when the edits baseHash or edition does not match this document (default false: refused)'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  }, guard(({ document, edits, out: o, force }) => {
    const { doc, ops } = loadDocument(document, edits, !!force);
    normaliseNumbers(doc); // the JSON carries the numbers the PDF prints (a manual-numbering document is left as written)
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
      out_dir: z.string().optional().describe('Folder for the outputs (default: the save folder, Documents\\<title>\\)'),
      theme: z.string().optional().describe('Theme / design-pack JSON'),
      docx: z.boolean().optional().describe('Also build the DOCX (default true)'),
      force: z.boolean().optional().describe('Replay the edits even when their baseHash or edition does not match this document (default false: refused)'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  }, guard(async ({ document, edits, locale, out_dir, theme, docx, force }) => {
    const { doc, ops } = loadDocument(document, edits, !!force);
    const ed = localeOf(document, doc, locale);
    const th = loadTheme(theme && path.resolve(theme));
    const stem = `${doc.service || 'document'}.${ed}`;
    const dir = out_dir ? path.resolve(out_dir) : null; // no out_dir: the save folder, Documents\<title>\Exports\<date> <title> - <language>
    const target = (ext) => (dir ? path.join(dir, `${stem}.${ext}`) : uniquePath(ensure(workspace()).dirs.docs, outName(docTitle(doc, doc.service), new Date(), ed, ext)));
    const pdf = await exportPdf(doc, { locale: ed, theme: th, pdfPath: target('pdf') });
    const res = { locale: ed, ops_applied: ops, pdf: pdf.pdf, post: pdf.post };
    if (docx !== false) res.docx = exportDocx(doc, { locale: ed, theme: th, docxPath: target('docx') }).docx;
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

  server.registerTool('diagram_mermaid', {
    title: 'Diagram ⇄ Mermaid',
    description: 'Convert Mermaid flowchart code into a Business-Wrap diagram model (laid out in the house workflow style: stages, «إجراء» decisions, approval/refusal ends, solid/dashed/red arrows), or a diagram model (or the first diagram block of a document) into Mermaid code. To put a model into a document, use apply_edits with {op:"replace", path:"<diagram block>/model", value:<model>}.',
    inputSchema: {
      mermaid: z.string().optional().describe('Mermaid flowchart code to import (flowchart LR/RL/TD; [] stage, {} decision, ([ ]) start/end pill, -.-> return, --x refusal)'),
      model_file: z.string().optional().describe('Path of a diagram model JSON or a document JSON to export as Mermaid'),
      locale: z.enum(['ar', 'en']).optional().describe('Edition the words belong to (default ar)'),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, guard(async ({ mermaid, model_file, locale = 'ar' }) => {
    if (mermaid) { const model = DIAGRAM.fromMermaid(mermaid, { locale }); return { model, nodes: model.nodes.length, edges: model.edges.length }; }
    if (model_file) return { mermaid: DIAGRAM.toMermaid(modelIn(readJson(model_file))) };
    throw new Error('give mermaid (code to import) or model_file (to export)');
  }));

  server.registerTool('render_diagram', {
    title: 'Render a diagram to PNG',
    description: 'Render one diagram model (a document figure, a Mermaid import) to a PNG through the same engine and fonts as the PDF, and report whether it would print legibly (smallest printed size in points, overlaps). Warns, never blocks.',
    inputSchema: {
      model_file: z.string().optional().describe('Path of a diagram model JSON or a document JSON holding one diagram'),
      model: z.record(z.any()).optional().describe('The diagram model itself (instead of model_file)'),
      out: z.string().describe('Output .png path'),
      locale: z.enum(['ar', 'en']).optional().describe('Edition the words belong to (default ar)'),
      scale: z.number().min(1).max(4).optional().describe('Pixel ratio (default 2)'),
      theme: z.string().optional().describe('Theme / design-pack JSON'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  }, guard(async ({ model_file, model, out: o, locale = 'ar', scale = 2, theme }) => {
    if (!model_file && !model) throw new Error('give model_file or model');
    const r = await renderDiagramPng(modelIn(model || readJson(model_file)), { theme: loadTheme(theme && path.resolve(theme)), locale, scale, pngPath: out(o, '.png') });
    const L = r.legibility;
    return { png: r.png, width: r.width, height: r.height, legible: !!L.ok, min_pt: L.minPtPrinted, small: L.small?.length ?? 0, overlaps: L.overlaps?.length ?? 0 };
  }));

  server.registerTool('harvest_model', {
    title: 'Harvest from a process model',
    description: 'Turn a BPMN 2.0 file (Flowable, Camunda, Activiti), a monitoring-graph JSON, a draw.io diagram or a YAML/JSON step list into the Arabic and English document JSON (actors, workflow figure of the steps people do, steps, rules, user stories, statuses) and build the editor for it.',
    inputSchema: {
      model: z.string().describe('Path of the .bpmn / .xml / .drawio / .yaml / .json file'),
      out_dir: z.string().optional().describe('Folder for the documents and the editor (default: the save folder, Documents\\<title>\\)'),
      name: z.string().optional().describe('Service name (wins over the name in the model)'),
      roles: z.string().optional().describe('Path of a roles mapping JSON: readable names (string or {ar, en}) for expression assignees and raw keys'),
      open: OPEN,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  }, guard(async ({ model, out_dir, name, roles, open }) => {
    const r = await harvestModel(path.resolve(model), { out: out_dir ? path.resolve(out_dir) : undefined, name, roles: roles && path.resolve(roles) });
    return opened({ documents: r.documents, editor: r.editor, actors: r.ir.actors.length, unresolved_roles: r.ir.actors.filter((a) => a.unresolved).map((a) => a.raw), steps: r.ir.steps.filter((s) => s.type === 'task').length, learned_rules_applied: r.learned }, open);
  }));

  server.registerTool('harvest_merge', {
    title: 'Merge a crawl harvest with a process model',
    description: 'The union of a crawl harvest (what the applicant meets: card, inputs, attachments, validations) and a process model (actors, workflow, rules, tasks, statuses) into one Arabic and English document, each chapter and status row marked with its source; where the two disagree the crawl wording is kept and the other is listed as a conflict.',
    inputSchema: {
      crawl: z.string().describe('Path of the raw crawl harvest (harvest.json) or its folder'),
      model: z.string().describe('Path of process.json or a model file (BPMN, monitoring-graph JSON, draw.io, YAML)'),
      out_dir: z.string().optional().describe('Folder for the documents and the editor (default: the save folder, Documents\\<title>\\)'),
      name: z.string().optional().describe('Service name for both editions'),
      roles: z.string().optional().describe('Path of a roles mapping JSON'),
      open: OPEN,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  }, guard(async ({ crawl, model, out_dir, name, roles, open }) => {
    const r = await harvestMerge(path.resolve(crawl), path.resolve(model), { out: out_dir ? path.resolve(out_dir) : undefined, name, roles: roles && path.resolve(roles) });
    const diagram_warnings = r.documents.flatMap((f) => { try { const d = readJson(f); return diagramWarnings(d, { locale: localeOf(f, d) }).map((w) => `${path.basename(f)}: ${w}`); } catch { return []; } });
    return opened({ documents: r.documents, editor: r.editor, conflicts: r.conflicts, learned_rules_applied: r.learned, ...(diagram_warnings.length ? { diagram_warnings } : {}) }, open);
  }));

  server.registerTool('harvest_crawl', {
    title: 'Harvest by walking the live service',
    description: 'Walk an e-service in a real browser from a crawl config (start URL per language, optional login steps with $env: / $secret: values, OTP pause rule) and turn what it shows into the document JSON + the editor. Opens a visible Chrome unless the config says headed: false; an OTP or captcha pause waits for the human. It never files a request: it stops before Send / Submit / Pay (a dry run).',
    inputSchema: {
      config: z.string().describe('Path of the crawl config JSON (see bible/contracts/harvest.schema.json#/$defs/crawlConfig)'),
      out_dir: z.string().optional().describe('Folder for the raw harvest, screenshots, documents and the editor (default: the save folder, Documents\\<title>\\)'),
      open: OPEN,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  }, guard(async ({ config, out_dir, open }) => {
    // never files a request from an agent: a dry run that stops before Send / Submit / Pay
    const r = await harvestCrawl(path.resolve(config), { out: out_dir ? path.resolve(out_dir) : undefined, log: () => {}, ask: async () => false });
    return opened({ documents: r.documents, editor: r.editor, raw: path.join(r.rawDir, 'harvest.json'), languages: Object.keys(r.raw.languages), steps: Object.values(r.raw.languages)[0]?.steps.length ?? 0, learned_rules_applied: r.learned }, open);
  }));

  server.registerTool('harvest_sources', {
    title: 'Harvest from your own files',
    description: 'Turn files or folders the user provides into the Arabic and English document JSON + the editor: process models (BPMN, draw.io, YAML/JSON step lists, monitoring graph) through the model parser, and documents (PDF, DOCX, HTML, TXT, MD) whose numbered or bulleted lines become the steps. No model, no network. Files it cannot read are listed in skipped with the reason.',
    inputSchema: {
      sources: z.array(z.string()).min(1).describe('Files or folders'),
      out_dir: z.string().optional().describe('Folder for the documents and the editors (default: the save folder, Documents\\<title>\\)'),
      name: z.string().optional().describe('Service name for every document'),
      roles: z.string().optional().describe('Path of a roles mapping JSON'),
      open: OPEN,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  }, guard(async ({ sources, out_dir, name, roles, open }) => {
    const { results, skipped } = await harvestSources(sources, { out: out_dir ? path.resolve(out_dir) : undefined, name, roles: roles && path.resolve(roles) });
    return opened({ results, skipped, documents: results[0]?.documents || [] }, open);
  }));

  server.registerTool('open_in_editor', {
    title: 'Open in the Business-Wrap editor',
    description: 'Start the local host in the background (no console window) if it is not running, put the documents into the editor (library import when the host has one) and open an Edge tab on it. Give documents (JSON files or folders), or editor (a built .html), or doc_id (a document already in the library). Returns {url, doc_id}.',
    inputSchema: {
      documents: z.array(z.string()).optional().describe('Document JSON files or folders'),
      editor: z.string().optional().describe('A built editor .html'),
      doc_id: z.string().optional().describe('A document code already in the library'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  }, guard(async ({ documents, editor, doc_id }) => {
    if (documents?.length) return openEditor({ inputs: documents });
    if (editor) return openEditor({ inputs: [editor] });
    if (doc_id) {
      const hit = (await library()).documents.find((d) => d.name.includes(doc_id) || fs.readFileSync(d.file, 'utf8').includes(doc_id));
      if (!hit) throw new Error(`no document ${doc_id} in the library`);
      return { ...(await openEditor({ inputs: [hit.file] })), doc_id };
    }
    throw new Error('give documents, editor or doc_id');
  }));

  server.registerTool('close_editor', {
    title: 'Close the editor and its host',
    description: 'Turn Business-Wrap off (same as `business-wrap stop --all` and the editor power button): every open tab saves first, then every local host, server and Edge window this install started stops. Never the host of another install.',
    inputSchema: {},
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  }, guard(async () => closeEditors()));

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
    // a Claude Code plugin is the client's copy (cache/<marketplace>/<plugin>/<version>): never rewritten in place
    if (isPluginInstall(REPO)) return { applied: false, plugin: true, current: u.current, latest: u.latest, how: PLUGIN_UPDATE_HOW };
    if (confirm !== true) return { applied: false, needs_confirmation: true, would_update: { from: u.current, to: u.latest }, keeps: ['.local', 'design/custom', 'logos', 'fonts/custom', 'drafts', 'out'], ask_user: oneLiner(u, 'en') };
    const repo = JSON.parse(fs.readFileSync(path.join(REPO, 'update', 'source.json'), 'utf8')).repo;
    const r = await applyUpdate({ dir: REPO, release: { version: u.latest, zip: u.zip, zipApi: u.zipApi, sha256: u.sha256 }, repo, token: token(), current: currentVersion() });
    if (r.ok) server.sendToolListChanged().catch(() => {});
    return { applied: !!r.ok, ...r, migration_notes: u.migration || [], restart: 'restart the MCP server (or run /reload-plugins) to load the new version; until then every tool answers RESTART_REQUIRED' };
  }));

  registerEditorTools(server, z, guard);
  registerLearningTools(server, z, guard);
  return server;
}
