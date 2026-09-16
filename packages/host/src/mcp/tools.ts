import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { LIMITS } from '@figma-mcp/core';
import { fileURLToPath } from 'node:url';
import { readAssets } from './assets.js';
import type { BridgeClient } from './client.js';

// Neo theo vi tri file, KHONG theo process.cwd(): MCP server do client khoi dong
// nen cwd co the la bat ky dau. dist/mcp/ -> len 4 bac la goc repo.
const ASSETS_DIR = process.env.FIGMA_ASSETS_DIR ?? fileURLToPath(new URL('../../../../assets/', import.meta.url));

const text = (v: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(v) }] });

export function registerTools(server: McpServer, client: BridgeClient): void {
  server.registerTool(
    'figma_status',
    {
      description: 'Trạng thái kết nối plugin Figma, file/page đang mở, selection hiện tại, thư mục assets cho phép. Gọi đầu phiên.',
      inputSchema: {},
    },
    async () => {
      const status = await client.call('status') as Record<string, unknown>;
      return text({ ...status, assetsDir: ASSETS_DIR });
    }
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

  server.registerTool(
    'figma_snapshot',
    {
      description: 'Đọc thiết kế dạng JSON nén kèm warnings tính sẵn (tràn khung, chồng lấn, tương phản, layer chưa đặt tên). ĐÂY LÀ ĐƯỜNG ĐỌC MẶC ĐỊNH — dùng nó trước, chỉ gọi figma_export khi warnings báo contrast_unknown hoặc khi cần đánh giá nội dung ảnh/thẩm mỹ. Bỏ trống nodeId thì lấy selection hiện tại.',
      inputSchema: {
        nodeId: z.string().optional(),
        depth: z.number().int().optional().describe('mặc định 3, -1 là toàn bộ cây'),
        maxNodes: z.number().int().positive().optional().describe('mặc định 300'),
      },
    },
    async (args) => text(await client.call('snapshot', args))
  );

  server.registerTool(
    'figma_export',
    {
      description: 'Xuất một node thành PNG và trả ảnh về để nhìn. CHỈ dùng khi cần đánh giá nội dung ảnh raster hoặc thẩm mỹ tổng thể — với toạ độ, kích thước, màu, tương phản trên nền đặc thì figma_snapshot vừa rẻ hơn vừa chính xác hơn.',
      inputSchema: {
        nodeId: z.string(),
        maxPx: z.number().int().positive().optional().describe('cạnh dài tối đa, mặc định 800, trần 1600'),
      },
    },
    async ({ nodeId, maxPx }) => {
      const out = await client.call('export', { nodeId, maxPx }) as { base64: string; w: number; h: number };
      return {
        content: [
          { type: 'image' as const, data: out.base64, mimeType: 'image/png' },
          { type: 'text' as const, text: `PNG ${out.w}x${out.h}` },
        ],
      };
    }
  );

  server.registerTool(
    'figma_images',
    {
      description: 'Nạp ảnh vào Figma hoặc liệt kê ảnh đã có. {load: ["hero.png"]} đọc file trong thư mục assets và trả imageHash để dùng trong figma_eval. {list: true} liệt kê imageHash đã có sẵn trong document để tái dùng, khỏi nạp lại. Đường dẫn tương đối với thư mục assets; ra ngoài sẽ bị từ chối.',
      inputSchema: {
        load: z.array(z.string()).optional(),
        list: z.boolean().optional(),
      },
    },
    async ({ load, list }) => {
      if (list) return text(await client.call('images', { list: true }));
      if (!load || load.length === 0) throw new Error('Cần truyền load (mảng đường dẫn) hoặc list: true');
      const encoded = await readAssets(load, ASSETS_DIR);
      return text(await client.call('images', { load: encoded }));
    }
  );
}
