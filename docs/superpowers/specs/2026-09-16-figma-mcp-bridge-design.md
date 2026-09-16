# Figma MCP Bridge — Thiết kế v1

Ngày: 2026-09-16
Trạng thái: Đã chốt thiết kế. Rủi ro số 1 đã xác minh đóng (§3). Đang triển khai.

## 1. Mục tiêu

Cho phép AI agent (Claude Code, Claude Desktop, Codex CLI) tạo và chỉnh sửa thiết kế **trực tiếp trong Figma Desktop** thông qua một MCP server chạy local và một plugin Figma tự viết.

Hai tiêu chí xuyên suốt mọi quyết định, theo thứ tự:

1. **Tối thiểu token.** Đo bằng tổng token cho một tác vụ hoàn chỉnh, không phải kích thước tool definition.
2. **Mở rộng bằng skill, không sửa server.** Thêm khả năng mới phải là viết thêm tài liệu/recipe, không phải sửa code rồi restart.

Use case đầu tiên: **creative/banner quảng cáo game** và **icon/asset game lẻ**.

### Ngoài phạm vi v1

- Photoshop (xem §14)
- Tự động đặt tên / tách layer theo chuẩn (chỉ chuẩn bị móc nối, xem §7.3)
- Pipeline phân tích creative có sẵn (chỉ chuẩn bị schema, xem §7)
- Publish plugin lên Figma Community
- Chạy qua mạng ngoài localhost

## 2. Ràng buộc và giả định

| Ràng buộc | Hệ quả |
|---|---|
| Figma REST API không tạo/sửa được nội dung thiết kế | Bắt buộc đi qua Plugin API |
| Chỉ Figma **Desktop** mới import được plugin từ manifest local | Figma bản web không dùng được |
| Figma chỉ chạy plugin khi cửa sổ plugin còn mở | Plugin phải có UI, người dùng giữ mở trong phiên làm việc |
| Plugin sandbox không gọi network trực tiếp | WebSocket phải đặt trong UI iframe, chuyển tiếp xuống sandbox bằng `postMessage` |
| `eval` của Figma có ngữ nghĩa khác `eval` chuẩn | Helper phải gắn lên `globalThis`; build plugin phải tắt sourcemap kiểu eval |
| Plugin dev local miễn phí trên mọi gói Figma | Không phát sinh chi phí; không dùng plugin trả phí có sẵn |

**Stack:** Node 20+ / TypeScript. `@modelcontextprotocol/sdk` cho MCP, `ws` cho WebSocket, `esbuild` để build plugin (cấu hình sourcemap không dùng eval).

## 3. Rủi ro số 1 — ĐÃ ĐÓNG

**Rủi ro ban đầu:** sandbox Figma có thể không cho phép chạy JavaScript tuỳ ý qua `eval` / `new Function`.

**Đã xác minh bằng spike trên Figma Desktop (2026-09-16),** plugin độc lập tại `spike/eval-check/`. Cả 4 phép thử đều đạt:

| Phép thử | Kết quả |
|---|---|
| `eval('1 + 1')` | ✅ `2` |
| `eval('figma.currentPage.name')` | ✅ `Page 1` — chạm được Plugin API |
| `new Function('return 2 + 3')()` | ✅ `5` |
| `eval('(async function(){ return globalThis.__probe + 1; })()')` | ✅ `8` — async IIFE đọc `globalThis` |

Phép thử thứ tư là phép thử quyết định: nó kiểm tra đúng cơ chế `figma_eval` dùng thật — bọc async và đọc biến qua `globalThis` thay vì closure.

**Kết luận:** hướng C-lite (eval-first) khả thi hoàn toàn. Không dùng phương án dự phòng.

Hai ràng buộc rút ra vẫn phải tuân thủ:
- Helper **bắt buộc gắn lên `globalThis`** — eval chạy ở global scope, không bắt closure của module.
- Build plugin **phải tắt sourcemap kiểu eval** (`sourcemap: false` trong esbuild).

**Phương án dự phòng (không dùng đến, giữ lại để tham khảo):** nếu spike thất bại, đường ghi sẽ chuyển sang DSL khai báo `figma_apply(ops[])` với schema chặt cho từng thao tác; phần còn lại của thiết kế không đổi.

## 4. Kiến trúc

