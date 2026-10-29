#!/usr/bin/env node
// business-wrap-mcp: the Business-Wrap MCP server over stdio.
import { StdioServerTransport } from './vendor/sdk.mjs';
import { createServer } from './server.mjs';

import { checkForUpdate } from '../update/check.mjs';

// cached (one request a day at most), bounded to 4 s so a slow network never delays the client
const update = await Promise.race([checkForUpdate().catch(() => null), new Promise((r) => setTimeout(() => r(null), 4000))]);
await createServer({ update }).connect(new StdioServerTransport());
