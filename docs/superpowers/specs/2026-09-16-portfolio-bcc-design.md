# Portfolio BCC — Trương Lê Hà An

Thiết kế portfolio case study cho Creative Copywriter chuyên Truyền thông Thay đổi Hành vi (BCC).
Bản mẫu: **CASE 01 — Dược điển nước Nam (TRAFFIC)**, 8 trang A4 ngang, dựng trong Figma qua bridge của repo này.

## Nguồn

- Google Doc gốc: CV đầy đủ, 6 case, và bản phân tích bố cục từng trang cho 2 HERO case + 1 MEDIUM case.
- Moodboard do người dùng cung cấp (ảnh): bảng màu 5 token, tone whimsy/childlike, texture crayon, doodle thay vì minh hoạ hoàn chỉnh.
- `Định hướng nghệ thuật (version 4).pdf` — art direction **của chiến dịch TRAFFIC**, 25 trang. Nguồn ảnh thật.
- `leaflet traffic ver 2.pdf` — leaflet 2 mặt, ấn phẩm thật.

## Quyết định nền tảng

**Deliverable:** file Figma A4 ngang → export PDF. Frame **842 × 595**, không phải 1123×794 — Figma export PDF theo tỉ lệ 1px = 1pt, nên 842×595 ra đúng A4 ngang chuẩn in.

**Hướng thẩm mỹ:** nền editorial sạch (hướng C), gia vị scrapbook (hướng A). Nguyên tắc phân vai: **whimsy thuộc về giọng của An, không thuộc về nội dung chiến dịch.** Nội dung bảo tồn/y tế nằm trong khối thẳng, sạch; lớp vẽ tay nằm ở khung và ở trang kể chuyện ý tưởng.

**Tất cả frame nằm trên MỘT page Figma**, xếp hàng ngang, cách nhau 60px.

## Design system

### Màu

Moodboard cho 5 màu. Hai trong số đó **không đạt ngưỡng tương phản AA cho chữ** trên nền giấy `#F7F3EE`:
Goldenrod `#DB9E32` chỉ 2.1:1, Slate `#7188A2` chỉ 3.3:1 (ngưỡng 4.5:1).

Cách giải: **tách màu trang trí khỏi màu chữ**. Giữ nguyên màu moodboard cho doodle, băng keo, đường kẻ; thêm hai token đậm hơn chỉ dùng cho chữ.

| Token | Hex | Tương phản trên giấy | Dùng ở đâu |
|---|---|---|---|
| Paper | `#F7F3EE` | — | Nền mọi trang |
| Ink | `#2F3E4E` | 9.8:1 | Body, heading |
| Red | `#C1272D` | 6.1:1 | Big idea, số liệu, doodle nhấn |
| GoldDeep | `#8A5A14` | 5.3:1 | Section label, chữ nhấn |
| SlateDeep | `#52657A` | 5.3:1 | Caption, footer, chữ phụ |
| Goldenrod | `#DB9E32` | *chỉ trang trí* | Doodle, băng keo, highlight |
| Slate | `#7188A2` | *chỉ trang trí* | Đường kẻ |
| Sky | `#BDD0E1` | *chỉ trang trí* | Mảng nền, panel |

### Chữ

Moodboard đề xuất Google Sans — **font này không có trên Figma** (độc quyền Google, không nằm trên Google Fonts).
Quan trọng hơn: phần lớn font display kiểu crayon **không có dấu tiếng Việt**. Đã kiểm chứng trực tiếp bằng cách render thử rồi export PNG:

| Font | Tiếng Việt | Kết luận |
|---|---|---|
| Baloo 2 ExtraBold | Đạt — Ư, Ợ, Đ, Ể đồng bộ với chữ không dấu | Display |
| Be Vietnam Pro | Đạt — toàn bộ 40+ ký tự có dấu đều | Body/Heading |
| **Caveat** | **Hỏng** — ả, ờ, ở, ự rơi sang font fallback, đè nhau | Loại |
| Patrick Hand | Đạt — nét viết tay liền mạch | Viết tay |

Caveat được quảng cáo là hỗ trợ tiếng Việt nhưng thực tế trên Figma thì không. **Luôn verify font bằng render thật trước khi dựng.**

Text style: `Display/XL` 64 · `Display/L` 44 · `Stat/Big` 96 · `Stat/Number` 72 · `Heading/H1` 28 · `Heading/H2` 18 · `Body/Lead` 13 · `Body/Regular` 10.5/160% · `Body/Emphasis` 10.5 SemiBold · `Caption` 9 · `Label` 9 UPPER tracking 8% · `Hand/Large` 26 · `Hand/Note` 14.

### Lưới

Lề 48, vùng nội dung 746×499, 12 cột, gutter 16, baseline 8.

### Lớp A — doodle

Vẽ bằng vector trong Figma, không dùng ảnh:

