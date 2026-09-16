import { buildSnapshot, LIMITS, type RawNode } from '@figma-mcp/core';

const READ_KEYS = [
  'x', 'y', 'width', 'height', 'visible', 'opacity', 'rotation', 'blendMode',
  'locked', 'clipsContent', 'fills', 'strokes', 'strokeWeight', 'cornerRadius',
  'topLeftRadius', 'topRightRadius', 'bottomRightRadius', 'bottomLeftRadius',
  'characters', 'fontName', 'fontSize', 'lineHeight', 'letterSpacing',
  'textAlignHorizontal', 'textAlignVertical', 'textAutoResize',
  'layoutMode', 'itemSpacing', 'paddingTop', 'paddingRight', 'paddingBottom',
  'paddingLeft', 'primaryAxisAlignItems', 'effects',
] as const;

/** Doc node Figma thanh plain object. Symbol (figma.mixed) giu nguyen - core hieu la MIXED. */
export function readNode(node: BaseNode, depth: number, level = 0): RawNode {
  const any = node as any;
  const out: RawNode = { id: node.id, name: node.name, type: node.type };
  for (const key of READ_KEYS) {
    const v = any[key];
    if (v !== undefined) (out as any)[key] = v;
  }
  if (node.type === 'INSTANCE' && any.mainComponent) out.mainComponentName = any.mainComponent.name;
  if ('children' in node && level < depth) {
    out.children = (node as any).children.map((c: BaseNode) => readNode(c, depth, level + 1));
  }
  return out;
}

/** Thu gọn giá trị trả về: node Figma -> {id,name,type}, cắt vòng lặp tham chiếu. */
export function collapse(value: unknown, seen = new WeakSet<object>(), depth = 0): unknown {
  if (value === null || typeof value !== 'object') {
    return typeof value === 'symbol' ? 'MIXED' : value;
  }
  if (seen.has(value)) return '[vòng lặp tham chiếu]';
  if (depth > 6) return '[quá sâu]';
  seen.add(value);

  const node = value as { id?: unknown; type?: unknown; name?: unknown };
  if (typeof node.id === 'string' && typeof node.type === 'string') {
    return { id: node.id, name: node.name, type: node.type };
  }
  if (Array.isArray(value)) return value.map((v) => collapse(v, seen, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) out[k] = collapse(v, seen, depth + 1);
  return out;
}

export async function handleOp(op: string, payload: any): Promise<unknown> {
  switch (op) {
    case 'status': {
      const page = figma.currentPage;
      return {
        connected: true,
        file: figma.root.name,
        page: { id: page.id, name: page.name },
        selection: page.selection.map((n) => ({ id: n.id, name: n.name, type: n.type })),
      };
    }

    case 'eval': {
      const { code } = payload as { code: string };
      // Bọc trong async function để dùng được await và return ở cấp cao nhất.
      // eval chạy ở global scope: helper phải nằm trên globalThis, không phải closure.
      const fn = eval(`(async function(){\n${code}\n})`);
      const raw = await fn();
      return { result: collapse(raw) };
    }

    case 'snapshot': {
      const { nodeId, depth = LIMITS.snapshotDepth, maxNodes = LIMITS.snapshotMaxNodes } =
        (payload ?? {}) as { nodeId?: string; depth?: number; maxNodes?: number };

      let target: BaseNode | null;
      if (nodeId) target = await figma.getNodeByIdAsync(nodeId);
      else if (figma.currentPage.selection.length > 0) target = figma.currentPage.selection[0];
      else target = figma.currentPage;
      if (!target) throw new Error(`Khong tim thay node ${nodeId}`);

      // Doc sau hon depth 1 bac de warnings nhin duoc quan he cha-con o bien
      const readDepth = depth < 0 ? 50 : depth + 1;
      return buildSnapshot(readNode(target, readDepth), { depth, maxNodes });
    }

    case 'export': {
      const { nodeId, maxPx = LIMITS.exportDefaultPx } = payload as { nodeId: string; maxPx?: number };
      const capped = Math.min(maxPx, LIMITS.exportMaxPx);
      const node = await figma.getNodeByIdAsync(nodeId);
      if (!node || !('exportAsync' in node)) throw new Error(`Node ${nodeId} khong export duoc`);

      const w = (node as any).width as number;
      const h = (node as any).height as number;
      const longest = Math.max(w, h);

      // Resize ngay trong Figma: rang buoc canh dai. Nho hon nguong thi giu nguyen.
      const constraint: ExportSettingsConstraints =
        longest <= capped ? { type: 'SCALE', value: 1 }
        : w >= h ? { type: 'WIDTH', value: capped }
        : { type: 'HEIGHT', value: capped };

      const bytes = await (node as any).exportAsync({ format: 'PNG', constraint });
      const scale = longest <= capped ? 1 : capped / longest;
      return {
        base64: figma.base64Encode(bytes),
        w: Math.round(w * scale),
        h: Math.round(h * scale),
      };
    }

    case 'images': {
      const { load, list } = (payload ?? {}) as { load?: Record<string, string>; list?: boolean };
      if (list) return { images: await (globalThis as any).listDocImages() };
      if (!load) throw new Error('Can truyen load hoac list');

      const out: Record<string, { hash: string; w: number; h: number }> = {};
      for (const path of Object.keys(load)) {
        const img = figma.createImage(figma.base64Decode(load[path]));
        const size = await img.getSizeAsync();
        out[path] = { hash: img.hash, w: size.width, h: size.height };
      }
      return out;
    }

    default:
      throw new Error(`Op không nhận ra: ${op}`);
  }
}
