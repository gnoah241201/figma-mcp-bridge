import { DEFAULT_PORT } from '@figma-mcp/core';
import { startDaemon } from './daemon.js';

const port = Number(process.env.FIGMA_BRIDGE_PORT ?? DEFAULT_PORT);

startDaemon(port).then(
  () => console.error(`[figma-mcp-bridge] đang nghe 127.0.0.1:${port}`),
  (err: NodeJS.ErrnoException) => {
    // Hai MCP server cùng spawn daemon: bản thua im lặng thoát, bản thắng đã giữ cổng
    if (err.code === 'EADDRINUSE') process.exit(0);
    console.error('[figma-mcp-bridge] lỗi:', err);
    process.exit(1);
  }
);
