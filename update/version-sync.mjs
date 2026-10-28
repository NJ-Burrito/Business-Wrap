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
  // The plugin MCP server launches a pinned release: the npm package business-wrap@X.Y.Z, or the GitHub tag
  // github:NJ-Burrito/Business-Wrap#vX.Y.Z. Exactly this version, never a range.
  let launchRefs = 0;
  for (const [n, s] of Object.entries(plugin.mcpServers || {})) for (const a of s.args || []) {
    const m = /^business-wrap@(.+)$/.exec(a); if (m) { launchRefs++; want(`plugin mcpServers.${n} npm package`, m[1]); }
    const g = /^github:NJ-Burrito\/Business-Wrap#v(.+)$/.exec(a); if (g) { launchRefs++; want(`plugin mcpServers.${n} git tag`, g[1]); }
  }
  if (!launchRefs) bad.push('plugin mcpServers has no pinned launch ref (business-wrap@X.Y.Z or github:NJ-Burrito/Business-Wrap#vX.Y.Z)');
  const mk = j('.claude-plugin/marketplace.json');
  want('marketplace metadata.version', mk.metadata?.version);
  for (const p of mk.plugins || []) want(`marketplace plugin ${p.name}`, p.version);
  const srv = j('mcp/server.json');
  want('mcp/server.json version', srv.version);
  for (const p of srv.packages || []) want(`mcp/server.json package ${p.identifier}`, p.version);
  for (const f of ['mcp/smithery.yaml', 'mcp/README.md', 'mcp/README.ar.md', 'README.md', 'README.ar.md']) for (const m of txt(f).matchAll(/business-wrap@(\d+\.\d+\.\d+)|Business-Wrap#v(\d+\.\d+\.\d+)/g)) want(f, m[1] || m[2]);
  // The built site and its JSON-LD (tools/site/build.mjs fills {{version}} from package.json): a hand edit or a
  // stale build fails here. Only version-shaped text next to a version word is read, so 127.0.0.1 never counts.
  const siteRe = /"softwareVersion":"([^"]+)"|\bv(\d+\.\d+\.\d+)\b|الإصدار (\d+\.\d+\.\d+)|Business-Wrap (\d+\.\d+\.\d+)|بزنس راب (\d+\.\d+\.\d+)/g;
  for (const f of ['site/index.html', 'site/ar/index.html', 'site/privacy.html', 'site/ar/privacy.html']) {
    if (!fs.existsSync(path.join(ROOT, f))) { bad.push(`${f} is missing (run node tools/site/build.mjs)`); continue; }
    let n = 0;
    for (const m of txt(f).matchAll(siteRe)) { n++; want(f, m.slice(1).find(Boolean)); }
    if (f.endsWith('index.html') && !/"softwareVersion":"/.test(txt(f))) bad.push(`${f} has no JSON-LD softwareVersion`);
    if (!n) bad.push(`${f} names no version`);
  }
  if (!/"softwareVersion": "\{\{version\}\}"/.test(txt('tools/site/pages/index.ld.json'))) bad.push('tools/site/pages/index.ld.json softwareVersion is not {{version}}');
  if (!extractNotes(txt('CHANGELOG.md'), v)) bad.push(`CHANGELOG.md has no section for ${v}`);
  if (tag && tag.replace(/^v/, '') !== v) bad.push(`tag ${tag} does not match package.json ${v}`);
  return { version: v, bad };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf('--tag');
  const { version, bad } = mismatches(i > 0 ? process.argv[i + 1] : '');
  if (bad.length) { for (const b of bad) console.error(`FAIL  version-sync: ${b}`); process.exit(1); }
  console.log(`PASS  version-sync: ${version} in package.json, plugin, plugin MCP launch business-wrap@${version}, marketplace, MCP registry, Smithery, READMEs, site and JSON-LD, CHANGELOG`);
}
