// 0.18.0 (document studio) · lane L1 integration: the document-type registry reaches the editor, the host, the CLI and the PDF.
//   1. buildEditor({docTypes:true}) embeds <script type="application/json" id="bw-doctypes"> = payloadJson(): it parses, holds every registry type with both
//      composed editions, cannot close the script early, sits outside bw-data (bw-data is identical with and without it), and is absent when not asked for
//   2. the shipped build (build-skill-html.mjs) and the CLI blank editor ask for it
//   3. a re-wrap of an older file keeps it only if the old file had it, and the history (services, carried keys) is unchanged
//   4. GET /api/doctypes (the same payload) and GET /api/doctypes/<id>/<ed>.json (composed) through the real server
//   5. `business-wrap types` and `new --type <id> --out <dir>` through the real CLI entry (update/cli.mjs): the pair of documents carries docType / coverDesign /
//      motif, the editor embeds the registry; an unknown type exits 2 and writes nothing
//   6. the compact page 1 is no cover: its folio and running head are there; a spine or an absent coverDesign stays as before (page 1 = cover, folio from page 2)
//   node tests/doctypes-build-0180.test.mjs     (headless Chrome for the PDF only; it closes its own browser)
import './_isolate.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawnSync } from 'node:child_process';
import { py } from '../engine/py.mjs';
import { REPO, exportPdf, loadTheme } from '../engine/export.mjs';
import * as DT from '../engine/doctypes.mjs';
import { buildEditor, rewrapEditorHtml } from '../engine/build-editor.mjs';

const results = [];
let failed = 0;
const check = (name, ok, detail = '') => {
  const line = `${ok ? 'PASS' : 'FAIL'}  doctypes-build-0180: ${name}${detail && !ok ? '  | ' + String(detail).replace(/\s+/g, ' ').slice(0, 300) : ''}`;
  results.push(line);
  console.log(line);
  if (!ok) failed += 1;
};
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-1109-doctypes-build-'));
process.env.BW_LOCAL_DIR = path.join(tmp, 'local');
process.env.BW_WORKSPACE = path.join(tmp, 'ws');
const DATA = /<script type="application\/json" id="bw-data">([\s\S]*?)<\/script>/;
const DTS = /<script type="application\/json" id="bw-doctypes">([\s\S]*?)<\/script>/;
const count = (h, s) => h.split(s).length - 1;
const withData = (html, d) => html.replace(DATA, (_, ) => `<script type="application/json" id="bw-data">${JSON.stringify(d).replace(/</g, '\\u003c')}</script>`);
const types = DT.listTypes();
const BLANK = path.join(REPO, 'samples', 'blank');
const build = (name, o = {}) => { const out = path.join(tmp, name); buildEditor({ inputs: [BLANK], out, set: 'blank', watermarkDir: null, ...o }); return fs.readFileSync(out, 'utf8'); };

