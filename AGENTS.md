# Figma MCP Bridge — tóm tắt cho AI agent

Đọc file này trước khi chạm vào repo. Nó cho biết hệ thống làm gì, giao thức ra sao, và những cái bẫy đã tốn thời gian để phát hiện.

## Hệ thống này là gì

MCP server local cho phép AI agent **thiết kế trực tiếp trong Figma Desktop** — tạo frame, text, vector, nạp ảnh, đọc lại thiết kế dạng JSON, xuất PNG.

```
Claude Code │ Claude Desktop │ Codex CLI
        └──────────┬──────────┘
              stdio (MCP)
                   ▼
          MCP Server (5 tool)          packages/host/src/mcp/
                   │ WebSocket
                   ▼
      Bridge daemon :3055               packages/host/src/bridge/
      (sống độc lập, tự spawn)
                   │ WebSocket
                   ▼
      Plugin UI iframe → postMessage → sandbox → figma.*
                                        packages/plugin/src/
```

**Điều kiện bắt buộc:** Figma **Desktop** (bản web không import được plugin local), và **cửa sổ plugin phải mở suốt** — đóng là đứt kết nối.

`packages/core` là code thuần tuý, không import `figma` lẫn API Node. Đó là lý do 76 test chạy được trong CI mà không cần Figma.

## Năm tool

| Tool | Payload | Trả về |
|---|---|---|
| `figma_status` | — | `{connected, file, page:{id,name}, selection, assetsDir}` |
| `figma_snapshot` | `{nodeId?, depth?, maxNodes?}` | JSON nén + `warnings[]`. Bỏ trống `nodeId` thì lấy selection |
| `figma_eval` | `{code, timeoutMs?}` | Kết quả `return` của code. Mỗi lần gọi = **một bước undo** |
| `figma_export` | `{nodeId, maxPx?}` | PNG base64 (mặc định 800px, trần 1600) |
| `figma_images` | `{load:[...]}` hoặc `{list:true}` | `{path: {hash, w, h}}` — hash dùng làm `imageHash` |

`figma_eval` bọc code trong một `async function`, nên dùng được `await` và `return` ở cấp cao nhất.

### Nguyên tắc token: JSON trước, ảnh sau

Snapshot một banner 15 layer tốn ~450 token và cho toạ độ chính xác từng pixel. Một PNG 800×1200 tốn ~1.300 token và chỉ cho phỏng đoán. **Chỉ gọi `figma_export` khi** cần biết ảnh raster *vẽ cái gì*, hoặc cần đánh giá thẩm mỹ tổng thể, hoặc snapshot báo `contrast_unknown`.

Mẹo: kết thúc lệnh tạo bằng `return snapshot(frame)` — nhận luôn kết quả và warnings mà không mất thêm một lượt gọi.

### Warnings mà snapshot tự tính

`overflow` · `offscreen` · `overlap` · `contrast` · `contrast_unknown` · `tiny_font` · `hidden` · `unnamed` · `missing_font`

Đọc chúng và sửa — đây là vòng kiểm rẻ nhất. Nhưng đừng theo mù quáng: `tiny_font` dùng ngưỡng 10pt của màn hình, không đúng cho bản in; `overlap` giữa text và doodle trang trí thường là cố ý.

## Helper toàn cục trong `figma_eval`

Gắn trên `globalThis` (eval chạy ở global scope, không thấy biến cục bộ của module):

- `await setText(node, str)` — tự `loadFontAsync` cho font **hiện tại** của node rồi gán characters
- `snapshot(node, {depth, maxNodes})` — `depth: -1` là toàn bộ cây
- `await listDocImages()` — liệt kê imageHash đã có trong document kèm nơi dùng
- `hex(rgb, opacity?)` / `rgb('#E63946')` — màu Figma là 0..1, không phải 0..255

## Bẫy Plugin API — đọc kỹ, đã trả giá cho từng cái

