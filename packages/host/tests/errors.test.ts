import { describe, it, expect } from 'vitest';
import { enrichError } from '../src/mcp/errors.js';

describe('enrichError', () => {
  it('gợi ý setText khi lỗi liên quan font', () => {
    const e = enrichError({ message: 'Cannot write to node with unloaded font Inter Bold' });
    expect(e.hint).toContain('setText');
  });
  it('gợi ý getNodeByIdAsync', () => {
    const e = enrichError({ message: 'figma.getNodeById is not a function' });
    expect(e.hint).toContain('getNodeByIdAsync');
  });
  it('gợi ý clone mảng fills', () => {
    const e = enrichError({ message: 'Cannot add property 0, object is not extensible' });
    expect(e.hint).toContain('clone');
  });
  it('cắt message dài còn 500 ký tự', () => {
    const e = enrichError({ message: 'x'.repeat(900) });
    expect(e.message.length).toBe(500);
  });
  it('giữ nguyên hint có sẵn, không ghi đè', () => {
    const e = enrichError({ message: 'font lỗi', hint: 'gợi ý riêng' });
    expect(e.hint).toBe('gợi ý riêng');
  });
});
