#!/usr/bin/env node
// business-wrap-mcp: the Business-Wrap MCP server over stdio.
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server.mjs';

await createServer().connect(new StdioServerTransport());
