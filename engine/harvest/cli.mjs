// Harvest CLI: both paths end in the same pair of document JSON files and an editor.
//
//   npm run harvest:model -- <model.bpmn|.xml|.drawio|.yaml|.json> [--out dir] [--name "Service name"] [--no-editor]
//   npm run harvest:crawl -- <crawl-config.json> [--out dir] [--no-editor] [--headless]
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { parseModel, modelToDocument } from './model.mjs';
import { crawl, harvestToDocument } from './crawl.mjs';
import { i18n, REPO } from '../export.mjs';
import { buildEditor } from '../build-editor.mjs';

const inflateRaw = (bin) => zlib.inflateRawSync(Buffer.from(bin)).toString('latin1');

/** Write both editions (and the editor) for one document builder. */
export function writeDocuments(build, outRoot, { editor = true, extra = {} } = {}) {
  const H = i18n().harvest;
  const docs = { ar: build('ar', H.ar), en: build('en', H.en) };
  const dir = path.resolve(outRoot, docs.en.service);
  fs.mkdirSync(dir, { recursive: true });
  for (const [ed, d] of Object.entries(docs)) fs.writeFileSync(path.join(dir, `document.${ed}.json`), JSON.stringify(d, null, 1) + '\n');
  for (const [name, v] of Object.entries(extra)) fs.writeFileSync(path.join(dir, name), JSON.stringify(v, null, 1) + '\n');
  const out = { dir, documents: [path.join(dir, 'document.ar.json'), path.join(dir, 'document.en.json')], service: docs.en.service };
  if (editor) out.editor = buildEditor({ inputs: out.documents, out: path.join(dir, `${docs.en.service}.editor.html`), set: docs.en.service, watermarkDir: null }).out;
  return out;
}

export async function harvestModel(file, { out = path.join(REPO, 'out', 'harvest'), name, editor = true } = {}) {
  const ir = await parseModel(fs.readFileSync(file, 'utf8'), { inflateRaw, name });
  return { ...writeDocuments((locale, L) => modelToDocument(ir, { locale, L }), out, { editor, extra: { 'process.json': ir } }), ir };
}

export async function harvestCrawl(config, { out = path.join(REPO, 'out', 'harvest'), editor = true, log, browser } = {}) {
  const cfg = typeof config === 'string' ? JSON.parse(fs.readFileSync(config, 'utf8')) : config;
  const { raw, outDir } = await crawl({ ...cfg, outDir: cfg.outDir || path.join(out, 'raw', String(cfg.name || 'service').replace(/[^\w-]+/g, '-')) }, { log, browser });
  return { ...writeDocuments((locale, L) => harvestToDocument(raw, { locale, L }), out, { editor }), raw, rawDir: outDir };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [cmd, input, ...rest] = process.argv.slice(2);
  const flag = (k) => { const i = rest.indexOf(`--${k}`); return i < 0 ? undefined : rest[i + 1]; };
  const opts = { out: flag('out') ? path.resolve(flag('out')) : undefined, editor: !rest.includes('--no-editor') };
  if (!input || !['model', 'crawl'].includes(cmd)) {
    console.error('usage: node engine/harvest/cli.mjs model <file> [--out dir] [--name n] | crawl <config.json> [--out dir] [--headless]');
    process.exit(2);
  }
  try {
    const r = cmd === 'model'
      ? await harvestModel(path.resolve(input), { ...opts, name: flag('name') })
      : await harvestCrawl(rest.includes('--headless') ? { ...JSON.parse(fs.readFileSync(input, 'utf8')), headed: false } : path.resolve(input), opts);
    console.log(`documents  ${r.documents.join('  ')}`);
    if (r.editor) console.log(`editor     ${r.editor}`);
  } catch (e) {
    console.error(`harvest failed: ${e.message}`);
    process.exit(1);
  }
}
