import { toHex } from './color.js';
import { LIMITS } from './protocol.js';
import type { RawNode, RawPaint, SnapNode } from './types.js';

const MIXED = 'MIXED';

const isMixed = (v: unknown): boolean => typeof v === 'symbol';
const round2 = (v: number): number => Math.round(v * 100) / 100;

function paintToValue(p: RawPaint): unknown {
  if (p.type === 'SOLID' && p.color) return toHex(p.color, p.opacity ?? 1);
  if (p.type === 'IMAGE') return { type: 'IMAGE', hash: p.imageHash ?? null, mode: p.scaleMode ?? 'FILL' };
  const stops = (p.gradientStops ?? []).map((s) => `${toHex(s.color, s.color.a ?? 1)}@${round2(s.position)}`);
  return { type: p.type.replace('GRADIENT_', ''), stops };
}

function fillsToValue(fills: RawNode['fills']): unknown {
  if (isMixed(fills)) return MIXED;
  const list = (fills as readonly RawPaint[] | undefined)?.filter((f) => f.visible !== false) ?? [];
  if (list.length === 0) return undefined;
  if (list.length === 1) return paintToValue(list[0]);
  return list.map(paintToValue);
}

function fontToValue(n: RawNode): string | undefined {
  if (isMixed(n.fontName) || isMixed(n.fontSize)) return MIXED;
  const f = n.fontName as { family: string; style: string } | undefined;
  if (!f) return undefined;
  const size = typeof n.fontSize === 'number' ? n.fontSize : undefined;
  const lh = !isMixed(n.lineHeight) ? (n.lineHeight as { value: number; unit: string } | undefined) : undefined;
  const sizePart = size === undefined ? '' : ` ${round2(size)}`;
  const lhPart = lh && lh.unit === 'PIXELS' ? `/${round2(lh.value)}` : '';
  return `${f.family} ${f.style}${sizePart}${lhPart}`;
}

function radiusToValue(n: RawNode): number | number[] | undefined {
  if (typeof n.cornerRadius === 'number') return n.cornerRadius === 0 ? undefined : n.cornerRadius;
  if (!isMixed(n.cornerRadius)) return undefined;
  return [n.topLeftRadius ?? 0, n.topRightRadius ?? 0, n.bottomRightRadius ?? 0, n.bottomLeftRadius ?? 0];
}

function layoutToValue(n: RawNode): unknown {
  if (!n.layoutMode || n.layoutMode === 'NONE') return undefined;
  return {
    dir: n.layoutMode === 'VERTICAL' ? 'V' : 'H',
    gap: n.itemSpacing ?? 0,
    pad: [n.paddingTop ?? 0, n.paddingRight ?? 0, n.paddingBottom ?? 0, n.paddingLeft ?? 0],
    align: n.primaryAxisAlignItems ?? 'MIN',
  };
}

function put(out: SnapNode, key: string, value: unknown): void {
  if (value !== undefined) out[key] = value;
}

const countAll = (nodes: readonly RawNode[]): number =>
  nodes.reduce((sum, n) => sum + 1 + countAll(n.children ?? []), 0);

/** Nén một node và cây con. Bỏ mọi thuộc tính mang giá trị mặc định. */
export function serialize(
  node: RawNode,
  opts: { depth?: number; maxNodes?: number } = {}
): { root: SnapNode; omitted: number } {
  const depth = opts.depth ?? LIMITS.snapshotDepth;
  const maxNodes = opts.maxNodes ?? LIMITS.snapshotMaxNodes;
  let budget = maxNodes;
  let omitted = 0;

  const walk = (n: RawNode, level: number): SnapNode => {
    budget -= 1;
    const out: SnapNode = { id: n.id, name: n.name, type: n.type };

    if (typeof n.x === 'number') out.x = round2(n.x);
    if (typeof n.y === 'number') out.y = round2(n.y);
    if (typeof n.width === 'number') out.w = round2(n.width);
    if (typeof n.height === 'number') out.h = round2(n.height);

    put(out, 'fill', fillsToValue(n.fills));
    if (n.strokes && n.strokes.length > 0) {
      const w = typeof n.strokeWeight === 'number' ? n.strokeWeight : undefined;
      put(out, 'stroke', { color: paintToValue(n.strokes[0]), w });
    }
    put(out, 'radius', radiusToValue(n));
    if (n.opacity !== undefined && n.opacity !== 1) out.opacity = round2(n.opacity);
    if (n.rotation !== undefined && n.rotation !== 0) out.rot = round2(n.rotation);
    if (n.blendMode && n.blendMode !== 'NORMAL' && n.blendMode !== 'PASS_THROUGH') out.blend = n.blendMode;
    if (n.visible === false) out.hidden = true;
    if (n.locked === true) out.locked = true;
    if (n.clipsContent === true) out.clip = true;
    if (n.effects && n.effects.length > 0) out.effects = n.effects as unknown[];

    if (typeof n.characters === 'string') {
      out.text = n.characters.length > LIMITS.textTruncate
        ? n.characters.slice(0, LIMITS.textTruncate) + '…'
        : n.characters;
    }
    put(out, 'font', fontToValue(n));
    if (n.textAlignHorizontal && n.textAlignHorizontal !== 'LEFT') out.align = n.textAlignHorizontal;
    if (n.textAlignVertical && n.textAlignVertical !== 'TOP') out.valign = n.textAlignVertical;
    if (n.textAutoResize && n.textAutoResize !== 'NONE') out.autoResize = n.textAutoResize;
    if (!isMixed(n.letterSpacing)) {
      const ls = n.letterSpacing as { value: number; unit: string } | undefined;
      if (ls && ls.value !== 0) out.spacing = round2(ls.value);
    }

    put(out, 'layout', layoutToValue(n));
    put(out, 'of', n.mainComponentName);

    const kids = n.children ?? [];
    if (kids.length === 0) return out;
    if (level >= depth) { omitted += countAll(kids); return out; }

    const taken: SnapNode[] = [];
    for (const kid of kids) {
      if (budget <= 0) { omitted += 1 + countAll(kid.children ?? []); continue; }
      taken.push(walk(kid, level + 1));
    }
    if (taken.length > 0) out.c = taken;
    return out;
  };

  const root = walk(node, 0);
  return { root, omitted };
}
