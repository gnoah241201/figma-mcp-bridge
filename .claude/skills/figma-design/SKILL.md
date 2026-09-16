---
name: figma-design
description: Use when creating or editing designs in Figma through the figma_* MCP tools - game creative banners, icons, or any layout work in a Figma file.
---

# Thiết kế trong Figma qua MCP

## Quy trình

1. `figma_status` — xác nhận plugin đã kết nối, biết file/page đang mở.
2. `figma_snapshot` — đọc hiện trạng. **Luôn dùng trước `figma_export`.**
3. `figma_eval` — tạo/sửa. Gộp nhiều layer vào MỘT lệnh, đừng gọi từng cái.
4. `figma_snapshot` lại — đọc `warnings`, sửa những gì báo.
5. `figma_export` — **chỉ khi** warnings báo `contrast_unknown`, hoặc cần đánh giá ảnh raster/thẩm mỹ.

Nguyên tắc token: JSON trước, ảnh sau. Snapshot một banner 15 layer tốn ~450 token và cho toạ độ chính xác từng pixel; một tấm PNG 800×1200 tốn ~1.300 token và chỉ cho phỏng đoán. Ảnh chỉ thắng ở đúng hai việc: biết ảnh raster *vẽ cái gì*, và đánh giá thẩm mỹ tổng thể.

## Bẫy Plugin API

- `await figma.getNodeByIdAsync(id)` — không có bản đồng bộ.
- `await setText(node, str)` — tự `loadFontAsync`. Gán `node.characters` trực tiếp sẽ lỗi.
- `fills`/`strokes` bất biến: `const f = [...node.fills]; f[0] = {...}; node.fills = f;`
- `resize()` reset `textAutoResize` về `NONE` và auto-layout sizing về `FIXED`. Cấu hình lại sau khi gọi.
- Ảnh là async: `const img = figma.createImage(bytes); await img.getSizeAsync();`
- Màu là 0..1, không phải 0..255. Dùng `rgb('#E63946')`.
- Helper nằm trên `globalThis` — eval chạy ở global scope, không thấy biến cục bộ.

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

Mẹo quan trọng nhất: **kết thúc lệnh tạo bằng `return snapshot(frame)`** — nhận luôn kết quả và warnings mà không mất thêm một lượt gọi `figma_snapshot`.

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

## Recipe: chèn ảnh từ thư mục assets

```
1. figma_images {load: ["hero.png"]}  ->  {"hero.png": {hash: "a3f9", w: 1024, h: 1536}}
2. figma_eval dùng hash đó làm imageHash
```

Muốn tái dùng ảnh đã có trong file thì `figma_images {list: true}` rồi lấy hash, khỏi nạp lại.

## Quy ước đặt tên layer

Đặt tên ngay lúc tạo. Tên mặc định kiểu `Rectangle 12` sẽ bị `figma_snapshot` báo `unnamed`.

- Frame gốc: `Banner_<W>x<H>`, `Icon_<tên>`
- Nền: `BG`
- Chữ: `Title`, `Subtitle`, `CTA`
- Nhóm: `Group_<vai trò>`
