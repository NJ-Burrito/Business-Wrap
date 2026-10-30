#!/usr/bin/env node
// business-wrap-mcp: the Business-Wrap MCP server over stdio.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);

if (args.includes('--version') || args.includes('-v')) {
  console.log(JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version);
} else if (args.includes('--help') || args.includes('-h') || args.length) {
  const unknown = args.filter((a) => a !== '--help' && a !== '-h');
  const usage = `business-wrap-mcp: the Business-Wrap MCP server (stdio transport, local only, no network port)

Run by an MCP client, which talks to it over stdin/stdout. Add it to the client's config, for example (.mcp.json):

  { "mcpServers": { "business-wrap": { "command": "node", "args": ["${path.join(ROOT, 'mcp', 'cli.mjs').replace(/\\/g, '/')}"] } } }

  business-wrap-mcp --help       this text
  business-wrap-mcp --version    the installed version`;
  if (unknown.length) { console.error(`business-wrap-mcp: unknown option ${unknown.join(' ')}\n\n${usage}`); process.exitCode = 2; } else console.log(usage);
} else {
  const { StdioServerTransport } = await import('./vendor/sdk.mjs');
  const { createServer } = await import('./server.mjs');
  const { checkForUpdate } = await import('../update/check.mjs');
  // cached (one request a day at most), bounded to 4 s so a slow network never delays the client
  const update = await Promise.race([checkForUpdate().catch(() => null), new Promise((r) => setTimeout(() => r(null), 4000))]);
  await createServer({ update }).connect(new StdioServerTransport());
}
