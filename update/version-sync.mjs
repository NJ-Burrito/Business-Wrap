// One version everywhere (CI gate): package.json is the source; the plugin, the marketplace, the MCP
// registry entry, Smithery, the MCP READMEs and the CHANGELOG must all say the same. Mirrors the
// "tag matches manifest" + "CHANGELOG has a dated section" refusals of QA Wrap's release.yml and
// extension/tools/lib-release-guard.mjs (versionNotNew / changelogUndated).
//
//   node update/version-sync.mjs [--tag vX.Y.Z]     check: exit 1 and name every mismatch (CI; the default)
//   node update/version-sync.mjs --check            same, explicit
//   npm run version:sync                            WRITE: copy package.json's version into every generated copy
//                                                   (plugin, marketplace, MCP registry, package-lock, pinned refs in
//                                                   Smithery and READMEs, then rebuild the site), then check.
//                                                   CHANGELOG.md headings stay human-written. A bump is one edit
//                                                   (package.json "version") plus this command.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { extractNotes } from './core.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const j = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
const txt = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const put = (f, s) => fs.writeFileSync(path.join(ROOT, f), s);
const PIN_FILES = ['mcp/smithery.yaml', 'mcp/README.md', 'mcp/README.ar.md', 'README.md', 'README.ar.md'];

export function mismatches(tag) {
  const v = j('package.json').version;
  const bad = [];
  const want = (where, got) => { if (got !== v) bad.push(`${where} says ${got}, package.json says ${v}`); };
  const plugin = j('.claude-plugin/plugin.json');
  want('.claude-plugin/plugin.json version', plugin.version);
  // The plugin MCP server launches a pinned release: its own files (${CLAUDE_PLUGIN_ROOT}/mcp/cli.mjs, so the plugin's
  // version is the server's), the npm package business-wrap@X.Y.Z, or the GitHub tag github:NJ-Burrito/Business-Wrap#vX.Y.Z.
  let launchRefs = 0;
  for (const [n, s] of Object.entries(plugin.mcpServers || {})) for (const a of s.args || []) {
    const m = /^business-wrap@(.+)$/.exec(a); if (m) { launchRefs++; want(`plugin mcpServers.${n} npm package`, m[1]); }
    const g = /^github:NJ-Burrito\/Business-Wrap#v(.+)$/.exec(a); if (g) { launchRefs++; want(`plugin mcpServers.${n} git tag`, g[1]); }
    if (a === '${CLAUDE_PLUGIN_ROOT}/mcp/cli.mjs') launchRefs++; // the plugin's own copy: its version is plugin.json's
  }
  if (!launchRefs) bad.push('plugin mcpServers has no pinned launch ref (business-wrap@X.Y.Z or github:NJ-Burrito/Business-Wrap#vX.Y.Z)');
  const mk = j('.claude-plugin/marketplace.json');
  want('marketplace metadata.version', mk.metadata?.version);
  for (const p of mk.plugins || []) want(`marketplace plugin ${p.name}`, p.version);
  const srv = j('mcp/server.json');
  want('mcp/server.json version', srv.version);
  for (const p of srv.packages || []) want(`mcp/server.json package ${p.identifier}`, p.version);
  for (const f of PIN_FILES) for (const m of txt(f).matchAll(/business-wrap@(\d+\.\d+\.\d+)|Business-Wrap#v(\d+\.\d+\.\d+)/g)) want(f, m[1] || m[2]);
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

// Write mode: every generated copy takes package.json's version. Returns the files it changed.
export function writeAll() {
  const v = j('package.json').version;
  const changed = [];
  const save = (f, next, prev) => { if (next !== prev) { put(f, next); changed.push(f); } };
  const json = (f, edit) => { const prev = txt(f); const o = JSON.parse(prev); edit(o); let out = JSON.stringify(o, null, 2) + (/\n$/.test(prev) ? '\n' : ''); if (prev.includes('\r\n')) out = out.replace(/\r?\n/g, '\r\n'); save(f, out, prev); };
  json('.claude-plugin/plugin.json', (o) => {
    o.version = v;
    for (const s of Object.values(o.mcpServers || {})) s.args = (s.args || []).map((a) => a.replace(/^business-wrap@.+$/, `business-wrap@${v}`).replace(/^(github:NJ-Burrito\/Business-Wrap#v).+$/, `$1${v}`));
  });
  json('.claude-plugin/marketplace.json', (o) => { if (o.metadata) o.metadata.version = v; for (const p of o.plugins || []) p.version = v; });
  json('mcp/server.json', (o) => { o.version = v; for (const p of o.packages || []) p.version = v; });
  json('package-lock.json', (o) => { o.version = v; if (o.packages?.['']) o.packages[''].version = v; });
  for (const f of PIN_FILES) { const prev = txt(f); save(f, prev.replace(/(business-wrap@)\d+\.\d+\.\d+/g, `$1${v}`).replace(/(Business-Wrap#v)\d+\.\d+\.\d+/g, `$1${v}`), prev); }
  // The site is built from package.json ({{version}}), so rebuild it instead of patching html.
  const b = spawnSync(process.execPath, [path.join(ROOT, 'tools/site/build.mjs')], { cwd: ROOT, encoding: 'utf8' });
  if (b.status !== 0) { console.error(`FAIL  version-sync: site build failed\n${b.stdout}${b.stderr}`); process.exit(1); }
  changed.push('site/** (tools/site/build.mjs)');
  return { version: v, changed };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf('--tag');
  if (process.argv.includes('--write') && !process.argv.includes('--check') && i < 0) {
    const { version, changed } = writeAll();
    console.log(`WROTE version-sync: ${version} -> ${changed.length ? changed.join(', ') : 'nothing to change'}`);
  }
  const { version, bad } = mismatches(i > 0 ? process.argv[i + 1] : '');
  if (bad.length) { for (const b of bad) console.error(`FAIL  version-sync: ${b}`); process.exit(1); }
  console.log(`PASS  version-sync: ${version} in package.json, plugin, plugin MCP launch business-wrap@${version}, marketplace, MCP registry, Smithery, READMEs, site and JSON-LD, CHANGELOG`);
}
