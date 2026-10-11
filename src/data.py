"""Tải, kiểm tra, làm sạch và chia dữ liệu Hotel Booking Demand.

Chạy: python -m src.data   (tải dữ liệu nếu chưa có, kiểm tra checksum/schema, ghi reports/data_quality.md)
"""
import hashlib
import re
import urllib.request
import zipfile
from pathlib import Path

import pandas as pd
import yaml

ROOT = Path(__file__).resolve().parents[1]

# Schema sau khi đổi tên cột sang snake_case (31 cột gốc + `hotel`)
SCHEMA = {
    "is_canceled": "int", "lead_time": "int", "arrival_date_year": "int", "arrival_date_month": "str",
    "arrival_date_week_number": "int", "arrival_date_day_of_month": "int", "stays_in_weekend_nights": "int",
    "stays_in_week_nights": "int", "adults": "int", "children": "float", "babies": "int", "meal": "str",
    "country": "str", "market_segment": "str", "distribution_channel": "str", "is_repeated_guest": "int",
    "previous_cancellations": "int", "previous_bookings_not_canceled": "int", "reserved_room_type": "str",
    "assigned_room_type": "str", "booking_changes": "int", "deposit_type": "str", "agent": "str",
    "company": "str", "days_in_waiting_list": "int", "customer_type": "str", "adr": "float",
    "required_car_parking_spaces": "int", "total_of_special_requests": "int", "reservation_status": "str",
    "reservation_status_date": "str", "hotel": "str",
}
MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August",
          "September", "October", "November", "December"]
TYPE_CHECK = {"int": pd.api.types.is_integer_dtype, "float": pd.api.types.is_float_dtype,
              "str": pd.api.types.is_string_dtype}


def load_config(path=ROOT / "config.yaml"):
    return yaml.safe_load(Path(path).read_text(encoding="utf-8"))


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def download(cfg):
    """Tải mmc2.zip, kiểm tra SHA-256 của zip và từng CSV. Bỏ qua bước tải nếu tệp đã có và đúng checksum."""
    d = cfg["data"]
    raw_dir = ROOT / d["raw_dir"]
    raw_dir.mkdir(parents=True, exist_ok=True)
    if all((raw_dir / f).exists() and sha256(raw_dir / f) == meta["sha256"] for f, meta in d["files"].items()):
        return raw_dir
    zip_path = raw_dir / d["zip_name"]
    if not zip_path.exists():
        print(f"Đang tải {d['url']} ...")
        req = urllib.request.Request(d["url"], headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=120) as r:
            zip_path.write_bytes(r.read())
    if sha256(zip_path) != d["zip_sha256"]:
        raise ValueError(f"SHA-256 của {zip_path} không khớp; xóa tệp và tải lại (xem data/README.md).")
    with zipfile.ZipFile(zip_path) as z:
        for name, meta in d["files"].items():
            (raw_dir / name).write_bytes(z.read(name))  # chỉ giải nén đúng 2 tệp đã biết tên
            if sha256(raw_dir / name) != meta["sha256"]:
                raise ValueError(f"SHA-256 của {name} không khớp với config.yaml.")
    return raw_dir


def to_snake(name):
    return re.sub(r"(?<=[a-z])(?=[A-Z])", "_", name).lower()


def load_raw(cfg):
    """Đọc H1 + H2, thêm cột `hotel`, đổi tên cột sang snake_case, bỏ khoảng trắng đệm, 'NULL' -> NA."""
    raw_dir = ROOT / cfg["data"]["raw_dir"]
    frames = []
    for name, meta in cfg["data"]["files"].items():
        path = raw_dir / name
        if not path.exists():
            raise FileNotFoundError(f"Chưa có {path}. Chạy `make data` (python -m src.data) trước.")
        part = pd.read_csv(path, keep_default_na=False, na_values=["NA", ""])
        if len(part) != meta["rows"]:
            raise ValueError(f"{name}: {len(part)} dòng, kỳ vọng {meta['rows']}.")
        frames.append(part.assign(hotel=meta["hotel"]))
    df = pd.concat(frames, ignore_index=True).rename(columns=to_snake)
    for col in df.columns[df.dtypes.map(pd.api.types.is_string_dtype)]:
        df[col] = df[col].str.strip().replace({"NULL": pd.NA, "": pd.NA})
    return df