- `handEllipse` — vòng khoanh nguệch ngoạc (có jitter theo seed cố định) để nhấn số liệu.
- `sparkle` — ngôi sao 4 cánh, fill đặc.
- `sprig` — nhành dược liệu (thân + 3 lá + nụ), nối thẩm mỹ portfolio với chủ đề chiến dịch.
- `squiggle` — gạch chân lượn sóng.
- `arrow` / `note` — mũi tên viết tay kèm ghi chú Patrick Hand.
- `highlight` — vệt crayon bo tròn, opacity 0.3, xoay nhẹ, đặt **dưới** text.
- `tapeOn` — băng keo Goldenrod opacity 0.8, xoay ±6–9°.
- Nền giấy: PNG hạt nhiễu 1000×720, alpha thưa, phủ toàn trang ở opacity 0.55.

**Lưu ý kỹ thuật:** `vectorPaths` của Figma **không chấp nhận dấu phẩy** giữa các cặp toạ độ — phải strip hết. Và không dùng `rescale()` để thu phóng doodle (làm lệch vị trí lẫn nét); nhân thẳng vào toạ độ trong path.

### Ngân sách whimsy

- Trang thường: tối đa 2 chi tiết, đặt ở lề, không đè nội dung. Khối nội dung thẳng, không xoay.
- Trang 1 (Cover) và trang 3 (Phía sau ý tưởng): được phá mạnh nhất.
- Trang 2 (Thách thức) và trang 8 (Tác động): chỉ một vòng khoanh quanh con số, không thêm gì khác — số liệu và vấn đề xã hội tự đứng.

## Bố cục 8 trang

| Trang | Nội dung | Ảnh | Doodle |
|---|---|---|---|
| 01 Cover | Tên case, client, thời gian, 4 dòng vai trò | Banner ngoài trời, dán băng keo trên giấy | Sparkle, squiggle, 2 nhành, ghi chú + mũi tên |
| 02 Thách thức | 59% + giải nghĩa; niềm tin truyền đời; mục tiêu | — | Vòng khoanh quanh 59%, 1 nhành |
| 03 Phía sau ý tưởng | Câu hỏi viết tay → "Câu trả lời nằm ở lòng tự hào dân tộc"; 2 insight; khoảnh khắc Eureka | — | Panel mép giấy xé, highlight crayon, sparkle, mũi tên |
| 04 Big Idea | Logo lockup thật + key message + diễn giải | Logo "Dược điển nước Nam" | 2 nhành hai bên, sparkle, squiggle |
| 05 Digital | Chuỗi bài đăng & minigame | Bài đăng minigame | Băng keo, ghi chú + mũi tên, sparkle |
| 06 Triển lãm | "Bảng vàng dược liệu", 5 trường | Phác thảo không gian triển lãm | Băng keo, sparkle, 1 nhành |
| 07 Ấn phẩm & Video | Leaflet 2 mặt; video motion 6 phút | 2 mặt leaflet | Băng keo |
| 08 Tác động | 2.4M+ / 118K+ / 87K+ kèm % KPI | — | Vòng khoanh quanh 118K+, sparkle, 1 nhành |

Trang 5, 6 có thêm dải **"VAI TRÒ TRONG HẠNG MỤC"** ở chân trang — vừa lấp khoảng trống, vừa là thông tin mà HR thực sự cần: An làm chính xác cái gì trong từng hạng mục.

## Ảnh

Trích từ PDF bằng `pdfjs-dist` + `@napi-rs/canvas` (poppler không có trên máy), cắt bỏ khung deck và chú thích nội bộ, lưu vào `assets/ddnn/`.

**Còn thiếu:** 3 frame trích từ video motion 6 phút (trang 7 đang để ô placeholder có nhãn). Ảnh chụp triển lãm thật sẽ mạnh hơn nhiều so với phác thảo thiết kế đang dùng ở trang 6.

## Đã biết, chưa sửa

- Lớp giấy có hạt làm `figma_snapshot` không tính được tương phản nữa (`contrast_unknown` toàn bộ). Màu đã được đo và đạt AA **trước** khi thêm texture; hạt alpha thấp không làm đổi độ sáng đáng kể.
- Cảnh báo `tiny_font` với nhãn/caption 9pt: ngưỡng 10pt là heuristic cho màn hình. Đây là tài liệu in, 9pt cho label uppercase có tracking là chuẩn nhà in.
- Một số `overlap` là cố ý: vòng khoanh quanh số liệu, sparkle cạnh tiêu đề.

## Lỗi phát hiện trong doc gốc

Trang "Tác động" của **case HWA** đang copy nhầm số liệu của DDNN (2.4M / 118K / 87K cam kết). Theo phần Full Portfolio, HWA phải là 2M+ tiếp cận, 56K tương tác, 291.350 người thuộc nhóm cốt lõi. Cần sửa ở bản gốc trước khi dựng case đó.

## Bước tiếp theo

Chốt form DDNN → nhân bản cho MTSD (HERO), HWA + WWF ngà voi (MEDIUM), UNIDO + Côn Đảo (SMALL).
