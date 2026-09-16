const PORT = 3055;
let ws: WebSocket | null = null;
let backoff = 500;

const $ = (id: string) => document.getElementById(id)!;
function paint(dot: string, state: string, detail = '') {
  $('dot').textContent = dot;
  $('state').textContent = state;
  $('detail').textContent = detail;
}

function connect() {
  paint('🟡', 'đang nối…', `ws://localhost:${PORT}`);
  ws = new WebSocket(`ws://localhost:${PORT}`);

  ws.onopen = () => {
    backoff = 500;
    paint('🟢', 'đã kết nối', `ws://localhost:${PORT}`);
    parent.postMessage({ pluginMessage: { kind: 'connected' } }, '*');
  };

  // Lệnh từ daemon -> chuyển xuống sandbox
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.type === 'notice' && msg.kind === 'replaced') {
      paint('🔴', 'đã bị thay thế', 'một phiên plugin khác đã chiếm kết nối');
      ws?.close();
      return;
    }
    if (msg.type) return; // notice khác, không phải lệnh
    parent.postMessage({ pluginMessage: { kind: 'request', msg } }, '*');
  };

  ws.onclose = () => {
    paint('🔴', 'mất kết nối', `thử lại sau ${backoff}ms`);
    setTimeout(connect, backoff);
    backoff = Math.min(backoff * 2, 10_000);
  };
  ws.onerror = () => ws?.close();
}

// Phản hồi từ sandbox -> gửi lên daemon; và handshake khi sandbox báo sẵn sàng
onmessage = (e: MessageEvent) => {
  const m = e.data.pluginMessage;
  if (!m || ws?.readyState !== WebSocket.OPEN) return;
  if (m.kind === 'hello') ws.send(JSON.stringify({ type: 'hello', role: 'plugin', ...m.info }));
  if (m.kind === 'response') ws.send(JSON.stringify(m.msg));
};

$('retry').onclick = () => { backoff = 500; ws?.close(); };
connect();