def validate_schema(df, cfg):
    if len(df) != cfg["data"]["expected_rows"]:
        raise ValueError(f"Số dòng {len(df)} khác {cfg['data']['expected_rows']}.")
    if list(df.columns) != list(SCHEMA):
        raise ValueError(f"Tên/thứ tự cột khác schema: {sorted(set(df.columns) ^ set(SCHEMA))}")
    bad = [c for c, t in SCHEMA.items() if not TYPE_CHECK[t](df[c])]
    if bad:
        raise ValueError(f"Sai kiểu dữ liệu ở các cột: {bad}")
    if not set(df["arrival_date_month"]) <= set(MONTHS) or not set(df["is_canceled"]) <= {0, 1}:
        raise ValueError("Giá trị tháng hoặc nhãn is_canceled không hợp lệ.")


def clean(df):
    """Loại các dòng không dùng được, trả về (df_sạch, danh_sách (lý_do, số_dòng))."""
    removed = []
    rules = [
        ("`children` bị thiếu (không tính được số khách; không tự điền giá trị)", df["children"].isna()),
        ("Tổng số khách = 0 (adults + children + babies = 0): booking không hợp lệ",
         df["adults"] + df["children"].fillna(0) + df["babies"] == 0),
    ]
    keep = pd.Series(True, index=df.index)
    for reason, mask in rules:
        removed.append((reason, int((mask & keep).sum())))
        keep &= ~mask
    out = df.loc[keep].copy()
    out["children"] = out["children"].astype(int)
    out["arrival_date"] = pd.to_datetime(dict(year=out["arrival_date_year"],
                                              month=out["arrival_date_month"].map({m: i + 1 for i, m in enumerate(MONTHS)}),
                                              day=out["arrival_date_day_of_month"]))
    return out.reset_index(drop=True), removed


def split(df, cfg):
    """Chia theo ngày đến: train < val_start <= validation < test_start <= test."""
    val_start, test_start = pd.Timestamp(cfg["split"]["val_start"]), pd.Timestamp(cfg["split"]["test_start"])
    date = df["arrival_date"]
    return {"train": df[date < val_start].reset_index(drop=True),
            "val": df[(date >= val_start) & (date < test_start)].reset_index(drop=True),
            "test": df[date >= test_start].reset_index(drop=True)}


def load_splits(cfg=None):
    cfg = cfg or load_config()
    raw = load_raw(cfg)
    validate_schema(raw, cfg)
    return split(clean(raw)[0], cfg)


def md_table(df, floatfmt="{:,.3f}"):
    """DataFrame -> bảng Markdown (không cần thư viện tabulate)."""
    def fmt(v):
        if isinstance(v, float):
            return floatfmt.format(v)
        return f"{v:,}" if isinstance(v, int) else str(v)
    df = df.reset_index() if df.index.name or not isinstance(df.index, pd.RangeIndex) else df
    rows = [" | ".join(map(str, df.columns)), " | ".join("---" for _ in df.columns)]
    rows += [" | ".join(fmt(v.item() if hasattr(v, "item") else v) for v in r) for r in df.itertuples(index=False)]
    return "\n".join(f"| {r} |" for r in rows)


