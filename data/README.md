# Dữ liệu: Hotel Booking Demand Datasets

| Thuộc tính | Giá trị |
|---|---|
| Tên | Hotel Booking Demand Datasets |
| Tác giả | Nuno Antonio, Ana de Almeida, Luis Nunes |
| Bài mô tả | *Data in Brief* 22 (2019) 41–49 |
| Trang dữ liệu | https://pmc.ncbi.nlm.nih.gov/articles/PMC6297060/ |
| DOI | https://doi.org/10.1016/j.dib.2018.11.126 |
| Giấy phép | Creative Commons Attribution 4.0 (CC BY 4.0) |
| Tệp sử dụng | `mmc2.zip` (Multimedia component 2) → `H1.csv` (Resort Hotel), `H2.csv` (City Hotel) |
| URL tải trong script | `https://ars.els-cdn.com/content/image/1-s2.0-S2352340918315191-mmc2.zip` (tệp supplementary gốc trên CDN của Elsevier, giống liên kết `mmc2.zip` trên trang PMC) |
| Ngày tải | 2026-10-11 |
| Quy mô | 119.390 booking (H1: 40.060, H2: 79.330), 31 cột; ngày đến từ 01/07/2015 đến 31/08/2017 |

## Checksum SHA-256 (được kiểm tra tự động trong `src/data.py`)

| Tệp | SHA-256 | Số dòng |
|---|---|---|
| `mmc2.zip` | `6db57d635b9edec05f1cf9616ba6473e864909e4fc34819fa21cff58d518ee6a` | — |
| `H1.csv` | `6f38fda13794fd6cf6547d2432ffb79666200000eb45fd09e4b97fe49519a6ab` | 40.060 |
| `H2.csv` | `5107090ffdc5585a9e18299801e9d85c3b459c235542882183a502a73ef63c4d` | 79.330 |

## Cách tái tạo

```bash
make data          # hoặc: python -m src.data
```

Script tải `mmc2.zip` vào `data/raw/`, kiểm tra SHA-256 của tệp zip và từng CSV, kiểm tra số dòng, tên cột,
kiểu dữ liệu, rồi ghi `reports/data_quality.md`. Thư mục `data/raw/` nằm trong `.gitignore`: **dữ liệu thô
không được commit**.

Nếu không tải tự động được (ví dụ mạng chặn CDN): mở trang PMC ở trên, mục *Supplementary Materials*, tải
`mmc2.zip`, đặt vào `data/raw/mmc2.zip`, rồi chạy lại `make data`. Script vẫn kiểm tra checksum như cũ.

## Xử lý khi đọc

- Đổi tên cột từ CamelCase sang snake_case (ví dụ `LeadTime` → `lead_time`, `ADR` → `adr`).
- Các cột chữ trong tệp gốc được đệm khoảng trắng (ví dụ `"BB       "`): bỏ khoảng trắng ở hai đầu.
- Chuỗi `NULL` (ở `agent`, `company`, `country`) được coi là giá trị thiếu.
- Thêm cột `hotel` theo tệp nguồn và cột dẫn xuất `arrival_date` (chỉ dùng để chia tập).
- Các dòng bị loại và lý do: xem `reports/data_quality.md` mục 5.

Từ điển dữ liệu (kiểu, đơn vị, vai trò, **thời điểm biến có sẵn**, quyết định giữ/loại): `data/data_dictionary.csv`.

## Trích dẫn

> Antonio, N., de Almeida, A., & Nunes, L. (2019). Hotel booking demand datasets. *Data in Brief*, 22, 41–49.
> https://doi.org/10.1016/j.dib.2018.11.126

Dữ liệu đã được tác giả ẩn danh hóa (không có thông tin định danh khách). Nhóm chỉ sử dụng cho mục đích học tập,
có trích dẫn nguồn theo yêu cầu của giấy phép CC BY 4.0.
