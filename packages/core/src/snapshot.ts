import { serialize } from './serialize.js';
import { detectWarnings } from './warnings.js';
import type { RawNode, Snapshot } from './types.js';

export function buildSnapshot(
  root: RawNode,
  opts: { depth?: number; maxNodes?: number } = {}
): Snapshot {
  const { root: node, omitted } = serialize(root, opts);
  const snap: Snapshot = {
    schema: 'figma-snapshot/1',
    root: node,
    warnings: detectWarnings(root),
  };
  if (omitted > 0) {
    snap.truncated = { omitted, hint: 'chỉ định nodeId hẹp hơn, hoặc tăng depth' };
  }
  return snap;
}
