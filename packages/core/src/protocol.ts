export const DEFAULT_PORT = 3055;

export const LIMITS = {
  snapshotMaxNodes: 300,
  snapshotDepth: 3,
  evalResultBytes: 2048,
  exportDefaultPx: 800,
  exportMaxPx: 1600,
  errorChars: 500,
  opTimeoutMs: 30_000,
  evalTimeoutMs: 60_000,
  imageMaxBytes: 10 * 1024 * 1024,
  textTruncate: 200,
} as const;

export type Op = 'status' | 'eval' | 'snapshot' | 'export' | 'images';

export interface BridgeError {
  message: string;
  hint?: string;
  line?: number;
  snippet?: string;
}

export interface Request { id: string; op: Op; payload?: unknown }

export type Response =
  | { id: string; ok: true; result: unknown }
  | { id: string; ok: false; error: BridgeError };

export type Hello =
  | { type: 'hello'; role: 'plugin'; fileName: string; pageId: string; pageName: string }
  | { type: 'hello'; role: 'client' };

export type Notice = { type: 'notice'; kind: 'replaced' | 'plugin-connected' | 'plugin-gone' };
