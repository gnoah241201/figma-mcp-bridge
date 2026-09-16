import { describe, it, expect, afterEach } from 'vitest';
import WebSocket from 'ws';
import { startDaemon } from '../src/bridge/daemon.js';
import { BridgeClient } from '../src/mcp/client.js';

const PORT = 39056;
let daemon: { close(): Promise<void> } | undefined;
let client: BridgeClient | undefined;
afterEach(async () => { client?.close(); await daemon?.close(); daemon = undefined; client = undefined; });

function fakePlugin(port: number, handler: (op: string) => unknown): Promise<WebSocket> {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    ws.on('open', () => {
      ws.send(JSON.stringify({ type: 'hello', role: 'plugin', fileName: 'F', pageId: '0:1', pageName: 'P' }));
      resolve(ws);
    });
    ws.on('message', (raw) => {
      const m = JSON.parse(String(raw));
      if (m.op) ws.send(JSON.stringify({ id: m.id, ok: true, result: handler(m.op) }));
    });
  });
}

describe('BridgeClient', () => {
  it('gọi được op và nhận kết quả', async () => {
    daemon = await startDaemon(PORT);
    const plugin = await fakePlugin(PORT, () => ({ connected: true }));
    client = new BridgeClient(PORT);
    await client.connect();
    expect(await client.call('status')).toEqual({ connected: true });
    plugin.close();
  });

  it('ném lỗi đã làm giàu khi plugin trả lỗi', async () => {
    daemon = await startDaemon(PORT);
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}`);
    await new Promise((r) => ws.on('open', r));
    ws.send(JSON.stringify({ type: 'hello', role: 'plugin', fileName: 'F', pageId: '0:1', pageName: 'P' }));
    ws.on('message', (raw) => {
      const m = JSON.parse(String(raw));
      if (m.op) ws.send(JSON.stringify({ id: m.id, ok: false, error: { message: 'unloaded font Inter' } }));
    });
    client = new BridgeClient(PORT);
    await client.connect();
    await expect(client.call('eval')).rejects.toThrow(/setText/);
    ws.close();
  });

  it('timeout khi plugin không trả lời', async () => {
    daemon = await startDaemon(PORT);
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}`);
    await new Promise((r) => ws.on('open', r));
    ws.send(JSON.stringify({ type: 'hello', role: 'plugin', fileName: 'F', pageId: '0:1', pageName: 'P' }));
    client = new BridgeClient(PORT);
    await client.connect();
    await expect(client.call('status', undefined, 120)).rejects.toThrow(/quá 120ms/);
    ws.close();
  });
});
