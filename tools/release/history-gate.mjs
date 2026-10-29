// Release gate: a version may not ship unless its saved file is a fixture and every earlier fixture still opens whole.
//   node tools/release/history-gate.mjs [vX.Y.Z]      (the tag, default: package.json's version) — exit 1 with the reasons
// Run by .github/workflows/gates.yml (every push) and release.yml (before the release is cut); pure node, no browser.
// The browser half (open in the editor, import into the library) is tests/history-compat.test.mjs, part of `npm test`.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rewrapEditorHtml } from '../../engine/build-editor.mjs';
import { historyProblems, FORMAT, MIGRATIONS } from '../../engine/format.mjs';
import { describe, dataOf, fixtureDir, readFixture } from '../fixtures/history.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** → problem strings ([] = the gate passes). */
export async function gate(repo = REPO, version = JSON.parse(fs.readFileSync(path.join(repo, 'package.json'), 'utf8')).version) {
  const out = [];
  const dir = fixtureDir(repo);
  const have = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.html.gz')).map((f) => f.slice(0, -8)) : [];
  if (!have.includes(version)) out.push(`no fixture tests/fixtures/history/${version}.html.gz — run \`npm run fixture:history\` with this version's build, commit it, then tag`);
  for (let n = 0; n < FORMAT; n += 1) if (typeof MIGRATIONS[n] !== 'function') out.push(`file format ${FORMAT} but no migration ${n} → ${n + 1} in engine/format.mjs`);
  for (const v of have) {
    const exp = path.join(dir, `${v}.expect.json`);
    if (!fs.existsSync(exp)) { out.push(`${v}: no ${v}.expect.json beside the fixture`); continue; }
    const html = readFixture(repo, v);
    const old = dataOf(html);
    const want = JSON.parse(fs.readFileSync(exp, 'utf8'));
    if (old.version !== v) out.push(`${v}: the fixture was made by ${old.version}, not ${v}`);
    if (JSON.stringify(await describe(html)) !== JSON.stringify(want)) out.push(`${v}: expect.json does not describe the fixture`);
    let neu;
    try { neu = rewrapEditorHtml(html); } catch (e) { out.push(`${v}: opening it in this build fails: ${e.message}`); continue; }
    const lost = historyProblems(old, dataOf(neu));
    if (lost.length) out.push(`${v}: opened in this build it loses ${lost.slice(0, 3).join('; ')}`);
    const after = await describe(neu);
    if (JSON.stringify(after.services) !== JSON.stringify(want.services) || JSON.stringify(after.logs) !== JSON.stringify(want.logs)) out.push(`${v}: history differs after opening (ops/marks/log entries)`);
  }
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const tag = process.argv[2];
  const problems = await gate(REPO, tag ? tag.replace(/^v/, '') : undefined);
  if (problems.length) { console.error(`history gate FAILED:\n- ${problems.join('\n- ')}`); process.exit(1); }
  console.log('history gate: ok');
}
