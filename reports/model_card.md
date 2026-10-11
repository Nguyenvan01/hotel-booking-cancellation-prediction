# Model card: Dự đoán rủi ro hủy đặt phòng tại thời điểm đặt

Model card theo Mitchell et al. (2019). Số liệu lấy từ `models/metrics.json` và `reports/`.

## 1. Mục đích sử dụng

- **Dùng cho:** ngay khi một booking được tạo, ước lượng xác suất booking đó bị hủy (kể cả no-show) và xếp vào
  nhóm ưu tiên gọi xác nhận (Rất cao / Cao / Trung bình / Thấp), để bộ phận lễ tân sắp xếp việc liên hệ và lập
  kế hoạch công suất phòng.
- **Người dùng:** nhân viên vận hành khách sạn; quyết định cuối cùng thuộc về con người.

## 2. Sử dụng bị cấm

- Tự động hủy booking, từ chối khách hay bán chồng phòng dựa trên điểm rủi ro.
- Tăng giá, yêu cầu đặt cọc hay áp điều kiện khắt khe hơn cho khách có điểm rủi ro cao.
- Phân biệt đối xử theo quốc tịch hay bất kỳ đặc điểm cá nhân nào (mô hình cố ý không dùng quốc tịch).
- Áp dụng cho khách sạn, thị trường hay giai đoạn khác mà không đánh giá lại.

## 3. Dữ liệu và phạm vi

- *Hotel Booking Demand Datasets* (Antonio, de Almeida & Nunes, 2019, *Data in Brief* 22, 41–49,
  doi:10.1016/j.dib.2018.11.126), giấy phép CC BY 4.0. 119.390 booking của một resort và một khách sạn thành
  phố ở Bồ Đào Nha, ngày đến 01/07/2015–31/08/2017. Đã ẩn danh, không có thông tin định danh khách.
- Làm sạch: loại 184 dòng (4 thiếu `children`, 180 có 0 khách) → 119.206 dòng. Chi tiết: `reports/data_quality.md`.
- Chia theo ngày đến: train 07/2015–12/2016 (78.586), validation 01–04/2017 (18.443), test 05–08/2017 (22.177).
  Tỷ lệ hủy lần lượt 36,2% / 36,5% / 40,6%.
- Phạm vi: gộp hai khách sạn (City Hotel và Resort Hotel), `hotel` là một đặc trưng.

## 4. Thời điểm dự đoán và biến bị loại

- Mô hình chạy **ngay khi booking được tạo**, nên chỉ dùng thông tin đã có và không bị cập nhật sau thời điểm đó.
- **Đặc trưng (16):** `hotel`, `arrival_date_month`, `meal`, `market_segment`, `distribution_channel`,
  `reserved_room_type`, `customer_type`, `lead_time`, `stays_in_weekend_nights`, `stays_in_week_nights`, `adults`,
  `children`, `babies`, `previous_cancellations`, `previous_bookings_not_canceled`, `is_repeated_guest`.
- **Không dùng:** biến sau-đặt theo đề bài (`reservation_status`, `reservation_status_date`, `assigned_room_type`,
  `booking_changes`, `days_in_waiting_list`); biến nghi ghi nhận sau lúc đặt (`required_car_parking_spaces`,
  `deposit_type`, `adr`, `total_of_special_requests`); `country` (rò rỉ + công bằng); `agent`, `company`.
  Lý do từng biến: `docs/decisions.md`, `data/data_dictionary.csv`.

## 5. Metric trên tập test

Khoảng 95%: bootstrap theo cụm ngày đến (200 lần). Validation dùng để chọn; test dùng một lần để kết luận.

