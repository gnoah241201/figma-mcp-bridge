import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { LIMITS } from '@figma-mcp/core';
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

  server.registerTool(
    'figma_eval',
    {
      description: [
        'Chạy JavaScript trong sandbox Figma với toàn quyền Plugin API. Code được bọc sẵn trong async function — dùng được await và return ở cấp cao nhất.',
        'BẮT BUỘC nhớ 5 điều:',
        '1. Dùng await figma.getNodeByIdAsync(id), KHÔNG có getNodeById đồng bộ.',
        '2. Đổi nội dung text bằng await setText(node, str) — nó tự loadFontAsync. Gán node.characters trực tiếp sẽ lỗi.',
        '3. fills/strokes bất biến: const f = [...node.fills]; f[0] = {...}; node.fills = f;',
        '4. resize() reset textAutoResize về NONE và auto-layout sizing về FIXED — cấu hình lại sau khi gọi.',
        '5. Thao tác ảnh là async: const img = figma.createImage(bytes); await img.getSizeAsync().',
        'Helper toàn cục: setText, listDocImages, hex, rgb. Mỗi lần gọi là đúng một bước undo.',
      ].join('\n'),
      inputSchema: {
        code: z.string().describe('JavaScript chạy trong sandbox Figma'),
        timeoutMs: z.number().int().positive().optional(),
      },
    },
    async ({ code, timeoutMs }) => {
      const out = await client.call('eval', { code }, timeoutMs ?? LIMITS.evalTimeoutMs);
      const json = JSON.stringify((out as { result: unknown }).result);
      const body = json.length > LIMITS.evalResultBytes
        ? json.slice(0, LIMITS.evalResultBytes) + `\n…đã cắt, tổng ${json.length} byte`
        : json;
      return { content: [{ type: 'text' as const, text: body }] };
    }
  );
}
