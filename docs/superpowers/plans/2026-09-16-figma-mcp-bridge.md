# Figma MCP Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cho phép AI agent tạo và sửa thiết kế trực tiếp trong Figma Desktop qua một MCP server local và một plugin Figma tự viết.

**Architecture:** Ba tiến trình. MCP server (stdio, mỗi client một bản) nối WebSocket tới một bridge daemon sống độc lập ở `127.0.0.1:3055`; daemon chuyển tiếp lệnh tới UI iframe của plugin Figma, iframe `postMessage` xuống sandbox để gọi `figma.*`. Toàn bộ logic thuần tuý (serializer snapshot, phát hiện warnings, màu/tương phản) nằm trong package `core` không phụ thuộc Figma lẫn Node, nên unit test chạy được trong CI.

**Tech Stack:** Node 20+, TypeScript 5.x, npm workspaces, `@modelcontextprotocol/sdk`, `ws`, `zod`, `vitest`, `esbuild`.

**Spec:** [docs/superpowers/specs/2026-09-16-figma-mcp-bridge-design.md](../specs/2026-09-16-figma-mcp-bridge-design.md)

## Global Constraints

- Node 20+ bắt buộc (dùng `node:` prefix imports, `structuredClone`).
- Package `@figma-mcp/core` **không được import** `figma`, `ws`, hay bất kỳ API Node nào. Thuần tuý, test được trong CI.
- Bridge chỉ bind `127.0.0.1`, không bao giờ `0.0.0.0`.
- Cổng mặc định `3055`, đổi qua `FIGMA_BRIDGE_PORT`.
- Thư mục assets mặc định `<repo>/assets`, đổi qua `FIGMA_ASSETS_DIR`. Mọi đường dẫn giải bằng `fs.realpath` và bắt buộc nằm trong thư mục đó.
- Manifest plugin: `allowedDomains: ["none"]`, `devAllowedDomains: ["http://localhost:3055", "ws://localhost:3055"]`, `documentAccess: "dynamic-page"`.
- Build plugin bằng esbuild với `sourcemap: false` — sourcemap kiểu eval không chạy trong sandbox Figma.
- Trần cứng: snapshot 300 node / depth 3 · kết quả eval 2048 byte · export mặc định 800px, tối đa 1600px · thông báo lỗi 500 ký tự.
- Schema snapshot cố định chuỗi `"figma-snapshot/1"`.
- Commit message tiếng Việt, kết thúc bằng `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

## Deviation from spec

**§6.4 `figma_export`** — spec ban đầu ghi "server tự resize". Thay bằng `exportAsync({constraint})` resize ngay trong Figma. Bỏ được dependency native (`sharp`). Spec đã cập nhật.

**§8 "lỗi giữa chừng báo rõ đã thực thi tới đâu" — cover một phần.** Sandbox Figma không cho biết lệnh dừng ở đâu khi `eval` ném giữa chừng; muốn có thì phải bọc từng thao tác bằng instrumentation, đắt hơn giá trị thu về. Plan cài đặt phần biện pháp thực dụng của spec: mỗi `eval` là đúng một bước undo (Task 5, `figma.commitUndo()` trong `finally`), nên một lần Ctrl+Z dọn sạch trạng thái dở dang. Lỗi trả về có `message` và `line`, không có tiến độ.

## File Structure

```
packages/core/                      THUẦN TUÝ — toàn bộ unit test ở đây
  src/protocol.ts                   Kiểu thông điệp bridge + hằng số giới hạn
  src/color.ts                      hex ↔ rgb, luminance, contrast ratio
  src/types.ts                      RawNode (hình dạng node Figma), SnapNode, Warning, Snapshot
  src/serialize.ts                  RawNode → SnapNode (nén, bỏ default)
  src/warnings.ts                   RawNode → Warning[]
  src/snapshot.ts                   Gộp serialize + warnings thành Snapshot
  src/index.ts                      Re-export
  tests/*.test.ts

packages/host/                      NODE — MCP server + bridge daemon
  src/bridge/daemon.ts              WS server, registry kết nối, định tuyến
  src/bridge/main.ts                bin: figma-mcp-bridge
  src/mcp/client.ts                 WS client + auto-spawn daemon
  src/mcp/errors.ts                 Làm giàu lỗi + cắt ngắn
  src/mcp/assets.ts                 Giải đường dẫn trong allowlist
  src/mcp/tools.ts                  Đăng ký 5 tool
  src/mcp/main.ts                   bin: figma-mcp-server
  tests/*.test.ts

packages/plugin/                    FIGMA
  manifest.json
  build.mjs                         esbuild
  src/code.ts                       sandbox: dispatcher op
  src/ui.html + src/ui.ts           iframe: WS client, relay postMessage
  src/helpers.ts                    Helper gắn globalThis
  src/ops.ts                        Cài đặt từng op

spike/eval-check/                   Task 1 — plugin độc lập, dùng xong giữ làm tư liệu
assets/.gitkeep                     Nơi bạn bỏ ảnh vào
```

---

### Task 1: Spike — xác minh `eval` chạy được trong sandbox Figma

Đây là rủi ro số 1 của spec §3. Chặn hình dạng của đường ghi. Làm trước mọi thứ.

**Files:**
- Create: `spike/eval-check/manifest.json`
- Create: `spike/eval-check/code.js`
- Create: `spike/eval-check/ui.html`

**Interfaces:**
- Consumes: không
- Produces: kết luận nhị phân — `eval` chạy được hay không. Quyết định Task 6 giữ nguyên hay đổi sang DSL khai báo.

**Bước này cần bạn thao tác tay trong Figma Desktop.** Không tự động hoá được.

- [ ] **Step 1: Viết manifest**

```json
{
  "name": "Eval Spike",
  "id": "eval-spike-local",
  "api": "1.0.0",
  "main": "code.js",
  "ui": "ui.html",
  "editorType": ["figma"],
  "documentAccess": "dynamic-page",
  "networkAccess": { "allowedDomains": ["none"] }
}
```

- [ ] **Step 2: Viết code.js — chạy 4 phép thử trong sandbox**

```js
figma.showUI(__html__, { width: 420, height: 320 });

const tests = [
  ['eval biểu thức đơn giản', () => eval('1 + 1')],
  ['eval chạm figma.*', () => eval('figma.currentPage.name')],
  ['new Function', () => new Function('return 2 + 3')()],
  ['eval async IIFE + globalThis', () => {
    globalThis.__probe = 7;
    return eval('(async () => { return globalThis.__probe + 1; })()');
  }],
];

(async () => {
  const results = [];
  for (const [name, fn] of tests) {
    try {
      const value = await fn();
      results.push({ name, ok: true, value: String(value) });
    } catch (e) {
      results.push({ name, ok: false, value: String(e && e.message || e) });
    }
  }
  figma.ui.postMessage(results);
})();
```

Phép thử thứ 4 là phép thử quan trọng nhất: nó kiểm tra đúng cách `figma_eval` sẽ hoạt động thật — bọc async, và đọc biến qua `globalThis` chứ không qua closure.

- [ ] **Step 3: Viết ui.html**

```html
<body style="font:12px/1.5 monospace;padding:8px">
<div id="out">đang chạy…</div>
<script>
onmessage = (e) => {
  const rows = e.data.pluginMessage;
  document.getElementById('out').innerHTML = rows.map(r =>
    `<div>${r.ok ? '✅' : '❌'} <b>${r.name}</b><br><span style="color:#666">${r.value}</span></div>`
  ).join('<hr>');
};
</script>
</body>
```

- [ ] **Step 4: Chạy trong Figma Desktop**

Figma Desktop → menu Plugins → Development → Import plugin from manifest… → chọn `spike/eval-check/manifest.json` → chạy plugin "Eval Spike".

Ghi lại kết quả 4 dòng.

- [ ] **Step 5: Quyết định nhánh**

| Kết quả | Hành động |
|---|---|
| Phép thử 1, 2, 4 đều ✅ | Tiếp tục plan này nguyên vẹn |
| Phép thử 4 ❌ nhưng 1, 2 ✅ | Giữ `figma_eval`, nhưng code phải là biểu thức đồng bộ; Task 6 bỏ lớp bọc async, helper chuyển sang API đồng bộ |
| Phép thử 1 hoặc 2 ❌ | **DỪNG.** Đường ghi đổi sang DSL khai báo `figma_apply(ops[])` theo spec §3. Task 6 phải viết lại; Task 2-5 và 7-12 giữ nguyên |

- [ ] **Step 6: Commit**

```bash
git add spike/eval-check
git commit -m "spike: xác minh eval trong sandbox Figma

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Scaffold workspace + package core với test màu/tương phản

**Files:**
- Create: `package.json`, `tsconfig.base.json`, `vitest.config.ts`, `.gitignore`
- Create: `packages/core/package.json`, `packages/core/tsconfig.json`
- Create: `packages/core/src/color.ts`, `packages/core/src/index.ts`
- Create: `assets/.gitkeep`
- Test: `packages/core/tests/color.test.ts`

**Interfaces:**
- Consumes: không
- Produces:
  - `type RGB = { r: number; g: number; b: number }` — mỗi kênh 0..1
  - `toHex(c: RGB, opacity?: number): string` — `"#RRGGBB"`, hoặc `"#RRGGBBAA"` khi `opacity < 1`
  - `fromHex(hex: string): RGB`
  - `relativeLuminance(c: RGB): number`
  - `contrastRatio(a: RGB, b: RGB): number`

- [ ] **Step 1: Tạo package.json gốc**

```json
{
  "name": "figma-mcp-bridge",
  "private": true,
  "type": "module",
  "workspaces": ["packages/*"],
  "engines": { "node": ">=20" },
  "scripts": {
    "test": "vitest run",
    "build": "tsc -b packages/core packages/host && node packages/plugin/build.mjs"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "vitest": "^2.1.0",
    "@types/node": "^22.0.0"
  }
}
```

- [ ] **Step 2: Tạo tsconfig.base.json, vitest.config.ts, .gitignore**

`tsconfig.base.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "declaration": true,
    "composite": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  }
}
```

`vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['packages/*/tests/**/*.test.ts'] } });
```

`.gitignore`:
```
node_modules/
dist/
*.tsbuildinfo
assets/*
!assets/.gitkeep
```

- [ ] **Step 3: Tạo packages/core/package.json và tsconfig.json**

```json
{
  "name": "@figma-mcp/core",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": { ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" } }
}
```

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "src" },
  "include": ["src"]
}
```

- [ ] **Step 4: Viết test thất bại**

`packages/core/tests/color.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { toHex, fromHex, contrastRatio } from '../src/color.js';

describe('toHex', () => {
  it('chuyển rgb 0..1 sang hex hoa', () => {
    expect(toHex({ r: 1, g: 0.8196, b: 0.4 })).toBe('#FFD166');
  });
  it('bỏ alpha khi opacity = 1', () => {
    expect(toHex({ r: 0, g: 0, b: 0 }, 1)).toBe('#000000');
  });
  it('thêm 2 ký tự alpha khi opacity < 1', () => {
    expect(toHex({ r: 1, g: 1, b: 1 }, 0.5)).toBe('#FFFFFF80');
  });
});

describe('fromHex', () => {
  it('nghịch đảo được toHex', () => {
    const c = fromHex('#E63946');
    expect(toHex(c)).toBe('#E63946');
  });
});

describe('contrastRatio', () => {
  it('đen trên trắng là 21:1', () => {
    const r = contrastRatio({ r: 0, g: 0, b: 0 }, { r: 1, g: 1, b: 1 });
    expect(r).toBeCloseTo(21, 1);
  });
  it('màu giống nhau là 1:1', () => {
    const c = { r: 0.5, g: 0.2, b: 0.9 };
    expect(contrastRatio(c, c)).toBeCloseTo(1, 5);
  });
  it('đối xứng, không phụ thuộc thứ tự tham số', () => {
    const a = { r: 1, g: 0.82, b: 0.4 }, b = { r: 0.1, g: 0.1, b: 0.18 };
    expect(contrastRatio(a, b)).toBeCloseTo(contrastRatio(b, a), 10);
  });
});
```

- [ ] **Step 5: Chạy test, xác nhận thất bại**

Run: `npm install && npx vitest run packages/core/tests/color.test.ts`
Expected: FAIL — `Cannot find module '../src/color.js'`

- [ ] **Step 6: Cài đặt color.ts**

```ts
export type RGB = { r: number; g: number; b: number };

const byte = (v: number): string =>
  Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0').toUpperCase();

export function toHex(c: RGB, opacity = 1): string {
  const base = `#${byte(c.r)}${byte(c.g)}${byte(c.b)}`;
  return opacity >= 1 ? base : base + byte(opacity);
}

export function fromHex(hex: string): RGB {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.slice(0, 2), 16) / 255,
    g: parseInt(h.slice(2, 4), 16) / 255,
    b: parseInt(h.slice(4, 6), 16) / 255,
  };
}

export function relativeLuminance(c: RGB): number {
  const f = (v: number) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
}

export function contrastRatio(a: RGB, b: RGB): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}
```

`packages/core/src/index.ts`:
```ts
export * from './color.js';
```

- [ ] **Step 7: Chạy test, xác nhận xanh**

Run: `npx vitest run packages/core/tests/color.test.ts`
Expected: PASS — 7 test

- [ ] **Step 8: Commit**

```bash
git add package.json tsconfig.base.json vitest.config.ts .gitignore packages/core assets/.gitkeep
git commit -m "feat: scaffold workspace và module màu của core

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Protocol + bridge daemon

**Files:**
- Create: `packages/core/src/protocol.ts`
- Modify: `packages/core/src/index.ts`
- Create: `packages/host/package.json`, `packages/host/tsconfig.json`
- Create: `packages/host/src/bridge/daemon.ts`, `packages/host/src/bridge/main.ts`
- Test: `packages/host/tests/daemon.test.ts`

**Interfaces:**
- Consumes: không
- Produces:
  - `type Op = 'status' | 'eval' | 'snapshot' | 'export' | 'images'`
  - `interface BridgeError { message: string; hint?: string; line?: number; snippet?: string }`
  - `interface Request { id: string; op: Op; payload?: unknown }`
  - `type Response = { id: string; ok: true; result: unknown } | { id: string; ok: false; error: BridgeError }`
  - `type Hello = { type: 'hello'; role: 'plugin'; fileName: string; pageId: string; pageName: string } | { type: 'hello'; role: 'client' }`
  - `const DEFAULT_PORT = 3055`, `const LIMITS`
  - `startDaemon(port: number): Promise<{ close(): Promise<void> }>` từ `daemon.ts`

- [ ] **Step 1: Viết protocol.ts**

```ts
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
```

Thêm vào `packages/core/src/index.ts`:
```ts
export * from './protocol.js';
```

- [ ] **Step 2: Tạo packages/host/package.json và tsconfig.json**

```json
{
  "name": "@figma-mcp/host",
  "version": "0.1.0",
  "type": "module",
  "bin": {
    "figma-mcp-server": "./dist/mcp/main.js",
    "figma-mcp-bridge": "./dist/bridge/main.js"
  },
  "dependencies": {
    "@figma-mcp/core": "*",
    "@modelcontextprotocol/sdk": "^1.0.0",
    "ws": "^8.18.0",
    "zod": "^3.23.0"
  },
  "devDependencies": { "@types/ws": "^8.5.0" }
}
```

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "src" },
  "references": [{ "path": "../core" }],
  "include": ["src"]
}
```

- [ ] **Step 3: Viết test thất bại**

`packages/host/tests/daemon.test.ts`:
```ts
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
  it('định tuyến request từ client tới plugin và trả response đúng id', async () => {
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

  it('trả lỗi ngay khi chưa có plugin nào kết nối', async () => {
    daemon = await startDaemon(PORT);
    const client = await open('client');
    client.send(JSON.stringify({ id: 'r2', op: 'status' }));
    const res = await next(client, (m) => m.id === 'r2');
    expect(res.ok).toBe(false);
    expect(res.error.message).toContain('Plugin chưa chạy');
    client.close();
  });

  it('plugin mới thay thế plugin cũ và báo cho bản cũ', async () => {
    daemon = await startDaemon(PORT);
    const first = await open('plugin');
    const replaced = next(first, (m) => m.type === 'notice' && m.kind === 'replaced');
    const second = await open('plugin');
    expect(await replaced).toMatchObject({ kind: 'replaced' });
    first.close(); second.close();
  });

  it('không lẫn response khi nhiều request chạy song song', async () => {
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
```

- [ ] **Step 4: Chạy test, xác nhận thất bại**

Run: `npx vitest run packages/host/tests/daemon.test.ts`
Expected: FAIL — `Cannot find module '../src/bridge/daemon.js'`

- [ ] **Step 5: Cài đặt daemon.ts**

```ts
import { WebSocketServer, WebSocket } from 'ws';
import type { Response } from '@figma-mcp/core';

interface Conn { ws: WebSocket; role: 'plugin' | 'client' | null }

export async function startDaemon(port: number): Promise<{ close(): Promise<void> }> {
  const wss = new WebSocketServer({ host: '127.0.0.1', port });
  const conns = new Map<WebSocket, Conn>();
  let plugin: WebSocket | null = null;
  /** id request → socket client đã gửi, để trả response về đúng nơi */
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

      // Request từ client → chuyển tiếp xuống plugin
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

      // Response từ plugin → trả về đúng client đã hỏi
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
```

- [ ] **Step 6: Viết bridge/main.ts**

```ts
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
```

- [ ] **Step 7: Chạy test, xác nhận xanh**

Run: `npm install && npx vitest run packages/host/tests/daemon.test.ts`
Expected: PASS — 4 test

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/protocol.ts packages/core/src/index.ts packages/host
git commit -m "feat: protocol và bridge daemon với định tuyến theo id

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: MCP client + auto-spawn daemon + tool `figma_status`

**Files:**
- Create: `packages/host/src/mcp/client.ts`, `packages/host/src/mcp/errors.ts`
- Create: `packages/host/src/mcp/tools.ts`, `packages/host/src/mcp/main.ts`
- Test: `packages/host/tests/client.test.ts`, `packages/host/tests/errors.test.ts`

**Interfaces:**
- Consumes: `startDaemon`, `Request`, `Response`, `BridgeError`, `LIMITS`, `DEFAULT_PORT`
- Produces:
  - `class BridgeClient { constructor(port: number); connect(): Promise<void>; call(op: Op, payload?: unknown, timeoutMs?: number): Promise<unknown>; close(): void }`
  - `enrichError(err: BridgeError): BridgeError` — thêm `hint`, cắt `message` còn `LIMITS.errorChars`
  - `registerTools(server: McpServer, client: BridgeClient): void`

- [ ] **Step 1: Viết test thất bại cho errors.ts**

`packages/host/tests/errors.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { enrichError } from '../src/mcp/errors.js';

