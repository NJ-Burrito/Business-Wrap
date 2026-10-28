// Back-compat golden (WP2, 0.13.0): sha256 of the print HTML (no font CSS) and of the Chrome header/footer
// templates for every sample with no new field, as 0.12.0 rendered them. `node tests/fixtures/doc-model/golden.mjs --write`
// rewrites golden.json (only ever from the 0.12.0 tree); without it, prints the current hashes.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { renderDocument, chromeTemplates } from '../../../engine/render.mjs';
import { loadTheme, i18n, REPO } from '../../../engine/export.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
export function hashes() {
  const theme = loadTheme();
  const out = {};
  for (const s of ['event-permit', 'blank']) for (const locale of ['ar', 'en']) {
    const doc = JSON.parse(fs.readFileSync(path.join(REPO, 'samples', s, `document.${locale}.json`), 'utf8'));
    const labels = i18n().doc[locale];
    const html = renderDocument(doc, { locale, labels, theme, fontCss: '', logos: theme.logos });
    const ch = chromeTemplates(doc, { theme, labels, locale, fontCss: '', logos: theme.logos });
    out[`${s}.${locale}`] = { html: sha(html), header: sha(ch.header), footer: sha(ch.footer) };
  }
  return out;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const h = hashes();
  if (process.argv.includes('--write')) fs.writeFileSync(path.join(HERE, 'golden.json'), JSON.stringify(h, null, 1) + '\n');
  if (!process.argv.includes("--check")) console.log(JSON.stringify(h, null, 1));
}
/** [key, field] pairs that differ from golden.json. */
export function goldenDiff() {
  const want = JSON.parse(fs.readFileSync(path.join(HERE, 'golden.json'), 'utf8'));
  const got = hashes();
  return Object.entries(want).flatMap(([k, v]) => Object.keys(v).filter((f) => got[k]?.[f] !== v[f]).map((f) => `${k}.${f}`));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) && process.argv.includes('--check')) {
  const d = goldenDiff();
  console.log(d.length ? `GOLDEN DIFF: ${d.join(', ')}` : 'GOLDEN SAME');
  process.exit(d.length ? 1 : 0);
}