try {
  // ── 1. the embed ──
  const plain = build('plain.html');
  const withT = build('with.html', { docTypes: true });
  const m = DTS.exec(withT);
  let got = null;
  try { got = JSON.parse(m[1]); } catch { /* checked below */ }
  const want = DT.payload();
  check('docTypes:true embeds one <script id="bw-doctypes"> that parses as JSON', !!m && count(withT, '<script type="application/json" id="bw-doctypes">') === 1 && got && got.v === 1, m ? m[1].slice(0, 80) : 'no script');
  check('it is exactly payloadJson() (the same string the route and the CLI use)', !!m && m[1] === DT.payloadJson(), m ? m[1].length + ' vs ' + DT.payloadJson().length : '');
  check('it holds every registry type, in registry order, with the colour, art and both composed editions', !!got && JSON.stringify(got.types.map((t) => t.id)) === JSON.stringify(types.map((t) => t.id)) && types.length >= 1 && got.types.every((t) => /^#[0-9a-f]{6}$/i.test(t.accent) && typeof t.art === 'string' && typeof t.docs.ar === 'string' && typeof t.docs.en === 'string'));
  const docsOk = !!got && got.types.every((t) => ['ar', 'en'].every((ed) => { try { const d = JSON.parse(t.docs[ed]); return d.docType === t.id && d.coverDesign === t.coverDesign && d.motif === t.motif && !!d.control && Array.isArray(d.chapters); } catch { return false; } }));
  check('each embedded document parses and carries docType, coverDesign and motif of its type (composed, self-contained)', docsOk);
  check('the payload equals payload() in structure (categories, ids, palette)', !!got && JSON.stringify(got) === JSON.stringify(JSON.parse(DT.payloadJson())) && JSON.stringify(got.categories) === JSON.stringify(want.categories));
  check('it cannot close the script early: no "</script" and no raw < inside it', !!m && !/</.test(m[1]));
  check('it sits before the app script and outside bw-data (no doctypes key; bw-data is identical with and without it)', withT.indexOf('<script type="application/json" id="bw-doctypes">') < withT.indexOf('id="bw-app"') && JSON.stringify(Object.keys(JSON.parse(DATA.exec(withT)[1]))) === JSON.stringify(Object.keys(JSON.parse(DATA.exec(plain)[1]))) && DATA.exec(withT)[1] === DATA.exec(plain)[1]);
  check('without the option nothing is embedded (a re-wrap, harvest, SRS build or MCP build is unchanged)', !DTS.test(plain));
  const bytes = Buffer.byteLength(withT) - Buffer.byteLength(plain);
  check(`the registry is the only difference in size (${(bytes / 1024).toFixed(0)} KB)`, bytes === Buffer.byteLength('<script type="application/json" id="bw-doctypes">' + DT.payloadJson() + '</script>\n'));

  // ── 2. who asks for it ──
  const skill = fs.readFileSync(path.join(REPO, 'engine', 'build-skill-html.mjs'), 'utf8');
  check('the shipped build (build-skill-html.mjs) builds with docTypes: true', /docTypes:\s*true/.test(skill));
  const cli = fs.readFileSync(path.join(REPO, 'engine', 'cli.mjs'), 'utf8');
  check('the CLI blank editor (open with no document) and `new` build with the registry', /docTypes: implicitBlank/.test(cli) && /docTypes: true/.test(cli));

  // ── 3. re-wrap ──
  const old = (html) => withData(html, { ...JSON.parse(DATA.exec(html)[1]), version: '0.0.1', provenanceKey: { keep: 'me' } });
  const rw = rewrapEditorHtml(old(withT));
  const rwPlain = rewrapEditorHtml(old(plain));
  check('re-wrap keeps the registry when the old file had it (regenerated, one script)', count(rw, '<script type="application/json" id="bw-doctypes">') === 1 && DTS.exec(rw)[1] === DT.payloadJson());
  check('re-wrap adds none when the old file had none', !DTS.test(rwPlain));
  const d0 = JSON.parse(DATA.exec(withT)[1]);
  const d1 = JSON.parse(DATA.exec(rw)[1]);
  check('re-wrap changes no history: services, setId and an unknown carried key are the same; bw-data has no registry', JSON.stringify(d1.services) === JSON.stringify(d0.services) && d1.setId === d0.setId && d1.provenanceKey?.keep === 'me' && !('doctypes' in d1));
  check('a file already at this version and format is returned untouched', rewrapEditorHtml(withT) === withT);

  // ── 4. the routes, through the real server ──
  const { serve } = await import('../engine/serve.mjs');
  const editorFile = path.join(tmp, 'served.html');
  fs.writeFileSync(editorFile, withT);
  const server = await serve(editorFile, 0, { workspace: null });
  const port = server.address().port;
  const get = (p) => new Promise((ok) => { http.get(`http://127.0.0.1:${port}${p}`, (res) => { let s = ''; res.setEncoding('utf8'); res.on('data', (c) => { s += c; }); res.on('end', () => ok({ code: res.statusCode, type: res.headers['content-type'], body: s })); }).on('error', (e) => ok({ code: 0, body: String(e) })); });
  try {
    const all = await get('/api/doctypes');
    let j = null; try { j = JSON.parse(all.body); } catch { /* none */ }
    check('GET /api/doctypes answers 200 JSON with the payload (same types, same documents as the embedded script)', all.code === 200 && /json/.test(all.type) && !!j && JSON.stringify(j) === JSON.stringify(got), `${all.code} ${all.body.slice(0, 80)}`);
    const t0 = types[0];
    for (const ed of ['en', 'ar']) {
      const one = await get(`/api/doctypes/${t0.id}/${ed}.json`);
      let d = null; try { d = JSON.parse(one.body); } catch { /* none */ }
      check(`GET /api/doctypes/${t0.id}/${ed}.json is the composed document (docType, coverDesign, motif, design.vars)`, one.code === 200 && !!d && JSON.stringify(d) === JSON.stringify(DT.compose(t0.id, ed)) && d.docType === t0.id && !!d.design?.vars?.primary && !!d.motif, `${one.code} ${one.body.slice(0, 80)}`);
    }
    const bad = [await get('/api/doctypes/nope/en.json'), await get(`/api/doctypes/${t0.id}/fr.json`), await get('/api/doctypes/..%2f..%2fpackage/en.json'), await get('/api/doctypes/x'), await get('/api/doctypesx')];
    check('an unknown type, an unknown edition, a path trick and a stray path are 404 (nothing read outside the registry)', bad.every((r) => r.code === 404), bad.map((r) => r.code).join(','));
    const post = await new Promise((ok) => { const r = http.request({ host: '127.0.0.1', port, path: '/api/doctypes', method: 'POST', headers: { 'content-type': 'application/json' } }, (res) => { res.resume(); res.on('end', () => ok(res.statusCode)); }); r.on('error', () => ok(0)); r.end('{}'); });
    check('the route is read only: a POST is not served by it (404)', post === 404, String(post));
  } finally { await new Promise((ok) => server.close(ok)); server.closeAllConnections?.(); }

  // ── 5. the CLI, through its real entry ──
  const OUT = path.join(tmp, 'cli');
  fs.mkdirSync(OUT, { recursive: true });
  const env = { ...process.env, BW_STATE_DIR: path.join(OUT, 'state'), BW_LEARNING_DIR: path.join(OUT, 'learning'), INIT_CWD: OUT, BW_NO_BROWSER: '1', PYTHONUTF8: '1' };
  const bw = (...a) => { const r = spawnSync(process.execPath, [path.join(REPO, 'update', 'cli.mjs'), ...a], { cwd: OUT, env, encoding: 'utf8', timeout: 240000 }); let json = null; try { json = JSON.parse(r.stdout); } catch { /* plain */ } return { code: r.status, out: r.stdout || '', err: r.stderr || '', json }; };
  const tj = bw('types', '--json');
  check('`types --json` lists every registry type with id, code, category, cover design and names', tj.code === 0 && JSON.stringify(tj.json?.types?.map((t) => t.id)) === JSON.stringify(types.map((t) => t.id)) && tj.json.types.every((t) => t.code && t.category && ['spine', 'compact'].includes(t.coverDesign) && t.name?.ar && t.name?.en), tj.out + tj.err);
  const tp = bw('types');
  check('`types` prints one line per type for a person', tp.code === 0 && types.every((t) => tp.out.includes(t.id)), tp.out + tp.err);
  const id = types.find((t) => t.id === 'blank') ? 'blank' : types[0].id;
  const dir = path.join(OUT, 'new-blank');
  const nw = bw('new', '--type', id, '--out', dir, '--no-open', '--json');
  const docs = ['ar', 'en'].map((ed) => { try { return JSON.parse(fs.readFileSync(path.join(dir, `document.${ed}.json`), 'utf8')); } catch { return null; } });
  check(`new --type ${id} --out writes the pair of composed documents and builds the editor`, nw.code === 0 && docs.every(Boolean) && fs.existsSync(nw.json?.editor || ''), nw.out + nw.err);
  const ty = DT.listTypes().find((t) => t.id === id);
  check('both documents carry docType, coverDesign and motif of the type and its palette in design.vars', docs.every((d, i) => d && d.docType === id && d.service === id && d.coverDesign === (ty.coverDesign || 'spine') && d.motif === (ty.motif || id) && JSON.stringify(d.design?.vars) === JSON.stringify(DT.compose(id, ['ar', 'en'][i]).design.vars)));
  const edHtml = nw.json?.editor && fs.existsSync(nw.json.editor) ? fs.readFileSync(nw.json.editor, 'utf8') : '';
  const sv = edHtml && JSON.parse(DATA.exec(edHtml)[1]).services;
  check('the new editor opens on that document in both editions and embeds the registry', !!sv && sv.length === 1 && sv[0].id === id && !!sv[0].editions.ar && !!sv[0].editions.en && JSON.parse(sv[0].editions.en.raw).docType === id && DTS.exec(edHtml)?.[1] === DT.payloadJson());
  const nt = bw('new', '--type', id, '--title', 'Custom title', '--out', path.join(OUT, 'new-titled'), '--no-open', '--json');
  check('--title sets the document title and keeps the type', nt.code === 0 && JSON.parse(fs.readFileSync(path.join(OUT, 'new-titled', 'document.en.json'), 'utf8')).control.title === 'Custom title' && JSON.parse(fs.readFileSync(path.join(OUT, 'new-titled', 'document.en.json'), 'utf8')).docType === id, nt.out + nt.err);
  const un = bw('new', '--type', 'no-such-type', '--out', path.join(OUT, 'new-bad'), '--no-open', '--json');
  check('an unknown type exits 2, names the types and writes nothing', un.code === 2 && /unknown document type/.test(un.err) && !fs.existsSync(path.join(OUT, 'new-bad')), `${un.code} ${un.err}`);
  const old0 = bw('new', '--out', path.join(OUT, 'new-plain'), '--no-open', '--json');
  const plainDoc = JSON.parse(fs.readFileSync(path.join(OUT, 'new-plain', 'document.en.json'), 'utf8'));
  check('`new` without --type is the old blank pair (no docType key)', old0.code === 0 && !('docType' in plainDoc) && !('coverDesign' in plainDoc));

  // ── 6. the PDF: a compact page 1 is a page, not a cover ──
  const theme = loadTheme();
  const PROBE = 'import sys, json, pymupdf\nd = pymupdf.open(sys.argv[1])\nout = []\nfor i in range(min(3, d.page_count)):\n    p = d[i]\n    runs = []\n    for b in p.get_text("dict")["blocks"]:\n        for l in b.get("lines", []):\n            for s in l["spans"]:\n                if s["text"].strip(): runs.append([s["text"].strip(), round(s["origin"][0]), round(s["origin"][1])])\n    out.append({"h": round(p.rect.height), "w": round(p.rect.width), "runs": runs})\nprint(json.dumps(out))\n';
  const probe = (f) => JSON.parse(spawnSync(...py(['-c', PROBE, f]), { encoding: 'utf8', env: { ...process.env, PYTHONUTF8: '1' } }).stdout);
  const head = (pg) => pg.runs.some(([, , y]) => y < 40);                       // the running head Chrome prints at the top margin
  const folio = (pg, n) => pg.runs.some(([t, , y]) => t === String(n) && y > pg.h - 30); // the folio stamped in the footer row (its side follows the document's folio setting)
  const sample = (ed, cover) => { const d = ed === 'ar' || ed === 'en' ? JSON.parse(fs.readFileSync(path.join(BLANK, `document.${ed}.json`), 'utf8')) : null; if (cover) { d.coverDesign = cover; d.motif = 'blank'; } return d; };
  for (const ed of ['en', 'ar']) {
    const mark = folio;
    const f = (n) => path.join(tmp, `${n}-${ed}.pdf`);
    await exportPdf(sample(ed, 'compact'), { locale: ed, theme, pdfPath: f('compact') });
    await exportPdf(sample(ed, 'spine'), { locale: ed, theme, pdfPath: f('spine') });
    await exportPdf(sample(ed, null), { locale: ed, theme, pdfPath: f('none') });
    const c = probe(f('compact')); const s = probe(f('spine')); const n = probe(f('none'));
    check(`PDF compact ${ed}: page 1 has its folio «1» and its running head, page 2 has «2»`, mark(c[0], 1) && head(c[0]) && mark(c[1], 2) && head(c[1]), JSON.stringify(c[0].runs.filter(([, , y]) => y < 40 || y > c[0].h - 30)));
    check(`PDF spine ${ed}: page 1 is the cover (no running head, no folio); page 2 has «1»`, !head(s[0]) && !mark(s[0], 1) && !mark(s[0], 2) && mark(s[1], 1) && head(s[1]), JSON.stringify(s[0].runs.filter(([, , y]) => y < 40 || y > s[0].h - 30)));
    check(`PDF with no coverDesign ${ed}: exactly as before (cover first, folio «1» on page 2)`, !head(n[0]) && !mark(n[0], 1) && mark(n[1], 1) && head(n[1]), JSON.stringify(n[0].runs.filter(([, , y]) => y < 40 || y > n[0].h - 30)));
  }
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exitCode = failed ? 1 : 0;
