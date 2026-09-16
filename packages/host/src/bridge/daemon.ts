import { WebSocketServer, WebSocket } from 'ws';
import type { Response } from '@figma-mcp/core';

interface Conn { ws: WebSocket; role: 'plugin' | 'client' | null }

export async function startDaemon(port: number): Promise<{ close(): Promise<void> }> {
  const wss = new WebSocketServer({ host: '127.0.0.1', port });
  const conns = new Map<WebSocket, Conn>();
  let plugin: WebSocket | null = null;
  /** id request -> socket client đã gửi, để trả response về đúng nơi */
  const pending = new Map<string, WebSocket>();

  const send = (ws: WebSocket, msg: unknown) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  };

  await new Promise<void>((resolve, reject) => {
    wss.once('listening', resolve);
    wss.once('error', reject);
  });

  wss.on('connection', (ws) => {
    conns.set(ws, { ws, role: null });

    ws.on('message', (raw) => {
      let msg: any;
      try { msg = JSON.parse(String(raw)); } catch { return; }
      const conn = conns.get(ws);
      if (!conn) return;

      if (msg.type === 'hello') {
        conn.role = msg.role;
        if (msg.role === 'plugin') {
          if (plugin && plugin !== ws) send(plugin, { type: 'notice', kind: 'replaced' });
          plugin = ws;
          for (const c of conns.values()) {
            if (c.role === 'client') send(c.ws, { type: 'notice', kind: 'plugin-connected' });
          }
        }
        return;
      }

      // Request từ client -> chuyển tiếp xuống plugin
      if (conn.role === 'client' && typeof msg.op === 'string') {
        if (!plugin || plugin.readyState !== WebSocket.OPEN) {
          const err: Response = {
            id: msg.id, ok: false,
            error: { message: 'Plugin chưa chạy. Figma Desktop → Plugins → Development → MCP Creative Bridge' },
          };
          send(ws, err);
          return;
        }
        pending.set(msg.id, ws);
        send(plugin, msg);
        return;
      }

      // Response từ plugin -> trả về đúng client đã hỏi
      if (conn.role === 'plugin' && typeof msg.id === 'string' && 'ok' in msg) {
        const origin = pending.get(msg.id);
        pending.delete(msg.id);
        if (origin) send(origin, msg);
      }
    });

    ws.on('close', () => {
      const conn = conns.get(ws);
      conns.delete(ws);
      if (conn?.role !== 'plugin' || plugin !== ws) return;
      plugin = null;
      for (const [id, origin] of pending) {
        send(origin, { id, ok: false, error: { message: 'Plugin ngắt kết nối giữa chừng' } });
      }
      pending.clear();
      for (const c of conns.values()) {
        if (c.role === 'client') send(c.ws, { type: 'notice', kind: 'plugin-gone' });
      }
    });
  });

  return {
    close: () =>
      new Promise<void>((resolve) => {
        for (const c of conns.values()) c.ws.terminate();
        wss.close(() => resolve());
      }),
  };
}
