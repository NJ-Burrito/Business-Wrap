// Re-run the healers on built documents, and the cross-service check on a set of them.
//
//   node engine/srs/heal/cli.mjs <out-dir> [<out-dir> …]     healers on each build (exit 1 on any FAIL)
//   node engine/srs/heal/cli.mjs --set <root>                no-common-data across every build under <root>
//
// A build directory is what `engine/srs/cli.mjs build --out` writes (02-evidence.json + document.{ar,en}.json).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { heal, failed, healTable } from './index.mjs';
import { loadPack, coreText, deepMerge } from '../compose.mjs';
import { fold } from '../model.mjs';

const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
// the sections whose values are the service's own facts: two services printing the same one is a copy
const OWN = ['description', 'recipients', 'assumptions', 'fees', 'documents', 'adminRef', 'outputs', 'legislation', 'dataDictionary'];

export function commonData(builds, { shared = [] } = {}) {
  const seen = new Map();
  const sharedSet = new Set(shared.map(fold));
  for (const { name, doc } of builds) {
    const secs = doc.chapters.flatMap((c) => c.sections);
    for (const f of (doc.fill || []).filter((x) => OWN.includes(x.gen) && x.fill === 'evidence')) {
      const s = secs.find((x) => x.number === f.section); if (!s) continue;
      const vals = s.blocks.flatMap((b) => (b.kind === 'table' ? b.rows.map((r) => r.join(' | ')) : b.paragraphs || []));
      for (const v of vals) {
        const k = fold(v); if (k.length < 12 || sharedSet.has(k)) continue;
        const h = crypto.createHash('sha1').update(k).digest('hex');
        if (!seen.has(h)) seen.set(h, { value: v, gen: f.gen, in: new Set() });
        seen.get(h).in.add(name);
      }
    }
  }
  return [...seen.values()].filter((x) => x.in.size > 1).map((x) => ({ value: x.value, gen: x.gen, services: [...x.in] }));
}

export function healDir(dir) {
  const ev = readJson(path.join(dir, '02-evidence.json'));
  const docs = { ar: readJson(path.join(dir, 'document.ar.json')), en: readJson(path.join(dir, 'document.en.json')) };
  const pack = loadPack(ev.pack);
  const text = Object.fromEntries(['ar', 'en'].map((lc) => [lc, deepMerge(coreText()[lc], pack.text?.[lc])]));
  const inputs = fs.existsSync(path.join(dir, '01-harvest.json')) ? readJson(path.join(dir, '01-harvest.json')) : {};
  return heal({ docs, model: ev.model, evidence: ev, pack, profile: ev.profile || {}, text, inputs: { raw: inputs.harvest, ir: inputs.model, record: inputs.record } });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args[0] === '--set') {
    const root = path.resolve(args[1] || '.');
    const builds = fs.readdirSync(root).filter((d) => fs.existsSync(path.join(root, d, 'document.ar.json'))).map((d) => ({ name: d, doc: readJson(path.join(root, d, 'document.ar.json')) }));
    const dup = commonData(builds);
    for (const d of dup) console.log(`FLAG  ${d.gen}: «${d.value.slice(0, 60)}» in ${d.services.join(', ')}`);
    console.log(`no-common-data: ${builds.length} build(s), ${dup.length} value(s) shared between services`);
    process.exit(dup.length ? 1 : 0);
  }
  let bad = 0;
  for (const d of args) { const r = healDir(path.resolve(d)); console.log(`# ${d}\n${healTable(r.results)}\n`); bad += failed(r.results).length; }
  process.exit(bad ? 1 : 0);
}
