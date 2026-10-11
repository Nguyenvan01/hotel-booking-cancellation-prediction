"""Danh sách đặc trưng hợp lệ (chỉ biến có sẵn ngay lúc tạo booking) và bộ tiền xử lý.

Lý do giữ/loại từng biến: docs/decisions.md và data/data_dictionary.csv.
"""
import numpy as np
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import FunctionTransformer, OneHotEncoder, StandardScaler

TARGET = "is_canceled"

# Biến phát sinh/cập nhật sau thời điểm đặt: đề bài bắt buộc loại.
FORBIDDEN_BY_SPEC = ["reservation_status", "reservation_status_date", "assigned_room_type",
                     "booking_changes", "days_in_waiting_list"]
# Loại thêm theo nguyên tắc bảo thủ (có bằng chứng ghi nhận sau lúc đặt, hoặc rủi ro công bằng).
EXCLUDED_SUSPECT = ["required_car_parking_spaces", "country", "agent", "company"]
# Nghi vấn: KHÔNG dùng trong mô hình chính; chỉ dùng cho ablation độ nhạy trên validation.
SENSITIVITY_ONLY = ["deposit_type", "adr", "total_of_special_requests"]
FORBIDDEN = FORBIDDEN_BY_SPEC + EXCLUDED_SUSPECT + SENSITIVITY_ONLY

CATEGORICAL = ["hotel", "arrival_date_month", "meal", "market_segment", "distribution_channel",
               "reserved_room_type", "customer_type"]
NUMERIC = ["lead_time", "stays_in_weekend_nights", "stays_in_week_nights", "adults", "children", "babies",
           "previous_cancellations", "previous_bookings_not_canceled"]
BINARY = ["is_repeated_guest"]
FEATURES = CATEGORICAL + NUMERIC + BINARY


def build_preprocessor(categorical=CATEGORICAL, numeric=NUMERIC, binary=BINARY, log_numeric=True):
    """One-hot cho biến phân loại, log1p + chuẩn hóa cho biến đếm lệch phải, giữ nguyên biến nhị phân.

    Mọi tham số (hạng mục, trung bình, độ lệch chuẩn) chỉ được học khi gọi .fit trên tập train.
    Hạng mục hiếm (< 50 dòng train) hoặc chưa gặp được gộp vào nhóm "infrequent" thay vì làm lỗi.
    """
    num_steps = [FunctionTransformer(np.log1p, feature_names_out="one-to-one")] if log_numeric else []
    return ColumnTransformer([
        ("cat", OneHotEncoder(drop="first", min_frequency=50, handle_unknown="infrequent_if_exist",
                              sparse_output=False), categorical),
        ("num", make_pipeline(*num_steps, StandardScaler()), numeric),
        ("bin", "passthrough", binary),
    ])