```
Claude Code   │   Claude Desktop   │   Codex CLI
      └───────────────┬───────────────┘
                 stdio (MCP)
                      ▼
      ┌───────────────────────────────┐
      │ MCP Server                    │  tiến trình ngắn, mỗi client một bản
      │ 5 tool · đọc file allowlist   │
      └───────────────┬───────────────┘
                      │ WebSocket client
                      ▼
      ┌───────────────────────────────┐
      │ Bridge daemon  :3055          │  sống độc lập, ngoài vòng đời client
      └───────────────┬───────────────┘
                      │ WebSocket
                      ▼
      ┌───────────────────────────────┐
      │ Plugin UI iframe (ui.html)    │  cửa sổ nhỏ, hiện trạng thái kết nối
      └───────────────┬───────────────┘
                      │ postMessage
                      ▼
      ┌───────────────────────────────┐
      │ Plugin sandbox (code.js)      │  gọi figma.*
      └───────────────────────────────┘
```

### 4.1 Vì sao bridge là daemon riêng, không nhúng trong MCP server

1. **Đa client.** MCP server do client tự khởi động, có thể có 3 bản chạy đồng thời — không thể cùng bind một cổng.
2. **Giữ kết nối qua restart.** Daemon sống độc lập nên plugin không đứt khi restart Claude Code. Nếu nhúng, mỗi lần restart client là phải sang Figma chạy lại plugin bằng tay.

**Không phát sinh thao tác thủ công:** MCP server khi khởi động thử cổng `3055` — trống thì tự spawn daemon dạng detached (`stdio: ignore`), đã có thì nối vào như client thường. Daemon ghi pidfile và logfile tại `~/.figma-mcp/`.

### 4.2 Manifest plugin

```json
"networkAccess": {
  "allowedDomains": ["none"],
  "devAllowedDomains": ["http://localhost:3055", "ws://localhost:3055"]
}
```

Production để `["none"]` — plugin chỉ dùng local, không có lý do cấp quyền ra internet.

Cổng đổi được qua biến môi trường `FIGMA_BRIDGE_PORT` (mặc định 3055). Đổi cổng thì phải sửa manifest tương ứng.

## 5. Giao thức bridge

**Khung thông điệp**

Yêu cầu: `{id, op, payload}` — Phản hồi: `{id, ok: true, result}` hoặc `{id, ok: false, error}`

Có `id` nên nhiều lệnh chạy song song không lẫn nhau.

**Handshake.** Khi kết nối, mỗi bên gửi `{type: "hello", role: "plugin" | "client", ...}`. Plugin kèm `fileKey`, `fileName`, `pageId`, `pageName`.

**Số lượng kết nối.** Nhiều MCP client được phép nối đồng thời. **Chỉ một plugin tại một thời điểm** — kết nối plugin mới thay thế kết nối cũ, bản cũ nhận thông báo và hiển thị trạng thái "đã bị thay thế".

**Timeout.** Mặc định 30s cho mọi op, riêng `figma_eval` 60s (theo `timeoutMs`). Hết giờ thì huỷ và trả lỗi kèm thông tin đã thực thi tới đâu.

**Chưa có plugin.** Nếu không có plugin nào kết nối, daemon trả lỗi ngay, không xếp hàng chờ.

## 6. Bộ tool

Tổng cộng 5 tool, khoảng 800 token định nghĩa.

### 6.1 `figma_status()`

Không tham số. Trả về trạng thái kết nối, file/page đang mở, selection hiện tại, thư mục assets đang cho phép.

```json
{"connected": true, "file": "Game Creatives", "page": "Banners",
 "selection": [{"id":"1:2","name":"Banner_320x480","type":"FRAME"}],
 "assetsDir": "D:/Videcode/MCP Creative/assets"}
```

### 6.2 `figma_snapshot(nodeId?, depth?, maxNodes?)`

Đường đọc mặc định. Trả JSON chuẩn hoá (§7) kèm `warnings[]` (§7.3).

- `nodeId` — bỏ trống thì lấy selection hiện tại; không có selection thì lấy current page.
- `depth` — mặc định `3`, `-1` là toàn bộ cây.
- `maxNodes` — mặc định `300`.

### 6.3 `figma_eval(code, timeoutMs?)`

Chạy JavaScript trong sandbox Figma với toàn quyền Plugin API.

- Code được bọc tự động trong `async function` ⇒ dùng được `await` và `return` ở cấp cao nhất.
- Helper cài sẵn trên `globalThis` (§6.3.1).
- Kết quả JSON-serialize; node Figma thu gọn thành `{id, name, type}`; cắt vòng lặp tham chiếu.
- **Mỗi lần gọi là đúng một bước undo** — plugin gọi `figma.commitUndo()` sau mỗi lệnh.

