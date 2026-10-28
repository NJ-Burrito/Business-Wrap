// B1 script-first (0.13.0): every verb of `business-wrap` (update/cli.mjs → engine/cli.mjs) runs on fixtures with
// no network (a preload refuses every non-loopback socket and fetch) and no ANTHROPIC_* / OPENAI_* variable; the
// host it starts is stopped by `close`; no code path in engine/, editor/ or mcp/ imports a model or API client.
//
//   node tests/cli.test.mjs
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { py } from '../engine/py.mjs';
import { VERBS } from '../engine/cli.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(REPO, 'out', 'cli-test');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const FIX = path.join(REPO, 'tests', 'fixtures', 'harvest');

const results = [];
let failed = 0;
const check = (name, ok, detail = '') => { results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); if (!ok) failed += 1; };

// no network: loopback only (the host on 127.0.0.1 is allowed, anything else throws)
const BLOCK = `import net from 'node:net';
const ok = (h) => !h || /^(127\\.|localhost$|::1$|\\[::1\\]$)/.test(String(h));
const c = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...a) { const o = a[0] && typeof a[0] === 'object' ? (Array.isArray(a[0]) ? a[0][0] : a[0]) : { port: a[0], host: a[1] }; if (!o.path && !ok(o.host)) throw new Error('NETWORK BLOCKED ' + o.host); return c.apply(this, a); };
const f = globalThis.fetch; globalThis.fetch = (u, ...r) => { const h = new URL(String(u?.url || u)).hostname; if (!ok(h)) return Promise.reject(new Error('NETWORK BLOCKED ' + h)); return f(u, ...r); };`;
const PRELOAD = `data:text/javascript,${encodeURIComponent(BLOCK)}`;
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(ANTHROPIC|OPENAI)_/i.test(k)));
Object.assign(env, { BW_STATE_DIR: path.join(OUT, 'state'), BW_LEARNING_DIR: path.join(OUT, 'learning'), INIT_CWD: OUT });
const bw = (...args) => {
  const r = spawnSync(process.execPath, ['--import', PRELOAD, path.join(REPO, 'update', 'cli.mjs'), ...args], { cwd: OUT, env, encoding: 'utf8', timeout: 240000 });
  let json = null;
  try { json = JSON.parse(r.stdout); } catch { /* plain output */ }
  return { code: r.status, out: r.stdout || '', err: r.stderr || '', json };
};
const get = (url) => new Promise((ok) => { http.get(url, (res) => { let s = ''; res.on('data', (c) => { s += c; }); res.on('end', () => ok({ code: res.statusCode, body: s })); }).on('error', () => ok({ code: 0, body: '' })); });

// invented sources: an HTML page, a text file, a DOCX (built here), each with three numbered steps
fs.writeFileSync(path.join(OUT, 'steps.html'), '<html><head><title>Library card</title></head><body><h1>Library card</h1><ol><li>Fill in the card form</li><li>Attach a photo</li><li>Collect the card</li></ol></body></html>');
fs.writeFileSync(path.join(OUT, 'steps.txt'), 'Parking permit\n1. Apply online\n2. Pay the fee\n3. Print the permit\n');
const DOCX = path.join(OUT, 'steps.docx');
const para = (t, list) => `<w:p>${list ? '<w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr>' : ''}<w:r><w:t>${t}</w:t></w:r></w:p>`;
const xml = `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${para('Boat licence')}${para('Book a test', 1)}${para('Pass the test', 1)}${para('Receive the licence', 1)}</w:body></w:document>`;
spawnSync(...py(['-c', 'import sys,zipfile;z=zipfile.ZipFile(sys.argv[1],"w",zipfile.ZIP_DEFLATED);z.writestr("[Content_Types].xml","<Types/>");z.writestr("word/document.xml",sys.argv[2]);z.close()', DOCX, xml], []));

