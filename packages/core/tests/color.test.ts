import { describe, it, expect } from 'vitest';
import { toHex, fromHex, contrastRatio } from '../src/color.js';

describe('toHex', () => {
  it('chuyen rgb 0..1 sang hex hoa', () => {
    expect(toHex({ r: 1, g: 0.8196, b: 0.4 })).toBe('#FFD166');
  });
  it('bo alpha khi opacity = 1', () => {
    expect(toHex({ r: 0, g: 0, b: 0 }, 1)).toBe('#000000');
  });
  it('them 2 ky tu alpha khi opacity < 1', () => {
    expect(toHex({ r: 1, g: 1, b: 1 }, 0.5)).toBe('#FFFFFF80');
  });
});

describe('fromHex', () => {
  it('nghich dao duoc toHex', () => {
    const c = fromHex('#E63946');
    expect(toHex(c)).toBe('#E63946');
  });
});

describe('contrastRatio', () => {
  it('den tren trang la 21:1', () => {
    const r = contrastRatio({ r: 0, g: 0, b: 0 }, { r: 1, g: 1, b: 1 });
    expect(r).toBeCloseTo(21, 1);
  });
  it('mau giong nhau la 1:1', () => {
    const c = { r: 0.5, g: 0.2, b: 0.9 };
    expect(contrastRatio(c, c)).toBeCloseTo(1, 5);
  });
  it('doi xung, khong phu thuoc thu tu tham so', () => {
    const a = { r: 1, g: 0.82, b: 0.4 }, b = { r: 0.1, g: 0.1, b: 0.18 };
    expect(contrastRatio(a, b)).toBeCloseTo(contrastRatio(b, a), 10);
  });
});