Description của tool nhúng sẵn 5 bẫy chí mạng (~80 token, được prompt cache):
`figma.getNodeByIdAsync()` chứ không phải `getNodeById` · dùng `setText()` để tự load font · `fills` bất biến, phải clone · `resize()` reset auto-resize của text và auto-layout sizing · thao tác image là async.

#### 6.3.1 Helper trên `globalThis`

Bắt buộc gắn lên `globalThis` vì eval của Figma không bắt closure.

| Helper | Việc |
|---|---|
| `setText(node, str)` | `loadFontAsync` rồi mới ghi `characters` |
| `snapshot(node, opts)` | Dùng lại đúng serializer của `figma_snapshot` |
| `listDocImages()` | Liệt kê `imageHash` đã có trong document kèm nơi đang dùng |
| `hex(color)` / `rgb(hex)` | Chuyển đổi màu hai chiều |

### 6.4 `figma_export(nodeId, maxPx?)`

Xuất PNG và trả ảnh về cho AI. `maxPx` mặc định `800`, trần cứng `1600`.

Resize thực hiện **ngay trong Figma** qua `exportAsync({constraint})` — ràng buộc theo cạnh dài hơn của node. Không cần thư viện xử lý ảnh native phía server.

**Dùng khi** cần phán đoán nội dung raster hoặc thẩm mỹ — không phải bước kiểm tra mặc định (§7.3).

### 6.5 `figma_images({load?, list?})`

- `{load: ["hero.png", "logo.png"]}` — đọc file trong thư mục assets, tạo image trong Figma, trả `{path: {hash, w, h}}`. Nạp nhiều ảnh trong một lượt gọi.
- `{list: true}` — liệt kê ảnh đã có sẵn trong document để tái dùng hash, khỏi upload lại.

**Bảo mật:** đường dẫn giải bằng `realpath` và **bắt buộc nằm trong** `FIGMA_ASSETS_DIR` (mặc định `<repo>/assets`). Mọi path traversal bị từ chối. Đây là tool duy nhất chạm vào hệ thống file.

## 7. Schema snapshot v1

Có trường `schema` ngay từ đầu để pipeline phân tích cắm vào sau mà không vỡ tương thích.

### 7.1 Ví dụ

```json
{
  "schema": "figma-snapshot/1",
  "root": {"id":"1:2","name":"Banner_320x480","type":"FRAME","w":320,"h":480,
    "c":[
      {"id":"1:3","name":"BG","type":"RECTANGLE","x":0,"y":0,"w":320,"h":480,
       "fill":{"type":"IMAGE","hash":"a3f9","mode":"FILL"}},
      {"id":"1:5","name":"Title","type":"TEXT","x":24,"y":40,"w":272,"h":68,
       "text":"Đại Chiến Tam Quốc","font":"Inter Bold 28/34",
       "align":"CENTER","fill":"#FFD166"},
      {"id":"1:8","name":"Rectangle 12","type":"RECTANGLE","x":90,"y":400,"w":140,"h":44,
       "fill":"#E63946","radius":22}
    ]},
  "warnings": []
}
```

### 7.2 Quy tắc nén

1. **Bỏ mọi thuộc tính mang giá trị mặc định.** `opacity:1`, `visible:true`, `rotation:0`, `blendMode:"NORMAL"`, stroke rỗng, effects rỗng — không xuất hiện. Node Figma thô có hơn 60 thuộc tính; một rect thường còn 8 trường.
2. **Đóng gói trường liên quan thành chuỗi.** `font:"Inter Bold 28/34"` thay cho `fontFamily` + `fontWeight` + `fontSize` + `lineHeight`.
3. **Màu về hex.** `#FFD166`, thêm 2 ký tự alpha khi alpha < 1.
4. **Khoá ngắn cho trường nóng** (`x/y/w/h/c`), tên đầy đủ cho trường hiếm.

Giữ **cấu trúc lồng** qua `c` (children) — AI đọc quan hệ cha-con trực tiếp, và rẻ hơn chút so với làm phẳng kèm con trỏ cha. Schema ổn định nên khi cần so sánh nhiều creative thì làm phẳng lúc nào cũng được.

### 7.2.1 Danh mục trường

**Luôn có:** `id`, `name`, `type`, `x`, `y`, `w`, `h`

