"""Ứng dụng web + API. Chỉ nạp pipeline đã huấn luyện (models/model.joblib), không huấn luyện lại, không lưu dữ liệu.
Các endpoint GET chỉ đọc file đã sinh bởi src/ (metrics, đường cong, model card, data card), không tính lại.

Chạy: uvicorn app.main:app --port 8000   (hoặc make app). Giao diện React build sẵn ở app/web (make ui để build lại).
"""
import json
import logging
import math
import re
from datetime import datetime, timezone
from pathlib import Path

import joblib
import pandas as pd
import yaml
from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse, PlainTextResponse
from fastapi.staticfiles import StaticFiles

from app.schemas import DEMO_BOOKINGS, EXAMPLE, BookingRequest, RiskResponse

ROOT = Path(__file__).resolve().parents[1]
WEB = Path(__file__).parent / "web"
MODELS, REPORTS = ROOT / "models", ROOT / "reports"
log = logging.getLogger("app")

MODEL = joblib.load(MODELS / "model.joblib")
CONFIG = json.loads((MODELS / "config.json").read_text(encoding="utf-8"))
MODEL_IDS = {"Baseline: tỷ lệ hủy chung (prior)": "prior", "Baseline: LR chỉ lead_time": "lead_time",
             "LR đầy đủ (mô hình chính)": "main", "LR đầy đủ, class_weight=balanced (so sánh)": "balanced"}
GROUP_LABELS = {"hotel": "Loại khách sạn", "distribution_channel": "Kênh phân phối",
                "market_segment": "Phân khúc thị trường", "customer_type": "Loại khách",
                "lead_time_bin": "Khoảng lead time (ngày)", "guest_type": "Khách mới / lặp lại",
                "arrival_month": "Tháng đến"}
DOWNLOADS = {"metrics.json": MODELS / "metrics.json", "data_dictionary.csv": ROOT / "data" / "data_dictionary.csv",
             "model_card.md": REPORTS / "model_card.md"}

app = FastAPI(
    title="Dự đoán rủi ro hủy đặt phòng",
    version=CONFIG["model_version"],
    description="Logistic regression ước lượng xác suất hủy ngay lúc tạo booking. Chỉ dùng để ưu tiên gọi xác "
                "nhận; không dùng để tự động hủy, tăng giá hay phân biệt đối xử. Không lưu dữ liệu gửi lên.",
)

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


def to_frame(booking: BookingRequest):
    row = pd.DataFrame([booking.model_dump()])
    row["is_repeated_guest"] = row["is_repeated_guest"].astype(int)
    return row[list(MODEL.feature_names_in_)]


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else None


def read_csv(path):
    if not path.exists():
        return None
    return [{k: (None if isinstance(v, float) and math.isnan(v) else v) for k, v in r.items()}
            for r in pd.read_csv(path, keep_default_na=False, na_values=[""]).to_dict("records")]


def by_model_id(d):
    return {MODEL_IDS.get(k, k): v for k, v in d.items()} if d else d


def field_specs():
    """Danh sách trường đầu vào cho form: kiểu, nhãn, đơn vị, miền cứng (422), miền train (cảnh báo), hạng mục."""
    schema, domain = BookingRequest.model_json_schema(), CONFIG["train_domain"]
    out = []
    for name, p in schema["properties"].items():
        spec = {"name": name, "label": p.get("title", name), "description": p.get("description"),
                "group": p.get("group"), "unit": p.get("unit"), "required": name in schema.get("required", [])}
        if "enum" in p:
            counts = domain["categories"].get(name, {})
            spec |= {"type": "category", "options": [{"value": v, "train_count": counts.get(v, 0)} for v in p["enum"]]}
        elif p.get("type") == "boolean":
            spec |= {"type": "boolean"}
        else:
            spec |= {"type": "integer", "min": p.get("minimum"), "max": p.get("maximum"),
                     "train": domain["numeric"].get(name)}
        out.append(spec)
    return out


def section_bullets(markdown, heading):
    """Các gạch đầu dòng của một mục trong model card (để giao diện trích dẫn, không viết lại)."""
    m = re.search(rf"^## {re.escape(heading)}.*?$(.*?)(?=^## |\Z)", markdown, flags=re.M | re.S)
    if not m:
        return []
    items = []
    for line in m.group(1).splitlines():
        if line.startswith("- "):
            items.append(line[2:].strip())
        elif line.startswith("  ") and items and line.strip():
            items[-1] += " " + line.strip()
    return items


