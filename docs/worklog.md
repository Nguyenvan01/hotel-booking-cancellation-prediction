# Nhật ký 6 tuần

> **Mẫu để nhóm tự điền.** Mỗi dòng: ngày, người thực hiện, việc, giờ ước lượng, kết quả/minh chứng (commit,
> tệp), vấn đề gặp phải. Không điền hộ hoặc điền lùi ngày: nhật ký phải khớp với Git history và lời trình bày
> khi vấn đáp. Cột "Minh chứng đầu ra" lấy theo kế hoạch trong tài liệu giao nhiệm vụ.

Thành viên: **A** = `<Họ tên, MSSV>` · **B** = `<Họ tên, MSSV>`

## Tuần 1: Chốt câu hỏi, thời điểm dự đoán, nguồn/giấy phép; tạo repo và backlog

Minh chứng đầu ra: `docs/project_brief.md`, `data/README.md`, schema (`src/data.py`), kế hoạch baseline.

| Ngày | Người | Việc | Giờ | Kết quả / minh chứng | Vấn đề |
|---|---|---|---|---|---|
| | | | | | |

## Tuần 2: Tải/làm sạch; EDA trên train; hoàn thiện split và baseline

Minh chứng: `src/data.py`, `notebooks/eda.ipynb`, `reports/data_quality.md`, baseline chạy được; checkpoint GV.

| Ngày | Người | Việc | Giờ | Kết quả / minh chứng | Vấn đề |
|---|---|---|---|---|---|
| | | | | | |

## Tuần 3: Pipeline mô hình chính; validation; theo dõi thí nghiệm

Minh chứng: `reports/experiments.csv` (vòng 1), model candidate, `tests/test_preprocessing.py`.

| Ngày | Người | Việc | Giờ | Kết quả / minh chứng | Vấn đề |
|---|---|---|---|---|---|
| | | | | | |

## Tuần 4: Hoàn tất thí nghiệm, chọn mô hình/ngưỡng; test cuối; phân tích lỗi

Minh chứng: bảng kết quả đóng băng (`models/metrics.json`), `reports/figures/`, `reports/model_card.md` nháp,
`reports/test_runs.log`.

| Ngày | Người | Việc | Giờ | Kết quả / minh chứng | Vấn đề |
|---|---|---|---|---|---|
| | | | | | |

## Tuần 5: Đóng gói API và giao diện; tích hợp model; test đầu vào và lỗi

Minh chứng: web demo end-to-end (`app/`), API docs (`/docs`), `tests/test_api.py`; checkpoint demo.

| Ngày | Người | Việc | Giờ | Kết quả / minh chứng | Vấn đề |
|---|---|---|---|---|---|
| | | | | | |

## Tuần 6: Hoàn thiện báo cáo/slide; rehearsal; tái lập trên môi trường sạch

Minh chứng: release cuối, báo cáo PDF + DOCX, slide, biên bản phân công (`docs/contribution.md`).

| Ngày | Người | Việc | Giờ | Kết quả / minh chứng | Vấn đề |
|---|---|---|---|---|---|
| | | | | | |

## Ghi nhận sử dụng công cụ AI

| Ngày | Người | Công cụ | Dùng để làm gì | Cách kiểm chứng |
|---|---|---|---|---|
| 2026-10-11 | `<điền>` | Claude Code (Claude Opus 5.5) | Rà soát repo so với đề, chuyển sang đúng bộ dữ liệu, viết lại pipeline `src/`, app, test và bản nháp tài liệu | Chạy lại toàn bộ pipeline, 51 test tự động, đối chiếu số trong tài liệu với `models/metrics.json`; nhóm tự đọc lại và chịu trách nhiệm nội dung (xem `docs/contribution.md`) |
