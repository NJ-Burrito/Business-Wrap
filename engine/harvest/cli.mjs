// Harvest CLI: both paths end in the same pair of document JSON files and an editor.
//
//   npm run harvest:model -- <model.bpmn|.xml|.drawio|.yaml|.json> [--out dir] [--name "Service name"] [--no-editor]
//   npm run harvest:crawl -- <crawl-config.json> [--out dir] [--no-editor] [--headless] [--raw harvest.json] [--into dir]
//   npm run harvest:merge -- <harvest.json> <process.json | model file> [--out dir] [--name n] [--roles roles.json]
// A model accepts --roles <file>: readable names for expression assignees and raw keys (see bible/08-harvest).
// A second harvest written --into a document folder merges with the first (never overwrites it).
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { parseModel, modelToDocument } from './model.mjs';
import { crawl } from './crawl.mjs';
import { harvestToDocument, mergeToDocument } from './docs.mjs';
import { i18n, REPO, userCwd } from '../export.mjs';
import { buildEditor } from '../build-editor.mjs';
import { get, applyOp, applyOps, migrate } from '../edits.mjs';

const inflateRaw = (bin) => zlib.inflateRawSync(Buffer.from(bin)).toString('latin1');

/**
 * A re-harvest keeps what people changed: every value the editor flagged «manual» (doc.manual, pointer →
 * {generated}) keeps the person's text, and a source that now says something else is reported as a conflict
 * (doc.harvestConflicts, shown in the editor). The document's own labels, design and layout carry over.
 */
export function reharvest(next, prev) {
  if (!prev) return { doc: next, conflicts: [] };
  const conflicts = [];
  const manual = {};
  for (const [ptr, m] of Object.entries(prev.manual || {})) {
    const mine = get(prev, ptr);
    const theirs = get(next, ptr);
    if (mine === undefined) continue;
    if (theirs !== undefined && theirs !== m.generated && theirs !== mine) conflicts.push({ path: ptr, generated: m.generated, harvested: theirs, manual: mine });
    try { applyOp(next, { op: 'replace', path: ptr, value: mine }); manual[ptr] = { generated: theirs ?? m.generated }; } catch { conflicts.push({ path: ptr, generated: m.generated, harvested: null, manual: mine }); }
  }
  for (const k of ['labels', 'design', 'layout']) if (prev[k] !== undefined) next[k] = prev[k];
  if (Object.keys(manual).length) next.manual = manual;
  if (conflicts.length) next.harvestConflicts = conflicts; else delete next.harvestConflicts;
  return { doc: next, conflicts };
}

/** The previous edition in the output folder, with its edits file (<service>.<ed>.edits.json) applied if there is one. */
function previous(dir, service, ed) {
  const f = path.join(dir, `document.${ed}.json`);
  if (!fs.existsSync(f)) return null;
  let doc = JSON.parse(fs.readFileSync(f, 'utf8'));
  const edits = path.join(dir, `${service}.${ed}.edits.json`);
  if (fs.existsSync(edits)) doc = applyOps(doc, migrate(JSON.parse(fs.readFileSync(edits, 'utf8'))).ops);
  return doc;
}

const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
/**
 * Write both editions (and the editor) for one document builder. `sources` are the harvest inputs
 * ({ir} and/or {raw}); they are kept beside the documents (process.json, harvest.json), so a second
 * harvest of the other kind into the same folder merges with the first instead of replacing it.
 */
export function writeDocuments(build, outRoot, { editor = true, extra = {}, into, sources = {}, name } = {}) {
  const H = i18n().harvest;
  let docs = { ar: build('ar', H.ar), en: build('en', H.en) };
  const dir = path.resolve(into || path.resolve(outRoot, docs.en.service));
  const keptIr = sources.ir || (fs.existsSync(path.join(dir, 'process.json')) ? readJson(path.join(dir, 'process.json')) : null);
  const keptRaw = sources.raw || (fs.existsSync(path.join(dir, 'harvest.json')) ? readJson(path.join(dir, 'harvest.json')) : null);
  if (keptIr && keptRaw) docs = { ar: mergeToDocument(keptIr, keptRaw, { locale: 'ar', L: H.ar, name }), en: mergeToDocument(keptIr, keptRaw, { locale: 'en', L: H.en, name }) };
  if (keptIr) extra['process.json'] = keptIr;
  if (keptRaw) extra['harvest.json'] = keptRaw;
  fs.mkdirSync(dir, { recursive: true });
  const conflicts = {};
  for (const [ed, d0] of Object.entries(docs)) {
    d0.harvest = { at: new Date().toISOString().slice(0, 10), kinds: [keptIr && 'model', keptRaw && 'crawl'].filter(Boolean) };
    const merging = d0.harvestConflicts || [];
    const r = reharvest(d0, previous(dir, docs.en.service, ed));
    docs[ed] = r.doc;
    if (merging.length) { const key = (c) => `${c.path}|${c.kept ?? c.manual}|${c.other ?? c.harvested}`; docs[ed].harvestConflicts = [...new Map([...merging, ...(docs[ed].harvestConflicts || [])].map((c) => [key(c), c])).values()]; }
    const all = docs[ed].harvestConflicts || [];
    if (all.length) conflicts[ed] = all;
  }
  for (const [ed, d] of Object.entries(docs)) fs.writeFileSync(path.join(dir, `document.${ed}.json`), JSON.stringify(d, null, 1) + '\n');
  for (const [name, v] of Object.entries(extra)) fs.writeFileSync(path.join(dir, name), JSON.stringify(v, null, 1) + '\n');
  const out = { dir, documents: [path.join(dir, 'document.ar.json'), path.join(dir, 'document.en.json')], service: docs.en.service, conflicts };
  if (editor) out.editor = buildEditor({ inputs: out.documents, out: path.join(dir, `${docs.en.service}.editor.html`), set: docs.en.service, watermarkDir: null }).out;
  return out;
}

