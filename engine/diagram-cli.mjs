// Mermaid ⇄ diagram model, from the command line.
//
//   node engine/diagram-cli.mjs --from-mermaid flow.mmd [--locale ar|en] [--out model.json]
//   node engine/diagram-cli.mjs --to-mermaid <model.json | document.json> [--out flow.mmd]
//   node engine/diagram-cli.mjs --svg <model.json> [--locale ar|en] [--out figure.svg]
//   node engine/diagram-cli.mjs --png <model.json> --out figure.png [--locale ar|en] [--scale 2]   (headless Chrome; prints the path)
//   node engine/diagram-cli.mjs --legibility <model.json> [--frame 269x140] [--min-pt 7] [--locale ar|en]   (JSON; exit 1 when not ok)
//   node engine/diagram-cli.mjs --layout <model.json> [--aspect 1.5] [--max-nodes 20] [--out model.json]   (auto layout; a big graph is split into figures)
// A document JSON gives its first diagram block. Output goes to stdout unless --out is given.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DIAGRAM } from './diagram.mjs';
import { loadTheme, userCwd, renderDiagramPng } from './export.mjs';

/** The diagram model inside a file: a bw-diagram model itself, or a document's first diagram block. */
export function modelIn(json) {
  if (json?.kind === 'bw-diagram' || Array.isArray(json?.nodes)) return json;
  for (const ch of json?.chapters || []) for (const s of ch.sections || []) for (const b of s.blocks || []) if (b.kind === 'diagram') return b.model;
  throw new Error('no diagram model in this file (expected a bw-diagram model or a document with a diagram block)');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i += 1) if (argv[i].startsWith('--')) { a[argv[i].slice(2)] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true; }
  const read = (p) => fs.readFileSync(path.resolve(userCwd(), p), 'utf8');
  let out;
  if (a['from-mermaid']) out = JSON.stringify(DIAGRAM.fromMermaid(read(a['from-mermaid']), { locale: a.locale || 'ar' }), null, 1) + '\n';
  else if (a['to-mermaid']) out = DIAGRAM.toMermaid(modelIn(JSON.parse(read(a['to-mermaid']))));
  else if (a.svg) out = DIAGRAM.render(modelIn(JSON.parse(read(a.svg))), { theme: loadTheme(a.theme && path.resolve(userCwd(), a.theme)), locale: a.locale || 'ar' }) + '\n';
  else if (a.png) {
    if (!a.out) { console.error('--png needs --out figure.png'); process.exit(2); }
    const r = await renderDiagramPng(modelIn(JSON.parse(read(a.png))), { theme: loadTheme(a.theme && path.resolve(userCwd(), a.theme)), locale: a.locale || 'ar', scale: Number(a.scale) || 2, pngPath: path.resolve(userCwd(), a.out) });
    console.log(r.png);
    if (!r.legibility.ok) console.error(`WARN legibility: min ${r.legibility.minPtPrinted} pt, ${r.legibility.small.length} small, ${r.legibility.overlaps.length} overlap(s)`);
    process.exit(0);
  } else if (a.legibility) {
    const [fw, fh] = String(a.frame || '269x140').split('x').map(Number);
    const r = DIAGRAM.legibility(modelIn(JSON.parse(read(a.legibility))), { theme: loadTheme(a.theme && path.resolve(userCwd(), a.theme)), locale: a.locale || 'ar', frameMm: [fw, fh], minPt: Number(a['min-pt']) || 7 });
    console.log(JSON.stringify(r, null, 1));
    process.exit(r.ok ? 0 : 1);
  } else if (a.layout) {
    const m = modelIn(JSON.parse(read(a.layout)));
    const opts = { force: true, aspect: Number(a.aspect) || 1.5, maxNodes: Number(a['max-nodes']) || 20, locale: a.locale || 'ar' };
    const figs = DIAGRAM.splitByPhase(m, { maxNodes: opts.maxNodes, aspect: opts.aspect, locale: opts.locale });
    out = JSON.stringify(figs.length > 1 ? figs.map((f) => ({ caption: f.caption, model: f.model })) : DIAGRAM.layout(m, opts), null, 1) + '\n';
  } else {
    console.error('usage: node engine/diagram-cli.mjs --from-mermaid f.mmd | --to-mermaid model.json | --svg model.json | --png model.json --out f.png | --legibility model.json | --layout model.json  [--locale ar|en] [--out file]');
    process.exit(2);
  }
  if (a.out) { fs.writeFileSync(path.resolve(userCwd(), a.out), out); console.log(path.resolve(userCwd(), a.out)); } else process.stdout.write(out);
}