`x`/`y` là **toạ độ tương đối so với node cha**, đúng theo mô hình của Figma. Toạ độ tuyệt đối được tính nội bộ khi dò warnings, không xuất ra.

Số làm tròn 2 chữ số thập phân.

**Chỉ có khi khác mặc định:**

| Trường | Kiểu | Ghi chú |
|---|---|---|
| `fill` | `"#RRGGBB"` \| `"#RRGGBBAA"` \| object \| array | Gradient: `{type,stops,angle}`. Image: `{type:"IMAGE",hash,mode}` |
| `stroke` | `{color, w}` | |
| `radius` | number \| `[tl,tr,br,bl]` | |
| `opacity`, `rot`, `blend` | number / string | |
| `hidden` | `true` | Khi `visible === false` |
| `locked` | `true` | |
| `clip` | `true` | |
| `effects` | array | Shadow, blur |
| `text` | string | Cắt ở 200 ký tự, thêm `…` |
| `font` | `"Family Weight Size/LineHeight"` | Chỉ node TEXT |
| `align`, `valign`, `spacing`, `autoResize` | | Chỉ node TEXT |
| `layout` | `{dir, gap, pad, align}` | Chỉ khi bật auto-layout |
| `of` | string | Tên component gốc, chỉ node INSTANCE |
| `c` | array | Node con |

### 7.3 Danh mục `warnings`

Plugin tự tính trong sandbox và trả về **kết luận**, không trả dữ liệu thô để AI tự suy luận.

```json
"warnings": [
  {"node":"1:5","name":"Title","issue":"overflow","detail":"vượt mép phải 12px"},
  {"node":"1:8","name":"Rectangle 12","issue":"unnamed","detail":"còn tên mặc định"},
  {"node":"1:5","name":"Title","issue":"contrast_unknown",
   "detail":"chữ nằm trên ảnh raster, không tính được tương phản — cần figma_export"}
]
```

| `issue` | Điều kiện phát hiện |
|---|---|
| `overflow` | Bounds tuyệt đối của con vượt bounds cha quá 0.5px, khi cha có clip hoặc cha là artboard gốc |
| `offscreen` | Node nằm một phần hoặc toàn bộ ngoài artboard gốc |
| `overlap` | Hai node TEXT, hoặc TEXT với shape không phải nền, giao nhau quá 10% diện tích của node nhỏ hơn |
| `contrast` | TEXT trên nền màu đặc, tỉ lệ tương phản < 4.5:1 (< 3:1 nếu font ≥ 24px bold) |
| `contrast_unknown` | TEXT có nền là ảnh, gradient, hoặc không có nền |

Hai định nghĩa cần rõ để cài đặt không phải đoán:

- **"Node nền"** = node có bounds phủ ≥ 90% diện tích artboard gốc. Chồng lấn với node nền không tính là `overlap`.
- **"Nền của một TEXT"** = node anh em nằm **dưới** nó trong thứ tự z gần nhất mà bounds phủ trọn bounds của TEXT. Không tìm thấy node nào như vậy thì lấy `fill` của node cha. Cha cũng không có fill đặc thì phát `contrast_unknown`.
| `tiny_font` | `fontSize` < 10 |
| `hidden` | `visible === false`, hoặc `opacity` < 0.02, hoặc `w`/`h` < 1 |
| `unnamed` | Tên khớp `/^(Rectangle\|Ellipse\|Frame\|Group\|Vector\|Line\|Text\|Polygon\|Star) \d+$/` |
| `missing_font` | Font không có sẵn trên máy |

**Nguyên tắc JSON trước, ảnh khi cần — được mã hoá vào chính tool.** Khi chữ nằm trên ảnh raster, tương phản về nguyên tắc không tính được từ JSON. Thay vì im lặng, snapshot phát `contrast_unknown` và **chỉ đích danh là phải gọi `figma_export`**. AI không phải tự nhớ tự đoán lúc nào cần mở mắt ra nhìn.

`unnamed` là móc nối cho mục tiêu đặt tên / tách layer để dành cho v2.

## 8. Xử lý lỗi

Mỗi lỗi tốn một round-trip đầy đủ, nên chất lượng thông báo lỗi là khoản đầu tư trực tiếp vào token.