def write_quality_report(raw, clean_df, removed, splits, path):
    pct = lambda n, d=len(raw): f"{n:,} ({n / d:.2%})"
    missing = raw.isna().sum()
    missing = pd.DataFrame({"Số ô thiếu": missing[missing > 0].map(int),
                            "Tỷ lệ": missing[missing > 0].map(lambda n: f"{n / len(raw):.2%}")})
    missing.index.name = "Cột"
    total_guests = raw["adults"] + raw["children"].fillna(0) + raw["babies"]
    outliers = pd.DataFrame({"Số dòng": {
        "adr < 0": int((raw["adr"] < 0).sum()),
        "adr = 0": int((raw["adr"] == 0).sum()),
        f"adr > 1000 (max = {raw['adr'].max():,.0f})": int((raw["adr"] > 1000).sum()),
        "Tổng số khách = 0": int((total_guests == 0).sum()),
        "adults > 4": int((raw["adults"] > 4).sum()),
        "children >= 10 hoặc babies >= 9": int(((raw["children"] >= 10) | (raw["babies"] >= 9)).sum()),
        "Tổng số đêm = 0": int((raw["stays_in_weekend_nights"] + raw["stays_in_week_nights"] == 0).sum()),
        f"lead_time > 365 (max = {raw['lead_time'].max()})": int((raw["lead_time"] > 365).sum()),
        "meal = 'Undefined' (theo bài báo tương đương 'SC')": int((raw["meal"] == "Undefined").sum()),
        "market_segment = 'Undefined'": int((raw["market_segment"] == "Undefined").sum()),
        "distribution_channel = 'Undefined'": int((raw["distribution_channel"] == "Undefined").sum()),
    }})
    outliers.index.name = "Kiểm tra"
    target = pd.DataFrame({name: {"Số booking": len(s), "Số hủy": int(s["is_canceled"].sum()),
                                  "Tỷ lệ hủy": f"{s['is_canceled'].mean():.2%}",
                                  "Ngày đến": f"{s['arrival_date'].min():%Y-%m-%d} → {s['arrival_date'].max():%Y-%m-%d}"}
                           for name, s in [("Toàn bộ (sau làm sạch)", clean_df), *splits.items()]}).T
    target.index.name = "Tập"
    by_hotel = clean_df.groupby("hotel")["is_canceled"].agg(n="size", cancel_rate="mean")
    removed_df = pd.DataFrame(removed, columns=["Lý do loại", "Số dòng"])
    dup_full = int(raw.duplicated().sum())
    from src.features import FEATURES
    dup_feat = int(clean_df.duplicated(subset=FEATURES + ["arrival_date", "is_canceled"]).sum())

    text = f"""# Báo cáo chất lượng dữ liệu

> Tệp này được sinh tự động bởi `python -m src.data`. Nguồn: H1.csv + H2.csv (xem `data/README.md`).

## 1. Quy mô

- Số dòng thô: **{len(raw):,}** (kỳ vọng 119.390, khớp), {raw.shape[1]} cột (31 cột gốc + `hotel`).
- Không có khóa booking (ID) trong dữ liệu gốc; mỗi dòng là một booking.
- Sau làm sạch: **{len(clean_df):,}** dòng (loại {len(raw) - len(clean_df):,} dòng).

## 2. Giá trị thiếu (dữ liệu thô)

{md_table(missing)}

Ghi chú:
- `agent` và `company` ghi `NULL` khi booking **không** qua đại lý / công ty (theo mô tả của bài báo), nên đây
  không hẳn là "thiếu". Cả hai cột đều bị loại khỏi tập đặc trưng (xem `docs/decisions.md`).
- `country` thiếu {int(raw['country'].isna().sum()):,} dòng và cũng bị loại khỏi đặc trưng (nghi rò rỉ + rủi ro công bằng).
- `children` thiếu {int(raw['children'].isna().sum())} dòng → loại dòng (không tự điền), xem mục 5.

## 3. Trùng lặp

- Dòng trùng hoàn toàn ở mọi cột: **{pct(dup_full)}**.
- Sau làm sạch, dòng trùng trên (đặc trưng + ngày đến + nhãn): {pct(dup_feat, len(clean_df))}.
- Không có mã booking nên không phân biệt được bản ghi nhân đôi do lỗi với nhiều phòng của cùng một đoàn
  (cùng ngày đến, cùng kênh, cùng loại phòng). **Quyết định: giữ lại.** Vì chia theo ngày đến, các bản trùng
  cùng ngày đến luôn rơi vào cùng một tập → không gây rò rỉ giữa train/validation/test.

## 4. Ngoại lệ và giá trị bất thường (dữ liệu thô)

{md_table(outliers)}

- `adr` (giá trung bình/đêm) không nằm trong đặc trưng của mô hình chính nên các giá trị âm/cực lớn được giữ
  nguyên và chỉ ghi nhận ở đây.
- Các nhóm `Undefined` được giữ nguyên là một hạng mục riêng (không gộp ngầm).

## 5. Các dòng bị loại

{md_table(removed_df)}

## 6. Phân bố biến mục tiêu `is_canceled`

{md_table(target)}

Theo khách sạn (sau làm sạch):

{md_table(by_hotel.rename(columns={'n': 'Số booking', 'cancel_rate': 'Tỷ lệ hủy'}))}

Lớp "hủy" chiếm khoảng 37%: mất cân bằng nhẹ. Vì vậy ngoài ROC-AUC, báo cáo dùng PR-AUC, log loss và
precision/recall tại ngưỡng; `class_weight` được thử cả `None` và `balanced`.
"""
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Path(path).write_text(text, encoding="utf-8")


def main():
    cfg = load_config()
    download(cfg)
    raw = load_raw(cfg)
    validate_schema(raw, cfg)
    clean_df, removed = clean(raw)
    splits = split(clean_df, cfg)
    write_quality_report(raw, clean_df, removed, splits, ROOT / cfg["paths"]["reports"] / "data_quality.md")
    print(f"OK: {len(raw):,} dòng thô, checksum + schema khớp. Sau làm sạch {len(clean_df):,} dòng.")
    for name, s in splits.items():
        print(f"  {name:5s}: {len(s):6,} dòng, tỷ lệ hủy {s['is_canceled'].mean():.3f}")


if __name__ == "__main__":
    main()
