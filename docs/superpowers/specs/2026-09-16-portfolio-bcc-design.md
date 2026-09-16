# Portfolio BCC — Trương Lê Hà An

Portfolio case study cho Creative Copywriter chuyên Truyền thông Thay đổi Hành vi (BCC).
**28 trang A4 ngang**, dựng trong Figma qua bridge của repo này, tất cả nằm trên một page Figma duy nhất.

## Phạm vi

| Khối | Trang | Trạng thái ảnh |
|---|---|---|
| Đầu/cuối portfolio | 5 (bìa · giới thiệu · mục lục · kinh nghiệm · liên hệ) | Không cần ảnh |
| Case 01 — Dược điển nước Nam (TRAFFIC) | 8 | Thật; thiếu 3 frame video, ảnh triển lãm đang là phác thảo |
| Case 02 — Một trong số đó (FIT) | 8 | Toàn bộ 4 ô là placeholder có nhãn |
| Case 03 — Thương vụ bạc bẽo (HWA) | 7 | Thật — booklet 22 trang + one-pager |

UNIDO và Côn Đảo **không đưa vào bản này**: doc gốc ghi UNIDO là `[INSERT KẾT QUẢ]` và Côn Đảo không có phần Tác động. Dàn 8 trang cho một case không có số liệu sẽ làm yếu cả tập.

## Nguồn

- Google Doc gốc: CV, 6 case, và bản phân tích bố cục từng trang cho 2 HERO case + 1 MEDIUM case. Phần đuôi doc bị API cắt, chưa đọc được — không ảnh hưởng vì 3 case đã làm đều nằm trong phần đọc được.
- Moodboard (ảnh do người dùng gửi): 5 token màu, tone whimsy/childlike, texture crayon, doodle thay vì minh hoạ hoàn chỉnh.
- `Định hướng nghệ thuật (version 4).pdf` — art direction **của chiến dịch TRAFFIC**, 25 trang.
- `leaflet traffic ver 2.pdf` — leaflet 2 mặt.
- Booklet HWA 22 trang + one-pager: doc gốc nhúng link Drive, tải thẳng bằng HTTP. **Không dùng MCP `download_file_content`** — nó trả base64 vào context, file 11MB tương đương hàng triệu token.

## Quyết định nền tảng

**Deliverable:** file Figma A4 ngang → export PDF. Frame **842 × 595**, không phải 1123×794 — Figma export PDF theo tỉ lệ 1px = 1pt.

**Hướng thẩm mỹ:** nền editorial sạch (hướng C), gia vị scrapbook (hướng A). Nguyên tắc phân vai: **whimsy thuộc về giọng của An, không thuộc về nội dung chiến dịch.** Nội dung bảo tồn/y tế nằm trong khối thẳng, sạch; lớp vẽ tay nằm ở khung và ở trang kể chuyện ý tưởng.

**Bố cục canvas:** mỗi khối một hàng, `ROW × (595 + 60)`. Front matter ở `ROW = -1` nên đọc trước khi sắp theo toạ độ y.

## Design system

### Màu

Moodboard cho 5 màu. Hai trong số đó **không đạt ngưỡng tương phản AA cho chữ** trên nền giấy `#F7F3EE`:
Goldenrod `#DB9E32` chỉ 2.1:1, Slate `#7188A2` chỉ 3.3:1 (ngưỡng 4.5:1).

Cách giải: **tách màu trang trí khỏi màu chữ**.

| Token | Hex | Tương phản trên giấy | Dùng ở đâu |
|---|---|---|---|
| Paper | `#F7F3EE` | — | Nền mọi trang |
| Ink | `#2F3E4E` | 9.8:1 | Body, heading |
| Red | `#C1272D` | 6.1:1 | Big idea, số liệu, doodle nhấn |
| GoldDeep | `#8A5A14` | 5.3:1 | Section label, chữ nhấn |
| SlateDeep | `#52657A` | 5.3:1 | Caption, footer, chữ phụ |
| Goldenrod | `#DB9E32` | *chỉ trang trí* | Doodle, băng keo, highlight |
| Slate | `#7188A2` | *chỉ trang trí* | Đường kẻ |
| Sky | `#BDD0E1` | *chỉ trang trí* | Mảng nền, panel, ô placeholder |

### Chữ

Moodboard đề xuất Google Sans — font này **không có trên Figma** (độc quyền Google, không nằm trên Google Fonts).
Quan trọng hơn: phần lớn font display kiểu crayon **không có dấu tiếng Việt**. Đã kiểm chứng bằng cách render thử rồi export PNG:

