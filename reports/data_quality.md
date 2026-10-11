# Báo cáo chất lượng dữ liệu

> Tệp này được sinh tự động bởi `python -m src.data`. Nguồn: H1.csv + H2.csv (xem `data/README.md`).

## 1. Quy mô

- Số dòng thô: **119,390** (kỳ vọng 119.390, khớp), 32 cột (31 cột gốc + `hotel`).
- Không có khóa booking (ID) trong dữ liệu gốc; mỗi dòng là một booking.
- Sau làm sạch: **119,206** dòng (loại 184 dòng).

## 2. Giá trị thiếu (dữ liệu thô)

| Cột | Số ô thiếu | Tỷ lệ |
| --- | --- | --- |
| children | 4 | 0.00% |
| country | 488 | 0.41% |
| agent | 16,340 | 13.69% |
| company | 112,593 | 94.31% |

Ghi chú:
- `agent` và `company` ghi `NULL` khi booking **không** qua đại lý / công ty (theo mô tả của bài báo), nên đây
  không hẳn là "thiếu". Cả hai cột đều bị loại khỏi tập đặc trưng (xem `docs/decisions.md`).
- `country` thiếu 488 dòng và cũng bị loại khỏi đặc trưng (nghi rò rỉ + rủi ro công bằng).
- `children` thiếu 4 dòng → loại dòng (không tự điền), xem mục 5.

## 3. Trùng lặp

- Dòng trùng hoàn toàn ở mọi cột: **31,994 (26.80%)**.
- Sau làm sạch, dòng trùng trên (đặc trưng + ngày đến + nhãn): 39,712 (33.31%).
- Không có mã booking nên không phân biệt được bản ghi nhân đôi do lỗi với nhiều phòng của cùng một đoàn
  (cùng ngày đến, cùng kênh, cùng loại phòng). **Quyết định: giữ lại.** Vì chia theo ngày đến, các bản trùng
  cùng ngày đến luôn rơi vào cùng một tập → không gây rò rỉ giữa train/validation/test.

## 4. Ngoại lệ và giá trị bất thường (dữ liệu thô)

| Kiểm tra | Số dòng |
| --- | --- |
| adr < 0 | 1 |
| adr = 0 | 1,959 |
| adr > 1000 (max = 5,400) | 1 |
| Tổng số khách = 0 | 180 |
| adults > 4 | 16 |
| children >= 10 hoặc babies >= 9 | 3 |
| Tổng số đêm = 0 | 715 |
| lead_time > 365 (max = 737) | 3,148 |
| meal = 'Undefined' (theo bài báo tương đương 'SC') | 1,169 |
| market_segment = 'Undefined' | 2 |
| distribution_channel = 'Undefined' | 5 |

- `adr` (giá trung bình/đêm) không nằm trong đặc trưng của mô hình chính nên các giá trị âm/cực lớn được giữ
  nguyên và chỉ ghi nhận ở đây.
- Các nhóm `Undefined` được giữ nguyên là một hạng mục riêng (không gộp ngầm).

## 5. Các dòng bị loại

| Lý do loại | Số dòng |
| --- | --- |
| `children` bị thiếu (không tính được số khách; không tự điền giá trị) | 4 |
| Tổng số khách = 0 (adults + children + babies = 0): booking không hợp lệ | 180 |

## 6. Phân bố biến mục tiêu `is_canceled`

| Tập | Số booking | Số hủy | Tỷ lệ hủy | Ngày đến |
| --- | --- | --- | --- | --- |
| Toàn bộ (sau làm sạch) | 119,206 | 44,195 | 37.07% | 2015-07-01 → 2017-08-31 |
| train | 78,586 | 28,461 | 36.22% | 2015-07-01 → 2016-12-31 |
| val | 18,443 | 6,736 | 36.52% | 2017-01-01 → 2017-04-30 |
| test | 22,177 | 8,998 | 40.57% | 2017-05-01 → 2017-08-31 |

Theo khách sạn (sau làm sạch):

| hotel | Số booking | Tỷ lệ hủy |
| --- | --- | --- |
| City Hotel | 79,159 | 0.418 |
| Resort Hotel | 40,047 | 0.278 |

Lớp "hủy" chiếm khoảng 37%: mất cân bằng nhẹ. Vì vậy ngoài ROC-AUC, báo cáo dùng PR-AUC, log loss và
precision/recall tại ngưỡng; `class_weight` được thử cả `None` và `balanced`.