1. **`loadFontAsync` phải chạy TRƯỚC khi gán `node.fontName`.** `setText` chỉ nạp font đang có trên node, nó không cứu được việc bạn gán một font chưa nạp. Nạp hết font cần dùng ở đầu script.
2. **`vectorPaths` không chấp nhận dấu phẩy** giữa các cặp toạ độ. `'C 10 20, 30 40, 50 60'` sẽ lỗi `Invalid command at ,`. Strip hết dấu phẩy.
3. **Đừng dùng `rescale()` để thu phóng vector** — nó làm lệch cả vị trí lẫn độ dày nét. Nhân thẳng hệ số vào toạ độ trong path data.
4. **Không có `getNodeById` đồng bộ** — dùng `await figma.getNodeByIdAsync(id)`.
5. **`fills`/`strokes` bất biến:** `const f = [...node.fills]; f[0] = {...}; node.fills = f;`
6. **`resize()` reset `textAutoResize` về `NONE`** và auto-layout sizing về `FIXED`. Cấu hình lại *sau* khi gọi.
7. **Style là async:** `await node.setFillStyleIdAsync(id)`, `await node.setTextStyleIdAsync(id)`. Paint style **không áp được cho fill ảnh** — gán `fills` trực tiếp.
8. **Ảnh là async:** `const img = figma.createImage(bytes); await img.getSizeAsync();`
9. **Chế độ dynamic-page:** `await page.loadAsync()` trước khi đọc/ghi một page không phải page hiện tại; đổi page bằng `await figma.setCurrentPageAsync(page)`.
10. **Export PDF:** Figma quy đổi 1px = 1pt. Muốn ra đúng A4 ngang thì frame phải là **842×595**, không phải 1123×794.

## Giới hạn

`snapshotMaxNodes` 300 · `snapshotDepth` 3 · `evalResultBytes` 2048 · `exportMaxPx` 1600 · `opTimeoutMs` 30s · `evalTimeoutMs` 60s · `imageMaxBytes` 10MB

Kết quả `figma_eval` bị cắt ở 2048 byte — **không trả dữ liệu lớn qua eval** (ví dụ: không thể lấy bytes PDF về bằng đường này).

## Ảnh

Bỏ file vào `assets/` rồi `figma_images {load: ["ten.png"]}`. Đường dẫn tương đối với `assets/`; ra ngoài thư mục bị từ chối (chặn cả path traversal lẫn symlink trỏ ra ngoài). Đổi thư mục bằng `FIGMA_ASSETS_DIR`.

**Thư mục `assets/` không được commit** (`.gitignore`) — đó là chỗ để file làm việc, không phải nội dung repo.

## Đường vòng khi tool chưa nạp được

MCP server chỉ nạp tool lúc client khởi động. Nếu bạn vừa `claude mcp add` giữa phiên thì tool `figma_*` **chưa dùng được cho tới khi mở session mới**.

Không cần chờ: daemon là WebSocket thuần, nói chuyện thẳng được.

```js
// ws://127.0.0.1:3055
ws.send(JSON.stringify({ type: 'hello', role: 'client' }));
ws.send(JSON.stringify({ id: 'x-1', op: 'eval', payload: { code } }));
// nhan: { id, ok: true, result } | { id, ok: false, error: {message, hint?, line?, snippet?} }
// tin nhan co truong `type` la notice, khong phai response — bo qua
```

`op` hợp lệ: `status` · `eval` · `snapshot` · `export` · `images`. Với `images` thì `payload.load` là `{tênFile: base64}` — phía host tự đọc file, còn đi đường vòng thì bạn phải tự encode.

## Bản đồ file

```
packages/core/src/       protocol.ts (op, limit) · types.ts · serialize.ts
                         snapshot.ts · warnings.ts · color.ts
packages/host/src/mcp/   main.ts · tools.ts (5 tool) · client.ts (WS client)
                         assets.ts (allowlist đường dẫn) · errors.ts
packages/host/src/bridge/ daemon.ts (WS :3055) · main.ts
packages/plugin/src/     code.ts (sandbox) · ops.ts (dispatcher) · helpers.ts
                         ui.ts + ui.html (iframe giữ WebSocket)
.claude/skills/figma-design/  recipe + bẫy API, Claude Code tự nạp
docs/superpowers/specs/  thiết kế · docs/superpowers/plans/ kế hoạch
```

## Chạy

```bash
npm install && npm run build && npm test
```

Nạp plugin: Figma Desktop → Plugins → Development → Import plugin from manifest… → `packages/plugin/manifest.json`

Đăng ký MCP (sửa đường dẫn cho đúng máy):

```bash
claude mcp add figma -- node "D:/Videcode/MCP Creative/packages/host/dist/mcp/main.js"
```

Daemon tự khởi động khi MCP server chạy lần đầu và sống độc lập với client, nên restart client không làm đứt kết nối plugin.

## Quy trình làm việc chuẩn

1. `figma_status` — xác nhận đã kết nối, biết file/page đang mở
2. `figma_snapshot` — đọc hiện trạng
3. `figma_eval` — tạo/sửa, **gộp nhiều layer vào MỘT lệnh**, kết thúc bằng `return snapshot(frame)`
4. Đọc `warnings`, sửa những gì đáng sửa
5. `figma_export` — chỉ khi thật sự cần nhìn
