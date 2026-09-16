import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { BridgeClient } from './client.js';

const text = (v: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(v) }] });

export function registerTools(server: McpServer, client: BridgeClient): void {
  server.registerTool(
    'figma_status',
    {
      description: 'Trạng thái kết nối plugin Figma, file/page đang mở, selection hiện tại, thư mục assets cho phép. Gọi đầu phiên.',
      inputSchema: {},
    },
    async () => text(await client.call('status'))
  );
}
