// MCP server check: start `mcp/cli.mjs` over stdio with the official client, list the
// tools, and call each one on the anonymised sample.
//
//   node mcp/test/server.test.mjs
import '../../tests/_isolate.mjs';
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

const transport = new StdioClientTransport({ command: process.execPath, args: [path.join(REPO, 'mcp', 'cli.mjs')], cwd: REPO, env: { ...process.env, BW_LEARNING_DIR: path.join(OUT, 'learning'), BW_STATE_DIR: path.join(OUT, 'state'), BW_NO_BROWSER: '1' }, stderr: 'pipe' });
const client = new Client({ name: 'business-wrap-test', version: '1.0.0' });
const text = (r) => r.content?.[0]?.text || '';
const data = (r) => r.structuredContent ?? JSON.parse(text(r) || 'null');
try {
  await client.connect(transport);
  const { tools } = await client.listTools();
  const names = tools.map((t) => t.name).sort();
  check('tools/list', JSON.stringify(names) === JSON.stringify(['apply_edits', 'apply_update', 'build_editor', 'check_fonts', 'check_update', 'close_editor', 'diagram_mermaid', 'export_design_pack', 'export_document', 'harvest_crawl', 'harvest_merge', 'harvest_model', 'harvest_sources', 'learning_conflicts', 'learning_distill', 'learning_export', 'learning_forget', 'learning_import', 'learning_promote', 'learning_retire', 'learning_rules', 'open_in_editor', 'validate_edits']), names.join(','));
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

  // 0.13.3 TSYS-03: the edits belong to one document and one edition
  {
    const EN = path.join(SAMPLE, 'document.en.json');
    const wrongOut = path.join(OUT, 'wrong.en.json');
    r = await client.callTool({ name: 'apply_edits', arguments: { document: EN, edits: editsFile, out: wrongOut } });
    check('apply_edits: AR edits on the EN document are refused (baseHash), nothing written', r.isError === true && /baseHash|edition/.test(text(r)) && !fs.existsSync(wrongOut), text(r).slice(0, 160));
    const badHash = path.join(OUT, 'edits-badhash.json');
    fs.writeFileSync(badHash, JSON.stringify({ ...edits, baseHash: `sha256:${'0'.repeat(64)}` }));
    r = await client.callTool({ name: 'apply_edits', arguments: { document: AR, edits: badHash, out: path.join(OUT, 'badhash.ar.json') } });
    check('apply_edits: a wrong baseHash is refused', r.isError === true && /baseHash/.test(text(r)), text(r).slice(0, 160));
    const enRaw = fs.readFileSync(EN, 'utf8').replace(/\r\n/g, '\n');
    const badEd = path.join(OUT, 'edits-badedition.json');
    fs.writeFileSync(badEd, JSON.stringify({ ...edits, baseHash: `sha256:${crypto.createHash('sha256').update(enRaw).digest('hex')}`, locale: 'ar' }));
    r = await client.callTool({ name: 'apply_edits', arguments: { document: EN, edits: badEd, out: path.join(OUT, 'badedition.en.json') } });
    check('apply_edits: an edition mismatch is refused even with the right hash', r.isError === true && /edition mismatch/.test(text(r)), text(r).slice(0, 160));
    r = await client.callTool({ name: 'apply_edits', arguments: { document: EN, edits: editsFile, out: path.join(OUT, 'forced.en.json'), force: true } });
    check('apply_edits: force: true overrides on purpose', !r.isError && data(r)?.ops_applied === 2, text(r).slice(0, 160));
    r = await client.callTool({ name: 'export_document', arguments: { document: EN, edits: editsFile, out_dir: path.join(OUT, 'refused-export'), docx: false } });
    check('export_document: refuses mismatched edits too', r.isError === true && /baseHash|edition/.test(text(r)), text(r).slice(0, 160));
  }

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

  // B2: harvest → editor. A BPMN model with open: true comes back with a URL whose page carries the new document
  // (the library page once WP3's host is merged); the host stops on close_editor (the Edge tab is stubbed: BW_NO_BROWSER).
  r = await client.callTool({ name: 'harvest_model', arguments: { model: path.join(REPO, 'tests', 'fixtures', 'harvest', 'permit.bpmn20.xml'), out_dir: path.join(OUT, 'bpmn'), open: true } });
  {
    const o = data(r)?.opened || {};
    const docId = fs.existsSync(data(r)?.documents?.[0] || '') ? JSON.parse(fs.readFileSync(data(r).documents[0], 'utf8')).control.documentId : '?';
    const page = o.url ? await fetch(o.url).then(async (x) => ({ code: x.status, body: await x.text() })).catch(() => ({ code: 0, body: '' })) : { code: 0, body: '' };
    check('harvest_model open: true → a URL whose page lists the new document', !r.isError && page.code === 200 && page.body.includes(docId) && o.doc_id === docId, `${o.url} ${page.code} ${docId} ${text(r).slice(0, 160)}`);
    fs.writeFileSync(path.join(OUT, 'steps.html'), '<h1>Library card</h1><ol><li>Fill in the card form</li><li>Collect the card</li></ol>');
    const hs = await client.callTool({ name: 'harvest_sources', arguments: { sources: [path.join(OUT, 'steps.html'), path.join(REPO, 'tests', 'fixtures', 'harvest', 'steps.yaml'), path.join(OUT, 'edits.json')], out_dir: path.join(OUT, 'sources') } });
    check('harvest_sources: an HTML page and a step list become documents; an unreadable file is listed as skipped', !hs.isError && data(hs)?.results?.length === 2 && data(hs).skipped.length === 1, text(hs).slice(0, 200));
    const oe = await client.callTool({ name: 'open_in_editor', arguments: { documents: [SAMPLE] } });
    check('open_in_editor: {url, doc_id} for the sample', !oe.isError && /^http:\/\/127\.0\.0\.1:\d+\//.test(data(oe)?.url || '') && data(oe).doc_id === 'BW-SRS-SAMPLE-001', text(oe).slice(0, 160));
    const ce = await client.callTool({ name: 'close_editor', arguments: {} });
    await new Promise((ok) => setTimeout(ok, 800));
    const gone = o.url ? await fetch(o.url).then(() => false).catch(() => true) : false;
    check('close_editor stops every host it started', !ce.isError && data(ce)?.stopped >= 2 && gone, text(ce).slice(0, 160));
  }

  r = await client.callTool({ name: 'export_document', arguments: { document: AR, edits: editsFile, out_dir: path.join(OUT, 'export') } });
  const ex = data(r) || {};
  check('export_document: PDF + DOCX from the edited state', !r.isError && fs.existsSync(ex.pdf || '') && fs.existsSync(ex.docx || '') && ex.ops_applied === 2 && ex.locale === 'ar', text(r).slice(0, 200));
} catch (e) {
  check('mcp run', false, e.stack?.split('\n').slice(0, 3).join(' / '));
} finally {
  await client.callTool({ name: 'close_editor', arguments: {} }).catch(() => {});
  await client.close().catch(() => {});
}
console.log(results.join('\n'));
console.log(`\n${failed ? 'FAILED' : 'ALL PASS'}: ${results.length - failed}/${results.length}`);
process.exit(failed ? 1 : 0);
