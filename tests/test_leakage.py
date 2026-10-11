"""Khẳng định không có biến sau-đặt nào lọt vào đặc trưng của pipeline."""
import json

import joblib
import pandas as pd
import pytest
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline

from conftest import ROOT
from src.features import FEATURES, FORBIDDEN, FORBIDDEN_BY_SPEC, build_preprocessor

SPEC = {"reservation_status", "reservation_status_date", "assigned_room_type", "booking_changes",
        "days_in_waiting_list"}


def test_spec_columns_are_forbidden():
    assert SPEC <= set(FORBIDDEN_BY_SPEC) <= set(FORBIDDEN)


def test_feature_list_has_no_forbidden_column():
    assert not set(FEATURES) & set(FORBIDDEN)


def test_data_dictionary_agrees_with_feature_list():
    dd = pd.read_csv(ROOT / "data" / "data_dictionary.csv")
    assert set(dd.loc[dd["role"] == "feature", "variable"]) == set(FEATURES)
    assert not dd.loc[dd["variable"].isin(FEATURES), "available_at"].str.startswith("sau đặt").any()
    assert set(dd.loc[dd["role"].str.startswith("excluded"), "variable"]) <= set(FORBIDDEN)


def test_pipeline_ignores_forbidden_columns_even_if_present(bookings):
    pipe = Pipeline([("pre", build_preprocessor()), ("model", LogisticRegression())])
    pipe.fit(bookings[FEATURES], bookings["is_canceled"])
    names = pipe.named_steps["pre"].get_feature_names_out()
    assert not [n for n in names if any(col in n for col in FORBIDDEN)]
    # có thêm cột bị cấm trong đầu vào cũng không làm thay đổi dự đoán: pipeline chỉ chọn FEATURES theo tên
    with_leak = bookings[FEATURES].assign(booking_changes=99, reservation_status="Canceled")
    assert (pipe.predict_proba(with_leak) == pipe.predict_proba(bookings[FEATURES])).all()


def test_train_script_never_reads_test_split():
    src = (ROOT / "src" / "train.py").read_text(encoding="utf-8")
    assert '["test"]' not in src and "'test'" not in src


@pytest.mark.skipif(not (ROOT / "models" / "model.joblib").exists(), reason="chưa train mô hình")
def test_saved_model_uses_only_allowed_features():
    model = joblib.load(ROOT / "models" / "model.joblib")
    assert list(model.feature_names_in_) == FEATURES
    config = json.loads((ROOT / "models" / "config.json").read_text(encoding="utf-8"))
    assert set(config["forbidden_columns"]) == set(FORBIDDEN)
