// The GitHub release notes of one version, cut out of CHANGELOG.md by script (no model), as QA Wrap's
// extension/tools/release-notes.mjs does. The section is bilingual already (AR + EN lines) and carries
// the agent-facing "Migration notes / ملاحظات الترحيل" block when commands, schemas or behaviour changed.
// The notes open with the section's "In 10 seconds" list (or its first bullets when it has none), so a
// reader gets the answer first; the footer names the three update paths and the MCP command.
//
//   node update/release-notes.mjs v0.6.0      prints the notes; exit 1 when the version has none
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractNotes } from './core.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MCP = 'npx -y -p github:NJ-Burrito/Business-Wrap#v<version> business-wrap-mcp';
const HEAD = '### ⚡ In 10 seconds / في عشر ثوان';

// Moves the "**In 10 seconds / …**" bullet list to the top under one heading; without one, lifts the first
// five bullets of the section into the list and leaves the section whole below it.
export function leadWithTenSeconds(notes) {
  const lines = notes.split('\n');
  const at = lines.findIndex((l) => /^\*\*In 10 seconds\b.*\*\*\s*$/i.test(l.trim()));
  if (at >= 0) {
    let end = at + 1;
    while (end < lines.length && /^\s*-\s/.test(lines[end])) end++;
    const list = lines.slice(at + 1, end);
    if (list.length) {
      const rest = [...lines.slice(0, at), ...lines.slice(end)].join('\n').replace(/\n{3,}/g, '\n\n').trim();
      return `${HEAD}\n${list.join('\n')}\n\n${rest}`;
    }
  }
  const bullets = lines.filter((l) => /^\s*-\s/.test(l)).slice(0, 5).map((l) => l.trim());
  return bullets.length ? `${HEAD}\n${bullets.join('\n')}\n\n${notes}` : notes;
}

const footer = '\n\n---\nUpdate / التحديث: `node update/cli.mjs update --apply --yes` in your install (keeps .local, design/custom, logos, fonts/custom, drafts)'
  + ' · Claude Code: `/plugin marketplace update business-wrap` then `/plugin update business-wrap`'
  + ` · MCP: \`${MCP}\`\n`;

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const version = process.argv[2];
  const notes = version ? extractNotes(fs.readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8'), version) : null;
  if (!notes) { console.error(`release-notes: no CHANGELOG section for ${version || '(no version given)'}`); process.exit(1); }
  process.stdout.write(`${leadWithTenSeconds(notes)}${footer.replace('<version>', version)}`);
}
