// Mermaid ⇄ diagram model, from the command line.
//
//   node engine/diagram-cli.mjs --from-mermaid flow.mmd [--locale ar|en] [--out model.json]
//   node engine/diagram-cli.mjs --to-mermaid <model.json | document.json> [--out flow.mmd]
//   node engine/diagram-cli.mjs --svg <model.json> [--locale ar|en] [--out figure.svg]
//   node engine/diagram-cli.mjs --png <model.json> --out figure.png [--locale ar|en] [--scale 2]   (headless Chrome; prints the path)
//   node engine/diagram-cli.mjs --legibility <model.json> [--frame 255.9x116] [--min-pt 7] [--locale ar|en]   (JSON, with the arrow overlap and crossing counts; exit 1 when not ok; no --frame = what print gives)
//   node engine/diagram-cli.mjs --auto-layout <model.json> [--aspect 2.2] [--max-nodes 20] [--frame WxH] [--out result.json]   (0.16.0: lays out, rates against the print frame, cuts into legible figures when it must; JSON; exit 1 when not ok)
//   node engine/diagram-cli.mjs --apply-routing <model.json> [--out model.json]   (0.16.0: the same drawing with arrows that never lie on each other)
//   node engine/diagram-cli.mjs --layout <model.json> [--aspect 1.5] [--max-nodes 20] [--out model.json]   (auto layout; a big graph is split into figures)
// A document JSON gives its first diagram block. Output goes to stdout unless --out is given.
// A model may be given by file path anywhere a model is read: {"$file": "path/to/model.json"} (relative to the working directory).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DIAGRAM } from './diagram.mjs';
import { loadTheme, userCwd, renderDiagramPng } from './export.mjs';

/** 0.16.0 · A value given by file path: {"$file": "path"} is the parsed JSON of that file (one level; the file's own refs are not followed). Anything else is returned as it is. */
export function fileRef(value, baseDir = userCwd()) {
  if (value && typeof value === 'object' && !Array.isArray(value) && typeof value.$file === 'string' && Object.keys(value).length === 1) {
    return JSON.parse(fs.readFileSync(path.resolve(baseDir, value.$file), 'utf8'));
  }
  return value;
}

/** The diagram model inside a file: a bw-diagram model itself, or a document's first diagram block. */
export function modelIn(json0) {
  const json = fileRef(json0);
  if (json?.kind === 'bw-diagram' || Array.isArray(json?.nodes)) return json;
  for (const ch of json?.chapters || []) for (const s of ch.sections || []) for (const b of s.blocks || []) if (b.kind === 'diagram') return fileRef(b.model);
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
    const fm = a.frame ? String(a.frame).split('x').map(Number) : null;
    const r = DIAGRAM.legibility(modelIn(JSON.parse(read(a.legibility))), { theme: loadTheme(a.theme && path.resolve(userCwd(), a.theme)), locale: a.locale || 'ar', ...(fm ? { frameMm: fm } : {}), minPt: Number(a['min-pt']) || 7 });
    console.log(JSON.stringify(r, null, 1));
    process.exit(r.ok ? 0 : 1);
  } else if (a['auto-layout']) {
    const fm = a.frame ? String(a.frame).split('x').map(Number) : null;
    const r = DIAGRAM.autoLayout(modelIn(JSON.parse(read(a['auto-layout']))), { theme: loadTheme(a.theme && path.resolve(userCwd(), a.theme)), locale: a.locale || 'ar', aspect: Number(a.aspect) || undefined, maxNodes: Number(a['max-nodes']) || 20, ...(fm ? { frameMm: fm } : {}), minPt: Number(a['min-pt']) || 7 });
    out = JSON.stringify(r, null, 1) + '\n';
    if (a.out) { fs.writeFileSync(path.resolve(userCwd(), a.out), out); console.log(path.resolve(userCwd(), a.out)); } else process.stdout.write(out);
    process.exit(r.ok ? 0 : 1);
  } else if (a['apply-routing']) {
    out = JSON.stringify(DIAGRAM.applyRouting(modelIn(JSON.parse(read(a['apply-routing'])))), null, 1) + '\n';
  } else if (a.layout) {
    const m = modelIn(JSON.parse(read(a.layout)));
    const opts = { force: true, aspect: Number(a.aspect) || 1.5, maxNodes: Number(a['max-nodes']) || 20, locale: a.locale || 'ar' };
    const figs = DIAGRAM.splitByPhase(m, { maxNodes: opts.maxNodes, aspect: opts.aspect, locale: opts.locale });
    out = JSON.stringify(figs.length > 1 ? figs.map((f) => ({ caption: f.caption, model: f.model })) : DIAGRAM.layout(m, opts), null, 1) + '\n';
  } else {
    console.error('usage: node engine/diagram-cli.mjs --from-mermaid f.mmd | --to-mermaid model.json | --svg model.json | --png model.json --out f.png | --legibility model.json | --auto-layout model.json | --apply-routing model.json | --layout model.json  [--locale ar|en] [--out file]');
    process.exit(2);
  }
  if (a.out) { fs.writeFileSync(path.resolve(userCwd(), a.out), out); console.log(path.resolve(userCwd(), a.out)); } else process.stdout.write(out);
}
