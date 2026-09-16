import { describe, it, expect } from 'vitest';
import { buildSnapshot } from '../src/snapshot.js';
import type { RawNode } from '../src/types.js';

const banner: RawNode = {
  id: '1:2', name: 'Banner_320x480', type: 'FRAME', x: 0, y: 0, width: 320, height: 480,
  clipsContent: true,
  children: [
    { id: '1:3', name: 'BG', type: 'RECTANGLE', x: 0, y: 0, width: 320, height: 480,
      fills: [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 } }] },
    { id: '1:8', name: 'Rectangle 12', type: 'RECTANGLE', x: 90, y: 400, width: 140, height: 44,
      fills: [{ type: 'SOLID', color: { r: 0.9, g: 0.22, b: 0.27 } }], cornerRadius: 22 },
  ],
};

describe('buildSnapshot', () => {
  it('gắn schema có version và gộp warnings', () => {
    const snap = buildSnapshot(banner);
    expect(snap.schema).toBe('figma-snapshot/1');
    expect(snap.root.id).toBe('1:2');
    expect(snap.warnings.some((w) => w.issue === 'unnamed' && w.node === '1:8')).toBe(true);
  });

  it('không có trường truncated khi cây vừa đủ', () => {
    expect(buildSnapshot(banner).truncated).toBeUndefined();
  });

  it('có trường truncated kèm gợi ý khi bị cắt', () => {
    const snap = buildSnapshot(banner, { maxNodes: 2 });
    expect(snap.truncated).toEqual({ omitted: 1, hint: 'chỉ định nodeId hẹp hơn, hoặc tăng depth' });
  });
});
