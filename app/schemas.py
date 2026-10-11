"""Schema request/response của API. Giới hạn cứng (ngoài miền -> 422) đặt ở đây; cảnh báo "ngoài miền train"
được tính trong main.py từ models/config.json. Danh sách hạng mục phải khớp với dữ liệu train (có test)."""
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

Month = Literal["January", "February", "March", "April", "May", "June", "July", "August", "September",
                "October", "November", "December"]

EXAMPLE = {
    "hotel": "City Hotel", "lead_time": 120, "arrival_date_month": "August", "stays_in_weekend_nights": 1,
    "stays_in_week_nights": 2, "adults": 2, "children": 0, "babies": 0, "meal": "BB",
    "market_segment": "Online TA", "distribution_channel": "TA/TO", "reserved_room_type": "A",
    "customer_type": "Transient", "is_repeated_guest": False, "previous_cancellations": 0,
    "previous_bookings_not_canceled": 0,
}


class BookingRequest(BaseModel):
    """Thông tin có ngay lúc tạo booking. Không có tên, liên hệ hay quốc tịch của khách."""
    # strict: không tự ép kiểu ("12" không được hiểu thành 12); forbid: trường lạ bị từ chối, không bị bỏ qua
    model_config = ConfigDict(strict=True, extra="forbid", json_schema_extra={"examples": [EXAMPLE]})

    hotel: Literal["City Hotel", "Resort Hotel"] = Field(title="Khách sạn")
    lead_time: int = Field(ge=0, le=1000, title="Lead time", description="ngày, từ lúc đặt đến ngày đến (0–1000)")
    arrival_date_month: Month = Field(title="Tháng đến")
    stays_in_weekend_nights: int = Field(ge=0, le=30, title="Số đêm cuối tuần", description="đêm T7/CN (0–30)")
    stays_in_week_nights: int = Field(ge=0, le=60, title="Số đêm trong tuần", description="đêm T2–T6 (0–60)")
    adults: int = Field(ge=0, le=60, title="Người lớn", description="người (0–60)")
    children: int = Field(ge=0, le=10, title="Trẻ em", description="người (0–10)")
    babies: int = Field(ge=0, le=10, title="Em bé", description="người (0–10)")
    meal: Literal["BB", "HB", "FB", "SC", "Undefined"] = Field(
        title="Gói ăn", description="BB: bữa sáng, HB: nửa suất, FB: trọn gói, SC/Undefined: không gói ăn")
    market_segment: Literal["Online TA", "Offline TA/TO", "Groups", "Direct", "Corporate", "Complementary",
                            "Aviation"] = Field(title="Phân khúc thị trường", description="TA: đại lý, TO: tour")
    distribution_channel: Literal["TA/TO", "Direct", "Corporate", "GDS"] = Field(title="Kênh phân phối")
    reserved_room_type: Literal["A", "B", "C", "D", "E", "F", "G", "H", "L"] = Field(
        title="Loại phòng đặt", description="mã ẩn danh trong dữ liệu gốc")
    customer_type: Literal["Transient", "Transient-Party", "Contract", "Group"] = Field(title="Loại khách")
    is_repeated_guest: bool = Field(title="Khách đã từng ở", description="true/false")
    previous_cancellations: int = Field(ge=0, le=30, title="Số lần hủy trước đây", description="booking (0–30)")
    previous_bookings_not_canceled: int = Field(ge=0, le=100, title="Số booking trước không hủy",
                                                description="booking (0–100)")

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
