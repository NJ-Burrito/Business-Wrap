// 0.15.2: the live-editor slash commands. Every commands/*.md has front-matter with a description and allowed-tools;
// each allowed tool is a Claude Code built-in, Bash(node:*), or an MCP tool the server really registers (parsed from
// mcp/server.mjs and mcp/editor-tools.mjs, named as the plugin exposes it); every command is listed in both READMEs.
//
//   node tests/commands-0152.test.mjs
import './_isolate.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (...p) => fs.readFileSync(path.join(REPO, ...p), 'utf8').replace(/\r\n/g, '\n');
const results = []; let failed = 0;
const check = (name, ok, detail = '') => { results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); if (!ok) failed += 1; };

const tools = new Set([...read('mcp', 'server.mjs').matchAll(/registerTool\('([a-z_]+)'/g), ...read('mcp', 'editor-tools.mjs').matchAll(/registerTool\('([a-z_]+)'/g)].map((m) => m[1]));
check('parsed the MCP tool list', tools.size >= 20 && tools.has('editor_ops') && tools.has('render_diagram'), `${tools.size} tools`);
const plugin = JSON.parse(read('.claude-plugin', 'plugin.json'));
const server = Object.keys(plugin.mcpServers)[0];
const PREFIX = `mcp__plugin_${plugin.name}_${server}__`;
const BUILTIN = new Set(['Read', 'Grep', 'Glob', 'Bash(node:*)']);
const readmes = { 'README.md': read('README.md'), 'README.ar.md': read('README.ar.md') };

const files = fs.readdirSync(path.join(REPO, 'commands')).filter((f) => f.endsWith('.md')).sort();
for (const want of ['tabs', 'outline', 'edit', 'proofread', 'check', 'diagram', 'explain', 'action']) check(`/business-wrap:${want} exists`, files.includes(`${want}.md`));
for (const f of files) {
  const name = f.replace(/\.md$/, '');
  const src = read('commands', f);
  const fm = /^---\n([^]*?)\n---\n/.exec(src);
  check(`${f}: has front-matter`, !!fm);
  const meta = Object.fromEntries((fm?.[1] || '').split('\n').map((l) => l.split(/:\s(.*)/s)).filter((p) => p.length > 1).map(([k, v]) => [k.trim(), v.trim()]));
  check(`${f}: description`, (meta.description || '').length > 20, meta.description);
  check(`${f}: argument-hint present`, 'argument-hint' in meta || name === 'close' || name === 'status' || name === 'doctor');
  const allowed = (meta['allowed-tools'] || '').split(/,\s*/).filter(Boolean);
  check(`${f}: allowed-tools set`, allowed.length > 0, meta['allowed-tools']);
  const bad = allowed.filter((t) => !(BUILTIN.has(t) || (t.startsWith(PREFIX) && tools.has(t.slice(PREFIX.length)))));
  check(`${f}: allowed-tools name only real tools`, !bad.length, bad.join(', '));
  check(`${f}: no Write/Edit/Agent or bare Bash`, !allowed.some((t) => /^(Write|Edit|Agent|Bash)$/.test(t)));
  for (const [rn, r] of Object.entries(readmes)) check(`${f}: listed in ${rn}`, r.includes(`/business-wrap:${name}`));
}
// the editing commands follow the contract: one editor_ops batch, signed as the agent, undo stated
for (const f of ['edit.md', 'proofread.md']) { const s = read('commands', f); check(`${f}: ONE editor_ops batch + agent + Ctrl+Z`, /ONE `editor_ops`/.test(s) && /agent:/.test(s) && /Ctrl\+Z/.test(s)); }
check('action.md lists exactly the editor_action allow-list', (() => { const m = /EDITOR_ACTIONS = \[([^\]]+)\]/.exec(read('mcp', 'editor-tools.mjs')); const acts = m[1].match(/'(\w+)'/g).map((x) => x.slice(1, -1)); const s = read('commands', 'action.md'); return acts.every((a) => s.includes('`' + a + '`')); })());

console.log(results.join('\n'));
console.log(`\n${failed ? 'FAILED' : 'ALL PASS'}: ${results.length - failed}/${results.length}`);
process.exit(failed ? 1 : 0);
