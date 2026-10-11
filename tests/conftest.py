import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


@pytest.fixture
def bookings():
    """Booking giả lập nhỏ, đủ mọi cột đặc trưng + vài cột bị cấm, để test không cần tải dữ liệu thật."""
    rng = np.random.default_rng(0)
    n = 300
    return pd.DataFrame({
        "hotel": rng.choice(["City Hotel", "Resort Hotel"], n),
        "arrival_date_month": rng.choice(["January", "May", "August"], n),
        "meal": rng.choice(["BB", "HB", "SC"], n),
        "market_segment": rng.choice(["Online TA", "Groups", "Direct"], n),
        "distribution_channel": rng.choice(["TA/TO", "Direct"], n),
        "reserved_room_type": rng.choice(["A", "D"], n),
        "customer_type": rng.choice(["Transient", "Contract"], n),
        "lead_time": rng.integers(0, 400, n),
        "stays_in_weekend_nights": rng.integers(0, 3, n),
        "stays_in_week_nights": rng.integers(0, 6, n),
        "adults": rng.integers(1, 4, n),
        "children": rng.integers(0, 2, n),
        "babies": np.zeros(n, dtype=int),
        "previous_cancellations": rng.integers(0, 2, n),
        "previous_bookings_not_canceled": rng.integers(0, 3, n),
        "is_repeated_guest": rng.integers(0, 2, n),
        "is_canceled": rng.integers(0, 2, n),
        # cột bị cấm: phải bị pipeline bỏ qua
        "reservation_status": rng.choice(["Canceled", "Check-Out"], n),
        "booking_changes": rng.integers(0, 3, n),
        "assigned_room_type": rng.choice(["A", "D"], n),
        "arrival_date": pd.Timestamp("2016-01-01") + pd.to_timedelta(rng.integers(0, 600, n), unit="D"),
    })
