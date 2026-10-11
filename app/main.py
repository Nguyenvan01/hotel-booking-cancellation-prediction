"""Ứng dụng web + API. Chỉ nạp pipeline đã huấn luyện (models/model.joblib), không huấn luyện lại, không lưu dữ liệu.

Chạy: uvicorn app.main:app --port 8000   (hoặc make app)
"""
import json
import logging
from pathlib import Path

import joblib
import pandas as pd
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse, PlainTextResponse
from fastapi.staticfiles import StaticFiles

from app.schemas import EXAMPLE, BookingRequest, RiskResponse

ROOT = Path(__file__).resolve().parents[1]
STATIC = Path(__file__).parent / "static"
log = logging.getLogger("app")

MODEL = joblib.load(ROOT / "models" / "model.joblib")
CONFIG = json.loads((ROOT / "models" / "config.json").read_text(encoding="utf-8"))
METRICS = json.loads((ROOT / "models" / "metrics.json").read_text(encoding="utf-8"))

app = FastAPI(
    title="Dự đoán rủi ro hủy đặt phòng",
    version=CONFIG["model_version"],
    description="Logistic regression ước lượng xác suất hủy ngay lúc tạo booking. Chỉ dùng để ưu tiên gọi xác "
                "nhận; không dùng để tự động hủy, tăng giá hay phân biệt đối xử. Không lưu dữ liệu gửi lên.",
)
app.mount("/static", StaticFiles(directory=STATIC), name="static")
app.mount("/figures", StaticFiles(directory=ROOT / "reports" / "figures"), name="figures")

MESSAGES = {
    "missing": "Thiếu trường bắt buộc",
    "extra_forbidden": "Trường không được hỗ trợ",
    "int_type": "Phải là số nguyên",
    "bool_type": "Phải là true hoặc false",
    "literal_error": "Giá trị không hợp lệ; chấp nhận: {expected}",
    "greater_than_equal": "Phải ≥ {ge}",
    "less_than_equal": "Phải ≤ {le}",
    "json_invalid": "Body không phải JSON hợp lệ",
}


@app.exception_handler(RequestValidationError)
async def validation_error(request: Request, exc: RequestValidationError):
    details = []
    for e in exc.errors():
        template = MESSAGES.get(e["type"])
        message = template.format(**e.get("ctx", {})) if template else e["msg"].removeprefix("Value error, ")
        details.append({"field": ".".join(str(x) for x in e["loc"][1:]) or "body", "message": message,
                        "type": e["type"]})
    # thiếu trường / body hỏng -> 400; sai kiểu, sai hạng mục, ngoài miền -> 422
    status = 400 if any(d["type"] in ("missing", "json_invalid") for d in details) else 422
    return JSONResponse(status_code=status, content={"detail": details})


@app.exception_handler(Exception)
async def internal_error(request: Request, exc: Exception):
    log.exception("Lỗi khi xử lý %s", request.url.path)  # không ghi nội dung request (không lưu dữ liệu khách)
    return JSONResponse(status_code=500, content={"detail": "Lỗi nội bộ; không có dữ liệu nào được lưu. Vui lòng thử lại."})


def input_warnings(booking: BookingRequest):
    domain, out = CONFIG["train_domain"], []
    values = booking.model_dump()
    for col, d in domain["numeric"].items():
        v = int(values[col])
        if v < d["min"] or v > d["max"]:
            out.append(f"{col} = {v} nằm ngoài miền dữ liệu train [{d['min']:g}, {d['max']:g}]: mô hình phải ngoại "
                       "suy, xác suất kém tin cậy.")
        elif v < d["p01"] or v > d["p99"]:
            out.append(f"{col} = {v} hiếm gặp trong train (ngoài khoảng 1%–99%: {d['p01']:g}–{d['p99']:g}).")
    for col, counts in domain["categories"].items():
        if counts.get(values[col], 0) < 50:
            out.append(f"{col} = {values[col]} rất hiếm trong train (n = {counts.get(values[col], 0)}), được gộp "
                       "vào nhóm 'hiếm' khi dự đoán.")
    return out


@app.post("/api/cancellation-risk", response_model=RiskResponse,
          responses={400: {"description": "Thiếu trường hoặc body không phải JSON"},
                     422: {"description": "Sai kiểu, hạng mục không hợp lệ hoặc ngoài miền cho phép"}})
def cancellation_risk(booking: BookingRequest):
    row = pd.DataFrame([booking.model_dump()])
    row["is_repeated_guest"] = row["is_repeated_guest"].astype(int)
    p = float(MODEL.predict_proba(row[list(MODEL.feature_names_in_)])[0, 1])
    group = next(g for g in CONFIG["risk_groups"] if p >= g["min_probability"])
    used = group["min_probability"] if group["min_probability"] > 0 else CONFIG["thresholds"]["high_recall"]
    return RiskResponse(probability=round(p, 4), risk_group=group["name"], action=group["action"],
                        threshold_used=round(used, 4),
                        thresholds={k: round(v, 4) for k, v in CONFIG["thresholds"].items()},
                        model_version=CONFIG["model_version"], warnings=input_warnings(booking))


@app.get("/api/model-info")
def model_info():
    """Thông tin cho giao diện: schema đầu vào, ngưỡng, metric validation/test, phiên bản."""
    return {"model_version": CONFIG["model_version"], "trained_at": CONFIG["trained_at"], "params": CONFIG["params"],
            "split": CONFIG["split"], "thresholds": CONFIG["thresholds"], "risk_groups": CONFIG["risk_groups"],
            "features": CONFIG["features"], "forbidden_columns": CONFIG["forbidden_columns"],
            "input_schema": BookingRequest.model_json_schema(), "example": EXAMPLE, "metrics": METRICS}


@app.get("/model-card", response_class=PlainTextResponse)
def model_card():
    return (ROOT / "reports" / "model_card.md").read_text(encoding="utf-8")


@app.get("/", include_in_schema=False)
def index():
    return FileResponse(STATIC / "index.html")


@app.get("/predict", include_in_schema=False)
def predict_page():
    return FileResponse(STATIC / "predict.html")


@app.get("/dashboard", include_in_schema=False)
def dashboard_page():
    return FileResponse(STATIC / "dashboard.html")
