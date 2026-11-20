# Đồng bộ 2 chiều Google Sheet `Vocabulary`

Thư mục này được thiết lập đồng bộ 2 chiều với Google Sheet **[Vocabulary](https://docs.google.com/spreadsheets/d/1qrOo0UCkwjf_GqGEWJAZmwlTNc4G-VpQ6GRx8nMAPnI/edit)** thông qua Antigravity.

## Cấu trúc thư mục

- `sheets/*.csv` — Dữ liệu của từng tab trên Google Sheet (mã hóa `UTF-8 BOM` để mở bằng Excel hoặc VS Code đều hiển thị đúng tiếng Việt).
- `sync.py` — Script đồng bộ 2 chiều theo **từng ô thay đổi (cell-level 3-way merge)**, giữ nguyên màu sắc, Tables, ô gộp và công thức (`=ARRAYFORMULA`, `=UPPER`...) trên Google Sheet.
- `.sync/config.json` — Ánh xạ tên tab Google Sheet ↔ tên file `.csv` cục bộ.
- `.sync/state.json` — Bản chụp lần đồng bộ gần nhất dùng để phát hiện thay đổi từ cả 2 phía.
- `web-app/` — Ứng dụng học từ vựng React + TypeScript + Vite + Tailwind CSS đọc trực tiếp từ `sheets/*.csv` (tự reload khi file CSV thay đổi).

## Chạy ứng dụng học từ vựng (React)

```powershell
cd web-app
npm run dev
```

Mở trình duyệt tại `http://localhost:5173`. Mỗi khi bạn sửa file trong `sheets/` hoặc chạy đồng bộ từ Google Sheet, ứng dụng sẽ tự động cập nhật dữ liệu mới.

## Cách sử dụng hằng ngày

Bạn chỉ cần chỉnh sửa trực tiếp các file trong thư mục `sheets/` (hoặc sửa trên Google Sheet Web), sau đó nhắn cho **Antigravity**:

- **"Kiểm tra thay đổi / status"** → chạy `python sync.py status` để xem trước ô nào đổi ở máy, ô nào đổi trên Web.
- **"Đồng bộ 2 chiều / sync"** → chạy `python sync.py sync` để tự động cập nhật cả 2 chiều.
- **"Tải mới toàn bộ từ Web / pull"** → chạy `python sync.py pull` để làm mới toàn bộ file local theo Google Sheet.
- **Tự động đồng bộ định kỳ:** Dùng lệnh `/schedule` trong Antigravity để hẹn chạy `python sync.py sync` định kỳ (ví dụ mỗi 30 phút).

## Lưu ý bảo vệ dữ liệu

1. **Xung đột (Conflict):** Nếu cùng 1 ô bị sửa khác nhau ở cả máy lẫn Web trước khi sync, script sẽ **dừng lại và báo rõ ô nào bị trùng** để bạn chọn giữ bản ở máy (`--on-conflict local`) hay bản trên Web (`--on-conflict remote`).
2. **Bảo vệ công thức:** Nếu bạn mở file CSV bằng Excel và Excel đổi một ô công thức Google Sheets (như `=ARRAYFORMULA(...)`) thành lỗi `#NAME?`, script sẽ tự động phát hiện và giữ nguyên công thức gốc trên Web.
3. **Không tự động xóa tab:** Nếu bạn xóa nhầm 1 file `.csv` ở máy, script sẽ cảnh báo chứ không tự xóa tab trên Google Sheet.
4. **Thêm tab mới:** Nếu bạn tạo một file `.csv` mới trong `sheets/` rồi chạy `sync`, tab mới tương ứng sẽ tự được tạo trên Google Sheet (và ngược lại, tạo tab mới trên Web sẽ tự sinh file `.csv` trong `sheets/`).
