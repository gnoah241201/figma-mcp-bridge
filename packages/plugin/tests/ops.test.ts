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
    // Node Figma that la instance cua lop, khong phai object literal - xem
    // nhom test "phan biet node Figma that voi object thuan" ben duoi.
    class RectangleNode {
      id = '1:2'; name = 'BG'; type = 'RECTANGLE'; fills = [1, 2, 3]; parent = {};
    }
    expect(collapse(new RectangleNode()))
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

describe('readNode', () => {
  it('đọc thuộc tính có mặt, bỏ qua thuộc tính undefined', async () => {
    const { readNode } = await import('../src/ops.js');
    const out = readNode({
      id: '1:3', name: 'BG', type: 'RECTANGLE',
      x: 0, y: 0, width: 320, height: 480, opacity: 1,
      fills: [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 } }],
    } as any, 3);
    expect(out).toEqual({
      id: '1:3', name: 'BG', type: 'RECTANGLE',
      x: 0, y: 0, width: 320, height: 480, opacity: 1,
      fills: [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 } }],
    });
  });

  it('đọc đệ quy cây con tới đúng depth', async () => {
    const { readNode } = await import('../src/ops.js');
    const leaf = { id: 'c', name: 'c', type: 'RECTANGLE' };
    const mid = { id: 'b', name: 'b', type: 'FRAME', children: [leaf] };
    const out = readNode({ id: 'a', name: 'a', type: 'FRAME', children: [mid] } as any, 1);
    expect(out.children![0].id).toBe('b');
    expect(out.children![0].children).toBeUndefined();
  });

  it('lấy tên component gốc cho INSTANCE', async () => {
    const { readNode } = await import('../src/ops.js');
    const out = readNode({ id: 'i', name: 'Btn', type: 'INSTANCE', mainComponent: { name: 'Button/Primary' } } as any, 1);
    expect(out.mainComponentName).toBe('Button/Primary');
  });
});

describe('op snapshot', () => {
  it('trả snapshot của node được chỉ định qua nodeId', async () => {
    const banner = {
      id: '1:2', name: 'Banner', type: 'FRAME', x: 0, y: 0, width: 320, height: 480,
      clipsContent: true,
      children: [{ id: '1:8', name: 'Rectangle 12', type: 'RECTANGLE', x: 0, y: 0, width: 10, height: 10 }],
    };
    stubFigma({ getNodeByIdAsync: async (id: string) => (id === '1:2' ? banner : null) });
    const snap = await handleOp('snapshot', { nodeId: '1:2' }) as any;
    expect(snap.schema).toBe('figma-snapshot/1');
    expect(snap.root.id).toBe('1:2');
    expect(snap.warnings.some((w: any) => w.issue === 'unnamed')).toBe(true);
  });

  it('dùng selection khi không truyền nodeId', async () => {
    stubFigma({
      currentPage: {
        id: '0:1', name: 'P',
        selection: [{ id: '9:9', name: 'Chosen', type: 'FRAME', x: 0, y: 0, width: 10, height: 10 }],
      },
    });
    const snap = await handleOp('snapshot', {}) as any;
    expect(snap.root.id).toBe('9:9');
    expect(snap.root.name).toBe('Chosen');
  });

  it('báo lỗi rõ khi nodeId không tồn tại', async () => {
    stubFigma({ getNodeByIdAsync: async () => null });
    await expect(handleOp('snapshot', { nodeId: 'x:x' })).rejects.toThrow(/Khong tim thay node/);
  });
});

