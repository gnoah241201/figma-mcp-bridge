import { describe, it, expect, afterEach } from 'vitest';
import WebSocket from 'ws';
import { startDaemon } from '../src/bridge/daemon.js';

const PORT = 39055;
let daemon: { close(): Promise<void> } | undefined;
afterEach(async () => { await daemon?.close(); daemon = undefined; });

function open(role: 'plugin' | 'client'): Promise<WebSocket> {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}`);
    ws.on('open', () => {
      ws.send(JSON.stringify(
        role === 'plugin'
          ? { type: 'hello', role, fileName: 'F', pageId: '0:1', pageName: 'P' }
          : { type: 'hello', role }
      ));
      resolve(ws);
    });
  });
}

const next = (ws: WebSocket, pred: (m: any) => boolean): Promise<any> =>
  new Promise((resolve) => {
    const on = (raw: WebSocket.RawData) => {
      const m = JSON.parse(String(raw));
      if (pred(m)) { ws.off('message', on); resolve(m); }
    };
    ws.on('message', on);
  });

describe('bridge daemon', () => {
  it('dinh tuyen request tu client toi plugin va tra response dung id', async () => {
    daemon = await startDaemon(PORT);
    const plugin = await open('plugin');
    const client = await open('client');

    plugin.on('message', (raw) => {
      const m = JSON.parse(String(raw));
      if (m.op) plugin.send(JSON.stringify({ id: m.id, ok: true, result: { echo: m.op } }));
    });

    client.send(JSON.stringify({ id: 'r1', op: 'status' }));
    const res = await next(client, (m) => m.id === 'r1');
    expect(res).toEqual({ id: 'r1', ok: true, result: { echo: 'status' } });
    plugin.close(); client.close();
  });

  it('tra loi ngay khi chua co plugin nao ket noi', async () => {
    daemon = await startDaemon(PORT);
    const client = await open('client');
    client.send(JSON.stringify({ id: 'r2', op: 'status' }));
    const res = await next(client, (m) => m.id === 'r2');
    expect(res.ok).toBe(false);
    expect(res.error.message).toContain('Plugin chưa chạy');
    client.close();
  });

  it('plugin moi thay the plugin cu va bao cho ban cu', async () => {
    daemon = await startDaemon(PORT);
    const first = await open('plugin');
    const replaced = next(first, (m) => m.type === 'notice' && m.kind === 'replaced');
    const second = await open('plugin');
    expect(await replaced).toMatchObject({ kind: 'replaced' });
    first.close(); second.close();
  });

  it('khong lan response khi nhieu request chay song song', async () => {
    daemon = await startDaemon(PORT);
    const plugin = await open('plugin');
    const client = await open('client');
    plugin.on('message', (raw) => {
      const m = JSON.parse(String(raw));
      if (!m.op) return;
      const delay = m.id === 'a' ? 40 : 1;
      setTimeout(() => plugin.send(JSON.stringify({ id: m.id, ok: true, result: m.id })), delay);
    });
    client.send(JSON.stringify({ id: 'a', op: 'status' }));
    client.send(JSON.stringify({ id: 'b', op: 'status' }));
    const [ra, rb] = await Promise.all([
      next(client, (m) => m.id === 'a'),
      next(client, (m) => m.id === 'b'),
    ]);
    expect(ra.result).toBe('a');
    expect(rb.result).toBe('b');
    plugin.close(); client.close();
  });
});