const rolesOf = (roles) => (typeof roles === 'string' ? readJson(roles) : roles || {});
/** A model file (BPMN, draw.io, YAML/JSON steps, monitoring graph JSON) or an IR already parsed. */
export async function readModel(file, { name, roles } = {}) {
  const text = fs.readFileSync(file, 'utf8');
  if (/"kind"\s*:\s*"bw-process"/.test(text)) {
    const ir = JSON.parse(text);
    if (name) ir.name = name;
    return ir;
  }
  return parseModel(text, { inflateRaw, name, roles: rolesOf(roles) });
}
/** A raw crawl harvest: the harvest.json file, or the folder that holds it. */
const readRaw = (f) => readJson(fs.statSync(f).isDirectory() ? path.join(f, 'harvest.json') : f);

export async function harvestModel(file, { out = path.join(userCwd(), 'bw-harvest'), name, roles, editor = true, into } = {}) {
  const ir = await readModel(file, { name, roles });
  return { ...writeDocuments((locale, L) => modelToDocument(ir, { locale, L }), out, { editor, into, sources: { ir }, name }), ir };
}

/** `raw`: a saved harvest.json to map again without a browser (offline re-run). */
export async function harvestCrawl(config, { out = path.join(userCwd(), 'bw-harvest'), editor = true, log, browser, raw: rawFile, into } = {}) {
  const cfg = typeof config === 'string' ? JSON.parse(fs.readFileSync(config, 'utf8')) : config;
  const { raw, outDir } = rawFile
    ? { raw: readRaw(rawFile), outDir: path.dirname(path.resolve(rawFile)) }
    : await crawl({ ...cfg, outDir: cfg.outDir || path.join(out, 'raw', String(cfg.name || 'service').replace(/[^\w-]+/g, '-')) }, { log, browser });
  return { ...writeDocuments((locale, L) => harvestToDocument(raw, { locale, L }), out, { editor, into, sources: { raw } }), raw, rawDir: outDir };
}

/** The documented union of a crawl and a model, with provenance per section and row, conflicts listed. */
export async function harvestMerge(crawlFile, modelFile, { out = path.join(userCwd(), 'bw-harvest'), name, roles, editor = true, into } = {}) {
  const raw = readRaw(crawlFile);
  const ir = await readModel(modelFile, { roles });
  return { ...writeDocuments((locale, L) => mergeToDocument(ir, raw, { locale, L, name }), out, { editor, into, sources: { ir, raw }, name }), ir, raw };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [cmd, input, ...rest] = process.argv.slice(2);
  const flag = (k) => { const i = rest.indexOf(`--${k}`); return i < 0 ? undefined : rest[i + 1]; };
  const opts = { out: flag('out') ? path.resolve(userCwd(), flag('out')) : undefined, editor: !rest.includes('--no-editor'), into: flag('into') && path.resolve(flag('into')), roles: flag('roles') && path.resolve(flag('roles')), name: flag('name') };
  if (!input || !['model', 'crawl', 'merge'].includes(cmd) || (cmd === 'merge' && (!rest[0] || rest[0].startsWith('--')))) {
    console.error('usage: node engine/harvest/cli.mjs model <file> [--out dir] [--name n] [--roles roles.json] [--into dir]\n       node engine/harvest/cli.mjs crawl <config.json> [--out dir] [--headless] [--raw harvest.json] [--into dir]\n       node engine/harvest/cli.mjs merge <harvest.json> <process.json|model file> [--out dir] [--name n] [--roles roles.json]');
    process.exit(2);
  }
  try {
    const r = cmd === 'model'
      ? await harvestModel(path.resolve(input), opts)
      : cmd === 'merge'
        ? await harvestMerge(path.resolve(input), path.resolve(rest[0]), opts)
        : await harvestCrawl(rest.includes('--headless') ? { ...JSON.parse(fs.readFileSync(input, 'utf8')), headed: false } : path.resolve(input), { ...opts, raw: flag('raw') && path.resolve(flag('raw')) });
    console.log(`documents  ${r.documents.join('  ')}`);
    if (r.editor) console.log(`editor     ${r.editor}`);
    for (const [ed, cs] of Object.entries(r.conflicts || {})) for (const c of cs) console.log(c.source ? `CONFLICT   ${ed} ${c.path}: kept «${c.kept}»; the ${c.source} says «${c.other}»` : `CONFLICT   ${ed} ${c.path}: kept your edit; the source now says: ${c.harvested}`);
  } catch (e) {
    console.error(`harvest failed: ${e.message}`);
    process.exit(1);
  }
}