| Font | Tiếng Việt | Kết luận |
|---|---|---|
| Baloo 2 ExtraBold | Đạt | Display |
| Be Vietnam Pro | Đạt — toàn bộ 40+ ký tự có dấu | Body/Heading |
| **Caveat** | **Hỏng** — ả, ờ, ở, ự rơi sang font fallback, đè nhau | Loại |
| Patrick Hand | Đạt | Viết tay |

Caveat được quảng cáo là hỗ trợ tiếng Việt nhưng thực tế trên Figma thì không. **Luôn verify font bằng render thật trước khi dựng.**

Text style: `Display/XL` 64 · `Display/L` 44 · `Stat/Big` 96 · `Stat/Number` 72 · `Heading/H1` 28 · `Heading/H2` 18 · `Body/Lead` 13 · `Body/Regular` 10.5/160% · `Body/Emphasis` 10.5 SemiBold · `Caption` 9 · `Label` 9 UPPER tracking 8% · `Hand/Large` 26 · `Hand/Note` 14.

### Lưới

Lề 48, vùng nội dung 746×499, 12 cột, gutter 16, baseline 8.

### Lớp A — doodle

Vẽ bằng vector trong Figma, không dùng ảnh: `handEllipse` (vòng khoanh nguệch ngoạc có jitter theo seed cố định) · `sparkle` · `sprig` (nhành dược liệu) · `squiggle` · `arrow`/`note` (ghi chú viết tay có mũi tên chỉ) · `highlight` (vệt crayon đặt **dưới** text) · `tapeOn` (băng keo xoay ±6–9°). Nền giấy: PNG hạt nhiễu 1000×720 alpha thưa, phủ toàn trang ở opacity 0.55.

### Ngân sách whimsy

- Trang thường: tối đa 2 chi tiết, đặt ở lề, không đè nội dung.
- Trang Cover và Phía sau ý tưởng: được phá mạnh nhất.
- Trang Thách thức và Tác động: chỉ một vòng khoanh quanh con số quan trọng nhất.

## Cấu trúc code

Tách đôi để 3 case không lệch nhau:

```
lib.js     font, token, text style, helper (txt/rect/img/line/imgSlot),
           bộ doodle, shell/footer/roleBand, clearCase
case0.js   front matter   (ROW = -1)
case1.js   Dược điển nước Nam (ROW = 0)
case2.js   Một trong số đó   (ROW = 1)
case3.js   Thương vụ bạc bẽo (ROW = 2)
```

Mỗi case đặt `ROW`, `CASE`, `CASEFOOT`, gọi `clearCase()` rồi dựng. Chạy: `cat lib.js caseN.js > _run.js` rồi `figma_eval`. Frame đặt tên `C<case>-P<trang> — <tên>` để `clearCase()` chỉ xoá đúng case của mình.

## Đã biết, chưa sửa

- Lớp giấy có hạt làm `figma_snapshot` không tính được tương phản nữa (`contrast_unknown` toàn bộ). Màu đã đo và đạt AA **trước** khi thêm texture.
- `tiny_font` với nhãn/caption 9pt: ngưỡng 10pt là heuristic cho màn hình, không đúng cho bản in.
- Một số `overlap` là cố ý: vòng khoanh quanh số liệu, sparkle cạnh tiêu đề. Kiểm tra cuối: **28 frame, 0 lỗi tràn khung / ngoài khung / thiếu font / chồng lấn không phải doodle.**

## Còn thiếu

- **Case 02:** toàn bộ 4 ô ảnh (bộ sticker đã in, key visual cuộc thi, sticker × Tò He, booklet hợp tác).
- **Case 01:** 3 frame trích từ video motion 6 phút; ảnh chụp triển lãm thật (đang dùng phác thảo thiết kế).
- **Trang Liên hệ:** đường dẫn LinkedIn và portfolio trực tuyến.
- **Export PDF** phải làm tay trong Figma (File → Export frames to PDF) — bridge chỉ xuất PNG.

## Lỗi phát hiện trong doc gốc

1. Trang "Tác động" của case **HWA** copy nhầm số liệu của DDNN (2.4M / 118K / 87K cam kết). Số đúng theo phần Full Portfolio: 2M+ tiếp cận, 56K tương tác, 291.350 người nhóm cốt lõi. Bản dựng đã dùng số đúng.
2. Phần bối cảnh **FIT** ghi "Trong năm 2026, FIT tiếp tục triển khai chiến dịch" trong khi thời gian case là 02–06/2025. Bản dựng đã bỏ mốc năm mâu thuẫn này, chỉ giữ "từ năm 2022, FIT hiện thực hoá sáng kiến RTC".
