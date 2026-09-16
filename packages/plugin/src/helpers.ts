import { toHex, fromHex, buildSnapshot } from '@figma-mcp/core';
import { readNode } from './ops.js';

/**
 * Gắn lên globalThis, KHÔNG dùng closure — eval của Figma chạy ở global scope
 * nên code người dùng không nhìn thấy biến cục bộ của module này.
 * Spike 2026-09-16 đã xác minh globalThis đọc được từ trong eval.
 */
export function installHelpers(): void {
  const g = globalThis as any;

  g.setText = async (node: TextNode, str: string): Promise<TextNode> => {
    const font = node.fontName;
    if (font === figma.mixed) throw new Error('Node có nhiều font, gán node.fontName trước khi setText');
    await figma.loadFontAsync(font as FontName);
    node.characters = str;
    return node;
  };

  g.listDocImages = async (): Promise<Array<{ hash: string; usedBy: string[] }>> => {
    const byHash = new Map<string, string[]>();
    const walk = (node: BaseNode & ChildrenMixin, path: string) => {
      for (const child of node.children) {
        const here = `${path}/${child.name}`;
        const fills = (child as GeometryMixin).fills;
        if (Array.isArray(fills)) {
          for (const f of fills) {
            if (f.type === 'IMAGE' && f.imageHash) {
              const list = byHash.get(f.imageHash) ?? [];
              list.push(here);
              byHash.set(f.imageHash, list);
            }
          }
        }
        if ('children' in child) walk(child as BaseNode & ChildrenMixin, here);
      }
    };
    walk(figma.currentPage, figma.currentPage.name);
    return [...byHash].map(([hash, usedBy]) => ({ hash, usedBy }));
  };

  g.snapshot = (node: BaseNode, opts: { depth?: number; maxNodes?: number } = {}) => {
    const depth = opts.depth ?? 3;
    return buildSnapshot(readNode(node, depth < 0 ? 50 : depth + 1), opts);
  };

  g.hex = toHex;
  g.rgb = fromHex;
}
