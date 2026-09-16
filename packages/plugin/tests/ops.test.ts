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