try {
  let r = bw('help');
  check('help lists every verb', r.code === 0 && VERBS.filter((v) => v !== 'help').every((v) => r.out.includes(`business-wrap ${v}`)), r.err.slice(0, 160));

  r = bw('status', '--json');
  check('status answers offline, ai: false', r.code === 0 && r.json?.ai === false && typeof r.json.version === 'string', r.out.slice(0, 160) + r.err.slice(0, 160));

  r = bw('new', '--title', 'Test permit', '--out', path.join(OUT, 'new'), '--no-open', '--json');
  check('new writes a document pair + an editor', r.code === 0 && r.json?.documents?.length === 2 && fs.existsSync(r.json.editor), r.err.slice(0, 200));

  r = bw('build', path.join(REPO, 'samples', 'event-permit'), '--out', path.join(OUT, 'built.html'), '--json');
  check('build makes the editor', r.code === 0 && fs.existsSync(path.join(OUT, 'built.html')) && r.json?.services?.[0] === 'event-permit', r.err.slice(0, 200));

  r = bw('harvest', path.join(FIX, 'steps.yaml'), '--out', path.join(OUT, 'h-yaml'), '--no-open', '--json');
  check('harvest a YAML step list: documents + PASS gates', r.code === 0 && r.json?.documents?.length === 2 && r.json.gates.every((g) => g.verdict === 'PASS'), JSON.stringify(r.json?.gates?.map((g) => g.verdict)) + r.err.slice(0, 160));

  r = bw('harvest', path.join(FIX, 'permit.bpmn20.xml'), '--out', path.join(OUT, 'h-bpmn'), '--no-open', '--json');
  check('harvest a BPMN model', r.code === 0 && r.json?.documents?.length === 2 && fs.existsSync(r.json.editor || ''), r.err.slice(0, 200));

  r = bw('import', path.join(OUT, 'steps.html'), path.join(OUT, 'steps.txt'), DOCX, '--out', path.join(OUT, 'imp'), '--no-open', '--json');
  const steps = (r.json?.results || []).map((x) => JSON.parse(fs.readFileSync(x.documents[1], 'utf8'))).map((d) => JSON.stringify(d));
  check('import HTML + TXT + DOCX: one document pair each, steps carried', r.code === 0 && r.json?.results?.length === 3 && /Attach a photo/.test(steps[0] || '') && /Pay the fee/.test(steps.join('')) && /Pass the test/.test(steps.join('')), JSON.stringify(r.json?.skipped) + r.err.slice(0, 160));

  r = bw('gate', 'document', path.join(REPO, 'samples', 'event-permit', 'document.ar.json'), '--json');
  check('gate document: PASS on the sample', r.code === 0 && r.json?.gates?.[0]?.verdict === 'PASS', r.out.slice(0, 160));
  fs.writeFileSync(path.join(OUT, 'nocode.json'), JSON.stringify({ control: { title: 'x' }, chapters: [] }));
  r = bw('gate', 'document', path.join(OUT, 'nocode.json'), '--json');
  check('gate document: a missing document code FAILs (exit 1)', r.code === 1 && r.json?.gates?.[0]?.problems.some((p) => /document code/.test(p)), r.out.slice(0, 200));

  r = bw('export', path.join(REPO, 'samples', 'event-permit', 'document.en.json'), 'en', '--out', path.join(OUT, 'exp'), '--json');
  const gv = Object.fromEntries((r.json?.gates || []).map((g) => [g.stage, g.verdict]));
  check('export: PDF + DOCX, per-stage gates document/render/export after the step', fs.existsSync(r.json?.pdf || '') && fs.existsSync(r.json?.docx || '') && gv.document === 'PASS' && gv.export === 'PASS' && ['PASS', 'SKIP'].includes(gv.render), JSON.stringify(r.json?.gates) .slice(0, 300) + r.err.slice(0, 200));

  r = bw('heal-log', '--json');
  check('heal-log answers', r.code === 0 && Array.isArray(r.json?.healed));
  r = bw('library', '--json');
  check('library list answers', r.code === 0 && Array.isArray(r.json?.documents), r.err.slice(0, 160));
  r = bw('verify-history', path.join(OUT, 'nocode.json'), '--json');
  check('verify-history: runs WP4\'s check, or says it is not in this build (exit 3)', r.code === 3 || r.code === 0 || r.code === 1, `exit ${r.code} ${r.err.slice(0, 120)}`);
  r = bw('report', '2026-10-01', '2026-10-31', '--json');
  check('report: runs WP4\'s report, or says it is not in this build (exit 3)', r.code === 3 || r.code === 0, `exit ${r.code} ${r.err.slice(0, 120)}`);
  r = bw('update', '--notes');
  check('update --notes works offline', r.code === 0 && /Business-Wrap \d/.test(r.out), r.err.slice(0, 160));
  r = bw('nonsense');
  check('an unknown verb exits 2 with the usage', r.code === 2 && /business-wrap open/.test(r.err));

  // open → the host answers with the document → close stops it
  r = bw('open', path.join(REPO, 'samples', 'event-permit'), '--port', '4391', '--no-browser', '--json');
  const page = r.json?.url ? await get(r.json.url) : { code: 0, body: '' };
  check('open: host up, the page carries the document', r.code === 0 && page.code === 200 && page.body.includes('BW-SRS-SAMPLE-001') && r.json.doc_id === 'BW-SRS-SAMPLE-001', `${r.json?.url} ${page.code} ${r.err.slice(0, 160)}`);
  const pid = r.json?.pid;
  r = bw('status', '--json');
  check('status lists the running host', r.json?.hosts?.some((h) => h.pid === pid));
  r = bw('close', '--json');
  await new Promise((ok) => setTimeout(ok, 800));
  const after = r.json?.url ? null : await get(`http://127.0.0.1:${4391}/`);
  check('close stops the host it started (port no longer answers)', r.code === 0 && r.json?.pids?.includes(pid) && after?.code === 0, JSON.stringify(r.json) + ` after=${after?.code}`);

  // the grep gate: no model or API client in any code path
  const CLIENT = /from\s+['"](@anthropic-ai\/[\w-]+|anthropic|openai|@google\/generative-ai|@google\/genai|cohere-ai|@mistralai\/[\w-]+|ollama)['"]|require\(\s*['"](@anthropic-ai|openai|anthropic)|api\.anthropic\.com|api\.openai\.com|^\s*(import|from)\s+(anthropic|openai)\b/m;
  const hits = [];
  const walk = (d) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) { if (!['node_modules', '__pycache__'].includes(f.name)) walk(p); } else if (/\.(mjs|js|cjs|ts|py)$/.test(f.name) && CLIENT.test(fs.readFileSync(p, 'utf8'))) hits.push(path.relative(REPO, p)); } };
  for (const d of ['engine', 'editor', 'mcp', 'update', 'commands']) if (fs.existsSync(path.join(REPO, d))) walk(path.join(REPO, d));
  check('grep gate: no model / API client imported in engine, editor, mcp, update, commands', hits.length === 0, hits.join(', '));
} catch (e) {
  check('cli run', false, e.stack?.split('\n').slice(0, 3).join(' / '));
} finally {
  spawnSync(process.execPath, [path.join(REPO, 'engine', 'cli.mjs'), 'close'], { env, encoding: 'utf8' });
}
console.log(results.join('\n'));
console.log(`\n${failed ? 'FAILED' : 'ALL PASS'}: ${results.length - failed}/${results.length}`);
process.exit(failed ? 1 : 0);