| Mô hình | Tập | ROC-AUC | PR-AUC | Log loss | Brier |
|---|---|---|---|---|---|
| Baseline: tỷ lệ hủy chung | test | 0,500 | 0,406 | 0,679 | 0,243 |
| Baseline: LR chỉ `lead_time` | test | 0,619 | 0,481 | 0,680 | 0,242 |
| **LR đầy đủ (mô hình chính)** | validation | 0,783 (0,757–0,812) | 0,711 | 0,527 | 0,177 |
| **LR đầy đủ (mô hình chính)** | **test** | **0,727 (0,709–0,748)** | **0,674 (0,638–0,718)** | **0,583 (0,571–0,594)** | **0,200** |
| LR đầy đủ, `class_weight = balanced` | test | 0,727 | 0,673 | 0,611 | 0,214 |

Mô hình chính vượt cả hai baseline trên mọi metric ở test. ROC-AUC giảm từ 0,783 (validation) xuống 0,727 (test):
xem mục 8.

### Ba ngưỡng hành động (chọn trên validation)

| Ngưỡng | t | Precision val → test | Recall val → test | Gắn cờ val → test |
|---|---|---|---|---|
| Ưu tiên recall (recall ≥ 90% trên val) | 0,241 | 0,480 → 0,488 | 0,900 → 0,910 | 68,5% → 75,6% |
| Cân bằng (F1 max trên val) | 0,335 | 0,529 → 0,523 | 0,793 → 0,804 | 54,8% → 62,4% |
| Theo năng lực gọi (~15% booking) | 0,556 | 0,808 → 0,700 | 0,332 → 0,344 | 15,0% → 19,9% |

Nhóm rủi ro trong app: ≥ 0,556 Rất cao; ≥ 0,335 Cao; ≥ 0,241 Trung bình; còn lại Thấp. Ở test, ngưỡng "năng lực
gọi" gắn cờ 19,9% thay vì 15% vì tỷ lệ hủy mùa hè cao hơn; nếu năng lực gọi cố định, cần hiệu chỉnh lại ngưỡng
định kỳ.

## 6. Calibration

- Trên test, xác suất dự đoán trung bình 39,5% so với tỷ lệ hủy thực tế 40,6% (lệch −1,1 điểm phần trăm).
- Reliability diagram (`reports/figures/fig_calibration.png`) bám đường chéo ở vùng 0–0,6; ở vùng xác suất cao
  nhất, tỷ lệ hủy thực tế cao hơn dự đoán (mô hình hơi thận trọng).
- `class_weight = "balanced"` có cùng ROC-AUC nhưng xác suất bị đẩy lên (log loss 0,611 so với 0,583), nên
  không được chọn: sản phẩm cần xác suất có ý nghĩa, không chỉ thứ hạng.

## 7. Hiệu năng theo nhóm (test, ngưỡng cân bằng)

| Nhóm | n | Hủy thực tế | Dự đoán TB | ROC-AUC | Recall |
|---|---|---|---|---|---|
| City Hotel | 15.191 | 42,6% | 44,6% | 0,739 | 0,873 |
| Resort Hotel | 6.986 | 36,2% | 28,5% | 0,733 | 0,626 |
| Online TA | 13.074 | 42,7% | 41,0% | 0,632 | 0,839 |
| Groups | 2.317 | 67,7% | 64,5% | 0,901 | 0,928 |
| Direct | 2.469 | 18,7% | 20,5% | 0,623 | 0,258 |
| Lead time 8–30 ngày | 2.750 | 30,5% | 24,4% | 0,598 | 0,208 |
| Lead time 31–90 ngày | 3.716 | 39,4% | 35,9% | 0,573 | 0,709 |
| Khách lặp lại | 582 | 6,4% | 5,8% | 0,751 | 0,405 |

Theo tháng đến (test): ROC-AUC 0,782 (05/2017), 0,756 (06), 0,675 (07), 0,666 (08). Bảng đầy đủ:
`reports/error_by_group.csv`, `reports/results.md`.

## 8. Giới hạn và trường hợp ngoài miền

1. **Trôi theo thời gian.** Hiệu năng giảm dần khi xa thời điểm huấn luyện (tháng 7–8/2017 thấp nhất). Cần đánh
   giá lại và huấn luyện lại định kỳ.
