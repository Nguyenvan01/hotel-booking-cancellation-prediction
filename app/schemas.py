"""Schema request/response của API. Giới hạn cứng (ngoài miền -> 422) đặt ở đây; cảnh báo "ngoài miền train"
được tính trong main.py từ models/config.json. Danh sách hạng mục phải khớp với dữ liệu train (có test).
`unit` và `group` trong json_schema_extra được giao diện dùng để dựng form."""
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

Month = Literal["January", "February", "March", "April", "May", "June", "July", "August", "September",
                "October", "November", "December"]
BOOKING, GUEST, CHANNEL, HISTORY = "Thông tin đặt phòng", "Khách", "Kênh & loại phòng", "Lịch sử"


def meta(group, unit=None):
    return {"group": group, **({"unit": unit} if unit else {})}


EXAMPLE = {
    "hotel": "City Hotel", "lead_time": 120, "arrival_date_month": "August", "stays_in_weekend_nights": 1,
    "stays_in_week_nights": 2, "adults": 2, "children": 0, "babies": 0, "meal": "BB",
    "market_segment": "Online TA", "distribution_channel": "TA/TO", "reserved_room_type": "A",
    "customer_type": "Transient", "is_repeated_guest": False, "previous_cancellations": 0,
    "previous_bookings_not_canceled": 0,
}

# Booking mẫu giả lập (không phải khách thật) cho demo; nhãn mô tả nhóm kết quả mong đợi.
DEMO_BOOKINGS = [
    {"id": "low", "label": "Rủi ro thấp: khách quen, đặt sát ngày",
     "booking": EXAMPLE | {"lead_time": 3, "arrival_date_month": "March", "stays_in_weekend_nights": 0, "adults": 1,
                           "market_segment": "Corporate", "distribution_channel": "Corporate",
                           "is_repeated_guest": True, "previous_bookings_not_canceled": 4}},
    {"id": "medium", "label": "Rủi ro trung bình: gia đình đặt qua OTA",
     "booking": EXAMPLE | {"hotel": "Resort Hotel", "lead_time": 60, "stays_in_weekend_nights": 2,
                           "stays_in_week_nights": 5, "children": 1, "meal": "HB", "reserved_room_type": "D"}},
    {"id": "high", "label": "Rủi ro cao: đoàn đặt sớm, từng hủy",
     "booking": EXAMPLE | {"lead_time": 250, "arrival_date_month": "October", "stays_in_weekend_nights": 0,
                           "stays_in_week_nights": 3, "market_segment": "Groups", "previous_cancellations": 1}},
    {"id": "ood", "label": "Ngoài miền train: lead time 900 ngày",
     "booking": EXAMPLE | {"lead_time": 900, "arrival_date_month": "May"}},
]


class BookingRequest(BaseModel):
    """Thông tin có ngay lúc tạo booking. Không có tên, liên hệ hay quốc tịch của khách."""
    # strict: không tự ép kiểu ("12" không được hiểu thành 12); forbid: trường lạ bị từ chối, không bị bỏ qua
    model_config = ConfigDict(strict=True, extra="forbid", json_schema_extra={"examples": [EXAMPLE]})

    hotel: Literal["City Hotel", "Resort Hotel"] = Field(title="Khách sạn", json_schema_extra=meta(BOOKING))
    lead_time: int = Field(ge=0, le=1000, title="Thời gian đặt trước",
                           description="Số ngày từ lúc đặt đến ngày đến", json_schema_extra=meta(BOOKING, "ngày"))
    arrival_date_month: Month = Field(title="Tháng đến dự kiến", json_schema_extra=meta(BOOKING))
    stays_in_weekend_nights: int = Field(ge=0, le=30, title="Số đêm cuối tuần", description="Đêm thứ Bảy, Chủ nhật",
                                         json_schema_extra=meta(BOOKING, "đêm"))
    stays_in_week_nights: int = Field(ge=0, le=60, title="Số đêm trong tuần", description="Đêm thứ Hai đến thứ Sáu",
                                      json_schema_extra=meta(BOOKING, "đêm"))
    adults: int = Field(ge=0, le=60, title="Người lớn", json_schema_extra=meta(GUEST, "người"))
    children: int = Field(ge=0, le=10, title="Trẻ em", json_schema_extra=meta(GUEST, "người"))
    babies: int = Field(ge=0, le=10, title="Em bé", json_schema_extra=meta(GUEST, "người"))
    is_repeated_guest: bool = Field(title="Khách lặp lại", description="Khách đã từng ở khách sạn",
                                    json_schema_extra=meta(GUEST))
    market_segment: Literal["Online TA", "Offline TA/TO", "Groups", "Direct", "Corporate", "Complementary",
                            "Aviation"] = Field(title="Phân khúc thị trường", description="TA: đại lý, TO: tour",
                                                json_schema_extra=meta(CHANNEL))
    distribution_channel: Literal["TA/TO", "Direct", "Corporate", "GDS"] = Field(
        title="Kênh phân phối", json_schema_extra=meta(CHANNEL))
    reserved_room_type: Literal["A", "B", "C", "D", "E", "F", "G", "H", "L"] = Field(
        title="Loại phòng đặt", description="Mã ẩn danh trong dữ liệu gốc", json_schema_extra=meta(CHANNEL))
    meal: Literal["BB", "HB", "FB", "SC", "Undefined"] = Field(
        title="Gói ăn", description="BB: bữa sáng, HB: nửa suất, FB: trọn gói, SC/Undefined: không gói ăn",
        json_schema_extra=meta(CHANNEL))
    customer_type: Literal["Transient", "Transient-Party", "Contract", "Group"] = Field(
        title="Loại khách", json_schema_extra=meta(CHANNEL))
    previous_cancellations: int = Field(ge=0, le=30, title="Số lần hủy trước",
                                        json_schema_extra=meta(HISTORY, "lần"))
    previous_bookings_not_canceled: int = Field(ge=0, le=100, title="Số booking trước không hủy",
                                                json_schema_extra=meta(HISTORY, "lần"))

    @model_validator(mode="after")
    def at_least_one_guest(self):
        if self.adults + self.children + self.babies < 1:
            raise ValueError("Tổng số khách (người lớn + trẻ em + em bé) phải ≥ 1")
        return self


class RiskResponse(BaseModel):
    probability: float = Field(description="Xác suất hủy ước lượng (0–1)")
    risk_group: Literal["Rất cao", "Cao", "Trung bình", "Thấp"]
    action: str = Field(description="Hành động gợi ý; chỉ để ưu tiên gọi xác nhận")
    threshold_used: float = Field(description="Ngưỡng xác suất xác định nhóm (ngưỡng thấp nhất nếu nhóm Thấp)")
    thresholds: dict[str, float]
    model_version: str
    warnings: list[str]
