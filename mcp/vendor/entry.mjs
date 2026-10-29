// The only third-party code the MCP server needs, bundled into sdk.mjs by `npm run vendor:mcp` so the
// plugin starts from a fresh clone with no node_modules and no npm registry.
export { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
export { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
export { z } from 'zod';