2. **Dự đoán thấp cho Resort Hotel** (28,5% so với 36,2% thực tế) → recall ở Resort thấp hơn hẳn City.
3. **Xếp hạng yếu trong nhóm lớn nhất** (Online TA, ROC-AUC 0,63) và ở lead time 8–90 ngày: phần lớn tín hiệu đến
   từ lead time dài, phân khúc Groups và lịch sử hủy.
4. **Phụ thuộc vào `previous_cancellations`.** Odds ratio cho 0 → 1 lần hủy trước là khoảng 72, do trên train
   `previous_cancellations = 1` có 97% hủy (dấu hiệu booking đoàn bị hủy hàng loạt). Booking cá nhân có 1 lần hủy
   trước có thể bị đánh giá quá cao (ví dụ FP mạnh nhất trên test: khách Direct, xác suất 0,98, không hủy).
5. **Lỗi tin chắc nhất ở khách quen đặt sát ngày:** các FN có xác suất gần 0 đều là khách lặp lại, lead time 0–4
   ngày, kênh Corporate/Direct.
6. **Đánh đổi rò rỉ:** loại `deposit_type`, `adr`, `total_of_special_requests` làm ROC-AUC validation thấp hơn
   0,058 (0,783 so với 0,841, ablation A2). Nếu khách sạn xác nhận các trường này được chốt ngay lúc đặt, có thể đưa
   lại và đánh giá lại.
7. **Rủi ro rò rỉ còn lại:** số đêm và số khách có thể bị sửa sau lúc đặt trong dữ liệu lịch sử (D-07).
8. **Ngoài miền:** với `lead_time` vượt 737 ngày (max của train), mô hình tuyến tính trên log-odds vẫn ngoại suy
   (ví dụ 2.000 ngày → 0,80). API trả cảnh báo khi đầu vào ngoài miền hoặc hiếm.
9. **Không suy diễn nhân quả:** hệ số/odds ratio là liên hệ có điều kiện trong dữ liệu quan sát; ví dụ odds ratio
   của `customer_type = Transient` không có nghĩa là đổi loại khách sẽ làm giảm hủy.

## 9. Công bằng và quyền riêng tư

- Không dùng quốc tịch hay thông tin cá nhân. Các nhóm như khách lặp lại/khách mới có tỷ lệ gắn cờ rất khác nhau
  (5% so với 64%) chủ yếu vì tỷ lệ hủy thực tế khác nhau; việc gắn cờ chỉ dẫn tới một cuộc gọi xác nhận, không
  dẫn tới bất lợi cho khách.
- Ứng dụng không lưu và không ghi log nội dung booking; không dùng cơ sở dữ liệu.

## 10. Phiên bản và tái lập

| Mục | Nội dung |
|---|---|
| Phiên bản | `logreg-1.0-5638e346` (SHA-256 của `models/model.joblib` bắt đầu bằng `5638e346`) |
| Ngày huấn luyện / đánh giá test | 2026-10-11 / 2026-10-11 (log: `reports/test_runs.log`) |
| Loại mô hình | `sklearn.linear_model.LogisticRegression` trong `Pipeline` (one-hot + log1p + chuẩn hóa) |
| Tham số | L2, C = 1, `class_weight = None`, solver lbfgs, seed 42 (chọn theo log loss trên validation) |
| Nhóm thực hiện | Project 13, lớp 12523W.1, học phần Học máy (GV PGS.TS. Nguyễn Văn Hậu) |
| Mã nguồn | `src/train.py`, `src/evaluate.py`; cấu hình `config.yaml`; tham số đầy đủ `models/config.json` |

```bash
make all   # data → train → evaluate → test → app
```

Môi trường: Python 3.14.7, numpy 2.5.3, pandas 3.0.6, scikit-learn 1.9.1 (đầy đủ trong `requirements.txt` và
`models/config.json`).
