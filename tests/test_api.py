import json
import typing

import pytest
from fastapi.testclient import TestClient

from conftest import ROOT

pytestmark = pytest.mark.skipif(not (ROOT / "models" / "model.joblib").exists(), reason="chưa train mô hình")

URL = "/api/cancellation-risk"


@pytest.fixture(scope="module")
def client():
    from app.main import app
    return TestClient(app, raise_server_exceptions=False)


@pytest.fixture
def booking():
    from app.schemas import EXAMPLE
    return dict(EXAMPLE)


def test_valid_request(client, booking):
    r = client.post(URL, json=booking)
    assert r.status_code == 200
    body = r.json()
    assert set(body) == {"probability", "risk_group", "action", "threshold_used", "thresholds", "model_version",
                         "warnings"}
    assert 0 <= body["probability"] <= 1 and body["risk_group"] in ("Rất cao", "Cao", "Trung bình", "Thấp")
    config = json.loads((ROOT / "models" / "config.json").read_text(encoding="utf-8"))
    assert body["model_version"] == config["model_version"] and body["warnings"] == []


def test_risk_group_matches_thresholds(client, booking):
    low = client.post(URL, json=booking | {"lead_time": 0, "is_repeated_guest": True,
                                           "previous_bookings_not_canceled": 3}).json()
    high = client.post(URL, json=booking | {"lead_time": 300, "previous_cancellations": 1,
                                            "market_segment": "Groups"}).json()
    assert low["risk_group"] == "Thấp" and low["probability"] < low["thresholds"]["high_recall"]
    assert high["risk_group"] == "Rất cao" and high["probability"] >= high["thresholds"]["capacity"]
    assert high["threshold_used"] == high["thresholds"]["capacity"]


@pytest.mark.parametrize("field", ["lead_time", "hotel", "is_repeated_guest"])
def test_missing_field_returns_400(client, booking, field):
    booking.pop(field)
    r = client.post(URL, json=booking)
    assert r.status_code == 400
    assert r.json()["detail"][0] == {"field": field, "message": "Thiếu trường bắt buộc", "type": "missing"}


@pytest.mark.parametrize("field,value", [("lead_time", "abc"), ("lead_time", "12"), ("lead_time", 1.5),
                                         ("adults", None), ("is_repeated_guest", "yes")])
def test_wrong_type_returns_422(client, booking, field, value):
    r = client.post(URL, json=booking | {field: value})
    assert r.status_code == 422 and r.json()["detail"][0]["field"] == field


@pytest.mark.parametrize("field,value", [("lead_time", -1), ("lead_time", 5000), ("children", 11),
                                         ("market_segment", "Undefined"), ("hotel", "Hotel X")])
def test_out_of_domain_returns_422(client, booking, field, value):
    r = client.post(URL, json=booking | {field: value})
    assert r.status_code == 422 and r.json()["detail"][0]["field"] == field


def test_zero_guests_and_extra_field_rejected(client, booking):
    assert client.post(URL, json=booking | {"adults": 0}).status_code == 422
    r = client.post(URL, json=booking | {"country": "PRT"})  # biến bị loại không được nhận âm thầm
    assert r.status_code == 422 and r.json()["detail"][0]["type"] == "extra_forbidden"


def test_invalid_json_returns_400(client):
    r = client.post(URL, content="{not json", headers={"Content-Type": "application/json"})
    assert r.status_code == 400


def test_warnings_for_rare_or_out_of_train_inputs(client, booking):
    body = client.post(URL, json=booking | {"lead_time": 900, "reserved_room_type": "L"}).json()
    assert any("lead_time" in w and "ngoài miền" in w for w in body["warnings"])
    assert any("reserved_room_type" in w for w in body["warnings"])


def test_internal_error_is_safe(client, booking, monkeypatch):
    import app.main as m
    monkeypatch.setattr(m.MODEL, "predict_proba", lambda X: 1 / 0)
    r = client.post(URL, json=booking)
    assert r.status_code == 500 and "ZeroDivision" not in r.text


