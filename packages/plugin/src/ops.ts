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

    default:
      throw new Error(`Op không nhận ra: ${op}`);
  }
}