@app.get("/api/health")
def health():
    return {"status": "ok", "model_version": CONFIG["model_version"]}


@app.post("/api/cancellation-risk", response_model=RiskResponse,
          responses={400: {"description": "Thiếu trường hoặc body không phải JSON"},
                     422: {"description": "Sai kiểu, hạng mục không hợp lệ hoặc ngoài miền cho phép"}})
def cancellation_risk(booking: BookingRequest):
    p = float(MODEL.predict_proba(to_frame(booking))[0, 1])
    group = next(g for g in CONFIG["risk_groups"] if p >= g["min_probability"])
    used = group["min_probability"] if group["min_probability"] > 0 else CONFIG["thresholds"]["high_recall"]
    return RiskResponse(probability=round(p, 4), risk_group=group["name"], action=group["action"],
                        threshold_used=round(used, 4),
                        thresholds={k: round(v, 4) for k, v in CONFIG["thresholds"].items()},
                        model_version=CONFIG["model_version"], warnings=input_warnings(booking))


@app.post("/api/explain", responses={400: {"description": "Như /api/cancellation-risk"}, 422: {"description": "Như trên"}})
def explain(booking: BookingRequest):
    """Giải thích cho giao diện: log-odds = intercept + tổng đóng góp từng biến (tách chính xác của hồi quy logistic),
    và đường xác suất khi chỉ thay đổi lead_time. Đóng góp được đo so với booking tham chiếu: biến số ở mức trung
    bình của train, biến phân loại ở hạng mục tham chiếu (hạng mục bị drop trong one-hot)."""
    row = to_frame(booking)
    pre, lr = MODEL.named_steps["pre"], MODEL.named_steps["model"]
    contrib = {}
    for name, x, b in zip(pre.get_feature_names_out(), pre.transform(row)[0], lr.coef_[0]):
        col = name.split("__", 1)[1]
        feat = next(f for f in MODEL.feature_names_in_ if col == f or col.startswith(f + "_"))
        contrib[feat] = contrib.get(feat, 0.0) + float(b * x)
    values = booking.model_dump()
    grid = [0, 7, 14, 30, 60, 90, 120, 150, 180, 240, 300, 365, 450, 540, 630, 737]
    curve = MODEL.predict_proba(pd.concat([row.assign(lead_time=v) for v in grid]))[:, 1]
    return {
        "intercept": float(lr.intercept_[0]),
        "probability": float(MODEL.predict_proba(row)[0, 1]),
        "contributions": sorted(({"feature": f, "label": BookingRequest.model_fields[f].title, "value": values[f],
                                  "contribution": round(c, 4)} for f, c in contrib.items()),
                                key=lambda d: -abs(d["contribution"])),
        "lead_time_curve": [{"lead_time": v, "probability": round(float(q), 4)} for v, q in zip(grid, curve)],
        "train_lead_time_max": CONFIG["train_domain"]["numeric"]["lead_time"]["max"],
    }


@app.get("/api/model-info")
def model_info():
    """Phiên bản, phạm vi, ngưỡng, trường đầu vào (lấy từ schema + miền train), booking mẫu, biến bị loại."""
    dictionary = read_csv(ROOT / "data" / "data_dictionary.csv") or []
    excluded = [{"variable": r["variable"], "role": r["role"], "available_at": r["available_at"], "reason": r["decision"]}
                for r in dictionary if r["role"].startswith("excluded") or r["role"] == "sensitivity_only"]
    return {"model_version": CONFIG["model_version"], "trained_at": CONFIG["trained_at"], "params": CONFIG["params"],
            "split": CONFIG["split"], "hotels": list(CONFIG["train_domain"]["categories"]["hotel"]),
            "thresholds": CONFIG["thresholds"], "risk_groups": CONFIG["risk_groups"], "fields": field_specs(),
            "demo_bookings": DEMO_BOOKINGS, "excluded": excluded, "example": EXAMPLE,
            "input_schema": BookingRequest.model_json_schema()}