def test_schema_categories_match_training_data():
    from app.schemas import BookingRequest
    config = json.loads((ROOT / "models" / "config.json").read_text(encoding="utf-8"))
    for col, counts in config["train_domain"]["categories"].items():
        allowed = set(typing.get_args(BookingRequest.model_fields[col].annotation))
        assert allowed <= set(counts), f"{col}: API nhận hạng mục không có trong train"
        assert {c for c, n in counts.items() if n >= 50} <= allowed, f"{col}: thiếu hạng mục phổ biến"


@pytest.mark.parametrize("path", ["/api/health", "/api/model-info", "/api/metrics", "/api/model-card", "/api/data-card", "/docs"])
def test_read_only_endpoints(client, path):
    assert client.get(path).status_code == 200


def test_model_info_fields_come_from_schema_and_train(client):
    from app.schemas import BookingRequest
    info = client.get("/api/model-info").json()
    fields = {f["name"]: f for f in info["fields"]}
    assert set(fields) == set(BookingRequest.model_fields)
    assert fields["lead_time"]["train"]["max"] == 737 and fields["lead_time"]["max"] == 1000
    assert all(f["group"] and f["label"] for f in fields.values())
    assert {o["value"] for o in fields["market_segment"]["options"]} >= {"Online TA", "Groups"}
    assert {e["variable"] for e in info["excluded"]} >= {"reservation_status", "booking_changes", "country"}


def test_demo_bookings_are_valid_and_ordered_by_risk(client):
    demos = {d["id"]: d["booking"] for d in client.get("/api/model-info").json()["demo_bookings"]}
    groups = {k: client.post(URL, json=b).json() for k, b in demos.items()}
    assert groups["low"]["risk_group"] == "Thấp" and groups["high"]["risk_group"] == "Rất cao"
    assert groups["low"]["probability"] < groups["medium"]["probability"] < groups["high"]["probability"]
    assert any("ngoài miền" in w for w in groups["ood"]["warnings"])


def test_metrics_are_read_from_saved_files(client):
    m = client.get("/api/metrics").json()
    assert set(m["test"]["models"]) >= {"main", "prior", "lead_time"}
    assert len(m["validation"]["threshold_curve"]) == 99
    assert set(m["curves"]["roc"]) >= {"main", "lead_time"} and m["curves"]["calibration"]["test"]["main"]
    assert m["odds"][0]["feature"] == "previous_cancellations" and m["error_groups"] and m["calibration_notes"]


def test_data_card(client):
    d = client.get("/api/data-card").json()
    assert d["license"] == "CC BY 4.0" and len(d["dictionary"]) == 33 and d["expected_rows"] == 119390


def test_downloads_are_whitelisted(client):
    assert client.get("/api/files/metrics.json").status_code == 200
    assert client.get("/api/files/config.yaml").status_code == 404
    assert client.get("/api/khong-co").status_code == 404


@pytest.mark.skipif(not (ROOT / "app" / "web" / "index.html").exists(), reason="chưa build giao diện (make ui)")
@pytest.mark.parametrize("path", ["/", "/predict", "/evaluation/overview", "/model-card", "/data"])
def test_spa_routes_serve_index(client, path):
    r = client.get(path)
    assert r.status_code == 200 and '<div id="root">' in r.text
    assert r.headers["cache-control"] == "no-cache"


@pytest.mark.skipif(not (ROOT / "app" / "web" / "index.html").exists(), reason="chưa build giao diện (make ui)")
def test_spa_does_not_leak_files_outside_build(client):
    r = client.get("/..%2F..%2Fconfig.yaml")
    assert "zip_sha256" not in r.text


def test_explain_decomposes_log_odds_exactly(client, booking):
    import math
    risk = client.post(URL, json=booking).json()
    ex = client.post("/api/explain", json=booking).json()
    logit = ex["intercept"] + sum(c["contribution"] for c in ex["contributions"])
    assert abs(1 / (1 + math.exp(-logit)) - risk["probability"]) < 1e-3
    assert {c["feature"] for c in ex["contributions"]} == set(booking)
    lt = [p["probability"] for p in ex["lead_time_curve"]]
    assert lt == sorted(lt)  # hệ số lead_time dương: xác suất tăng theo lead time
    assert client.post("/api/explain", json=booking | {"lead_time": "x"}).status_code == 422
