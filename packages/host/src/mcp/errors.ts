import { LIMITS, type BridgeError } from '@figma-mcp/core';

const RULES: Array<{ match: RegExp; hint: string }> = [
  { match: /font/i, hint: 'dùng setText(node, str) để tự loadFontAsync, đừng gán node.characters trực tiếp' },
  { match: /getNodeById is not a function|getNodeById.*dynamic-page/i, hint: 'dùng await figma.getNodeByIdAsync(id)' },
  { match: /not extensible|read.?only|cannot add property/i, hint: 'fills/strokes bất biến — clone mảng rồi gán lại: const f = [...node.fills]' },
  { match: /resize/i, hint: 'resize() reset textAutoResize về NONE và auto-layout sizing về FIXED — cấu hình lại sau khi gọi' },
];

export function enrichError(err: BridgeError): BridgeError {
  const message = err.message.length > LIMITS.errorChars
    ? err.message.slice(0, LIMITS.errorChars)
    : err.message;
  if (err.hint) return { ...err, message };
  const rule = RULES.find((r) => r.match.test(err.message));
  return rule ? { ...err, message, hint: rule.hint } : { ...err, message };
}
