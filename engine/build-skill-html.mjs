// Builds the editor that ships inside the skill: assets/editor/business-wrap.html.
// It opens on a blank document (samples/blank), carries the anonymised sample (samples/event-permit),
// and opens any document JSON through Import. Fonts are named, never embedded and never pathed
// (src: local(), the installed system fonts), so the file holds no machine path and no font bytes.
//
//   node engine/build-skill-html.mjs           # write it
//   node engine/build-skill-html.mjs --check   # exit 1 if the shipped file is stale
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildEditor } from './build-editor.mjs';
import { REPO } from './export.mjs';

export const SKILL_HTML = path.join(REPO, 'assets', 'editor', 'business-wrap.html');

export function buildSkillHtml(out = SKILL_HTML) {
  return buildEditor({
    inputs: [path.join(REPO, 'samples', 'blank'), path.join(REPO, 'samples', 'event-permit')],
    out,
    set: 'business-wrap',
    localFonts: true,
    watermarkDir: path.join(REPO, 'editor', 'brand', 'watermark'),
    ui: 'ar',
  });
}

const check = process.argv.includes('--check');
const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'bw-skill-')), 'business-wrap.html');
const r = buildSkillHtml(check ? tmp : SKILL_HTML);
if (check) {
  const fresh = fs.readFileSync(tmp, 'utf8');
  const shipped = fs.existsSync(SKILL_HTML) ? fs.readFileSync(SKILL_HTML, 'utf8').replace(/\r\n/g, '\n') : '';
  fs.rmSync(path.dirname(tmp), { recursive: true, force: true });
  if (fresh !== shipped) {
    console.error('FAIL  assets/editor/business-wrap.html is stale: run npm run skill-html and commit it');
    process.exit(1);
  }
  console.log(`PASS  assets/editor/business-wrap.html is current (${(Buffer.byteLength(fresh) / 1024).toFixed(0)} KB, services=${r.services.join(',')})`);
} else {
  console.log(`skill-html  ${path.relative(REPO, r.out)}  services=${r.services.join(',')}  fonts=local()  ${(r.bytes / 1024).toFixed(0)} KB`);
}
