import numpy as np
import pandas as pd
import pytest

from conftest import ROOT
from src.data import clean, load_config, split, to_snake
from src.features import CATEGORICAL, FEATURES, NUMERIC, build_preprocessor
from src.train import choose_thresholds, threshold_summary

CFG = {"split": {"val_start": "2017-01-01", "test_start": "2017-05-01"}}


def test_snake_case_names():
    assert [to_snake(c) for c in ["ADR", "LeadTime", "ArrivalDateDayOfMonth", "IsCanceled"]] == \
        ["adr", "lead_time", "arrival_date_day_of_month", "is_canceled"]


def test_split_is_by_arrival_date_and_disjoint():
    df = pd.DataFrame({"arrival_date": pd.to_datetime(["2016-12-31", "2017-01-01", "2017-04-30", "2017-05-01"])})
    s = split(df, CFG)
    assert [len(s[k]) for k in ("train", "val", "test")] == [1, 2, 1]
    assert s["train"]["arrival_date"].max() < s["val"]["arrival_date"].min()
    assert s["val"]["arrival_date"].max() < s["test"]["arrival_date"].min()


def test_clean_drops_missing_children_and_zero_guests():
    df = pd.DataFrame({"adults": [2, 0, 1], "children": [np.nan, 0.0, 0.0], "babies": [0, 0, 0],
                       "arrival_date_year": 2016, "arrival_date_month": "May", "arrival_date_day_of_month": 3})
    out, removed = clean(df)
    assert len(out) == 1 and [n for _, n in removed] == [1, 1]
    assert out["children"].dtype.kind == "i" and str(out["arrival_date"][0].date()) == "2016-05-03"


def test_preprocessor_learns_only_from_fitted_rows(bookings):
    train, other = bookings.iloc[:200], bookings.iloc[200:].assign(lead_time=5000)
    pre = build_preprocessor().fit(train[FEATURES])
    scaler = pre.named_transformers_["num"][-1]
    assert np.allclose(scaler.mean_, np.log1p(train[NUMERIC]).mean())
    assert pre.transform(other[FEATURES]).shape[0] == len(other)  # giá trị ngoài miền không làm lỗi


def test_unknown_category_goes_to_infrequent_bucket(bookings):
    pre = build_preprocessor().fit(bookings[FEATURES])
    row = bookings[FEATURES].iloc[[0]].assign(reserved_room_type="Z")
    with pytest.warns(UserWarning):
        assert np.isfinite(pre.transform(row)).all()


def test_thresholds_are_ordered_and_consistent():
    rng = np.random.default_rng(1)
    y = (rng.random(2000) < 0.36).astype(int)  # tỷ lệ hủy gần với dữ liệu thật
    p = np.clip(0.15 * y + rng.normal(0.3, 0.12, 2000), 0, 1)
    t = choose_thresholds(y, p, recall_target=0.9, capacity_share=0.15)
    assert t["high_recall"] < t["balanced_f1"] < t["capacity"]
    assert threshold_summary(y, p, t["high_recall"])["recall"] >= 0.9
    assert abs(threshold_summary(y, p, t["capacity"])["flagged_share"] - 0.15) < 0.01


@pytest.mark.skipif(not (ROOT / "data" / "raw" / "H2.csv").exists(), reason="chưa tải dữ liệu (make data)")
def test_real_splits_match_report():
    from src.data import load_splits
    s = load_splits(load_config())
    assert [len(s[k]) for k in ("train", "val", "test")] == [78586, 18443, 22177]
    assert not set(CATEGORICAL) - set(s["train"].columns)
