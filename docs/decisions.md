# Nhật ký quyết định

Mỗi quyết định ghi: bối cảnh → lựa chọn → lý do/bằng chứng. Khi mơ hồ, nhóm chọn phương án **bảo thủ**
(ưu tiên không rò rỉ hơn điểm số cao). Số liệu trích từ dữ liệu train hoặc toàn bộ dữ liệu thô, không từ test.

## D-01. Bỏ bộ dữ liệu Kaggle cũ, chuyển sang Hotel Booking Demand (2026-10-11)

- **Bối cảnh:** phiên bản đầu của repo dùng *Hotel Reservations Dataset* (Kaggle, 36.275 dòng, INN Hotels)
  và chọn XGBoost làm mô hình cuối. Đề Project 13 bắt buộc dùng *Hotel Booking Demand* (119.390 dòng) và
  Logistic Regression.
- **Lựa chọn:** viết lại pipeline. Công việc cũ được giữ trong `archive/hotel_reservations_cancellation.ipynb`
  (không xóa). Tệp CSV Kaggle và `archive/3_REPORT_MachineLearning.docx` (báo cáo của học phần khác, chỉ tham
  khảo định dạng) không commit.
- **Tái sử dụng từ bản cũ:** cách phát hiện dòng trùng (booking theo đoàn), bảng màu biểu đồ, khung
  `Pipeline` + `ColumnTransformer`.

## D-02. Phạm vi: gộp 2 khách sạn

- Gộp City Hotel và Resort Hotel, thêm `hotel` làm đặc trưng. Lý do: nhiều dữ liệu hơn, một mô hình duy nhất
  cho app, và cho phép phần mở rộng so sánh City và Resort (phân tích lỗi theo `hotel`).

## D-03. Loại `required_car_parking_spaces`

- **Bằng chứng:** cả 7.416 booking có yêu cầu chỗ đậu xe đều có tỷ lệ hủy 0%. Một biến "biết lúc đặt" khó
  tách lớp tuyệt đối như vậy; khả năng cao giá trị được ghi khi khách đến (check-in).
- **Lựa chọn:** loại khỏi mọi mô hình (chỉ xuất hiện trong ablation minh họa rò rỉ A3).

## D-04. Loại `country` (rò rỉ + công bằng)

- **Bằng chứng:** khách PRT (Bồ Đào Nha) hủy 57%, các nước khác 24%. Quốc tịch thường được xác nhận/sửa khi
  check-in, nên booking bị hủy giữ giá trị mặc định ban đầu → biến mang thông tin sau thời điểm đặt.
- **Công bằng:** dùng quốc tịch để ưu tiên gọi xác nhận có thể dẫn tới đối xử khác nhau theo quốc tịch, trái
  với nguyên tắc "không phân biệt đối xử" của đề. Loại.

## D-05. `deposit_type`, `adr`, `total_of_special_requests`: chỉ dùng cho ablation độ nhạy

- `deposit_type = Non Refund` có tỷ lệ hủy 99,4% (14.587 booking), ngược với logic kinh doanh (khách đã trả
  tiền không hoàn lại thường ít hủy). Có thể trường này phản ánh trạng thái tiền cọc sau khi hủy.
- `adr` được tính từ giao dịch lưu trú, có thể thay đổi sau lúc đặt (đổi phòng, đổi ngày).
- `total_of_special_requests` có thể được bổ sung bất kỳ lúc nào trước khi đến.
- **Lựa chọn:** không dùng trong mô hình chính. Ablation A2 (chỉ trên validation) cho thấy thêm ba biến này
  tăng ROC-AUC từ 0,783 lên 0,841. Đây là mức chênh nhóm **chủ động chấp nhận mất** để tránh rò rỉ; nếu khách
  sạn xác nhận được các trường này được chốt ngay lúc đặt, có thể đưa lại vào (xem model card, mục giới hạn).
- Với `adr`, ablation cắt giá trị âm về 0 trước log1p (1 dòng có `adr` < 0).

## D-06. Loại `agent`, `company`

- Mã ID ẩn danh nhiều giá trị (`agent` 333 giá trị, `company` 352), `company` NULL 94%. Có thể được bổ sung
  sau lúc đặt (công ty thanh toán). Thông tin "qua kênh nào" đã có ở `market_segment` và
  `distribution_channel`. Ngoài ra, app không thể yêu cầu nhân viên nhập mã ID đối tác một cách có ý nghĩa.

## D-07. Giữ số đêm và số khách dù có thể bị sửa sau

- `stays_in_*`, `adults`, `children`, `babies` là nội dung cốt lõi của một booking, luôn có lúc đặt. Trong
  dữ liệu, booking đã check-out có thể phản ánh số liệu sau khi sửa (`booking_changes`), nhưng không có
  dấu hiệu tách lớp bất thường như D-03/D-05. **Rủi ro còn lại** được ghi trong model card.

## D-08. Giữ `previous_cancellations` dù có bất thường

- Đề bài liệt kê rõ "lịch sử hủy có trước" là đầu vào hợp lệ, và theo định nghĩa biến này được tính trước
  booking hiện tại. Tuy nhiên trên train, `previous_cancellations = 1` có tỷ lệ hủy 97% (5.854 booking) trong
  khi `= 2` chỉ 42%: dấu hiệu của các đợt booking theo đoàn bị hủy hàng loạt. Mô hình dựa nhiều vào biến này
  (odds ratio lớn nhất); điều này được nêu trong phân tích lỗi và model card.

