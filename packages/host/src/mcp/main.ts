import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { DEFAULT_PORT } from '@figma-mcp/core';
import { BridgeClient } from './client.js';
import { registerTools } from './tools.js';

const client = new BridgeClient(Number(process.env.FIGMA_BRIDGE_PORT ?? DEFAULT_PORT));
await client.connect();

const server = new McpServer({ name: 'figma-mcp-bridge', version: '0.1.0' });
registerTools(server, client);

const transport = new StdioServerTransport();

// StdioServerTransport chỉ nghe 'data' và 'error' trên stdin, không xử lý EOF.
// Không tự đóng thì WebSocket tới daemon giữ event loop sống mãi và để lại
// tiến trình ma mỗi lần client ngắt kết nối.
let closing = false;
const shutdown = () => {
  if (closing) return;
  closing = true;
  client.close();
  void transport.close();
  process.exit(0);
};

process.stdin.once('end', shutdown);
process.stdin.once('close', shutdown);
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
transport.onclose = shutdown;

await server.connect(transport);
