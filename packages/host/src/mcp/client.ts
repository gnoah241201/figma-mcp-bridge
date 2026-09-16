import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import { LIMITS, type Op, type Response } from '@figma-mcp/core';
import { enrichError } from './errors.js';

export class BridgeClient {
  private ws: WebSocket | null = null;
  private seq = 0;
  private waiting = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }>();

  constructor(private port: number) {}

  async connect(): Promise<void> {
    try {
      this.ws = await this.dial();
    } catch {
      this.spawnDaemon();
      this.ws = await this.dialWithRetry();
    }
    this.ws.send(JSON.stringify({ type: 'hello', role: 'client' }));
    this.ws.on('message', (raw) => this.onMessage(String(raw)));
    this.ws.on('close', () => this.failAll('Mất kết nối tới bridge daemon'));
  }

  private dial(): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${this.port}`);
      ws.once('open', () => resolve(ws));
      ws.once('error', reject);
    });
  }

  private async dialWithRetry(): Promise<WebSocket> {
    let lastErr: unknown;
    for (let i = 0; i < 20; i++) {
      try { return await this.dial(); } catch (e) { lastErr = e; await new Promise((r) => setTimeout(r, 100)); }
    }
    throw new Error(`Không khởi động được bridge daemon sau 2s: ${String(lastErr)}`);
  }

  private spawnDaemon(): void {
    const entry = fileURLToPath(new URL('../bridge/main.js', import.meta.url));
    spawn(process.execPath, [entry], {
      detached: true,
      stdio: 'ignore',
      env: { ...process.env, FIGMA_BRIDGE_PORT: String(this.port) },
    }).unref();
  }

  private onMessage(raw: string): void {
    let msg: Response & { type?: string };
    try { msg = JSON.parse(raw); } catch { return; }
    if (msg.type) return; // notice, không phải response
    const entry = this.waiting.get(msg.id);
    if (!entry) return;
    clearTimeout(entry.timer);
    this.waiting.delete(msg.id);
    if (msg.ok) entry.resolve(msg.result);
    else {
      const e = enrichError(msg.error);
      entry.reject(new Error(e.hint ? `${e.message}\nGợi ý: ${e.hint}` : e.message));
    }
  }

  private failAll(reason: string): void {
    for (const [, entry] of this.waiting) { clearTimeout(entry.timer); entry.reject(new Error(reason)); }
    this.waiting.clear();
  }

  call(op: Op, payload?: unknown, timeoutMs = LIMITS.opTimeoutMs): Promise<unknown> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error('Chưa kết nối tới bridge daemon'));
    }
    const id = `${process.pid}-${++this.seq}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiting.delete(id);
        reject(new Error(`Op "${op}" quá ${timeoutMs}ms không phản hồi`));
      }, timeoutMs);
      this.waiting.set(id, { resolve, reject, timer });
      this.ws!.send(JSON.stringify({ id, op, payload }));
    });
  }

  close(): void { this.failAll('Client đóng'); this.ws?.close(); }
}
