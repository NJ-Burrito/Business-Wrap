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
  // 0.15.0: connect FIRST. The client's handshake never waits for a network call, a migration or an update check.
  const { logLine, startupFacts, sinceStart, cachedUpdate } = await import('./startup.mjs');
  logLine('start', startupFacts({ ms: sinceStart() }));
  // 0.15.3 T10: one stray exception (a late callback, a lazily imported module) must not end the connection: the client would show "not connected" until the
  // owner reloads. It is logged and the server goes on; only a storm (8 in a minute) or a client that is gone ends it.
  const crashes = [];
  process.on('uncaughtException', (e) => {
    logLine('error', { phase: 'uncaught', message: String(e?.stack || e), ms: sinceStart() });
    console.error(e);
    crashes.push(Date.now());
    while (crashes.length && Date.now() - crashes[0] > 60000) crashes.shift();
    if (crashes.length >= 8) { logLine('error', { phase: 'storm', message: '8 uncaught errors in a minute: exiting' }); process.exit(1); }
  });
  const left = (why) => { logLine('client-left', { why, ms: sinceStart() }); process.exit(0); };
  process.stdout.on('error', () => left('stdout closed'));
  process.stdin.on('end', () => left('stdin ended'));
  process.on('unhandledRejection', (e) => { logLine('error', { phase: 'rejection', message: String(e?.stack || e), ms: sinceStart() }); });
  const { StdioServerTransport } = await import('./vendor/sdk.mjs');
  const { createServer } = await import('./server.mjs');
  const { migrateLocal } = await import('../engine/testguard.mjs');
  const { update, ageMs } = await cachedUpdate(); // the cache only: no request here
  const migration = migrateLocal(ROOT).then((r) => { if (r.migrated || r.reason === 'nothing-to-move' || !/^(not-plugin-data|target-exists)$/.test(r.reason || '')) logLine('migrate', r); return r; });
  const server = createServer({ update, ready: migration });
  server.server.oninitialized = () => logLine('initialize', { ms: sinceStart(), updateCacheAgeMs: ageMs });
  server.server.onerror = (e) => logLine('error', { phase: 'protocol', message: String(e?.message || e), ms: sinceStart() });
  await server.connect(new StdioServerTransport());
  logLine('connected', { ms: sinceStart() });
  // a plugin update or reinstall replaces the folder under this server: say so in the log and on the tool list at once (every tool already answers RESTART_REQUIRED)
  const loaded = (await import('./startup.mjs')).installedVersion();
  const drift = setInterval(async () => {
    const { installedVersion } = await import('./startup.mjs');
    const now = installedVersion();
    if (now !== loaded) { clearInterval(drift); logLine('drift', { loaded, installed: now, ms: sinceStart() }); server.sendToolListChanged?.().catch(() => {}); }
  }, 20000);
  drift.unref();
  if (process.env.BW_TEST_MODE === '1' && process.env.BW_MCP_THROW_AFTER_MS) setTimeout(() => { throw new Error('test: a stray exception'); }, Number(process.env.BW_MCP_THROW_AFTER_MS)).unref();
  // the refresh runs after the handshake; a newer release shows on the next tool result (decorate), never delays startup
  import('../update/check.mjs').then(({ checkForUpdate }) => checkForUpdate()).then((u) => server.bwSetUpdate?.(u)).catch(() => {});
}
