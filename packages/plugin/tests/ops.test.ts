import { describe, it, expect, beforeEach } from 'vitest';
import { handleOp } from '../src/ops.js';

// Giả lập global figma để test dispatcher không cần Figma thật.
function stubFigma(over: Record<string, any> = {}) {
  (globalThis as any).figma = {
    root: { name: 'Game Creatives' },
    currentPage: {
      id: '0:1',
      name: 'Banners',
      selection: [{ id: '1:2', name: 'Banner_320x480', type: 'FRAME' }],
    },
    ...over,
  };
}

beforeEach(() => stubFigma());

describe('handleOp', () => {
  it('status trả về file, page và selection', async () => {
    expect(await handleOp('status', undefined)).toEqual({
      connected: true,
      file: 'Game Creatives',
      page: { id: '0:1', name: 'Banners' },
      selection: [{ id: '1:2', name: 'Banner_320x480', type: 'FRAME' }],
    });
  });

  it('status với selection rỗng trả mảng rỗng', async () => {
    stubFigma({ currentPage: { id: '0:1', name: 'P', selection: [] } });
    const out = await handleOp('status', undefined) as any;
    expect(out.selection).toEqual([]);
  });

  it('ném lỗi rõ ràng với op không nhận ra', async () => {
    await expect(handleOp('khong-ton-tai', undefined)).rejects.toThrow(/Op không nhận ra/);
  });
});

describe('collapse', () => {
  it('thu gọn node Figma thành id/name/type', async () => {
    const { collapse } = await import('../src/ops.js');
    expect(collapse({ id: '1:2', name: 'BG', type: 'RECTANGLE', fills: [1, 2, 3], parent: {} }))
      .toEqual({ id: '1:2', name: 'BG', type: 'RECTANGLE' });
  });

  it('cắt vòng lặp tham chiếu thay vì treo', async () => {
    const { collapse } = await import('../src/ops.js');
    const a: any = { foo: 1 };
    a.self = a;
    expect(collapse(a)).toEqual({ foo: 1, self: '[vòng lặp tham chiếu]' });
  });

  it('đổi symbol thành MIXED', async () => {
    const { collapse } = await import('../src/ops.js');
    expect(collapse({ fills: Symbol('mixed') })).toEqual({ fills: 'MIXED' });
  });

  it('giữ nguyên giá trị nguyên thuỷ và mảng', async () => {
    const { collapse } = await import('../src/ops.js');
    expect(collapse({ n: 1, s: 'x', b: true, arr: [1, 'a'] })).toEqual({ n: 1, s: 'x', b: true, arr: [1, 'a'] });
  });
});

describe('op eval', () => {
  it('chạy code và trả kết quả đã thu gọn', async () => {
    const out = await handleOp('eval', { code: 'return { id: "1:9", name: "R", type: "RECTANGLE" };' }) as any;
    expect(out.result).toEqual({ id: '1:9', name: 'R', type: 'RECTANGLE' });
  });

  it('hỗ trợ await ở cấp cao nhất', async () => {
    const out = await handleOp('eval', { code: 'const v = await Promise.resolve(41); return v + 1;' }) as any;
    expect(out.result).toBe(42);
  });

  it('đọc được figma qua global, giống trong sandbox', async () => {
    const out = await handleOp('eval', { code: 'return figma.currentPage.name;' }) as any;
    expect(out.result).toBe('Banners');
  });

  it('ném lỗi của code lên trên', async () => {
    await expect(handleOp('eval', { code: 'throw new Error("bể rồi");' })).rejects.toThrow('bể rồi');
  });
});