describe('enrichError', () => {
  it('gợi ý setText khi lỗi liên quan font', () => {
    const e = enrichError({ message: 'Cannot write to node with unloaded font Inter Bold' });
    expect(e.hint).toContain('setText');
  });
  it('gợi ý getNodeByIdAsync', () => {
    const e = enrichError({ message: 'figma.getNodeById is not a function' });
    expect(e.hint).toContain('getNodeByIdAsync');
  });
  it('gợi ý clone mảng fills', () => {
    const e = enrichError({ message: "Cannot add property 0, object is not extensible" });
    expect(e.hint).toContain('clone');
  });
  it('cắt message dài còn 500 ký tự', () => {
    const e = enrichError({ message: 'x'.repeat(900) });
    expect(e.message.length).toBe(500);
  });
  it('giữ nguyên hint có sẵn, không ghi đè', () => {
    const e = enrichError({ message: 'font lỗi', hint: 'gợi ý riêng' });
    expect(e.hint).toBe('gợi ý riêng');
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận thất bại**

Run: `npx vitest run packages/host/tests/errors.test.ts`
Expected: FAIL — module không tồn tại

- [ ] **Step 3: Cài đặt errors.ts**

```ts
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
```

- [ ] **Step 4: Chạy test, xác nhận xanh**

Run: `npx vitest run packages/host/tests/errors.test.ts`
Expected: PASS — 5 test

- [ ] **Step 5: Viết test thất bại cho client.ts**

`packages/host/tests/client.test.ts`:
```ts
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
```

- [ ] **Step 6: Chạy test, xác nhận thất bại**

Run: `npx vitest run packages/host/tests/client.test.ts`
Expected: FAIL — module không tồn tại

- [ ] **Step 7: Cài đặt client.ts**

```ts
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
```

- [ ] **Step 8: Chạy test, xác nhận xanh**

Run: `npx vitest run packages/host/tests/client.test.ts`
Expected: PASS — 3 test

- [ ] **Step 9: Đăng ký tool `figma_status` và viết main.ts**

`packages/host/src/mcp/tools.ts`:
```ts
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { BridgeClient } from './client.js';

const text = (v: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(v) }] });

export function registerTools(server: McpServer, client: BridgeClient): void {
  server.registerTool(
    'figma_status',
    {
      description: 'Trạng thái kết nối plugin Figma, file/page đang mở, selection hiện tại, thư mục assets cho phép. Gọi đầu phiên.',
      inputSchema: {},
    },
    async () => text(await client.call('status'))
  );
}
```

`packages/host/src/mcp/main.ts`:
```ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { DEFAULT_PORT } from '@figma-mcp/core';
import { BridgeClient } from './client.js';
import { registerTools } from './tools.js';

const client = new BridgeClient(Number(process.env.FIGMA_BRIDGE_PORT ?? DEFAULT_PORT));
await client.connect();

const server = new McpServer({ name: 'figma-mcp-bridge', version: '0.1.0' });
registerTools(server, client);
await server.connect(new StdioServerTransport());
```

- [ ] **Step 10: Build và kiểm tra server khởi động được**

Run: `npx tsc -b packages/core packages/host && node packages/host/dist/mcp/main.js < /dev/null`
Expected: thoát không lỗi (stdin đóng ngay). Không được có exception về module hay cổng.

- [ ] **Step 11: Commit**

```bash
git add packages/host
git commit -m "feat: MCP client với auto-spawn daemon, làm giàu lỗi, tool figma_status

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Vỏ plugin Figma — kết nối thật đầu tiên

**Files:**
- Create: `packages/plugin/package.json`, `packages/plugin/manifest.json`, `packages/plugin/build.mjs`
- Create: `packages/plugin/src/code.ts`, `packages/plugin/src/ui.html`, `packages/plugin/src/ui.ts`
- Create: `packages/plugin/src/ops.ts`

**Interfaces:**
- Consumes: `Request`, `Response`, `DEFAULT_PORT` từ core
- Produces: `handleOp(op: string, payload: any): Promise<unknown>` trong `ops.ts` — Task 6, 9, 10, 11 thêm nhánh vào đây

- [ ] **Step 1: Tạo package.json, manifest.json, build.mjs**

`packages/plugin/package.json`:
```json
{
  "name": "@figma-mcp/plugin",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": { "build": "node build.mjs" },
  "dependencies": { "@figma-mcp/core": "*" },
  "devDependencies": { "@figma/plugin-typings": "^1.100.0", "esbuild": "^0.24.0" }
}
```

`packages/plugin/manifest.json`:
```json
{
  "name": "MCP Creative Bridge",
  "id": "mcp-creative-bridge-local",
  "api": "1.0.0",
  "main": "dist/code.js",
  "ui": "dist/ui.html",
  "editorType": ["figma"],
  "documentAccess": "dynamic-page",
  "networkAccess": {
    "allowedDomains": ["none"],
    "devAllowedDomains": ["http://localhost:3055", "ws://localhost:3055"]
  }
}
```

`packages/plugin/build.mjs` — nhúng ui.ts vào ui.html thành một file, vì Figma chỉ nạp được một file UI:
```js
import * as esbuild from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';

await mkdir('dist', { recursive: true });

// sourcemap: false — sourcemap kiểu eval không chạy trong sandbox Figma
await esbuild.build({
  entryPoints: ['src/code.ts'],
  bundle: true, format: 'iife', target: 'es2017',
  sourcemap: false, outfile: 'dist/code.js',
});

const ui = await esbuild.build({
  entryPoints: ['src/ui.ts'],
  bundle: true, format: 'iife', target: 'es2017',
  sourcemap: false, write: false,
});

const html = await readFile('src/ui.html', 'utf8');
await writeFile('dist/ui.html', html.replace('/*BUNDLE*/', ui.outputFiles[0].text));
console.log('plugin đã build vào dist/');
```

- [ ] **Step 2: Viết ui.html + ui.ts (WS client và relay)**

`src/ui.html`:
```html
<body style="font:12px/1.6 -apple-system,sans-serif;margin:0;padding:12px">
  <div><span id="dot">⚪</span> <b id="state">đang nối…</b></div>
  <div id="detail" style="color:#666;margin-top:4px"></div>
  <button id="retry" style="margin-top:10px">Nối lại</button>
  <script>/*BUNDLE*/</script>
</body>
```

`src/ui.ts`:
```ts
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

  // Lệnh từ daemon → chuyển xuống sandbox
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.type === 'notice' && msg.kind === 'replaced') {
      paint('🔴', 'đã bị thay thế', 'một phiên plugin khác đã chiếm kết nối');
      ws?.close();
      return;
    }
    parent.postMessage({ pluginMessage: { kind: 'request', msg } }, '*');
  };

  ws.onclose = () => {
    paint('🔴', 'mất kết nối', `thử lại sau ${backoff}ms`);
    setTimeout(connect, backoff);
    backoff = Math.min(backoff * 2, 10_000);
  };
  ws.onerror = () => ws?.close();
}

// Phản hồi từ sandbox → gửi lên daemon; và handshake khi sandbox báo sẵn sàng
onmessage = (e: MessageEvent) => {
  const m = e.data.pluginMessage;
  if (!m || ws?.readyState !== WebSocket.OPEN) return;
  if (m.kind === 'hello') ws.send(JSON.stringify({ type: 'hello', role: 'plugin', ...m.info }));
  if (m.kind === 'response') ws.send(JSON.stringify(m.msg));
};

$('retry').onclick = () => { backoff = 500; ws?.close(); };
connect();
```

- [ ] **Step 3: Viết ops.ts với op `status`**

```ts
export async function handleOp(op: string, payload: any): Promise<unknown> {
  switch (op) {
    case 'status': {
      const page = figma.currentPage;
      return {
        connected: true,
        file: figma.root.name,
        page: { id: page.id, name: page.name },
        selection: page.selection.map((n) => ({ id: n.id, name: n.name, type: n.type })),
      };
    }
    default:
      throw new Error(`Op không nhận ra: ${op}`);
  }
}
```

- [ ] **Step 4: Viết code.ts (dispatcher sandbox)**

```ts
import { handleOp } from './ops.js';

figma.showUI(__html__, { width: 300, height: 150 });

function sendHello() {
  figma.ui.postMessage({
    kind: 'hello',
    info: {
      fileName: figma.root.name,
      pageId: figma.currentPage.id,
      pageName: figma.currentPage.name,
    },
  });
}

figma.ui.onmessage = async (m: any) => {
  if (m?.kind === 'connected') { sendHello(); return; }
  if (m?.kind !== 'request') return;

  const { id, op, payload } = m.msg;
  try {
    const result = await handleOp(op, payload);
    figma.ui.postMessage({ kind: 'response', msg: { id, ok: true, result } });
  } catch (e: any) {
    figma.ui.postMessage({
      kind: 'response',
      msg: { id, ok: false, error: { message: String(e?.message ?? e) } },
    });
  } finally {
    figma.commitUndo();
  }
};
```

- [ ] **Step 5: Build plugin**

Run: `npm install && npm run build -w @figma-mcp/plugin`
Expected: tạo `packages/plugin/dist/code.js` và `dist/ui.html` không lỗi

- [ ] **Step 6: Smoke test thủ công end-to-end**

1. Chạy daemon: `node packages/host/dist/bridge/main.js`
2. Figma Desktop → Plugins → Development → Import plugin from manifest… → `packages/plugin/manifest.json`
3. Chạy plugin "MCP Creative Bridge". Cửa sổ plugin phải hiện 🟢 **đã kết nối**.
4. Đăng ký MCP server với Claude Code:

```bash
claude mcp add figma -- node "D:/Videcode/MCP Creative/packages/host/dist/mcp/main.js"
```

5. Trong Claude Code, gọi `figma_status`. Phải trả về đúng tên file và page đang mở trong Figma.

Expected: tên file/page khớp với Figma đang mở. Đây là mốc "xương sống đã thông".

- [ ] **Step 7: Commit**

```bash
git add packages/plugin
git commit -m "feat: vỏ plugin Figma với WS relay và op status

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: `figma_eval` + helper trên globalThis

**Điều kiện:** Task 1 cho kết quả ✅. Nếu Task 1 thất bại ở phép thử 1 hoặc 2, task này thay bằng DSL khai báo theo spec §3.

**Files:**
- Create: `packages/plugin/src/helpers.ts`
- Modify: `packages/plugin/src/ops.ts` (thêm nhánh `eval`)
- Modify: `packages/plugin/src/code.ts` (cài helper trước khi nhận op)
- Modify: `packages/host/src/mcp/tools.ts` (thêm tool)

**Interfaces:**
- Consumes: `handleOp`, `LIMITS`
- Produces: helper toàn cục `setText`, `snapshot`, `listDocImages`, `hex`, `rgb`; op `eval` nhận `{code, timeoutMs}` trả `{result}` hoặc ném lỗi có `line`

- [ ] **Step 1: Viết helpers.ts**

```ts
import { toHex, fromHex } from '@figma-mcp/core';

/**
 * Gắn lên globalThis, KHÔNG dùng closure — eval của Figma chạy ở global scope
 * nên code người dùng không nhìn thấy biến cục bộ của module này.
 */
export function installHelpers(): void {
  const g = globalThis as any;

  g.setText = async (node: TextNode, str: string): Promise<TextNode> => {
    const font = node.fontName;
    if (font === figma.mixed) throw new Error('Node có nhiều font, gán node.fontName trước khi setText');
    await figma.loadFontAsync(font as FontName);
    node.characters = str;
    return node;
  };

  g.listDocImages = async (): Promise<Array<{ hash: string; usedBy: string[] }>> => {
    const byHash = new Map<string, string[]>();
    const walk = (node: BaseNode & ChildrenMixin, path: string) => {
      for (const child of node.children) {
        const here = `${path}/${child.name}`;
        const fills = (child as GeometryMixin).fills;
        if (Array.isArray(fills)) {
          for (const f of fills) {
            if (f.type === 'IMAGE' && f.imageHash) {
              const list = byHash.get(f.imageHash) ?? [];
              list.push(here);
              byHash.set(f.imageHash, list);
            }
          }
        }
        if ('children' in child) walk(child as BaseNode & ChildrenMixin, here);
      }
    };
    walk(figma.currentPage, figma.currentPage.name);
    return [...byHash].map(([hash, usedBy]) => ({ hash, usedBy }));
  };

  g.hex = toHex;
  g.rgb = fromHex;
}
```

- [ ] **Step 2: Gọi installHelpers trong code.ts**

Thêm vào đầu `packages/plugin/src/code.ts`, ngay sau import:

```ts
import { installHelpers } from './helpers.js';
installHelpers();
```

- [ ] **Step 3: Thêm nhánh `eval` vào ops.ts**

Chèn trước nhánh `default`:

```ts
    case 'eval': {
      const { code } = payload as { code: string };
      // Bọc trong async function để dùng được await và return ở cấp cao nhất.
      // eval ở global scope: helper phải nằm trên globalThis, không phải closure.
      const fn = eval(`(async function(){\n${code}\n})`);
      const raw = await fn();
      return { result: collapse(raw) };
    }
```

Thêm hàm `collapse` vào cuối `ops.ts` — thu gọn node Figma và cắt vòng lặp tham chiếu:

```ts
function collapse(value: unknown, seen = new WeakSet<object>(), depth = 0): unknown {
  if (value === null || typeof value !== 'object') {
    return typeof value === 'symbol' ? 'MIXED' : value;
  }
  if (seen.has(value)) return '[vòng lặp tham chiếu]';
  if (depth > 6) return '[quá sâu]';
  seen.add(value);

  const node = value as { id?: unknown; type?: unknown; name?: unknown };
  if (typeof node.id === 'string' && typeof node.type === 'string') {
    return { id: node.id, name: node.name, type: node.type };
  }
  if (Array.isArray(value)) return value.map((v) => collapse(v, seen, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) out[k] = collapse(v, seen, depth + 1);
  return out;
}
```

- [ ] **Step 4: Đăng ký tool trong tools.ts**

Thêm vào `registerTools`:

```ts
  server.registerTool(
    'figma_eval',
    {
      description: [
        'Chạy JavaScript trong sandbox Figma với toàn quyền Plugin API. Code được bọc sẵn trong async function — dùng được await và return ở cấp cao nhất.',
        'BẮT BUỘC nhớ 5 điều:',
        '1. Dùng await figma.getNodeByIdAsync(id), KHÔNG có getNodeById đồng bộ.',
        '2. Đổi nội dung text bằng await setText(node, str) — nó tự loadFontAsync. Gán node.characters trực tiếp sẽ lỗi.',
        '3. fills/strokes bất biến: const f = [...node.fills]; f[0] = {...}; node.fills = f;',
        '4. resize() reset textAutoResize về NONE và auto-layout sizing về FIXED — cấu hình lại sau khi gọi.',
        '5. Thao tác ảnh là async: const img = figma.createImage(bytes); await img.getSizeAsync().',
        'Helper toàn cục: setText, listDocImages, hex, rgb. Mỗi lần gọi là đúng một bước undo.',
      ].join('\n'),
      inputSchema: {
        code: z.string().describe('JavaScript chạy trong sandbox Figma'),
        timeoutMs: z.number().int().positive().optional(),
      },
    },
    async ({ code, timeoutMs }) => {
      const out = await client.call('eval', { code }, timeoutMs ?? LIMITS.evalTimeoutMs);
      const json = JSON.stringify((out as { result: unknown }).result);
      const body = json.length > LIMITS.evalResultBytes
        ? json.slice(0, LIMITS.evalResultBytes) + `\n…đã cắt, tổng ${json.length} byte`
        : json;
      return { content: [{ type: 'text' as const, text: body }] };
    }
  );
```

Thêm import `LIMITS` vào đầu `tools.ts`:
```ts
import { LIMITS } from '@figma-mcp/core';
```

- [ ] **Step 5: Build và smoke test thủ công**

Run: `npm run build && node packages/host/dist/bridge/main.js &`

Chạy lại plugin trong Figma, rồi trong Claude Code gọi `figma_eval` với:

```js
const r = figma.createRectangle();
r.resize(200, 120);
r.x = 0; r.y = 0;
r.fills = [{ type: 'SOLID', color: rgb('#E63946') }];
figma.currentPage.appendChild(r);
return { id: r.id, name: r.name };
```

Expected: hình chữ nhật đỏ 200×120 xuất hiện trong Figma; tool trả `{"id":"...","name":"Rectangle 1"}`. Bấm Ctrl+Z một lần phải xoá sạch.

- [ ] **Step 6: Commit**

```bash
git add packages/plugin packages/host/src/mcp/tools.ts
git commit -m "feat: figma_eval với helper globalThis và thu gọn kết quả

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: core — serializer snapshot

**Files:**
- Create: `packages/core/src/types.ts`, `packages/core/src/serialize.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/tests/serialize.test.ts`

**Interfaces:**
- Consumes: `toHex`
- Produces:
  - `interface RawNode` — hình dạng node Figma đọc được, mọi trường optional, symbol nghĩa là mixed
  - `interface SnapNode { id: string; name: string; type: string; x?: number; y?: number; w?: number; h?: number; [k: string]: unknown; c?: SnapNode[] }`
  - `serialize(node: RawNode, opts?: { depth?: number; maxNodes?: number }): { root: SnapNode; omitted: number }`

- [ ] **Step 1: Viết types.ts**

```ts
export interface RawPaint {
  type: 'SOLID' | 'IMAGE' | 'GRADIENT_LINEAR' | 'GRADIENT_RADIAL' | 'GRADIENT_ANGULAR' | 'GRADIENT_DIAMOND';
  visible?: boolean;
  opacity?: number;
  color?: { r: number; g: number; b: number };
  imageHash?: string | null;
  scaleMode?: string;
  gradientStops?: Array<{ position: number; color: { r: number; g: number; b: number; a?: number } }>;
  gradientTransform?: number[][];
}

/** Node Figma đã đọc ra. Mọi trường optional; symbol nghĩa là figma.mixed. */
export interface RawNode {
  id: string;
  name: string;
  type: string;
  x?: number; y?: number; width?: number; height?: number;
  visible?: boolean; opacity?: number; rotation?: number; blendMode?: string;
  locked?: boolean; clipsContent?: boolean;
  fills?: readonly RawPaint[] | symbol;
  strokes?: readonly RawPaint[];
  strokeWeight?: number | symbol;
  cornerRadius?: number | symbol;
  topLeftRadius?: number; topRightRadius?: number;
  bottomRightRadius?: number; bottomLeftRadius?: number;
  characters?: string;
  fontName?: { family: string; style: string } | symbol;
  fontSize?: number | symbol;
  lineHeight?: { value: number; unit: string } | symbol;
  letterSpacing?: { value: number; unit: string } | symbol;
  textAlignHorizontal?: string; textAlignVertical?: string; textAutoResize?: string;
  layoutMode?: 'NONE' | 'HORIZONTAL' | 'VERTICAL';
  itemSpacing?: number;
  paddingTop?: number; paddingRight?: number; paddingBottom?: number; paddingLeft?: number;
  primaryAxisAlignItems?: string;
  effects?: readonly unknown[];
  mainComponentName?: string;
  children?: readonly RawNode[];
}

export interface SnapNode {
  id: string; name: string; type: string;
  x?: number; y?: number; w?: number; h?: number;
  c?: SnapNode[];
  [key: string]: unknown;
}

export interface Warning {
  node: string;
  name: string;
  issue: 'overflow' | 'offscreen' | 'overlap' | 'contrast' | 'contrast_unknown'
       | 'tiny_font' | 'hidden' | 'unnamed' | 'missing_font';
  detail: string;
}

export interface Snapshot {
  schema: 'figma-snapshot/1';
  root: SnapNode;
  warnings: Warning[];
  truncated?: { omitted: number; hint: string };
}
```

- [ ] **Step 2: Viết test thất bại**

`packages/core/tests/serialize.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { serialize } from '../src/serialize.js';
import type { RawNode } from '../src/types.js';

const rect = (over: Partial<RawNode> = {}): RawNode => ({
  id: '1:3', name: 'BG', type: 'RECTANGLE',
  x: 0, y: 0, width: 320, height: 480,
  visible: true, opacity: 1, rotation: 0, blendMode: 'NORMAL',
  locked: false, strokes: [], effects: [],
  fills: [{ type: 'SOLID', color: { r: 1, g: 0.8196, b: 0.4 } }],
  ...over,
});

describe('serialize', () => {
  it('bỏ mọi thuộc tính mang giá trị mặc định', () => {
    const { root } = serialize(rect());
    expect(root).toEqual({
      id: '1:3', name: 'BG', type: 'RECTANGLE',
      x: 0, y: 0, w: 320, h: 480, fill: '#FFD166',
    });
  });

  it('giữ lại thuộc tính khác mặc định', () => {
    const { root } = serialize(rect({ opacity: 0.5, rotation: 12, locked: true, visible: false }));
    expect(root.opacity).toBe(0.5);
    expect(root.rot).toBe(12);
    expect(root.locked).toBe(true);
    expect(root.hidden).toBe(true);
  });

  it('đóng gói font thành một chuỗi', () => {
    const { root } = serialize({
      id: '1:5', name: 'Title', type: 'TEXT', x: 24, y: 40, width: 272, height: 68,
      characters: 'Đại Chiến Tam Quốc',
      fontName: { family: 'Inter', style: 'Bold' }, fontSize: 28,
      lineHeight: { value: 34, unit: 'PIXELS' },
      textAlignHorizontal: 'CENTER',
      fills: [{ type: 'SOLID', color: { r: 1, g: 0.8196, b: 0.4 } }],
    });
    expect(root.font).toBe('Inter Bold 28/34');
    expect(root.text).toBe('Đại Chiến Tam Quốc');
    expect(root.align).toBe('CENTER');
  });

  it('cắt text dài ở 200 ký tự', () => {
    const { root } = serialize({ id: '1:9', name: 'T', type: 'TEXT', characters: 'a'.repeat(300) });
    expect(String(root.text)).toHaveLength(201);
    expect(String(root.text).endsWith('…')).toBe(true);
  });

  it('biểu diễn fill ảnh và fill gradient', () => {
    const img = serialize(rect({ fills: [{ type: 'IMAGE', imageHash: 'a3f9', scaleMode: 'FILL' }] }));
    expect(img.root.fill).toEqual({ type: 'IMAGE', hash: 'a3f9', mode: 'FILL' });

    const grad = serialize(rect({ fills: [{
      type: 'GRADIENT_LINEAR',
      gradientStops: [
        { position: 0, color: { r: 0, g: 0, b: 0 } },
        { position: 1, color: { r: 1, g: 1, b: 1 } },
      ],
    }] }));
    expect(grad.root.fill).toEqual({ type: 'LINEAR', stops: ['#000000@0', '#FFFFFF@1'] });
  });

  it('coi symbol là MIXED', () => {
    const { root } = serialize(rect({ fills: Symbol('mixed') }));
    expect(root.fill).toBe('MIXED');
  });

  it('gộp bốn góc bo bằng nhau thành một số, khác nhau thành mảng', () => {
    expect(serialize(rect({ cornerRadius: 22 })).root.radius).toBe(22);
    expect(serialize(rect({
      cornerRadius: Symbol('mixed'),
      topLeftRadius: 4, topRightRadius: 8, bottomRightRadius: 12, bottomLeftRadius: 16,
    })).root.radius).toEqual([4, 8, 12, 16]);
  });

  it('xuất auto-layout khi bật', () => {
    const { root } = serialize(rect({
      type: 'FRAME', layoutMode: 'VERTICAL', itemSpacing: 16,
      paddingTop: 24, paddingRight: 16, paddingBottom: 24, paddingLeft: 16,
      primaryAxisAlignItems: 'CENTER',
    }));
    expect(root.layout).toEqual({ dir: 'V', gap: 16, pad: [24, 16, 24, 16], align: 'CENTER' });
  });

  it('cắt theo depth và đếm số node bỏ qua', () => {
    const leaf = (id: string): RawNode => ({ id, name: id, type: 'RECTANGLE' });
    const tree: RawNode = {
      id: '0', name: 'root', type: 'FRAME',
      children: [{ id: '1', name: 'a', type: 'FRAME', children: [
        { id: '2', name: 'b', type: 'FRAME', children: [leaf('3'), leaf('4')] },
      ] }],
    };
    const { root, omitted } = serialize(tree, { depth: 2 });
    expect((root.c as any)[0].c[0].c).toBeUndefined();
    expect(omitted).toBe(2);
  });

  it('cắt theo maxNodes', () => {
    const children = Array.from({ length: 10 }, (_, i) => ({ id: `n${i}`, name: `n${i}`, type: 'RECTANGLE' }));
    const { root, omitted } = serialize({ id: '0', name: 'r', type: 'FRAME', children }, { maxNodes: 5 });
    expect((root.c as SnapNode[]).length).toBe(4);
    expect(omitted).toBe(6);
  });

  it('làm tròn số về 2 chữ số thập phân', () => {
    const { root } = serialize(rect({ x: 12.3456, width: 99.999 }));
    expect(root.x).toBe(12.35);
    expect(root.w).toBe(100);
  });
});
```

- [ ] **Step 3: Chạy test, xác nhận thất bại**

Run: `npx vitest run packages/core/tests/serialize.test.ts`
Expected: FAIL — module không tồn tại

- [ ] **Step 4: Cài đặt serialize.ts**

```ts
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

function fillsToValue(fills: readonly RawPaint[] | symbol | undefined): unknown {
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

/** Nén một node và cây con. Bỏ mọi thuộc tính mang giá trị mặc định. */
export function serialize(
  node: RawNode,
  opts: { depth?: number; maxNodes?: number } = {}
): { root: SnapNode; omitted: number } {
  const depth = opts.depth ?? 3;
  const maxNodes = opts.maxNodes ?? 300;
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

  const countAll = (nodes: readonly RawNode[]): number =>
    nodes.reduce((sum, n) => sum + 1 + countAll(n.children ?? []), 0);

  const root = walk(node, 0);
  return { root, omitted };
}
```

Thêm vào `packages/core/src/index.ts`:
```ts
export * from './types.js';
export * from './serialize.js';
```

- [ ] **Step 5: Chạy test, xác nhận xanh**

Run: `npx vitest run packages/core/tests/serialize.test.ts`
Expected: PASS — 11 test

- [ ] **Step 6: Commit**

```bash
git add packages/core
git commit -m "feat: serializer snapshot nén theo giá trị mặc định

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: core — phát hiện warnings

**Files:**
- Create: `packages/core/src/warnings.ts`, `packages/core/src/snapshot.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/tests/warnings.test.ts`

**Interfaces:**
- Consumes: `contrastRatio`, `RawNode`, `Warning`, `serialize`
- Produces:
  - `detectWarnings(root: RawNode): Warning[]`
  - `buildSnapshot(root: RawNode, opts?: { depth?: number; maxNodes?: number }): Snapshot`

Quy tắc theo spec §7.3, gồm hai định nghĩa đã chốt:
- **Node nền** = bounds phủ ≥ 90% diện tích artboard gốc; chồng lấn với node nền không tính `overlap`.
- **Nền của một TEXT** = node anh em nằm dưới nó trong thứ tự z gần nhất mà bounds phủ trọn TEXT; không có thì lấy `fill` của cha; cha không có fill đặc thì `contrast_unknown`.

- [ ] **Step 1: Viết test thất bại**

`packages/core/tests/warnings.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { detectWarnings } from '../src/warnings.js';
import type { RawNode } from '../src/types.js';

const solid = (hex: string) => [{
  type: 'SOLID' as const,
  color: {
    r: parseInt(hex.slice(1, 3), 16) / 255,
    g: parseInt(hex.slice(3, 5), 16) / 255,
    b: parseInt(hex.slice(5, 7), 16) / 255,
  },
}];

const art = (children: RawNode[]): RawNode => ({
  id: '1:1', name: 'Banner', type: 'FRAME', x: 0, y: 0, width: 320, height: 480,
  clipsContent: true, children,
});

const txt = (over: Partial<RawNode>): RawNode => ({
  id: 't', name: 'Title', type: 'TEXT', x: 10, y: 10, width: 100, height: 30,
  characters: 'Hello', fontName: { family: 'Inter', style: 'Bold' }, fontSize: 28,
  fills: solid('#FFFFFF'), ...over,
});

const has = (ws: ReturnType<typeof detectWarnings>, issue: string, node?: string) =>
  ws.some((w) => w.issue === issue && (node === undefined || w.node === node));

describe('detectWarnings', () => {
  it('phát hiện overflow khi con vượt mép cha có clip', () => {
    const w = detectWarnings(art([txt({ id: 'a', x: 260, width: 100 })]));
    expect(has(w, 'overflow', 'a')).toBe(true);
    expect(w.find((x) => x.issue === 'overflow')!.detail).toContain('40');
  });

  it('không báo overflow khi nằm gọn trong cha', () => {
    expect(has(detectWarnings(art([txt({ id: 'a', x: 10, width: 100 })])), 'overflow')).toBe(false);
  });

  it('phát hiện offscreen khi node nằm ngoài artboard', () => {
    expect(has(detectWarnings(art([txt({ id: 'a', x: 400 })])), 'offscreen', 'a')).toBe(true);
  });

  it('phát hiện overlap giữa hai TEXT', () => {
    const w = detectWarnings(art([
      txt({ id: 'a', x: 10, y: 10, width: 100, height: 30 }),
      txt({ id: 'b', x: 50, y: 20, width: 100, height: 30 }),
    ]));
    expect(has(w, 'overlap')).toBe(true);
  });

  it('không tính overlap với node nền phủ gần hết artboard', () => {
    const bg: RawNode = { id: 'bg', name: 'BG', type: 'RECTANGLE', x: 0, y: 0, width: 320, height: 480, fills: solid('#000000') };
    expect(has(detectWarnings(art([bg, txt({ id: 'a' })])), 'overlap')).toBe(false);
  });

  it('báo contrast khi chữ trên nền đặc dưới 4.5:1', () => {
    const bg: RawNode = { id: 'bg', name: 'BG', type: 'RECTANGLE', x: 0, y: 0, width: 320, height: 480, fills: solid('#FFFFFF') };
    const w = detectWarnings(art([bg, txt({ id: 'a', fills: solid('#EEEEEE'), fontSize: 14 })]));
    expect(has(w, 'contrast', 'a')).toBe(true);
  });

  it('không báo contrast khi đủ tương phản', () => {
    const bg: RawNode = { id: 'bg', name: 'BG', type: 'RECTANGLE', x: 0, y: 0, width: 320, height: 480, fills: solid('#000000') };
    expect(has(detectWarnings(art([bg, txt({ id: 'a', fills: solid('#FFFFFF') })])), 'contrast')).toBe(false);
  });

  it('báo contrast_unknown khi nền là ảnh', () => {
    const bg: RawNode = {
      id: 'bg', name: 'BG', type: 'RECTANGLE', x: 0, y: 0, width: 320, height: 480,
      fills: [{ type: 'IMAGE', imageHash: 'a3f9', scaleMode: 'FILL' }],
    };
    const w = detectWarnings(art([bg, txt({ id: 'a' })]));
    expect(has(w, 'contrast_unknown', 'a')).toBe(true);
    expect(w.find((x) => x.issue === 'contrast_unknown')!.detail).toContain('figma_export');
  });

  it('báo tiny_font dưới 10px', () => {
    expect(has(detectWarnings(art([txt({ id: 'a', fontSize: 8 })])), 'tiny_font', 'a')).toBe(true);
  });

  it('báo hidden khi visible false hoặc opacity gần 0', () => {
    expect(has(detectWarnings(art([txt({ id: 'a', visible: false })])), 'hidden', 'a')).toBe(true);
    expect(has(detectWarnings(art([txt({ id: 'b', opacity: 0.01 })])), 'hidden', 'b')).toBe(true);
  });

  it('báo unnamed với tên mặc định của Figma', () => {
    const w = detectWarnings(art([{ id: 'a', name: 'Rectangle 12', type: 'RECTANGLE', x: 0, y: 0, width: 10, height: 10 }]));
    expect(has(w, 'unnamed', 'a')).toBe(true);
  });

  it('không báo unnamed với tên do người đặt', () => {
    const w = detectWarnings(art([{ id: 'a', name: 'CTA Button', type: 'RECTANGLE', x: 0, y: 0, width: 10, height: 10 }]));
    expect(has(w, 'unnamed')).toBe(false);
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận thất bại**

Run: `npx vitest run packages/core/tests/warnings.test.ts`
Expected: FAIL — module không tồn tại

- [ ] **Step 3: Cài đặt warnings.ts**

```ts
import { contrastRatio, type RGB } from './color.js';
import type { RawNode, RawPaint, Warning } from './types.js';

const DEFAULT_NAME = /^(Rectangle|Ellipse|Frame|Group|Vector|Line|Text|Polygon|Star|Component|Instance) \d+$/;

interface Box { x: number; y: number; w: number; h: number }

const boxOf = (n: RawNode, ox: number, oy: number): Box => ({
  x: ox + (n.x ?? 0), y: oy + (n.y ?? 0), w: n.width ?? 0, h: n.height ?? 0,
});

const area = (b: Box): number => b.w * b.h;

function intersection(a: Box, b: Box): Box {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const r = Math.min(a.x + a.w, b.x + b.w);
  const bt = Math.min(a.y + a.h, b.y + b.h);
  return { x, y, w: Math.max(0, r - x), h: Math.max(0, bt - y) };
}

const covers = (outer: Box, inner: Box): boolean =>
  outer.x <= inner.x && outer.y <= inner.y &&
  outer.x + outer.w >= inner.x + inner.w && outer.y + outer.h >= inner.y + inner.h;

function solidColor(fills: RawNode['fills']): RGB | null {
  if (typeof fills === 'symbol' || !Array.isArray(fills)) return null;
  const visible = (fills as RawPaint[]).filter((f) => f.visible !== false);
  const top = visible[visible.length - 1];
  return top && top.type === 'SOLID' && top.color ? top.color : null;
}

function hasNonSolidFill(fills: RawNode['fills']): boolean {
  if (typeof fills === 'symbol' || !Array.isArray(fills)) return false;
  return (fills as RawPaint[]).some((f) => f.visible !== false && f.type !== 'SOLID');
}

interface Flat { node: RawNode; box: Box; parent: RawNode | null; parentBox: Box | null; index: number }

export function detectWarnings(root: RawNode): Warning[] {
  const out: Warning[] = [];
  const flat: Flat[] = [];
  const rootBox = boxOf(root, -(root.x ?? 0), -(root.y ?? 0));

  const walk = (n: RawNode, ox: number, oy: number, parent: RawNode | null, parentBox: Box | null) => {
    const box = boxOf(n, ox, oy);
    if (parent) flat.push({ node: n, box, parent, parentBox, index: flat.length });
    const kids = n.children ?? [];
    for (const kid of kids) walk(kid, box.x, box.y, n, box);
  };
  walk(root, -(root.x ?? 0), -(root.y ?? 0), null, null);

  const rootArea = area(rootBox);
  const isBackdrop = (b: Box): boolean => rootArea > 0 && area(b) >= 0.9 * rootArea;

  const add = (n: RawNode, issue: Warning['issue'], detail: string) =>
    out.push({ node: n.id, name: n.name, issue, detail });

  for (const item of flat) {
    const { node: n, box, parent, parentBox } = item;

    if (n.visible === false) add(n, 'hidden', 'visible = false');
    else if (n.opacity !== undefined && n.opacity < 0.02) add(n, 'hidden', `opacity = ${n.opacity}`);
    else if (box.w < 1 || box.h < 1) add(n, 'hidden', `kích thước ${box.w}×${box.h}`);

    if (DEFAULT_NAME.test(n.name)) add(n, 'unnamed', 'còn tên mặc định');

    if (parent && parentBox && (parent.clipsContent === true || parent === root)) {
      const over = [
        box.x < parentBox.x ? `mép trái ${Math.round(parentBox.x - box.x)}px` : null,
        box.y < parentBox.y ? `mép trên ${Math.round(parentBox.y - box.y)}px` : null,
        box.x + box.w > parentBox.x + parentBox.w ? `mép phải ${Math.round(box.x + box.w - parentBox.x - parentBox.w)}px` : null,
        box.y + box.h > parentBox.y + parentBox.h ? `mép dưới ${Math.round(box.y + box.h - parentBox.y - parentBox.h)}px` : null,
      ].filter(Boolean);
      if (over.length > 0) add(n, 'overflow', `vượt ${over.join(', ')}`);
    }

    if (area(intersection(box, rootBox)) < area(box) - 0.5) {
      add(n, 'offscreen', 'nằm một phần hoặc toàn bộ ngoài artboard gốc');
    }

    if (n.type === 'TEXT') {
      const size = typeof n.fontSize === 'number' ? n.fontSize : undefined;
      if (size !== undefined && size < 10) add(n, 'tiny_font', `fontSize ${size} < 10`);

      const fg = solidColor(n.fills);
      // Nền: anh em dưới nó trong thứ tự z, gần nhất, phủ trọn TEXT
      const siblings = (parent?.children ?? []) as RawNode[];
      const myIndex = siblings.indexOf(n);
      let backdrop: RawNode | null = null;
      for (let i = myIndex - 1; i >= 0; i--) {
        const sib = siblings[i];
        const sibBox = boxOf(sib, parentBox?.x ?? 0, parentBox?.y ?? 0);
        if (covers(sibBox, box)) { backdrop = sib; break; }
      }
      const backdropFills = backdrop ? backdrop.fills : parent?.fills;
      const bg = solidColor(backdropFills);

      if (!fg) {
        // không kết luận được màu chữ
      } else if (bg && !hasNonSolidFill(backdropFills)) {
        const ratio = contrastRatio(fg, bg);
        const bold = typeof n.fontName === 'object' && /bold|black|heavy/i.test((n.fontName as any).style ?? '');
        const threshold = size !== undefined && size >= 24 && bold ? 3 : 4.5;
        if (ratio < threshold) {
          add(n, 'contrast', `${ratio.toFixed(1)}:1, dưới ngưỡng ${threshold}`);
        }
      } else {
        add(n, 'contrast_unknown', 'chữ nằm trên ảnh, gradient hoặc không có nền đặc — không tính được tương phản, cần figma_export');
      }
    }
  }

  // overlap: chỉ giữa TEXT với TEXT, hoặc TEXT với shape không phải nền
  const texts = flat.filter((f) => f.node.type === 'TEXT');
  for (const t of texts) {
    for (const other of flat) {
      if (other === t || isBackdrop(other.box)) continue;
      if (other.node.type !== 'TEXT') {
        if (other.node.children && other.node.children.length > 0) continue; // container, không tính
        if (other.index < t.index) continue; // shape nằm dưới chữ là nền hợp lệ
      }
      const inter = area(intersection(t.box, other.box));
      const smaller = Math.min(area(t.box), area(other.box));
      if (smaller > 0 && inter / smaller > 0.1) {
        add(t.node, 'overlap', `chồng ${Math.round((inter / smaller) * 100)}% với "${other.node.name}"`);
        break;
      }
    }
  }

  return out;
}
```

- [ ] **Step 4: Chạy test, xác nhận xanh**

Run: `npx vitest run packages/core/tests/warnings.test.ts`
Expected: PASS — 12 test

- [ ] **Step 5: Viết snapshot.ts gộp serialize + warnings**

```ts
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
```

Thêm vào `packages/core/src/index.ts`:
```ts
export * from './warnings.js';
export * from './snapshot.js';
```

- [ ] **Step 6: Chạy toàn bộ test**

Run: `npx vitest run`
Expected: PASS — toàn bộ test của core và host

- [ ] **Step 7: Commit**

```bash
git add packages/core
git commit -m "feat: phát hiện warnings và gộp buildSnapshot

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 9: Tool `figma_snapshot`

**Files:**
- Modify: `packages/plugin/src/ops.ts` (thêm nhánh `snapshot` + đọc node thành RawNode)
- Modify: `packages/plugin/src/helpers.ts` (thêm helper `snapshot` toàn cục)
- Modify: `packages/host/src/mcp/tools.ts`

**Interfaces:**
- Consumes: `buildSnapshot`, `LIMITS`, `handleOp`
- Produces: op `snapshot` nhận `{nodeId?, depth?, maxNodes?}` trả `Snapshot`

- [ ] **Step 1: Thêm hàm đọc node thành RawNode vào ops.ts**

```ts
import { buildSnapshot, LIMITS, type RawNode } from '@figma-mcp/core';

const READ_KEYS = [
  'x', 'y', 'width', 'height', 'visible', 'opacity', 'rotation', 'blendMode',
  'locked', 'clipsContent', 'fills', 'strokes', 'strokeWeight', 'cornerRadius',
  'topLeftRadius', 'topRightRadius', 'bottomRightRadius', 'bottomLeftRadius',
  'characters', 'fontName', 'fontSize', 'lineHeight', 'letterSpacing',
  'textAlignHorizontal', 'textAlignVertical', 'textAutoResize',
  'layoutMode', 'itemSpacing', 'paddingTop', 'paddingRight', 'paddingBottom',
  'paddingLeft', 'primaryAxisAlignItems', 'effects',
] as const;

/** Đọc node Figma thành plain object. Symbol (figma.mixed) giữ nguyên — core hiểu là MIXED. */
export function readNode(node: BaseNode, depth: number, level = 0): RawNode {
  const any = node as any;
  const out: RawNode = { id: node.id, name: node.name, type: node.type };
  for (const key of READ_KEYS) {
    const v = any[key];
    if (v !== undefined) (out as any)[key] = v;
  }
  if (node.type === 'INSTANCE' && any.mainComponent) out.mainComponentName = any.mainComponent.name;
  if ('children' in node && level < depth) {
    out.children = (node as ChildrenMixin).children.map((c) => readNode(c, depth, level + 1));
  }
  return out;
}
```

- [ ] **Step 2: Thêm nhánh `snapshot` vào handleOp**

```ts
    case 'snapshot': {
      const { nodeId, depth = LIMITS.snapshotDepth, maxNodes = LIMITS.snapshotMaxNodes } =
        (payload ?? {}) as { nodeId?: string; depth?: number; maxNodes?: number };

      let target: BaseNode | null = null;
      if (nodeId) target = await figma.getNodeByIdAsync(nodeId);
      else if (figma.currentPage.selection.length > 0) target = figma.currentPage.selection[0];
      else target = figma.currentPage;
      if (!target) throw new Error(`Không tìm thấy node ${nodeId}`);

      // Đọc sâu hơn depth 1 bậc để warnings nhìn được quan hệ cha-con ở biên
      const readDepth = depth < 0 ? 50 : depth + 1;
      return buildSnapshot(readNode(target, readDepth), { depth, maxNodes });
    }
```

- [ ] **Step 3: Thêm helper `snapshot` toàn cục vào helpers.ts**

Trong `installHelpers`, thêm:

```ts
  g.snapshot = (node: BaseNode, opts: { depth?: number; maxNodes?: number } = {}) => {
    const depth = opts.depth ?? 3;
    return buildSnapshot(readNode(node, depth < 0 ? 50 : depth + 1), opts);
  };
```

Và thêm import vào đầu `helpers.ts`:
```ts
import { buildSnapshot } from '@figma-mcp/core';
import { readNode } from './ops.js';
```

- [ ] **Step 4: Đăng ký tool trong tools.ts**

```ts
  server.registerTool(
    'figma_snapshot',
    {
      description: 'Đọc thiết kế dạng JSON nén kèm warnings tính sẵn (tràn khung, chồng lấn, tương phản, layer chưa đặt tên). ĐÂY LÀ ĐƯỜNG ĐỌC MẶC ĐỊNH — dùng nó trước, chỉ gọi figma_export khi warnings báo contrast_unknown hoặc khi cần đánh giá nội dung ảnh/thẩm mỹ. Bỏ trống nodeId thì lấy selection hiện tại.',
      inputSchema: {
        nodeId: z.string().optional(),
        depth: z.number().int().optional().describe('mặc định 3, -1 là toàn bộ cây'),
        maxNodes: z.number().int().positive().optional().describe('mặc định 300'),
      },
    },
    async (args) => text(await client.call('snapshot', args))
  );
```

- [ ] **Step 5: Build và smoke test thủ công**

Run: `npm run build`

Trong Figma tạo tay một frame 320×480 chứa một rect nền đen, một text trắng, và một rect để nguyên tên `Rectangle 12`. Chọn frame rồi gọi `figma_snapshot` từ Claude Code.

Expected: JSON có `schema: "figma-snapshot/1"`, các node nén đúng (rect nền chỉ có id/name/type/x/y/w/h/fill), và `warnings` chứa một mục `unnamed` cho `Rectangle 12`.

- [ ] **Step 6: Commit**

```bash
git add packages/plugin packages/host/src/mcp/tools.ts
git commit -m "feat: tool figma_snapshot với warnings tính trong sandbox

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 10: Tool `figma_export`

**Files:**
- Modify: `packages/plugin/src/ops.ts`
- Modify: `packages/host/src/mcp/tools.ts`

**Interfaces:**
- Consumes: `LIMITS`
- Produces: op `export` nhận `{nodeId, maxPx}` trả `{base64: string, w: number, h: number}`

- [ ] **Step 1: Thêm nhánh `export` vào handleOp**

```ts
    case 'export': {
      const { nodeId, maxPx = LIMITS.exportDefaultPx } = payload as { nodeId: string; maxPx?: number };
      const capped = Math.min(maxPx, LIMITS.exportMaxPx);
      const node = await figma.getNodeByIdAsync(nodeId);
      if (!node || !('exportAsync' in node)) throw new Error(`Node ${nodeId} không export được`);

      const w = (node as LayoutMixin).width;
      const h = (node as LayoutMixin).height;
      const longest = Math.max(w, h);

      // Resize ngay trong Figma: ràng buộc cạnh dài. Nhỏ hơn ngưỡng thì giữ nguyên.
      const constraint: ExportSettingsConstraints = longest <= capped
        ? { type: 'SCALE', value: 1 }
        : w >= h
          ? { type: 'WIDTH', value: capped }
          : { type: 'HEIGHT', value: capped };

      const bytes = await (node as ExportMixin).exportAsync({ format: 'PNG', constraint });
      const scale = longest <= capped ? 1 : capped / longest;
      return {
        base64: figma.base64Encode(bytes),
        w: Math.round(w * scale),
        h: Math.round(h * scale),
      };
    }
```

- [ ] **Step 2: Đăng ký tool trong tools.ts**

```ts
  server.registerTool(
    'figma_export',
    {
      description: 'Xuất một node thành PNG và trả ảnh về để nhìn. CHỈ dùng khi cần đánh giá nội dung ảnh raster hoặc thẩm mỹ tổng thể — với toạ độ, kích thước, màu, tương phản trên nền đặc thì figma_snapshot vừa rẻ hơn vừa chính xác hơn.',
      inputSchema: {
        nodeId: z.string(),
        maxPx: z.number().int().positive().optional().describe('cạnh dài tối đa, mặc định 800, trần 1600'),
      },
    },
    async ({ nodeId, maxPx }) => {
      const out = await client.call('export', { nodeId, maxPx }) as { base64: string; w: number; h: number };
      return {
        content: [
          { type: 'image' as const, data: out.base64, mimeType: 'image/png' },
          { type: 'text' as const, text: `PNG ${out.w}×${out.h}` },
        ],
      };
    }
  );
```

- [ ] **Step 3: Build và smoke test thủ công**

Run: `npm run build`

Chọn frame 320×480 trong Figma, lấy id qua `figma_snapshot`, rồi gọi `figma_export` với `maxPx: 400`.

Expected: nhìn thấy ảnh banner, dòng text trả về ghi `PNG 267×400`.

- [ ] **Step 4: Commit**

```bash
git add packages/plugin/src/ops.ts packages/host/src/mcp/tools.ts
git commit -m "feat: tool figma_export resize trong Figma qua exportAsync constraint

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 11: Tool `figma_images` + allowlist thư mục assets

**Files:**
- Create: `packages/host/src/mcp/assets.ts`
- Modify: `packages/plugin/src/ops.ts`
- Modify: `packages/host/src/mcp/tools.ts`
- Test: `packages/host/tests/assets.test.ts`

**Interfaces:**
- Consumes: `LIMITS`
- Produces:
  - `resolveAsset(relPath: string, assetsDir: string): Promise<string>` — ném lỗi nếu ra ngoài allowlist
  - `readAssets(paths: string[], assetsDir: string): Promise<Record<string, string>>` — map path → base64
  - op `images` nhận `{load?: Record<string,string>, list?: boolean}`

- [ ] **Step 1: Viết test thất bại**

`packages/host/tests/assets.test.ts`:
```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveAsset, readAssets } from '../src/mcp/assets.js';

let dir: string;
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'assets-'));
  await writeFile(join(dir, 'hero.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  await mkdir(join(dir, 'sub'), { recursive: true });
  await writeFile(join(dir, 'sub', 'logo.png'), Buffer.from([1, 2, 3]));
});
afterAll(async () => { await rm(dir, { recursive: true, force: true }); });

describe('resolveAsset', () => {
  it('giải được đường dẫn trong thư mục assets', async () => {
    await expect(resolveAsset('hero.png', dir)).resolves.toContain('hero.png');
  });
  it('giải được đường dẫn trong thư mục con', async () => {
    await expect(resolveAsset('sub/logo.png', dir)).resolves.toContain('logo.png');
  });
  it('từ chối path traversal', async () => {
    await expect(resolveAsset('../../etc/passwd', dir)).rejects.toThrow(/ngoài thư mục assets/);
  });
  it('từ chối đường dẫn tuyệt đối ra ngoài', async () => {
    await expect(resolveAsset(join(tmpdir(), 'other.png'), dir)).rejects.toThrow(/ngoài thư mục assets/);
  });
  it('báo lỗi rõ khi file không tồn tại', async () => {
    await expect(resolveAsset('missing.png', dir)).rejects.toThrow(/không tồn tại/);
  });
});

describe('readAssets', () => {
  it('đọc nhiều file thành base64 trong một lượt', async () => {
    const out = await readAssets(['hero.png', 'sub/logo.png'], dir);
    expect(Object.keys(out)).toEqual(['hero.png', 'sub/logo.png']);
    expect(out['hero.png']).toBe(Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString('base64'));
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận thất bại**

Run: `npx vitest run packages/host/tests/assets.test.ts`
Expected: FAIL — module không tồn tại

- [ ] **Step 3: Cài đặt assets.ts**

```ts
import { realpath, readFile, stat } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { LIMITS } from '@figma-mcp/core';

/** Giải đường dẫn và bắt buộc nằm trong assetsDir. Chặn cả path traversal lẫn symlink trỏ ra ngoài. */
export async function resolveAsset(relPath: string, assetsDir: string): Promise<string> {
  const base = await realpath(assetsDir);
  const candidate = resolve(base, relPath);

  let real: string;
  try {
    real = await realpath(candidate);
  } catch {
    throw new Error(`File "${relPath}" không tồn tại trong thư mục assets (${base})`);
  }

  if (real !== base && !real.startsWith(base + sep)) {
    throw new Error(`Đường dẫn "${relPath}" nằm ngoài thư mục assets (${base}) — bị từ chối`);
  }

  const info = await stat(real);
  if (info.size > LIMITS.imageMaxBytes) {
    throw new Error(`File "${relPath}" nặng ${Math.round(info.size / 1024 / 1024)}MB, vượt trần 10MB`);
  }
  return real;
}

export async function readAssets(paths: string[], assetsDir: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const p of paths) {
    const full = await resolveAsset(p, assetsDir);
    out[p] = (await readFile(full)).toString('base64');
  }
  return out;
}
```

- [ ] **Step 4: Chạy test, xác nhận xanh**

Run: `npx vitest run packages/host/tests/assets.test.ts`
Expected: PASS — 6 test

- [ ] **Step 5: Thêm nhánh `images` vào ops.ts**

```ts
    case 'images': {
      const { load, list } = (payload ?? {}) as { load?: Record<string, string>; list?: boolean };
      if (list) return { images: await (globalThis as any).listDocImages() };
      if (!load) throw new Error('Cần truyền load hoặc list');

      const out: Record<string, { hash: string; w: number; h: number }> = {};
      for (const [path, base64] of Object.entries(load)) {
        const img = figma.createImage(figma.base64Decode(base64));
        const size = await img.getSizeAsync();
        out[path] = { hash: img.hash, w: size.width, h: size.height };
      }
      return out;
    }
```

- [ ] **Step 6: Đăng ký tool trong tools.ts**

Thêm import và hằng số thư mục assets vào đầu `tools.ts`:
```ts
import { resolve } from 'node:path';
import { readAssets } from './assets.js';

const ASSETS_DIR = process.env.FIGMA_ASSETS_DIR ?? resolve(process.cwd(), 'assets');
```

```ts
  server.registerTool(
    'figma_images',
    {
      description: 'Nạp ảnh vào Figma hoặc liệt kê ảnh đã có. {load: ["hero.png"]} đọc file trong thư mục assets và trả imageHash để dùng trong figma_eval. {list: true} liệt kê imageHash đã có sẵn trong document để tái dùng, khỏi nạp lại. Đường dẫn tương đối với thư mục assets; ra ngoài sẽ bị từ chối.',
      inputSchema: {
        load: z.array(z.string()).optional(),
        list: z.boolean().optional(),
      },
    },
    async ({ load, list }) => {
      if (list) return text(await client.call('images', { list: true }));
      if (!load || load.length === 0) throw new Error('Cần truyền load (mảng đường dẫn) hoặc list: true');
      const encoded = await readAssets(load, ASSETS_DIR);
      return text(await client.call('images', { load: encoded }));
    }
  );
```

Bổ sung `assetsDir` vào op `status` trong `ops.ts` — thay vì đọc từ sandbox (không có fs), server ghép vào. Sửa handler `figma_status` trong `tools.ts`:

```ts
    async () => {
      const status = await client.call('status') as Record<string, unknown>;
      return text({ ...status, assetsDir: ASSETS_DIR });
    }
```

- [ ] **Step 7: Build và smoke test thủ công**

Run: `npm run build`

Đặt một file PNG vào `assets/hero.png`, rồi trong Claude Code:
1. Gọi `figma_images` với `{load: ["hero.png"]}` → nhận `hash`.
2. Gọi `figma_eval` dùng hash đó:

```js
const r = figma.createRectangle();
r.resize(320, 480);
r.fills = [{ type: 'IMAGE', imageHash: 'HASH_VỪA_NHẬN', scaleMode: 'FILL' }];
figma.currentPage.appendChild(r);
return { id: r.id };
```

Expected: ảnh xuất hiện trong Figma. Thử `{load: ["../../secret.png"]}` phải bị từ chối với thông báo về thư mục assets.

- [ ] **Step 8: Commit**

```bash
git add packages/host packages/plugin/src/ops.ts
git commit -m "feat: tool figma_images với allowlist thư mục assets

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 12: Skill, recipe, và hướng dẫn cài cho 3 client

**Files:**
- Create: `skills/figma-design/SKILL.md`
- Create: `README.md`

**Interfaces:**
- Consumes: toàn bộ 5 tool
- Produces: không có code

- [ ] **Step 1: Viết skills/figma-design/SKILL.md**

```markdown
---
name: figma-design
description: Use when creating or editing designs in Figma through the figma_* MCP tools — game creative banners, icons, or any layout work in a Figma file.
---

# Thiết kế trong Figma qua MCP

## Quy trình

1. `figma_status` — xác nhận plugin đã kết nối, biết file/page đang mở.
2. `figma_snapshot` — đọc hiện trạng. **Luôn dùng trước figma_export.**
3. `figma_eval` — tạo/sửa. Gộp nhiều layer vào MỘT lệnh, đừng gọi từng cái.
4. `figma_snapshot` lại — đọc `warnings`, sửa những gì báo.
5. `figma_export` — **chỉ khi** warnings báo `contrast_unknown`, hoặc cần đánh giá ảnh raster/thẩm mỹ.

## Bẫy Plugin API

- `await figma.getNodeByIdAsync(id)` — không có bản đồng bộ.
- `await setText(node, str)` — tự loadFontAsync. Gán `node.characters` trực tiếp sẽ lỗi.
- `fills`/`strokes` bất biến: `const f = [...node.fills]; f[0] = {...}; node.fills = f;`
- `resize()` reset `textAutoResize` về `NONE` và auto-layout sizing về `FIXED`. Cấu hình lại sau khi gọi.
- Ảnh là async: `const img = figma.createImage(bytes); await img.getSizeAsync();`
- Màu là 0..1, không phải 0..255. Dùng `rgb('#E63946')`.

## Helper toàn cục trong figma_eval

`setText(node, str)` · `snapshot(node, opts)` · `listDocImages()` · `hex(rgb, opacity?)` · `rgb(hexString)`

## Recipe: banner game

```js
const [W, H] = [320, 480];
const frame = figma.createFrame();
frame.name = 'Banner_320x480';   // đặt tên ngay, tránh warning unnamed
frame.resize(W, H);
frame.clipsContent = true;

const bg = figma.createRectangle();
bg.name = 'BG';
bg.resize(W, H);
bg.fills = [{ type: 'IMAGE', imageHash: HASH, scaleMode: 'FILL' }];
frame.appendChild(bg);

const title = figma.createText();
title.name = 'Title';
title.fontName = { family: 'Inter', style: 'Bold' };
await setText(title, 'Đại Chiến Tam Quốc');
title.fontSize = 28;
title.textAlignHorizontal = 'CENTER';
title.resize(W - 48, title.height);
title.x = 24; title.y = 40;
title.fills = [{ type: 'SOLID', color: rgb('#FFD166') }];
frame.appendChild(title);

figma.currentPage.appendChild(frame);
return snapshot(frame);   // trả luôn snapshot, tiết kiệm một round-trip
```

Mẹo cuối quan trọng: **kết thúc lệnh tạo bằng `return snapshot(frame)`** — bạn nhận luôn kết quả và warnings mà không mất thêm một lượt gọi `figma_snapshot`.

## Recipe: export icon nhiều scale

```js
const node = await figma.getNodeByIdAsync(ID);
const out = {};
for (const scale of [1, 2, 3]) {
  const bytes = await node.exportAsync({ format: 'PNG', constraint: { type: 'SCALE', value: scale } });
  out[`@${scale}x`] = bytes.length;
}
return out;
```

## Quy ước đặt tên layer

Đặt tên ngay lúc tạo. Tên mặc định kiểu `Rectangle 12` sẽ bị `figma_snapshot` báo `unnamed`.

- Frame gốc: `Banner_<W>x<H>`, `Icon_<tên>`
- Nền: `BG`
- Chữ: `Title`, `Subtitle`, `CTA`
- Nhóm: `Group_<vai trò>`
```

- [ ] **Step 2: Viết README.md**

````markdown
# Figma MCP Bridge

MCP server local cho phép AI agent thiết kế trực tiếp trong Figma Desktop.

Thiết kế: [docs/superpowers/specs/2026-09-16-figma-mcp-bridge-design.md](docs/superpowers/specs/2026-09-16-figma-mcp-bridge-design.md)

## Yêu cầu

- Node 20+
- **Figma Desktop** (bản web không import được plugin local)

## Cài đặt

```bash
npm install
npm run build
```

Nạp plugin: Figma Desktop → Plugins → Development → Import plugin from manifest… → chọn `packages/plugin/manifest.json`

## Đăng ký MCP server

Đường dẫn dưới đây giả định repo ở `D:/Videcode/MCP Creative`. Sửa lại cho đúng máy bạn.

**Claude Code**
```bash
claude mcp add figma -- node "D:/Videcode/MCP Creative/packages/host/dist/mcp/main.js"
```

**Claude Desktop** — sửa `claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "figma": {
      "command": "node",
      "args": ["D:/Videcode/MCP Creative/packages/host/dist/mcp/main.js"]
    }
  }
}
```

**Codex CLI** — sửa `~/.codex/config.toml`:
```toml
[mcp_servers.figma]
command = "node"
args = ["D:/Videcode/MCP Creative/packages/host/dist/mcp/main.js"]
```

Bridge daemon tự khởi động khi MCP server chạy lần đầu. Không cần bật tay.

## Dùng

1. Mở file Figma trong Figma Desktop.
2. Chạy plugin **MCP Creative Bridge**. Chờ hiện 🟢 *đã kết nối*. **Giữ cửa sổ plugin mở** — đóng là đứt kết nối.
3. Bỏ ảnh vào thư mục `assets/`.
4. Trong AI client, bảo nó thiết kế. Bắt đầu bằng `figma_status` để kiểm tra kết nối.

## Tool

| Tool | Việc |
|---|---|
| `figma_status` | Trạng thái kết nối, file/page, selection |
| `figma_snapshot` | Đọc thiết kế dạng JSON + warnings. **Đường đọc mặc định** |
| `figma_eval` | Chạy JS Plugin API. Đường ghi. Mỗi lần gọi = một bước undo |
| `figma_export` | PNG để nhìn. Chỉ khi cần đánh giá raster/thẩm mỹ |
| `figma_images` | Nạp ảnh từ `assets/`, hoặc liệt kê ảnh đã có |

## Biến môi trường

| Biến | Mặc định | Việc |
|---|---|---|
| `FIGMA_BRIDGE_PORT` | `3055` | Cổng bridge. Đổi thì phải sửa `packages/plugin/manifest.json` tương ứng |
| `FIGMA_ASSETS_DIR` | `<repo>/assets` | Thư mục ảnh cho phép đọc |

## Test

```bash
npm test
```

Toàn bộ unit test chạy không cần Figma.
````

- [ ] **Step 3: Chạy toàn bộ test và build lần cuối**

Run: `npm test && npm run build`
Expected: toàn bộ test PASS, build không lỗi

- [ ] **Step 4: Commit**

```bash
git add skills README.md
git commit -m "docs: skill figma-design và hướng dẫn cài cho 3 client

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Nghiệm thu cuối (spec §13)

Chạy sau khi xong Task 12. Đây là smoke test thủ công, không tự động hoá được.

- [ ] Từ phiên Claude Code mới: *"tạo banner 320×480 cho game X dùng ảnh `assets/hero.png`"* → banner xuất hiện trong Figma trong **không quá 5 round-trip**
- [ ] `figma_snapshot` trên banner 15 layer trả về **dưới 600 token**
- [ ] `npm test` xanh, không cần Figma
- [ ] Mở đồng thời Claude Code và Claude Desktop, cả hai đều gọi được tool, plugin không đứt
- [ ] Restart Claude Code, gọi lại tool ngay — **không** phải chạy lại plugin trong Figma
