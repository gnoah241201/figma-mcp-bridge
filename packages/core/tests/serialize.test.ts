import { describe, it, expect } from 'vitest';
import { serialize } from '../src/serialize.js';
import type { RawNode, SnapNode } from '../src/types.js';

const rect = (over: Partial<RawNode> = {}): RawNode => ({
  id: '1:3', name: 'BG', type: 'RECTANGLE',
  x: 0, y: 0, width: 320, height: 480,
  visible: true, opacity: 1, rotation: 0, blendMode: 'NORMAL',
  locked: false, strokes: [], effects: [],
  fills: [{ type: 'SOLID', color: { r: 1, g: 0.8196, b: 0.4 } }],
  ...over,
});

describe('serialize', () => {
  it('bỏ mọi thuộc tính mang giá trị mặc định', () => {
    const { root } = serialize(rect());
    expect(root).toEqual({
      id: '1:3', name: 'BG', type: 'RECTANGLE',
      x: 0, y: 0, w: 320, h: 480, fill: '#FFD166',
    });
  });

  it('giữ lại thuộc tính khác mặc định', () => {
    const { root } = serialize(rect({ opacity: 0.5, rotation: 12, locked: true, visible: false }));
    expect(root.opacity).toBe(0.5);
    expect(root.rot).toBe(12);
    expect(root.locked).toBe(true);
    expect(root.hidden).toBe(true);
  });

  it('đóng gói font thành một chuỗi', () => {
    const { root } = serialize({
      id: '1:5', name: 'Title', type: 'TEXT', x: 24, y: 40, width: 272, height: 68,
      characters: 'Đại Chiến Tam Quốc',
      fontName: { family: 'Inter', style: 'Bold' }, fontSize: 28,
      lineHeight: { value: 34, unit: 'PIXELS' },
      textAlignHorizontal: 'CENTER',
      fills: [{ type: 'SOLID', color: { r: 1, g: 0.8196, b: 0.4 } }],
    });
    expect(root.font).toBe('Inter Bold 28/34');
    expect(root.text).toBe('Đại Chiến Tam Quốc');
    expect(root.align).toBe('CENTER');
  });

  it('cắt text dài ở 200 ký tự', () => {
    const { root } = serialize({ id: '1:9', name: 'T', type: 'TEXT', characters: 'a'.repeat(300) });
    expect(String(root.text)).toHaveLength(201);
    expect(String(root.text).endsWith('…')).toBe(true);
  });

  it('biểu diễn fill ảnh và fill gradient', () => {
    const img = serialize(rect({ fills: [{ type: 'IMAGE', imageHash: 'a3f9', scaleMode: 'FILL' }] }));
    expect(img.root.fill).toEqual({ type: 'IMAGE', hash: 'a3f9', mode: 'FILL' });

    const grad = serialize(rect({ fills: [{
      type: 'GRADIENT_LINEAR',
      gradientStops: [
        { position: 0, color: { r: 0, g: 0, b: 0 } },
        { position: 1, color: { r: 1, g: 1, b: 1 } },
      ],
    }] }));
    expect(grad.root.fill).toEqual({ type: 'LINEAR', stops: ['#000000@0', '#FFFFFF@1'] });
  });

  it('coi symbol là MIXED', () => {
    const { root } = serialize(rect({ fills: Symbol('mixed') }));
    expect(root.fill).toBe('MIXED');
  });

  it('gộp bốn góc bo bằng nhau thành một số, khác nhau thành mảng', () => {
    expect(serialize(rect({ cornerRadius: 22 })).root.radius).toBe(22);
    expect(serialize(rect({
      cornerRadius: Symbol('mixed'),
      topLeftRadius: 4, topRightRadius: 8, bottomRightRadius: 12, bottomLeftRadius: 16,
    })).root.radius).toEqual([4, 8, 12, 16]);
  });

  it('xuất auto-layout khi bật', () => {
    const { root } = serialize(rect({
      type: 'FRAME', layoutMode: 'VERTICAL', itemSpacing: 16,
      paddingTop: 24, paddingRight: 16, paddingBottom: 24, paddingLeft: 16,
      primaryAxisAlignItems: 'CENTER',
    }));
    expect(root.layout).toEqual({ dir: 'V', gap: 16, pad: [24, 16, 24, 16], align: 'CENTER' });
  });

  it('cắt theo depth và đếm số node bỏ qua', () => {
    const leaf = (id: string): RawNode => ({ id, name: id, type: 'RECTANGLE' });
    const tree: RawNode = {
      id: '0', name: 'root', type: 'FRAME',
      children: [{ id: '1', name: 'a', type: 'FRAME', children: [
        { id: '2', name: 'b', type: 'FRAME', children: [leaf('3'), leaf('4')] },
      ] }],
    };
    const { root, omitted } = serialize(tree, { depth: 2 });
    expect((root.c as any)[0].c[0].c).toBeUndefined();
    expect(omitted).toBe(2);
  });

  it('cắt theo maxNodes', () => {
    const children = Array.from({ length: 10 }, (_, i) => ({ id: `n${i}`, name: `n${i}`, type: 'RECTANGLE' }));
    const { root, omitted } = serialize({ id: '0', name: 'r', type: 'FRAME', children }, { maxNodes: 5 });
    expect((root.c as SnapNode[]).length).toBe(4);
    expect(omitted).toBe(6);
  });

  it('làm tròn số về 2 chữ số thập phân', () => {
    const { root } = serialize(rect({ x: 12.3456, width: 99.999 }));
    expect(root.x).toBe(12.35);
    expect(root.w).toBe(100);
  });
});
