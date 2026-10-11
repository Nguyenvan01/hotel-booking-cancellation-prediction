# Project brief: Dự đoán khả năng hủy đặt phòng tại thời điểm đặt

Project 13 · Học máy cơ bản · Bài 5: Hồi quy logistic, phân loại bằng xác suất · Lớp 12523W.1 ·
GV PGS.TS. Nguyễn Văn Hậu · Nhóm 2 sinh viên · 6 tuần

> **Đóng băng trước khi xem test.** Các định nghĩa dưới đây đã được cố định trong `config.yaml`,
> `src/features.py` và `src/train.py` (commit `e070556`, sau đó mô hình được commit ở `b19833a`) trước lần chạy
> test đầu tiên lúc 2026-10-11 14:34 UTC (`reports/test_runs.log`). Tài liệu này chép lại các định nghĩa đó;
> không mục nào được sửa sau khi xem kết quả test.

## 1. Bối cảnh và câu hỏi

Khách sạn muốn ước lượng rủi ro hủy ngay khi nhận booking để chủ động xác nhận và lập kế hoạch, không gây bất lợi
cho khách. **Câu hỏi nghiên cứu:** với thông tin có ngay lúc đặt, hồi quy logistic dự đoán xác suất hủy và hỗ trợ
chọn ngưỡng hành động ra sao?

## 2. Đặc tả bài toán

| Thành phần | Nội dung |
|---|---|
| Loại bài toán | Phân loại nhị phân theo xác suất; nhãn `is_canceled` (1 = hủy hoặc no-show) |
| Đơn vị quan sát | Một booking tại thời điểm được tạo |
| Thời điểm dự đoán | Ngay khi booking được nhập vào hệ thống |
| Đầu vào | 16 biến có sẵn lúc đặt: khách sạn, lead time, tháng đến, số đêm cuối tuần/trong tuần, số người lớn/trẻ em/em bé, gói ăn, phân khúc thị trường, kênh phân phối, loại phòng đặt, loại khách, khách lặp lại, số lần hủy trước, số booking trước không hủy |
| Biến bị loại | Mọi biến chỉ biết sau lúc đặt (`reservation_status`, `reservation_status_date`, `assigned_room_type`, `booking_changes`, `days_in_waiting_list`) và các biến nghi ghi nhận sau lúc đặt hoặc có rủi ro công bằng (`required_car_parking_spaces`, `country`, `deposit_type`, `adr`, `total_of_special_requests`, `agent`, `company`). Lý do: `docs/decisions.md` |
| Đầu ra | Xác suất hủy (0–1) + nhóm ưu tiên xác nhận (Rất cao / Cao / Trung bình / Thấp) theo 3 ngưỡng chọn trên validation |
| Mô hình | `LogisticRegression` trong `Pipeline` (one-hot, log1p + chuẩn hóa); tune `C`, penalty L1/L2, `class_weight` trên validation |
| Baseline | (1) tỷ lệ hủy chung của train; (2) logistic regression chỉ với `lead_time` |
| Chỉ số chính | ROC-AUC, PR-AUC, log loss (chọn mô hình), Brier, precision/recall/tỷ lệ gắn cờ tại 3 ngưỡng, calibration curve |
| Phạm vi | **Gộp 2 khách sạn** (City Hotel + Resort Hotel), `hotel` là một đặc trưng |
| Chia dữ liệu | Theo ngày đến: train 07/2015–12/2016, validation 01–04/2017, test 05–08/2017; test dùng một lần |

## 3. Dữ liệu

*Hotel Booking Demand Datasets* (Antonio, de Almeida & Nunes, 2019, *Data in Brief* 22, 41–49,
doi:10.1016/j.dib.2018.11.126), CC BY 4.0, 119.390 booking. Tải bằng script có kiểm tra SHA-256 (`data/README.md`).

## 4. Tiêu chí thành công

1. **Tái lập:** `make all` chạy được trên máy khác từ dữ liệu thô đến web (Python 3.14, thư viện đã pin version).
2. **Vượt baseline:** mô hình chính tốt hơn cả hai baseline về ROC-AUC, PR-AUC và log loss trên test; nếu không
   vượt, phải giải thích được.
3. **Không rò rỉ:** test tự động khẳng định không có biến sau-đặt trong đặc trưng; mọi bước fit nằm trong
   `Pipeline` chỉ trên train; test tách biệt, chỉ dùng để báo cáo.
4. **Có thể dùng có trách nhiệm:** xác suất được hiệu chỉnh hợp lý (log loss, calibration curve), có 3 ngưỡng hành
   động với ma trận nhầm lẫn, model card nêu rõ giới hạn và sử dụng bị cấm.

## 5. Sử dụng có trách nhiệm

Chỉ dùng để ưu tiên gọi xác nhận. Không tự động hủy, không tăng giá, không phân biệt đối xử với khách.

## 6. Kết quả (điền sau khi đánh giá test, xem `reports/results.md`)

Test (22.177 booking): ROC-AUC 0,727 (95% CI 0,709–0,748), PR-AUC 0,674, log loss 0,583, so với baseline
`lead_time` 0,619 / 0,481 / 0,680 và baseline tỷ lệ chung 0,500 / 0,406 / 0,679. Đạt tiêu chí 2; hiệu năng giảm so
với validation (0,783) do trôi theo thời gian, được phân tích trong `reports/model_card.md`.
