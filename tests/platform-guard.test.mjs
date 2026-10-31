// Static guard: a test must not call a Windows-only thing unless it is behind a win32 check.
// The CI runs on Linux; a Windows-only call that is not guarded fails there only (the 0.15.0 fix rounds).
// Flags, in tests/**/*.mjs and mcp/test/**/*.mjs: powershell/pwsh, Expand-Archive, msedge.exe or an
// "Edge\Application" path, a drive path (C:\ or C:/), and a double-backslash path between two path parts.
// A hit is fine when a win32 check is on the same line or in the 15 lines above it, or the file opens with a
// "platform !== 'win32'" early exit. Anything else: add the check, or put `// platform-guard: ok <why>` on the line.
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BS = String.fromCharCode(92);
const RULES = [
  ['powershell/pwsh', /\b(powershell|pwsh)(\.exe)?\b/i],
  ['Expand-Archive', /Expand-Archive/i],
  ['msedge.exe / Edge install path', new RegExp('msedge\\.exe|Edge' + BS + BS + '?[\\\\/]Application', 'i')],
  ['drive path', new RegExp('\\b[A-Za-z]:(' + BS + BS + '{1,2}|/)[A-Za-z$%]')],
  ['backslash path', new RegExp('[\\w.-]' + BS + BS + BS + BS + '[\\w.-]')],
];
// A drive path or a backslash path only breaks Linux when it reaches the file system or a process, so those two rules
// need such a call on the same line. Test labels (the first string of check(...) / ok(...)) are text, never scanned.
const FS_CALL = /fs\.|Sync\(|spawn|exec|join\(|resolve\(|readFile|writeFile|mkdir|existsSync|import\(|new URL\(|pathToFileURL|path\./;
const NEEDS_FS = new Set(['drive path', 'backslash path']);
// Known hits from before this guard existed, each read and found harmless on Linux (called only under a win32 check
// further down, a mock compared by name, zip-slip bytes written as data, a candidate list that is only existsSync-probed).
// Never add to this list: guard the new call or annotate its line. Shrink it when one of these is cleaned up.
const BASELINE = new Set([
  'tests/power.test.mjs|powershell/pwsh',
  'tests/print.test.mjs|powershell/pwsh',
  'tests/projects-io.test.mjs|backslash path',
  'tests/projects-zip.test.mjs|backslash path',
  'tests/projects-zip.test.mjs|drive path',
  'tests/spell-helper.mjs|msedge.exe / Edge install path',
]);
const GUARD = /win32|\bisWin\b|\bIS_WIN\b|IsWindows|isWindows/;
const OK = /platform-guard:\s*ok/;

const files = [];
for (const dir of ['tests', 'mcp/test']) {
  const abs = join(ROOT, dir);
  if (!existsSync(abs)) continue;
  for (const f of readdirSync(abs)) if (f.endsWith('.mjs') && f !== 'platform-guard.test.mjs') files.push(join(abs, f));
}

const hits = [];
export function scan(text, name) {
  const lines = text.split('\n');
  // the whole file is Windows-only when it bails out early on other platforms
  const head = lines.slice(0, 40).join('\n');
  if (/platform\s*!==?\s*['"]win32['"][^\n]*\b(exit|return|skip)/i.test(head)) return [];
  const out = [];
  lines.forEach((line, i) => {
    const code = line.trim();
    if (code.startsWith('//') || code.startsWith('*') || OK.test(line)) return;
    const scan = line.replace(/^(\s*)(check|ok)\(\s*(['"`])(?:\\.|(?!\3).)*\3/, '$1$2(');
    for (const [label, re] of RULES) {
      if (!re.test(scan)) continue;
      if (NEEDS_FS.has(label) && !FS_CALL.test(scan)) continue;
      const from = Math.max(0, i - 15);
      if (lines.slice(from, i + 1).some((l) => GUARD.test(l))) continue;
      if (BASELINE.has(name + '|' + label)) break;
      out.push(`${name}:${i + 1}  ${label}: ${code.slice(0, 110)}`);
      break;
    }
  });
  return out;
}

for (const f of files) hits.push(...scan(readFileSync(f, 'utf8'), relative(ROOT, f).split(BS).join('/')));

// self-check, so a broken regex cannot pass silently (the probe must see known-true and known-false samples)
const bad = scan("const r = spawn('powershell', ['-c', 'x']);", 'probe').length === 1;
const ok = scan("if (process.platform === 'win32') {\n  spawn('powershell', []);\n}", 'probe').length === 0;
const drive = scan("fs.readFileSync('C:" + BS + BS + "Users" + BS + BS + "x';", 'probe').length === 1;
const fine = scan("const p = join(tmp, 'a/b');", 'probe').length === 0;
if (!(bad && ok && drive && fine)) { console.log('FAIL  platform-guard self-check', { bad, ok, drive, fine }); process.exit(1); }

if (hits.length) {
  console.log(`FAIL  ${hits.length} Windows-only call(s) in tests with no win32 guard (CI is Linux):`);
  for (const h of hits) console.log('  ' + h);
  process.exit(1);
}
console.log(`ok    platform-guard: ${files.length} test files, no unguarded Windows-only calls`);