describe('op export', () => {
  const exportNode = (w: number, h: number) => {
    const calls: any[] = [];
    const node = {
      id: 'e:1', name: 'Banner', type: 'FRAME', width: w, height: h,
      exportAsync: async (settings: any) => { calls.push(settings); return new Uint8Array([1, 2, 3]); },
    };
    stubFigma({
      getNodeByIdAsync: async () => node,
      base64Encode: () => 'AQID',
    });
    return calls;
  };

  it('ràng buộc cạnh rộng khi node nằm ngang', async () => {
    const calls = exportNode(1600, 800);
    const out = await handleOp('export', { nodeId: 'e:1', maxPx: 400 }) as any;
    expect(calls[0].constraint).toEqual({ type: 'WIDTH', value: 400 });
    expect(out).toEqual({ base64: 'AQID', w: 400, h: 200 });
  });

  it('ràng buộc cạnh cao khi node nằm dọc', async () => {
    const calls = exportNode(320, 480);
    const out = await handleOp('export', { nodeId: 'e:1', maxPx: 240 }) as any;
    expect(calls[0].constraint).toEqual({ type: 'HEIGHT', value: 240 });
    expect(out.h).toBe(240);
    expect(out.w).toBe(160);
  });

  it('giữ nguyên kích thước khi node đã nhỏ hơn ngưỡng', async () => {
    const calls = exportNode(100, 50);
    const out = await handleOp('export', { nodeId: 'e:1', maxPx: 800 }) as any;
    expect(calls[0].constraint).toEqual({ type: 'SCALE', value: 1 });
    expect(out).toEqual({ base64: 'AQID', w: 100, h: 50 });
  });

  it('ép trần cứng 1600px dù yêu cầu lớn hơn', async () => {
    const calls = exportNode(4000, 2000);
    await handleOp('export', { nodeId: 'e:1', maxPx: 5000 });
    expect(calls[0].constraint).toEqual({ type: 'WIDTH', value: 1600 });
  });

  it('báo lỗi khi node không export được', async () => {
    stubFigma({ getNodeByIdAsync: async () => ({ id: 'x', name: 'x', type: 'PAGE' }) });
    await expect(handleOp('export', { nodeId: 'x' })).rejects.toThrow(/khong export duoc/);
  });
});

describe('op images', () => {
  it('nạp nhiều ảnh trong một lượt và trả hash kèm kích thước', async () => {
    stubFigma({
      base64Decode: (b64: string) => new Uint8Array(Buffer.from(b64, 'base64')),
      createImage: (bytes: Uint8Array) => ({
        hash: `h${bytes.length}`,
        getSizeAsync: async () => ({ width: bytes.length * 10, height: bytes.length * 5 }),
      }),
    });
    const out = await handleOp('images', {
      load: { 'hero.png': Buffer.from([1, 2, 3]).toString('base64'), 'logo.png': Buffer.from([9]).toString('base64') },
    }) as any;
    expect(out).toEqual({
      'hero.png': { hash: 'h3', w: 30, h: 15 },
      'logo.png': { hash: 'h1', w: 10, h: 5 },
    });
  });

  it('list gọi helper listDocImages trên globalThis', async () => {
    stubFigma();
    (globalThis as any).listDocImages = async () => [{ hash: 'a3f9', usedBy: ['Banner/BG'] }];
    const out = await handleOp('images', { list: true }) as any;
    expect(out.images).toEqual([{ hash: 'a3f9', usedBy: ['Banner/BG'] }]);
  });

  it('báo lỗi khi không truyền load lẫn list', async () => {
    stubFigma();
    await expect(handleOp('images', {})).rejects.toThrow(/Can truyen load hoac list/);
  });
});

describe('collapse: phân biệt node Figma thật với object thuần', () => {
  class RectangleNode {
    id = '1:2'; name = 'BG'; type = 'RECTANGLE'; width = 320; parent = null;
  }

  it('thu gọn node Figma thật (instance của lớp)', async () => {
    const { collapse } = await import('../src/ops.js');
    expect(collapse(new RectangleNode())).toEqual({ id: '1:2', name: 'BG', type: 'RECTANGLE' });
  });

  it('KHÔNG bóp méo kết quả snapshot() dù cũng có id và type', async () => {
    const { collapse } = await import('../src/ops.js');
    const snap = {
      schema: 'figma-snapshot/1',
      root: { id: '1:2', name: 'Banner', type: 'FRAME', x: 0, y: 0, w: 320, h: 480,
              c: [{ id: '1:3', name: 'BG', type: 'RECTANGLE', x: 0, y: 0, w: 320, h: 480 }] },
      warnings: [],
    };
    expect(collapse(snap)).toEqual(snap);
  });

  it('thu gọn node Figma nằm lồng bên trong object thuần', async () => {
    const { collapse } = await import('../src/ops.js');
    expect(collapse({ created: new RectangleNode(), count: 1 }))
      .toEqual({ created: { id: '1:2', name: 'BG', type: 'RECTANGLE' }, count: 1 });
  });
});
