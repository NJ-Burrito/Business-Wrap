// The GitHub release notes of one version, cut out of CHANGELOG.md by script (no model), as QA Wrap's
// extension/tools/release-notes.mjs does. The section is bilingual already (AR + EN lines) and carries
// the agent-facing "Migration notes / ملاحظات الترحيل" block when commands, schemas or behaviour changed.
//
//   node update/release-notes.mjs v0.6.0      prints the section; exit 1 when the version has none
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractNotes } from './core.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const version = process.argv[2];
const notes = version ? extractNotes(fs.readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8'), version) : null;
if (!notes) { console.error(`release-notes: no CHANGELOG section for ${version || '(no version given)'}`); process.exit(1); }
process.stdout.write(`${notes}\n\n---\nUpdate / التحديث: \`npx business-wrap update --apply --yes\` (keeps .local, design/custom, logos, fonts/custom, drafts) · Claude Code: \`/plugin update business-wrap\`\n`);
