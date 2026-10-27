// One version everywhere (CI gate): package.json is the source; the plugin, the marketplace, the MCP
// registry entry, Smithery, the MCP READMEs and the CHANGELOG must all say the same. Mirrors the
// "tag matches manifest" + "CHANGELOG has a dated section" refusals of QA Wrap's release.yml and
// extension/tools/lib-release-guard.mjs (versionNotNew / changelogUndated).
//
//   node update/version-sync.mjs [--tag vX.Y.Z]     exit 1 and name every mismatch
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractNotes } from './core.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const j = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
const txt = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

export function mismatches(tag) {
  const v = j('package.json').version;
  const bad = [];
  const want = (where, got) => { if (got !== v) bad.push(`${where} says ${got}, package.json says ${v}`); };
  const plugin = j('.claude-plugin/plugin.json');
  want('.claude-plugin/plugin.json version', plugin.version);
  for (const [n, s] of Object.entries(plugin.mcpServers || {})) for (const a of s.args || []) { const m = /^business-wrap@(.+)$/.exec(a); if (m) want(`plugin mcpServers.${n} package`, m[1]); }
  const mk = j('.claude-plugin/marketplace.json');
  want('marketplace metadata.version', mk.metadata?.version);
  for (const p of mk.plugins || []) want(`marketplace plugin ${p.name}`, p.version);
  const srv = j('mcp/server.json');
  want('mcp/server.json version', srv.version);
  for (const p of srv.packages || []) want(`mcp/server.json package ${p.identifier}`, p.version);
  for (const f of ['mcp/smithery.yaml', 'mcp/README.md', 'mcp/README.ar.md']) for (const m of txt(f).matchAll(/business-wrap@(\d+\.\d+\.\d+)/g)) want(f, m[1]);
  if (!extractNotes(txt('CHANGELOG.md'), v)) bad.push(`CHANGELOG.md has no section for ${v}`);
  if (tag && tag.replace(/^v/, '') !== v) bad.push(`tag ${tag} does not match package.json ${v}`);
  return { version: v, bad };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf('--tag');
  const { version, bad } = mismatches(i > 0 ? process.argv[i + 1] : '');
  if (bad.length) { for (const b of bad) console.error(`FAIL  version-sync: ${b}`); process.exit(1); }
  console.log(`PASS  version-sync: ${version} in package.json, plugin, marketplace, MCP registry, Smithery, READMEs, CHANGELOG`);
}
