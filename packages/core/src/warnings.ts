import { contrastRatio, type RGB } from './color.js';
import type { RawNode, RawPaint, Warning } from './types.js';

const DEFAULT_NAME = /^(Rectangle|Ellipse|Frame|Group|Vector|Line|Text|Polygon|Star|Component|Instance) \d+$/;

interface Box { x: number; y: number; w: number; h: number }

const boxOf = (n: RawNode, ox: number, oy: number): Box => ({
  x: ox + (n.x ?? 0), y: oy + (n.y ?? 0), w: n.width ?? 0, h: n.height ?? 0,
});

const area = (b: Box): number => b.w * b.h;

function intersection(a: Box, b: Box): Box {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const r = Math.min(a.x + a.w, b.x + b.w);
  const bt = Math.min(a.y + a.h, b.y + b.h);
  return { x, y, w: Math.max(0, r - x), h: Math.max(0, bt - y) };
}

const covers = (outer: Box, inner: Box): boolean =>
  outer.x <= inner.x && outer.y <= inner.y &&
  outer.x + outer.w >= inner.x + inner.w && outer.y + outer.h >= inner.y + inner.h;

function solidColor(fills: RawNode['fills']): RGB | null {
  if (typeof fills === 'symbol' || !Array.isArray(fills)) return null;
  const visible = (fills as RawPaint[]).filter((f) => f.visible !== false);
  const top = visible[visible.length - 1];
  return top && top.type === 'SOLID' && top.color ? top.color : null;
}

function hasNonSolidFill(fills: RawNode['fills']): boolean {
  if (typeof fills === 'symbol' || !Array.isArray(fills)) return false;
  return (fills as RawPaint[]).some((f) => f.visible !== false && f.type !== 'SOLID');
}

interface Flat { node: RawNode; box: Box; parent: RawNode | null; parentBox: Box | null; index: number }

export function detectWarnings(root: RawNode): Warning[] {
  const out: Warning[] = [];
  const flat: Flat[] = [];
  const rootBox = boxOf(root, -(root.x ?? 0), -(root.y ?? 0));

  const walk = (n: RawNode, ox: number, oy: number, parent: RawNode | null, parentBox: Box | null) => {
    const box = boxOf(n, ox, oy);
    if (parent) flat.push({ node: n, box, parent, parentBox, index: flat.length });
    for (const kid of n.children ?? []) walk(kid, box.x, box.y, n, box);
  };
  walk(root, -(root.x ?? 0), -(root.y ?? 0), null, null);

  const rootArea = area(rootBox);
  const isBackdrop = (b: Box): boolean => rootArea > 0 && area(b) >= 0.9 * rootArea;

  const add = (n: RawNode, issue: Warning['issue'], detail: string) =>
    out.push({ node: n.id, name: n.name, issue, detail });

  for (const item of flat) {
    const { node: n, box, parent, parentBox } = item;

    if (n.visible === false) add(n, 'hidden', 'visible = false');
    else if (n.opacity !== undefined && n.opacity < 0.02) add(n, 'hidden', `opacity = ${n.opacity}`);
    else if (box.w < 1 || box.h < 1) add(n, 'hidden', `kích thước ${box.w}×${box.h}`);

    if (DEFAULT_NAME.test(n.name)) add(n, 'unnamed', 'còn tên mặc định');

    if (parent && parentBox && (parent.clipsContent === true || parent === root)) {
      const over = [
        box.x < parentBox.x ? `mép trái ${Math.round(parentBox.x - box.x)}px` : null,
        box.y < parentBox.y ? `mép trên ${Math.round(parentBox.y - box.y)}px` : null,
        box.x + box.w > parentBox.x + parentBox.w ? `mép phải ${Math.round(box.x + box.w - parentBox.x - parentBox.w)}px` : null,
        box.y + box.h > parentBox.y + parentBox.h ? `mép dưới ${Math.round(box.y + box.h - parentBox.y - parentBox.h)}px` : null,
      ].filter(Boolean);
      if (over.length > 0) add(n, 'overflow', `vượt ${over.join(', ')}`);
    }

    if (area(intersection(box, rootBox)) < area(box) - 0.5) {
      add(n, 'offscreen', 'nằm một phần hoặc toàn bộ ngoài artboard gốc');
    }

    if (n.type === 'TEXT') {
      const size = typeof n.fontSize === 'number' ? n.fontSize : undefined;
      if (size !== undefined && size < 10) add(n, 'tiny_font', `fontSize ${size} < 10`);

      const fg = solidColor(n.fills);
      // Nền: anh em nằm dưới trong thứ tự z, gần nhất, phủ trọn TEXT
      const siblings = (parent?.children ?? []) as RawNode[];
      const myIndex = siblings.indexOf(n);
      let backdrop: RawNode | null = null;
      for (let i = myIndex - 1; i >= 0; i--) {
        const sib = siblings[i];
        const sibBox = boxOf(sib, parentBox?.x ?? 0, parentBox?.y ?? 0);
        if (covers(sibBox, box)) { backdrop = sib; break; }
      }
      const backdropFills = backdrop ? backdrop.fills : parent?.fills;
      const bg = solidColor(backdropFills);

      if (fg) {
        if (bg && !hasNonSolidFill(backdropFills)) {
          const ratio = contrastRatio(fg, bg);
          const style = typeof n.fontName === 'object' ? (n.fontName as { style?: string }).style ?? '' : '';
          const bold = /bold|black|heavy/i.test(style);
          const threshold = size !== undefined && size >= 24 && bold ? 3 : 4.5;
          if (ratio < threshold) add(n, 'contrast', `${ratio.toFixed(1)}:1, dưới ngưỡng ${threshold}`);
        } else {
          add(n, 'contrast_unknown', 'chữ nằm trên ảnh, gradient hoặc không có nền đặc — không tính được tương phản, cần figma_export');
        }
      }
    }
  }

  // overlap: chỉ giữa TEXT với TEXT, hoặc TEXT với shape không phải nền
  const texts = flat.filter((f) => f.node.type === 'TEXT');
  for (const t of texts) {
    for (const other of flat) {
      if (other === t || isBackdrop(other.box)) continue;
      if (other.node.type !== 'TEXT') {
        if (other.node.children && other.node.children.length > 0) continue; // container, không tính
        if (other.index < t.index) continue; // shape nằm dưới chữ là nền hợp lệ
      }
      const inter = area(intersection(t.box, other.box));
      const smaller = Math.min(area(t.box), area(other.box));
      if (smaller > 0 && inter / smaller > 0.1) {
        add(t.node, 'overlap', `chồng ${Math.round((inter / smaller) * 100)}% với "${other.node.name}"`);
        break;
      }
    }
  }

  return out;
}