@app.get("/api/metrics")
def metrics():
    """Số liệu đã lưu: models/metrics.json, reports/curves.json, odds ratio, sai số theo nhóm, thí nghiệm."""
    m = read_json(MODELS / "metrics.json") or {}
    for part in ("validation", "test"):
        if part in m:
            m[part]["models"] = by_model_id(m[part]["models"])
    curves = read_json(REPORTS / "curves.json")
    if curves:
        curves["roc"], curves["pr"] = by_model_id(curves["roc"]), by_model_id(curves["pr"])
        curves["calibration"] = {k: by_model_id(v) for k, v in curves["calibration"].items()}
    fields = BookingRequest.model_fields
    odds = [{"feature": r["Đặc trưng"], "label": fields[r["Đặc trưng"]].title if r["Đặc trưng"] in fields else r["Đặc trưng"],
             "group": (fields[r["Đặc trưng"]].json_schema_extra or {}).get("group") if r["Đặc trưng"] in fields else None,
             "term": r["Số hạng"], "level": r["Số hạng"].split(" = ", 1)[1] if " = " in r["Số hạng"] else None,
             "comparison": r["So sánh"], "coef": r["Hệ số (log-odds)"], "odds_ratio": r["Odds ratio"]}
            for r in read_csv(REPORTS / "odds_ratios.csv") or []]
    error_groups = [{"variable": r["Biến"], "variable_label": GROUP_LABELS.get(r["Biến"], r["Biến"]),
                     "group": str(r["Nhóm"]), "n": r["n"], "observed_rate": r["Tỷ lệ hủy thực tế"],
                     "mean_predicted": r["Xác suất dự đoán TB"], "roc_auc": r["ROC-AUC"], "log_loss": r["Log loss"],
                     "precision": r["Precision@F1"], "recall": r["Recall@F1"], "flagged_share": r["Tỷ lệ gắn cờ"]}
                    for r in read_csv(REPORTS / "error_by_group.csv") or []]
    card = (REPORTS / "model_card.md").read_text(encoding="utf-8") if (REPORTS / "model_card.md").exists() else ""
    return {"model_version": CONFIG["model_version"], "validation": m.get("validation"), "test": m.get("test"),
            "curves": curves, "odds": odds, "error_groups": error_groups,
            "experiments": read_csv(REPORTS / "experiments.csv"),
            "calibration_notes": section_bullets(card, "6. Calibration")}


@app.get("/api/model-card", response_class=PlainTextResponse)
def model_card():
    return PlainTextResponse((REPORTS / "model_card.md").read_text(encoding="utf-8"), media_type="text/markdown")


@app.get("/api/data-card")
def data_card():
    cfg = yaml.safe_load((ROOT / "config.yaml").read_text(encoding="utf-8"))["data"]
    zip_path = ROOT / cfg["raw_dir"] / cfg["zip_name"]
    return {
        "name": "Hotel Booking Demand Datasets",
        "authors": "Nuno Antonio, Ana de Almeida, Luis Nunes",
        "citation": "Antonio, N., de Almeida, A., & Nunes, L. (2019). Hotel booking demand datasets. "
                    "Data in Brief, 22, 41–49.",
        "doi": "https://doi.org/10.1016/j.dib.2018.11.126",
        "page": "https://pmc.ncbi.nlm.nih.gov/articles/PMC6297060/",
        "license": "CC BY 4.0",
        "url": cfg["url"], "zip_sha256": cfg["zip_sha256"], "expected_rows": cfg["expected_rows"],
        "files": [{"name": k, **v} for k, v in cfg["files"].items()],
        "downloaded_at": (datetime.fromtimestamp(zip_path.stat().st_mtime, timezone.utc).date().isoformat()
                          if zip_path.exists() else None),
        "dictionary": read_csv(ROOT / "data" / "data_dictionary.csv"),
        "quality": read_json(REPORTS / "data_quality.json"),
    }


@app.get("/api/files/{name}")
def download(name: str):
    path = DOWNLOADS.get(name)
    if path is None or not path.exists():
        raise HTTPException(status_code=404, detail="Không có tệp này")
    return FileResponse(path, filename=name)


# ---- Giao diện React (build vào app/web). Đường dẫn phía client trả về index.html.
if (WEB / "assets").exists():
    app.mount("/assets", StaticFiles(directory=WEB / "assets"), name="assets")


@app.get("/{full_path:path}", include_in_schema=False)
def spa(full_path: str):
    if full_path.startswith("api/"):
        raise HTTPException(status_code=404, detail="Không có endpoint này")
    target = (WEB / full_path).resolve()
    if full_path and target.is_file() and WEB.resolve() in target.parents:
        return FileResponse(target)
    if (WEB / "index.html").exists():
        return FileResponse(WEB / "index.html")
    return PlainTextResponse("Chưa build giao diện. Chạy: make ui (cần Node.js) rồi tải lại trang.", status_code=503)