- **Plugin chưa kết nối** → không trả stack, trả hướng dẫn thao tác: `"Plugin chưa chạy. Figma Desktop → Plugins → Development → MCP Creative Bridge"`.
- **Lỗi trong `eval`** → gọn còn `{error, line, snippet}`, cắt stack.
- **Làm giàu lỗi phía server** — khoản ăn tiền nhất. Bắt các bẫy quen thuộc và gắn cách sửa vào luôn:

  | Lỗi khớp | Gợi ý gắn thêm |
  |---|---|
  | chứa `font` | `dùng setText(node, str), đừng gán node.characters trực tiếp` |
  | `getNodeById is not a function` | `dùng figma.getNodeByIdAsync()` |
  | `Cannot add property` trên `fills` | `fills bất biến — clone mảng rồi gán lại` |

- **Lỗi giữa chừng** → Figma đã kịp ghi một phần và không rollback tự động được. Server báo rõ đã thực thi tới đâu. Vì mỗi `eval` là một bước undo, một lần Ctrl+Z là sạch.

## 9. Chặn token

Trần **cứng trong server**, không phải lời khuyên trong prompt. AI không thể vô tình đốt 20k token bằng một lệnh snapshot cả file.

| Chỗ | Giới hạn | Khi vượt |
|---|---|---|
| `figma_snapshot` | 300 node, depth 3 | Cắt + `{"omitted": 120, "hint": "chỉ định nodeId hẹp hơn"}` |
| `figma_eval` kết quả | ~2KB | Cắt, gắn cờ `truncated` |
| `figma_export` | mặc định 800px, trần cứng 1600px | Figma resize qua `exportAsync({constraint})` |
| Thông báo lỗi | 500 ký tự | Cắt |

### 9.1 Cơ sở của quyết định JSON-first

Token thực sự đi vào ba chỗ, theo thứ tự lớn dần: **số round-trip** (mỗi lượt gọi tool là một lần chạy lại toàn bộ context), **dữ liệu đọc về** (dump cây node thô dễ ra 8-15k token), **retry do lỗi**. Tool definition có prompt cache nên gần như miễn phí sau lượt đầu.

So cùng một banner 15 layer: PNG 800×1200 ≈ 1.300 token và AI chỉ *đoán* được vị trí; JSON rút gọn ≈ 450 token và AI *biết* chính xác từng pixel. Rẻ hơn khoảng 3 lần, nhưng lý do quyết định là độ chính xác — nhìn ảnh thì không bao giờ sửa được lệch 2px.

Lợi thế lớn nhất của `figma_eval` cũng nằm ở đây: nó đọc–tính–ghi **trọn vẹn bên trong sandbox**, dữ liệu không đi qua model. Ví dụ căn giữa mọi text trong frame chỉ trả về `{ok: 12}` thay vì kéo cả cây layer qua context hai lượt.

## 10. Bảo mật

- Bridge chỉ bind `127.0.0.1`, không bind `0.0.0.0`.
- `figma_images` là tool duy nhất chạm hệ thống file; giới hạn cứng trong `FIGMA_ASSETS_DIR`, chặn path traversal bằng `realpath`.
- Plugin manifest để `allowedDomains: ["none"]` cho production.
- `figma_eval` chạy code do AI sinh ra trên file Figma của người dùng. Đây là đánh đổi có ý thức: sandbox Figma vốn không chạm được hệ thống file hay mạng, phạm vi thiệt hại tối đa là nội dung file Figma đang mở, và mỗi lệnh là một bước undo.

## 11. Mở rộng qua skill

Repo kèm `skills/figma-design/SKILL.md`: bẫy API đầy đủ, recipe banner theo preset size, recipe export icon nhiều scale, quy ước đặt tên layer. Chỉ nạp khi thật sự làm việc với Figma nên không chiếm chỗ ở session khác.

Skill là cơ chế riêng của Claude Code. Codex CLI và Claude Desktop không có, nên **5 bẫy chí mạng được nhúng thẳng vào description của `figma_eval`** (§6.3). Mọi client chạy đúng ở mức cơ bản; Claude Code được thêm recipe đầy đủ.

**Đây là con đường mở rộng chính thức:** thêm khả năng mới = viết thêm skill/recipe, không sửa code server.

## 12. Kiểm thử và thứ tự triển khai

### 12.1 Chiến lược kiểm thử

Không chạy được Figma trong CI, nên **đẩy logic thuần tuý ra khỏi plugin**:

