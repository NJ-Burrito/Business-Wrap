// MCP server check: start `mcp/cli.mjs` over stdio with the official client, list the
// tools, and call each one on the anonymised sample.
//
//   node mcp/test/server.test.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.join(REPO, 'out', 'mcp-test');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const SAMPLE = path.join(REPO, 'samples', 'event-permit');
const AR = path.join(SAMPLE, 'document.ar.json');

const results = [];
let failed = 0;
const check = (name, ok, detail = '') => {
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
  if (!ok) failed += 1;
};

// an edits file made here, on the exact base bytes (the build normalises line endings the same way)
const crypto = await import('node:crypto');
const raw = fs.readFileSync(AR, 'utf8').replace(/\r\n/g, '\n');
const edits = {
  version: 1,
  document: 'BW-SRS-SAMPLE-001',
  baseHash: `sha256:${crypto.createHash('sha256').update(raw).digest('hex')}`,
  locale: 'ar',
  ops: [
    { op: 'setText', path: '/chapters/0/sections/0/blocks/0/paragraphs/0', value: 'نص عبر خادم MCP' },
    { op: 'delete', path: '/chapters/1/sections/2/blocks/0/rows/1' },
  ],
};
const editsFile = path.join(OUT, 'edits.json');
fs.writeFileSync(editsFile, JSON.stringify(edits));
fs.writeFileSync(path.join(OUT, 'bad-edits.json'), JSON.stringify({ version: 1, ops: [{ op: 'explode', path: 'x' }] }));

const transport = new StdioClientTransport({ command: process.execPath, args: [path.join(REPO, 'mcp', 'cli.mjs')], cwd: REPO, env: { ...process.env, BW_LEARNING_DIR: path.join(OUT, 'learning') }, stderr: 'pipe' });
const client = new Client({ name: 'business-wrap-test', version: '1.0.0' });
const text = (r) => r.content?.[0]?.text || '';
const data = (r) => r.structuredContent ?? JSON.parse(text(r) || 'null');
try {
  await client.connect(transport);
  const { tools } = await client.listTools();
  const names = tools.map((t) => t.name).sort();
  check('tools/list', JSON.stringify(names) === JSON.stringify(['apply_edits', 'apply_update', 'build_editor', 'check_fonts', 'check_update', 'diagram_mermaid', 'export_design_pack', 'export_document', 'harvest_crawl', 'harvest_merge', 'harvest_model', 'learning_conflicts', 'learning_distill', 'learning_export', 'learning_forget', 'learning_import', 'learning_promote', 'learning_retire', 'learning_rules', 'validate_edits']), names.join(','));
  check('every tool has a description and an input schema', tools.every((t) => t.description && t.inputSchema?.type === 'object'));

  let r = await client.callTool({ name: 'validate_edits', arguments: { edits: editsFile } });
  {
    const dm = await client.callTool({ name: 'diagram_mermaid', arguments: { mermaid: ['flowchart LR', 'A([Start]) --> B[Review]', 'B --> C{Decide}', 'C -->|No| D([Refused])'].join('\n') } });
    const back = await client.callTool({ name: 'diagram_mermaid', arguments: { model_file: AR } });
    check('diagram_mermaid: Mermaid → model, and a document diagram → Mermaid', dm.structuredContent?.nodes >= 4 && /flowchart LR/.test(back.structuredContent?.mermaid || ''), JSON.stringify(dm.structuredContent?.nodes));
  }
  check('validate_edits: valid file', data(r)?.valid === true, text(r).slice(0, 120));
  r = await client.callTool({ name: 'validate_edits', arguments: { edits: path.join(OUT, 'bad-edits.json') } });
  check('validate_edits: invalid file reported', data(r)?.valid === false && data(r).errors.length > 0, JSON.stringify(data(r)?.errors).slice(0, 160));

  r = await client.callTool({ name: 'apply_edits', arguments: { document: AR, edits: editsFile, out: path.join(OUT, 'edited.ar.json') } });
  const edited = JSON.parse(fs.readFileSync(path.join(OUT, 'edited.ar.json'), 'utf8'));
  check('apply_edits: writes the edited document', !r.isError && edited.chapters[0].sections[0].blocks[0].paragraphs[0] === 'نص عبر خادم MCP' && edited.chapters[1].sections[2].blocks[0].rows.length === 2, text(r).slice(0, 120));

  r = await client.callTool({ name: 'apply_edits', arguments: { document: AR, edits: editsFile, out: path.join(OUT, 'edited.exe') } });
  check('apply_edits: refuses a non-.json output', r.isError === true, text(r).slice(0, 120));

  r = await client.callTool({ name: 'build_editor', arguments: { documents: [SAMPLE], out: path.join(OUT, 'editor.html'), ui: 'en' } });
  const html = fs.existsSync(path.join(OUT, 'editor.html')) ? fs.readFileSync(path.join(OUT, 'editor.html'), 'utf8') : '';
  check('build_editor: editor HTML with both editions', !r.isError && html.includes('id="bw-data"') && data(r)?.services?.[0] === 'event-permit', text(r).slice(0, 160));

  r = await client.callTool({ name: 'export_design_pack', arguments: { out: path.join(OUT, 'pack.json') } });
  const pack = JSON.parse(fs.readFileSync(path.join(OUT, 'pack.json'), 'utf8'));
  check('export_design_pack: bw-design-pack written', !r.isError && pack.kind === 'bw-design-pack' && pack.vars.primary, text(r).slice(0, 120));

  r = await client.callTool({ name: 'check_fonts', arguments: {} });
  check('check_fonts: answers', !r.isError && Array.isArray(data(r)?.found), `found=${data(r)?.found?.length} missing=${data(r)?.missing?.length} type3_risk=${data(r)?.type3_risk}`);

  r = await client.callTool({ name: 'harvest_model', arguments: { model: path.join(REPO, 'tests', 'fixtures', 'harvest', 'steps.yaml'), out_dir: path.join(OUT, 'harvest') } });
  check('harvest_model: a step list becomes both editions + an editor', !r.isError && data(r)?.documents?.length === 2 && fs.existsSync(data(r).editor || '') && data(r).steps === 1, text(r).slice(0, 160));

  r = await client.callTool({ name: 'export_document', arguments: { document: AR, edits: editsFile, out_dir: path.join(OUT, 'export') } });
  const ex = data(r) || {};
  check('export_document: PDF + DOCX from the edited state', !r.isError && fs.existsSync(ex.pdf || '') && fs.existsSync(ex.docx || '') && ex.ops_applied === 2 && ex.locale === 'ar', text(r).slice(0, 200));
} catch (e) {
  check('mcp run', false, e.stack?.split('\n').slice(0, 3).join(' / '));
} finally {
  await client.close().catch(() => {});
}
console.log(results.join('\n'));
console.log(`\n${failed ? 'FAILED' : 'ALL PASS'}: ${results.length - failed}/${results.length}`);
process.exit(failed ? 1 : 0);
