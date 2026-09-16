# Yarn Fever — 4 banner Halloween (UA creative)

Ngày: 2026-09-16
Game: [Yarn Fever! Unravel Puzzle](https://play.google.com/store/apps/details?id=puzzle.yarn.fever.unravel.puzzle) — Brave HK Limited · 10M+ tải · 4.6★
Mục đích: **ad creative UA** (Facebook / Google / TikTok)
Nguồn asset: sinh bằng ChatGPT → bỏ vào `assets/` → ghép bố cục trong Figma qua MCP

---

## 1. Style lock — ràng buộc bất di bất dịch

Mọi banner phải nằm trong hệ hình ảnh sẵn có của game. Lệch hệ là mất lợi thế nhận diện.

| Yếu tố | Quy định |
|---|---|
| **Chất liệu** | **Mọi vật thể làm bằng len đan / móc (amigurumi)** — nhìn rõ mũi đan, sợi xù nhẹ. Đây là chữ ký của game. |
| **Nhân vật** | Thú chibi mắt to bóng, má hồng. **Dễ thương, tuyệt đối không đáng sợ.** Halloween kiểu vui, không kinh dị. |
| **Ánh sáng** | Ấm, phát sáng từ trong (đèn lồng/nến/bí ngô), viền sáng quanh chủ thể, hạt lấp lánh + bokeh. |
| **Màu Halloween** | Tím `#6B2FA0` → `#3B1259` nền, cam `#FF7A1A` và vàng bí `#FFB03A` làm điểm nhấn, trắng ngà `#F3E9DC` cho ma. Giữ độ bão hoà cao như bản Trung thu. |
| **Typography** | In hoa, sans bo tròn rất mập, **viền trắng dày + viền tối ngoài + đổ bóng**. Theo đúng kiểu "UNRAVEL THE YARN" trên store. |
| **Điều cấm** | Không máu, không kinh dị, không sọ người thật. Không dùng font mảnh. Không để ảnh AI tự vẽ chữ. |

**Tại sao style lock quan trọng:** nhóm cạnh tranh trực tiếp (Wool Puzzle 3D, Yarn Sort 3D, Thread Jam, Wool Sort, Screw Sort) đều là game sort. Halloween cam-tím thông thường thì ai cũng làm được. **Halloween bằng len đan** thì gần như độc quyền — đó là thứ khiến người ta dừng lướt.

**Bám tiền lệ event:** store đang chạy *"Unravel Mid-Autumn yarn figures to earn mooncakes"*. Công thức đã được xác nhận: tháo len hình theo mùa → kiếm vật phẩm theo mùa. Halloween map thẳng: **tháo bí ngô/ma/dơi len → kiếm kẹo**.

---

## 2. Bốn banner = bốn động cơ khác nhau

Làm 4 bản na ná nhau thì test xong không học được gì. Mỗi banner đánh một động cơ riêng để đọc được kết quả.

| # | Góc | Động cơ test | Headline | Sub / CTA |
|---|---|---|---|---|
| **A** | Thoả mãn ASMR | Cảm giác đã tay | `UNRAVEL THE PUMPKIN` | `Pull the yarn. Feel the calm.` |
| **B** | Thử thách trí tuệ | Tự tin giải đố | `CAN YOU SORT IT?` | `Level 137 · 92% fail` |
| **C** | Sự kiện khan hiếm | FOMO | `HALLOWEEN EVENT` | `7 DAYS ONLY · Collect candy` |
| **D** | Nhân vật dễ thương | Gắn kết / thẩm mỹ | `SPOOKY YARN PARTY` | `Play free` |

A và D bán cảm xúc, B bán trí tuệ, C bán FOMO. Chạy song song sẽ biết người ta tải vì lý do gì — dữ liệu đó dùng được cho cả quý sau, không chỉ mùa Halloween.

**Copy rút gọn cho thumbnail:** headline tối đa 3 từ với A/C/D, 4 từ với B. Trên feed điện thoại banner hiển thị ~120px chiều ngang; dài hơn là không ai đọc.

---

## 3. Prompt sinh ảnh — dán thẳng vào ChatGPT

### Quy tắc chung cho cả 4 prompt

- Yêu cầu **tỷ lệ dọc 2:3 (1024×1536)** — làm master, cắt ra các size khác sau.
- **Bắt buộc ghi "no text, no letters, no words"** trong prompt. Chữ do AI vẽ luôn méo; chữ thật sẽ đặt trong Figma để sửa được và đổi ngôn ngữ được.
- **Bắt buộc chừa khoảng trống dưới đáy** cho headline — nếu không, chữ sẽ đè lên mặt nhân vật.
- Gen 3–4 bản mỗi prompt rồi chọn, đừng lấy bản đầu.

### Prompt A — Thoả mãn ASMR

```
A 3D rendered image in cute crocheted amigurumi style: a plump knitted
Halloween pumpkin made entirely of chunky orange yarn, glowing warmly from
inside, in the middle of unraveling — one long strand of orange yarn is
pulling loose and flowing downward in a smooth satisfying curve, coiling
into a soft woven basket below. Visible knit stitches and fuzzy wool
texture on every surface. Deep purple night background with soft bokeh
lights and small sparkles. Warm rim lighting on the pumpkin. Cozy, calming,
tactile mood. Cute, not scary. Vertical 2:3 composition, subject in the
upper two thirds, empty darker space at the bottom third.
No text, no letters, no words, no logo.
```

### Prompt B — Thử thách trí tuệ

```
A 3D rendered image in cute crocheted amigurumi style: a tangled cluster of
many colorful yarn strands — purple, orange, black, cream, green — knotted
together into a messy Halloween-themed ball, with a few small knitted bats
and a witch hat woven into the tangle. Everything made of chunky wool with
visible knit stitches. Several small woven baskets below, almost full,
suggesting the puzzle is nearly lost. Deep purple background, dramatic warm
side lighting, sparkles. Visually busy and challenging but still cute and
colorful, not scary. Vertical 2:3 composition, empty darker space at the
bottom third.
No text, no letters, no words, no logo.
```

### Prompt C — Sự kiện khan hiếm

```
A 3D rendered image in cute crocheted amigurumi style: a generous pile of
Halloween candy and treats all made of knitted yarn — wrapped candies,
lollipops, candy corn, a small knitted ghost — spilling out of a woven
orange pumpkin basket. Everything in chunky wool with visible knit
stitches. A few golden sparkles and floating light motes above the pile.
Deep purple and orange festive background with warm glowing lanterns and
bokeh. Abundant, rewarding, celebratory mood. Cute, not scary. Vertical 2:3
composition, the pile in the center, empty darker space at the top and
bottom for text.
No text, no letters, no words, no logo.
```

### Prompt D — Nhân vật dễ thương

```
A 3D rendered image in cute crocheted amigurumi style: three adorable
knitted animal characters — a white rabbit in a tiny witch hat, a brown
bear in a ghost costume, a panda holding a knitted jack-o-lantern lantern —
all made of chunky yarn with visible knit stitches, big glossy eyes, rosy
cheeks, happy expressions. They stand together at a cozy Halloween party
table with knitted pumpkins and candy. Deep purple night background with
warm glowing paper lanterns, bokeh lights, and sparkles. Very cute,
wholesome, festive, absolutely not scary. Vertical 2:3 composition,
characters in the upper two thirds, empty darker space at the bottom third.
No text, no letters, no words, no logo.
```

### Đặt tên file khi tải về

```
assets/hw_a_pumpkin.png
assets/hw_b_tangle.png
assets/hw_c_candy.png
assets/hw_d_characters.png
```

---

## 4. Ma trận kích thước

Dựng **master 1080×1920** cho mỗi banner, rồi đẻ biến thể bằng cách đổi khung và bố trí lại chữ — **không kéo giãn ảnh**.

| Size | Tỷ lệ | Dùng cho | Cách dựng |
|---|---|---|---|
| **1080×1920** | 9:16 | TikTok, Reels, Stories, Google App portrait | **Master.** Ảnh full-bleed, chữ ở 1/3 dưới |
| 1080×1080 | 1:1 | Facebook / Instagram feed | Cắt giữa theo chiều dọc, headline dời lên sát đáy chủ thể |
| 1200×628 | 1.91:1 | Facebook link, Google Display | Bố cục **ngang**: chủ thể lệch phải, chữ khối trái |
| 320×480 | 2:3 | Interstitial mạng quảng cáo (AppLovin, Unity) | Thu master, **phóng cỡ chữ tương đối lên ~1.3×** |

4 concept × 4 size = **16 file xuất**. Đây chính là chỗ MCP Figma tiết kiệm nhiều nhất: dựng 4 master bằng tay, 12 biến thể còn lại sinh bằng lệnh.

Riêng 320×480 phải phóng chữ: quy tắc chung là chữ nhỏ hơn ~24px ở size gốc sẽ không đọc nổi sau khi thu — `figma_snapshot` sẽ báo `tiny_font` nếu lỡ.

---

## 5. Quy trình dựng trong Figma

Sau khi bạn bỏ 4 file PNG vào `assets/`:

```
1. figma_images {load: ["hw_a_pumpkin.png", "hw_b_tangle.png",
                        "hw_c_candy.png", "hw_d_characters.png"]}
   → nhận 4 imageHash trong MỘT lượt gọi

2. figma_eval — mỗi banner một lệnh, dựng trọn:
   frame 1080×1920 → BG (image fill, scaleMode FILL)
                   → Scrim (gradient tím đen từ 45% xuống đáy)
                   → Headline
                   → Subline
                   → CTA pill + label
   kết thúc bằng: return snapshot(frame)
   → nhận luôn cây layer + warnings, không tốn thêm lượt gọi

3. Đọc warnings, sửa cái nào báo

4. figma_export để nhìn lại 4 master

5. figma_eval sinh 12 biến thể size từ 4 master
```

Ước tính: **khoảng 10–12 lượt gọi tool cho toàn bộ 16 file**, không tính vòng sửa.

### Quy ước đặt tên layer

Đặt tên ngay lúc tạo, `figma_snapshot` sẽ báo `unnamed` nếu quên.

```
HW_A_Pumpkin_1080x1920      (frame)
├── BG
├── Scrim
├── Headline
├── Subline
├── CTA_BG
└── CTA_Label
```

Tên frame theo mẫu `HW_<concept>_<tên>_<W>x<H>` để lọc và xuất hàng loạt.

---

## 6. Checklist QA trước khi xuất

`figma_snapshot` tự bắt phần lớn, phần còn lại phải nhìn:

**Máy bắt tự động:**
- `overflow` — chữ tràn khung
- `overlap` — chữ đè lên nhau
- `contrast` — tương phản dưới 4.5:1 trên nền đặc
- `tiny_font` — chữ dưới 10px
- `unnamed` — layer còn tên mặc định

**Phải tự nhìn bằng `figma_export`:**
- `contrast_unknown` — chữ nằm trên ảnh raster, máy không tính được. **Mọi headline trong bộ này đều rơi vào ca đó** vì nằm trên ảnh nền → bắt buộc export xem từng cái.
- Chữ có đè lên mặt nhân vật không (máy không biết "mặt" nằm đâu)
- Ảnh có bị crop mất phần quan trọng ở các size khác không
- Thu nhỏ còn cỡ thumbnail feed có còn đọc được không

**Mẹo kiểm nhanh:** export ở `maxPx: 200` — nếu ở cỡ đó vẫn đọc được headline thì trên feed thật chắc chắn ổn.

---

## 7. Việc cần bạn làm

1. Dán 4 prompt ở mục 3 vào ChatGPT, gen 3–4 bản mỗi cái, chọn bản hợp style nhất
2. Tải về, đặt đúng tên, bỏ vào `assets/`
3. Mở file Figma, chạy plugin MCP Creative Bridge
4. Bảo tôi dựng

Nếu hoá ra bạn **có kho asset gốc của game** (Brave HK — cùng nhóm với Bravestars?) thì bỏ qua mục 3 hoàn toàn: dùng render nhân vật và logo thật sẽ vừa đúng brand vừa đẹp hơn ảnh AI, và tôi ghép thẳng.
