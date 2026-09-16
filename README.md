# Figma MCP Bridge

MCP server local cho phép AI agent thiết kế trực tiếp trong Figma Desktop.

- Thiết kế: [docs/superpowers/specs/2026-09-16-figma-mcp-bridge-design.md](docs/superpowers/specs/2026-09-16-figma-mcp-bridge-design.md)
- Kế hoạch: [docs/superpowers/plans/2026-09-16-figma-mcp-bridge.md](docs/superpowers/plans/2026-09-16-figma-mcp-bridge.md)

## Yêu cầu

- Node 20+
- **Figma Desktop** — bản web không import được plugin local

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

Bridge daemon tự khởi động khi MCP server chạy lần đầu, không cần bật tay. Daemon sống độc lập với client nên restart Claude Code không làm đứt kết nối plugin.

## Dùng

1. Mở file Figma trong Figma Desktop.
2. Chạy plugin **MCP Creative Bridge**. Chờ hiện 🟢 *đã kết nối*. **Giữ cửa sổ plugin mở** — đóng là đứt kết nối.
3. Bỏ ảnh vào thư mục `assets/`.
4. Trong AI client, bảo nó thiết kế. Bắt đầu bằng `figma_status` để kiểm tra kết nối.

## Tool

| Tool | Việc |
|---|---|
| `figma_status` | Trạng thái kết nối, file/page, selection, thư mục assets |
| `figma_snapshot` | Đọc thiết kế dạng JSON nén + warnings. **Đường đọc mặc định** |
| `figma_eval` | Chạy JS Plugin API. Đường ghi. Mỗi lần gọi = một bước undo |
| `figma_export` | PNG để nhìn. Chỉ khi cần đánh giá raster/thẩm mỹ |
| `figma_images` | Nạp ảnh từ `assets/`, hoặc liệt kê ảnh đã có trong file |

Claude Code còn tự nạp skill `.claude/skills/figma-design/` chứa recipe và bẫy API đầy đủ.

## Biến môi trường

| Biến | Mặc định | Việc |
|---|---|---|
| `FIGMA_BRIDGE_PORT` | `3055` | Cổng bridge. Đổi thì phải sửa `packages/plugin/manifest.json` tương ứng |
| `FIGMA_ASSETS_DIR` | `<repo>/assets` | Thư mục ảnh cho phép đọc. Ngoài thư mục này bị từ chối |

## Test

```bash
npm test
```

76 test, chạy hoàn toàn không cần Figma. Logic thuần tuý (serializer snapshot, warnings, màu/tương phản, allowlist đường dẫn, dispatcher op) nằm ngoài plugin nên kiểm được trong CI.

## Kiến trúc

```
Claude Code │ Claude Desktop │ Codex CLI
        └──────────┬──────────┘
              stdio (MCP)
                   ▼
          MCP Server (5 tool)
                   │ WebSocket
                   ▼
      Bridge daemon :3055  (sống độc lập)
                   │ WebSocket
                   ▼
      Plugin UI iframe  →  postMessage  →  sandbox → figma.*
```

`packages/core` là code thuần tuý, không import `figma` lẫn API Node — đó là lý do test chạy được trong CI.