## D-09. Không dùng năm / tuần / ngày đến làm đặc trưng

- Chia theo thời gian nên năm của test (2017) không xuất hiện trong train: không ngoại suy được. Tuần trùng
  thông tin với tháng. Chỉ giữ `arrival_date_month` (mùa vụ).

## D-10. Làm sạch: loại 184 dòng, giữ dòng trùng

- Loại 4 dòng thiếu `children` (không tự điền) và 180 dòng tổng số khách = 0. Giữ 31.994 dòng trùng hoàn toàn
  vì không có mã booking để phân biệt lỗi nhân đôi và nhiều phòng của cùng một đoàn; chia theo ngày đến đảm
  bảo các bản trùng không nằm ở hai tập khác nhau.

## D-11. Chia theo ngày đến: train / validation / test = 07/2015–12/2016 / 01–04/2017 / 05–08/2017

- Mô phỏng triển khai thật: học từ quá khứ, dự đoán booking đến trong tương lai. Kiểm soát trôi theo thời gian
  tốt hơn chia ngẫu nhiên và tự động đặt các booking cùng đoàn vào cùng một tập.
- Mô hình cuối **chỉ fit trên train** (không fit lại trên train + validation), để ba ngưỡng chọn trên
  validation khớp đúng với mô hình được lưu và được đánh giá.
- Đánh đổi: validation (mùa đông–xuân) và test (mùa hè) khác mùa; tỷ lệ hủy test (40,6%) cao hơn train (36,2%).

## D-12. Tiền xử lý: log1p cho biến đếm, one-hot với nhóm hiếm

- EDA trên train: `lead_time` và các biến đếm lệch phải mạnh; tỷ lệ hủy tăng nhanh ở lead time ngắn rồi chậm
  dần. Áp dụng `log1p` + chuẩn hóa. Ablation A1 (bỏ log1p) giảm ROC-AUC validation từ 0,783 xuống 0,766.
- `OneHotEncoder(drop="first", min_frequency=50, handle_unknown="infrequent_if_exist")`: hạng mục < 50 dòng
  train (ví dụ phòng `L`, kênh `Undefined`) và hạng mục chưa gặp được gộp vào nhóm hiếm thay vì gây lỗi.
  `drop="first"` để mỗi hệ số có hạng mục tham chiếu rõ ràng khi diễn giải odds ratio.

## D-13. Chọn mô hình theo log loss trên validation

- Đầu ra của sản phẩm là **xác suất**, nên chọn tham số theo log loss (một proper scoring rule), không theo
  accuracy. Lưới: `C ∈ {0.001, …, 100}`, penalty L1/L2 (`l1_ratio` 1/0, vì scikit-learn 1.9 đã deprecate
  `penalty`), `class_weight ∈ {None, balanced}`. Kết quả: L2, C = 1, `class_weight = None`.
- `class_weight = "balanced"` cho ROC-AUC gần như bằng nhưng log loss xấu hơn (0,552 so với 0,527) vì nó
  đẩy xác suất lên so với tần suất thật. Mô hình balanced được giữ để so sánh calibration.
- Solver: `lbfgs` cho L2, `liblinear` cho L1 (`saga` mất 50–140 giây/lần fit và hội tụ chậm).

## D-14. Ba ngưỡng hành động chọn trên validation

- Ưu tiên recall: ngưỡng cao nhất vẫn bắt ≥ 90% booking hủy. Mục tiêu ban đầu 80% cho ngưỡng gần trùng
  ngưỡng F1 (0,328 so với 0,335) nên được nâng lên 90% để ba mức hành động khác nhau rõ (quyết định dựa trên
  validation).
- Cân bằng: ngưỡng tối đa F1.
- Theo năng lực gọi: gắn cờ 15% booking có xác suất cao nhất (giả định bộ phận lễ tân gọi được ~15% booking).

## D-15. Khoảng biến thiên bằng bootstrap theo cụm ngày đến

- Booking cùng ngày đến (đặc biệt booking theo đoàn) tương quan với nhau; bootstrap từng dòng sẽ cho khoảng tin
  cậy hẹp giả tạo. Bootstrap lấy mẫu lại theo **ngày đến** (200 lần, seed cố định). Hồi quy logistic với lbfgs
  là tất định, nên khoảng biến thiên qua seed bằng 0; bootstrap phản ánh biến thiên do mẫu.

## D-16. Tập test chỉ dùng một lần

- `src/train.py` không đọc test. `src/evaluate.py` có chế độ `val` để chạy thử code trên validation. Mỗi lần
  chạy trên test được ghi vào `reports/test_runs.log` (thời điểm UTC, SHA-256 mô hình, commit). Lần chạy test
  chính thức được thực hiện sau khi mô hình, đặc trưng và ngưỡng đã được commit.
- **Nhật ký chạy test (2026-10-11):** lần 1 (14:34 UTC) là lần đánh giá chính thức. Lần 2 (14:36 UTC) cùng
  mô hình, chỉ để sửa lỗi hiển thị trong `evaluate.py` (hình theo tháng lỡ bỏ các dòng trùng; đường PR của
  baseline hằng số; định dạng bảng). Mọi metric của lần 2 giống hệt lần 1 (đã so sánh `metrics.json`); không có
  tham số, đặc trưng hay ngưỡng nào thay đổi sau khi xem test.
