import { describe, it, expect } from 'vitest';
import { detectWarnings } from '../src/warnings.js';
import type { RawNode } from '../src/types.js';

const solid = (hex: string) => [{
  type: 'SOLID' as const,
  color: {
    r: parseInt(hex.slice(1, 3), 16) / 255,
    g: parseInt(hex.slice(3, 5), 16) / 255,
    b: parseInt(hex.slice(5, 7), 16) / 255,
  },
}];

const art = (children: RawNode[]): RawNode => ({
  id: '1:1', name: 'Banner', type: 'FRAME', x: 0, y: 0, width: 320, height: 480,
  clipsContent: true, children,
});

const txt = (over: Partial<RawNode>): RawNode => ({
  id: 't', name: 'Title', type: 'TEXT', x: 10, y: 10, width: 100, height: 30,
  characters: 'Hello', fontName: { family: 'Inter', style: 'Bold' }, fontSize: 28,
  fills: solid('#FFFFFF'), ...over,
});

const has = (ws: ReturnType<typeof detectWarnings>, issue: string, node?: string) =>
  ws.some((w) => w.issue === issue && (node === undefined || w.node === node));

describe('detectWarnings', () => {
  it('phát hiện overflow khi con vượt mép cha có clip', () => {
    const w = detectWarnings(art([txt({ id: 'a', x: 260, width: 100 })]));
    expect(has(w, 'overflow', 'a')).toBe(true);
    expect(w.find((x) => x.issue === 'overflow')!.detail).toContain('40');
  });

  it('không báo overflow khi nằm gọn trong cha', () => {
    expect(has(detectWarnings(art([txt({ id: 'a', x: 10, width: 100 })])), 'overflow')).toBe(false);
  });

  it('phát hiện offscreen khi node nằm ngoài artboard', () => {
    expect(has(detectWarnings(art([txt({ id: 'a', x: 400 })])), 'offscreen', 'a')).toBe(true);
  });

  it('phát hiện overlap giữa hai TEXT', () => {
    const w = detectWarnings(art([
      txt({ id: 'a', x: 10, y: 10, width: 100, height: 30 }),
      txt({ id: 'b', x: 50, y: 20, width: 100, height: 30 }),
    ]));
    expect(has(w, 'overlap')).toBe(true);
  });

  it('không tính overlap với node nền phủ gần hết artboard', () => {
    const bg: RawNode = { id: 'bg', name: 'BG', type: 'RECTANGLE', x: 0, y: 0, width: 320, height: 480, fills: solid('#000000') };
    expect(has(detectWarnings(art([bg, txt({ id: 'a' })])), 'overlap')).toBe(false);
  });

  it('báo contrast khi chữ trên nền đặc dưới 4.5:1', () => {
    const bg: RawNode = { id: 'bg', name: 'BG', type: 'RECTANGLE', x: 0, y: 0, width: 320, height: 480, fills: solid('#FFFFFF') };
    const w = detectWarnings(art([bg, txt({ id: 'a', fills: solid('#EEEEEE'), fontSize: 14 })]));
    expect(has(w, 'contrast', 'a')).toBe(true);
  });

  it('không báo contrast khi đủ tương phản', () => {
    const bg: RawNode = { id: 'bg', name: 'BG', type: 'RECTANGLE', x: 0, y: 0, width: 320, height: 480, fills: solid('#000000') };
    expect(has(detectWarnings(art([bg, txt({ id: 'a', fills: solid('#FFFFFF') })])), 'contrast')).toBe(false);
  });

  it('báo contrast_unknown khi nền là ảnh', () => {
    const bg: RawNode = {
      id: 'bg', name: 'BG', type: 'RECTANGLE', x: 0, y: 0, width: 320, height: 480,
      fills: [{ type: 'IMAGE', imageHash: 'a3f9', scaleMode: 'FILL' }],
    };
    const w = detectWarnings(art([bg, txt({ id: 'a' })]));
    expect(has(w, 'contrast_unknown', 'a')).toBe(true);
    expect(w.find((x) => x.issue === 'contrast_unknown')!.detail).toContain('figma_export');
  });

  it('báo tiny_font dưới 10px', () => {
    expect(has(detectWarnings(art([txt({ id: 'a', fontSize: 8 })])), 'tiny_font', 'a')).toBe(true);
  });

  it('báo hidden khi visible false hoặc opacity gần 0', () => {
    expect(has(detectWarnings(art([txt({ id: 'a', visible: false })])), 'hidden', 'a')).toBe(true);
    expect(has(detectWarnings(art([txt({ id: 'b', opacity: 0.01 })])), 'hidden', 'b')).toBe(true);
  });

  it('báo unnamed với tên mặc định của Figma', () => {
    const w = detectWarnings(art([{ id: 'a', name: 'Rectangle 12', type: 'RECTANGLE', x: 0, y: 0, width: 10, height: 10 }]));
    expect(has(w, 'unnamed', 'a')).toBe(true);
  });

  it('không báo unnamed với tên do người đặt', () => {
    const w = detectWarnings(art([{ id: 'a', name: 'CTA Button', type: 'RECTANGLE', x: 0, y: 0, width: 10, height: 10 }]));
    expect(has(w, 'unnamed')).toBe(false);
  });
});
