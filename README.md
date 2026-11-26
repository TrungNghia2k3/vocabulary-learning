# VocabStudio — Học Từ Vựng Tiếng Anh & Đồng Bộ 2 Chiều Google Sheets

Dự án kết hợp **Google Sheets** (làm nơi quản lý từ vựng trực quan) với ứng dụng web **React + TypeScript + Vite + Tailwind CSS** (`web-app/`), đồng bộ 2 chiều qua `sync.py` và sẵn sàng Deploy trên **Vercel / Netlify**.

- **Google Sheet nguồn:** [Vocabulary](https://docs.google.com/spreadsheets/d/1qrOo0UCkwjf_GqGEWJAZmwlTNc4G-VpQ6GRx8nMAPnI/edit)
- **GitHub Repository:** https://github.com/TrungNghia2k3/vocabulary-learning

---

## Cấu trúc thư mục

- `sheets/*.csv` — Dữ liệu của từng tab trên Google Sheet (`UTF-8 BOM`, mở bằng Excel hoặc VS Code đều hiển thị đúng tiếng Việt).
- `web-app/` — Ứng dụng học từ vựng React đọc trực tiếp từ `sheets/*.csv` (tự động reload khi CSV thay đổi).
- `sync.py` — Script đồng bộ 2 chiều theo **từng ô thay đổi (3-way merge)**, giữ nguyên màu sắc, Tables, ô gộp và công thức (`=ARRAYFORMULA`, `=UPPER`...) trên Google Sheet.
- `.sync/config.json` — Ánh xạ tên tab Google Sheet ↔ tên file `.csv` cục bộ.
- `.sync/state.json` — Bản chụp lần đồng bộ gần nhất *(chỉ lưu cục bộ, đã loại trừ khỏi Git)*.
- `vercel.json` / `netlify.toml` — Cấu hình Deploy tự động 1-click.

---

## Chạy ứng dụng trên máy (Local)

```powershell
cd web-app
npm install   # chỉ cần chạy lần đầu
npm run dev
```

Mở trình duyệt tại `http://localhost:5173`. Mỗi khi bạn chỉnh sửa `sheets/*.csv` hoặc đồng bộ từ Google Sheet, web sẽ tự cập nhật ngay lập tức.

---

## Quy trình chuẩn khi thêm dữ liệu hoặc sheet mới

### 1. Nguyên tắc chọn nguồn nhập liệu
- **Thêm lẻ hằng ngày (5–20 từ):** Nhập trực tiếp trên **Google Sheet (Web)** để tiện xem ảnh, dùng Dropdown chọn chủ đề và nhập được cả trên điện thoại.
- **Thêm hàng loạt / nhờ AI xử lý (tìm link ảnh, dịch nghĩa, tạo nhiều từ):** Nhờ **Antigravity** xử lý trên `sheets/*.csv` rồi đồng bộ ngược lên Google Sheet.
- **Tránh:** Không sửa **cùng 1 ô** ở cả máy và Web trước khi sync.

### 2. Khi thêm từ vào sheet đã có sẵn
- **Sheet `Comprehensible Input` (từ vựng kèm ảnh theo chủ đề):**
  - Thêm ở dòng trống cuối bảng.
  - Cột `A`: dán Link ảnh trực tiếp (`https://...`).
  - Cột `B`: **để trống** *(ô `B6` đã có công thức `=ARRAYFORMULA(IF(A6:A="", "", IMAGE(A6:A, 2)))` tự động hiển thị ảnh cho toàn bộ cột B)*.
  - Cột `C → G`: điền Từ vựng & Phiên âm, Nghĩa, Collocations, Ví dụ, Mẹo nhớ.
  - Cột `H (Chủ đề)`: chọn từ Dropdown (`Seasoning`, `Kitchen Appliances`...) hoặc **gõ thẳng tên chủ đề mới** (`Bedroom`, `Office`, `Fruits`...).
  - Cột `I (Nhóm con)`: phân nhóm chi tiết hơn (tùy chọn).
- **Các sheet khác (`Core Vocabulary`, `Books`, `IELTS...`, `Idioms`, `Collocations`, `Prepositions`, `Phrasal Verbs Library`):**
  - Thêm dòng mới ở cuối bảng theo đúng cột tiêu đề hiện có.
  - Riêng `Core Vocabulary`:
    - `Synonyms` / `Antonyms`: cách nhau bằng dấu `;` — ví dụ: `progress (sự tiến bộ); growth (tăng trưởng)`.
    - `Word Family`: mỗi từ loại 1 dòng — ví dụ: `noun: advance (sự tiến bộ), advancement (sự tiến bộ)`.
- **Sheet `Lyrics` (giải mã lời nhạc YouTube Music cùng AI Agent):**
  - Bạn chỉ cần dán **link YouTube Music** (`https://music.youtube.com/watch?v=...`) vào cột `A (YouTube Link)`, để trống các cột còn lại (hoặc chọn `Status = Pending`), rồi nhắn **"Kiểm tra thay đổi / status"**.
  - AI Agent sẽ tự lấy metadata & lyric, giải mã từng đoạn/từng câu (giữ nguyên sắc thái phóng khoáng/slang/ẩn ý gốc theo định dạng `[Section]` + `EN => Nghĩa sát gốc || Giải mã ẩn ý`) và trích kho `Key Slang & Vocab` (`phrase | Register | Nghĩa | Ngữ cảnh | Câu trích`), sau đó đổi `Status` thành `Done`, đồng bộ & đẩy lên tab **Lyrics Studio** trên web.
- **Sheet `News` & `News Vocab` (đọc báo tiếng Anh, lưu từ 1-click & phân tích sâu chuẩn IELTS cùng AI Agent):**
  - Tab **News Studio (`Đọc báo`)** hỗ trợ 2 chế độ: **Tin mới hôm nay (Live)** (lấy tin mới nhất từ *The Guardian* & *NPR*, tự tô sáng từ vựng đã học trong Google Sheets, chạm tra từ + dịch + nghe phát âm) và **Bài phân tích sâu (`News` sheet)**.
  - **Lưu từ 1-click nhảy thẳng vào Google Sheets (`News Vocab`):** Triển khai file `apps-script/news-vocab-webhook.gs` trong Google Sheets (*Extensions → Apps Script → Deploy → Web app*), sau đó dán URL (`/exec`) vào mục **Kết nối Sheet** trên News Studio (hoặc cấu hình biến môi trường `NEWS_SHEET_WEBHOOK_URL` trên Vercel/Netlify để mọi thiết bị dùng luôn). Khi bấm lưu, từ vựng tự nhảy thẳng vào tab `News Vocab` (chống trùng lặp) và bạn cũng có thể bấm **Gửi vào sheet News** để đẩy link bài báo thẳng vào tab `News` (`Status = Pending`).
  - Để phân tích sâu bài báo trong tab `News`, chỉ cần nhắn **"Kiểm tra thay đổi / status"**. AI sẽ điền tóm tắt, dịch song ngữ từng đoạn, kho từ vựng/collocation Band 7.0–8.5 và bộ câu hỏi đọc hiểu IELTS (TFNG & MCQ).
- **Book Studio (`Đọc sách PDF`) + Google Drive (`VocabStudio Books`) + Sheet `Book Vocab` & `Bookshelf`:**
  - Thả các file PDF sách tiếng Anh vào thư mục Google Drive **`VocabStudio Books`** (hoặc chọn mở file `.pdf` trực tiếp từ máy tính/điện thoại).
  - Hỗ trợ **Chế độ Học (Smart Reflow Reader)** (tự tách đoạn sạch sẽ, chỉnh cỡ chữ, tự tô sáng từ đã học trong Google Sheets, chạm tra từ + dịch nhanh từng đoạn + nghe đọc sách UK/US) và **Chế độ PDF gốc** (render trang nguyên bản kèm hình ảnh/biểu đồ).
  - Dùng chung **Google Apps Script Webhook** (`apps-script/news-vocab-webhook.gs`): bấm lưu từ 1-click nhảy thẳng vào tab **`Book Vocab`** (nhóm theo tên sách ở cột `Topic` để ôn bằng Flashcard/Quiz), đồng thời tự động đồng bộ **trang đang đọc & Bookmark** qua tab **`Bookshelf`** giữa Máy tính và Điện thoại.
- **Video Studio (`Xem YouTube`) + Sheet `Video Vocab`:**
  - Cập nhật video mới từ các kênh học thuật chuẩn tiếng Anh (**TED-Ed, BBC Learning English, Vox, National Geographic, BBC Earth, Kurzgesagt, TED Talks**) hoặc dán bất kỳ link YouTube nào.
  - Trình phát YouTube đồng bộ phụ đề tiếng Anh theo thời gian thực (bấm mốc giây nhảy video, lặp 1 câu luyện Shadowing, chỉnh tốc độ `0.75x–1.25x`, ẩn chữ luyện nghe, chọn 1 từ hoặc chọn cả cụm từ lưu thẳng 1-click vào tab **`Video Vocab`**).

### 3. Khi tạo một Sheet (Tab) mới hoàn toàn
1. Bấm dấu **`+`** tạo tab mới trên Google Sheet.
2. Đặt tên tab gọn gàng, **không có dấu cách thừa ở đầu/cuối**, không chứa các ký tự `/ \ : * ? " < > |`.
3. Đặt dòng tiêu đề cột (nằm trong **10 dòng đầu**) theo quy chuẩn để App React **tự động đọc 100% không cần sửa code**:
   - **2 cột bắt buộc:**
     - `Word` *(hoặc `Phrase` / `Term` / `Từ vựng`)*
     - `Meaning Vietnamese` *(hoặc `Meaning` / `Nghĩa`)*
   - **Các cột tùy chọn (thêm cột nào app tự bật tính năng đó):**
     - `Type` *(hoặc `Part of speech` / `Từ loại`)*
     - `Example` *(hoặc `Sentence` / `Ví dụ`)*
     - `Synonyms` / `Antonyms` *(ngăn cách bằng `,` hoặc `;` → tự dùng được trong Quiz Đồng/Trái nghĩa)*
     - `Image` *(hoặc `Link ảnh` → tự hiện ảnh ở Duyệt từ & Flashcard)*
     - `Cambridge` *(link từ điển Cambridge)*
     - `Chủ đề` *(hoặc `Topic`)* & `Nhóm con` *(hoặc `Subtopic` → tự hiện thanh lọc theo Chủ đề)*

> **3 điều cần tránh khi tạo sheet mới:**
> - Không xếp nhiều bảng ngang song song trong cùng 1 sheet — chỉ dùng **1 bảng dọc duy nhất**.
> - Không gộp ô (Merge cell) trong vùng dữ liệu.
> - Không tự ý xóa hoặc đổi tên tab cũ mà không báo đồng bộ (vì `sync.py` chủ động **không tự xóa** để bảo vệ dữ liệu).

### 4. Đồng bộ & Cập nhật lên Web Deploy (Vercel / Netlify)

Sau khi thêm từ hoặc tạo tab mới trên Google Sheet, chỉ cần nhắn **Antigravity**:

- **Kiểm tra thay đổi trước:** *"Kiểm tra thay đổi / status"* → chạy `python sync.py status`.
- **Chỉ cập nhật về máy (`localhost`):** *"Đồng bộ 2 chiều với Google Sheet"* → chạy `python sync.py sync`.
- **Cập nhật luôn bản Deploy online:** *"Đồng bộ Google Sheet, kiểm tra build và push lên GitHub"* → thực hiện trọn bộ 3 bước an toàn:
  1. `python sync.py sync` — kéo dữ liệu & tab mới về `sheets/`.
  2. `cd web-app && npm run build` — kiểm tra dữ liệu mới không gây lỗi build.
  3. `git add . && git commit && git push origin main` — Vercel / Netlify tự động build lại và cập nhật web sau ~30 giây.

*(Có thể dùng lệnh `/schedule` trong Antigravity nếu muốn tự động chạy `python sync.py sync` định kỳ.)*

---

## Cơ chế bảo vệ dữ liệu của `sync.py`

1. **Phát hiện xung đột (Conflict):** Nếu cùng 1 ô bị sửa khác nhau ở cả máy và Web, script sẽ dừng lại và báo rõ vị trí ô trùng (`.sync/conflicts.json`) để bạn chọn `--on-conflict local` (ưu tiên máy) hoặc `--on-conflict remote` (ưu tiên Web).
2. **Bảo vệ công thức:** Nếu Excel làm hỏng một ô công thức Google Sheets (ví dụ thành `#NAME?` / `#VALUE!`), script tự động chặn ghi đè và giữ nguyên công thức gốc.
3. **Không tự động xóa tab:** Thiếu file local hoặc mất tab trên Web sẽ chỉ cảnh báo, không tự xóa dữ liệu.