- **Unit test (CI, không cần Figma).** Serializer snapshot và bộ `warnings` là hàm thuần nhận cây node dạng plain object. Fixture cây node giả → kiểm tra nén đúng, bỏ default đúng, phát hiện tràn/chồng/tương phản đúng theo §7.3. Đây là phần nhiều bug nhất và test được toàn bộ.
- **Integration test.** Bridge daemon + MCP server nối nhau qua WebSocket với plugin giả — kiểm tra correlation `id`, timeout, truncate, auto-spawn daemon, xử lý trùng cổng, thay thế kết nối plugin.
- **Smoke test thủ công.** Checklist ngắn chạy trên Figma thật. Không tự động hoá được và không nên cố.

### 12.2 Thứ tự triển khai

1. **Spike `eval` trong sandbox** — 30 phút, chặn mọi việc phía sau. Thất bại thì chuyển đường ghi sang DSL khai báo (§3), phần còn lại giữ nguyên.
2. Bridge daemon + plugin rỗng + `figma_status` — nhìn thấy `connected` là xong xương sống.
3. `figma_eval` + helper `globalThis`.
4. `figma_snapshot` + `warnings` — phần nặng nhất, kèm unit test.
5. `figma_export`, `figma_images`.
6. Skill + recipe.

## 13. Tiêu chí thành công v1

1. Từ một phiên Claude Code mới: *"tạo banner 320×480 cho game X dùng ảnh `assets/hero.png`"* → banner xuất hiện trong Figma trong **không quá 5 round-trip**, không cần thao tác tay nào ngoài việc mở sẵn plugin.
2. `figma_snapshot` trên banner 15 layer trả về **dưới 900 token**.

   *Đo thật 2026-09-16 trên banner 6 layer (2 text tiếng Việt có dấu, 1 fill ảnh, 1 gradient): 364 token, trong đó `warnings` chiếm 78. Chi phí thân cây là **48 token/node**, suy ra 15 layer ≈ 790 token.*

   *Ngưỡng 600 đặt ban đầu là phỏng đoán và **không đạt**. Giữ nguyên 600 sẽ là mục tiêu giả. 48 token/node đã gần sàn của một định dạng tự mô tả — phần lớn chi phí là tên khoá lặp lại và id của Figma, rút thêm thì phải hy sinh khả năng đọc hiểu của AI. Lập luận nền của thiết kế vẫn đứng vững: 790 token vẫn rẻ hơn ~40% so với một tấm PNG 800px (~1.300 token), và quan trọng hơn là cho toạ độ chính xác từng pixel thay vì phỏng đoán.*
3. Unit test serializer và warnings chạy xanh trong CI, không cần Figma.
4. Cả 3 client (Claude Code, Claude Desktop, Codex CLI) đều gọi được, kể cả khi chạy đồng thời.
5. Restart client bất kỳ mà không phải chạy lại plugin trong Figma.

## 14. Để dành cho v2

- **Tổ chức layer tự động** — đặt tên theo chuẩn, tách object ra layer riêng, nhóm theo vai trò. Móc nối đã có: warning `unnamed` và trường `name` trong schema.
- **Pipeline phân tích creative** — đọc và so sánh nhiều creative. Móc nối đã có: `figma-snapshot/1` là schema ổn định, có version, làm phẳng được.
- **Thư viện recipe** — lưu lại đoạn JS đã chạy tốt để tái dùng, thay vì sinh lại từ đầu mỗi lần.
- **Photoshop.** Bridge daemon và giao thức §5 vốn không gắn với Figma. Thêm Photoshop nghĩa là viết một UXP plugin nối vào cùng daemon, cộng một adapter riêng. Các tool `snapshot`/`export`/`images` giữ nguyên hình dạng; riêng `eval` đổi sang UXP API. Khác biệt lớn nhất cần khảo sát: Photoshop là mô hình raster, khái niệm "node" và bộ `warnings` phải định nghĩa lại.

## 15. Nguồn tham khảo

- [Libraries and Bundling — Figma Developer Docs](https://developers.figma.com/docs/plugins/libraries-and-bundling/)
- [How we built the Figma plugin system — Figma Blog](https://www.figma.com/blog/how-we-built-the-figma-plugin-system/)
- [Plugin API Version 1, Update 66 — networkAccess](https://www.figma.com/plugin-docs/updates/2023/05/10/version-1-update-66/)
- [figma_eval — localfig MCP](https://glama.ai/mcp/servers/LucasGorgal/localfig/tools/figma_eval)
- [Figma Plugins — macwright.com](https://macwright.com/2024/03/29/figma-plugins)
