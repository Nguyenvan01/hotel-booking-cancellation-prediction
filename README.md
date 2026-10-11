# Project 13: Dự đoán khả năng hủy đặt phòng tại thời điểm đặt

Học phần Học máy cơ bản, Bài 5 (Hồi quy logistic: phân loại bằng xác suất). Lớp 12523W.1, GV PGS.TS. Nguyễn Văn Hậu.

Với thông tin có **ngay lúc booking được tạo**, mô hình **logistic regression** ước lượng xác suất booking bị hủy
và xếp booking vào nhóm ưu tiên gọi xác nhận theo 3 ngưỡng hành động. Mô hình **chỉ dùng để ưu tiên xác nhận**:
không tự động hủy, không tăng giá, không phân biệt đối xử với khách.

## Kết quả chính (tập test độc lập: booking đến 05–08/2017, dùng một lần)

| Mô hình | ROC-AUC (95% CI) | PR-AUC | Log loss | Brier |
|---|---|---|---|---|
| Baseline: tỷ lệ hủy chung | 0,500 | 0,406 | 0,679 | 0,243 |
| Baseline: LR chỉ `lead_time` | 0,619 (0,603–0,634) | 0,481 | 0,680 | 0,242 |
| **LR đầy đủ (16 đặc trưng lúc đặt)** | **0,727 (0,709–0,748)** | **0,674** | **0,583** | **0,200** |

Trên validation (01–04/2017) mô hình chính đạt ROC-AUC 0,783. Mức giảm trên test do trôi theo thời gian được
phân tích trong `reports/results.md` và `reports/model_card.md`. Chi tiết thí nghiệm: `reports/experiments.csv`.

## Chạy từ máy mới

Yêu cầu: Python 3.14 (đã kiểm thử 3.14.7), kết nối mạng để tải dữ liệu (~1,4 MB).

```bash
git clone <link-repo> && cd <thư-mục-repo>
python3.14 -m venv .venv
source .venv/bin/activate            # Windows: .venv\Scripts\activate
pip install -r requirements.txt
make all                             # data → train → evaluate → test → app (http://localhost:8000)
```

Từng bước (cũng là các lệnh dùng khi không có `make`):

| Bước | Lệnh | Đầu ra |
|---|---|---|
| Tải + kiểm tra dữ liệu | `python -m src.data` | `data/raw/` (không commit), `reports/data_quality.md` |
| Huấn luyện | `python -m src.train` | `models/model.joblib`, `models/config.json`, `models/metrics.json` (validation), `reports/experiments.csv` |
| Đánh giá test | `python -m src.evaluate` | `models/metrics.json` (test), `reports/results.md`, `reports/*.csv`, `reports/figures/` |
| Kiểm thử | `python -m pytest -q tests` | 51 test: leakage, tiền xử lý, API |
| Web + API | `python -m uvicorn app.main:app --port 8000` | http://localhost:8000 |
| EDA (tùy chọn) | `make eda` | `notebooks/eda.ipynb`, `reports/figures/eda_*.png` |

`models/` đã được commit nên có thể chạy `make app` ngay sau khi cài thư viện, không cần tải dữ liệu.

## Ứng dụng web

Giao diện React + TypeScript (Vite, Tailwind CSS v4, shadcn/ui trên Base UI, TanStack Query/Table, React Hook Form
+ Zod, Recharts, motion). Bản build nằm sẵn trong `app/web/` và được FastAPI phục vụ cùng cổng, nên `make app` chạy
được ngay mà **không cần Node.js**.

| Màn hình | Đường dẫn | Nội dung |
|---|---|---|
| Giới thiệu & phạm vi | `/` | Câu hỏi, phạm vi dữ liệu, cách dùng có trách nhiệm, các biến đã loại (kèm lý do) |
| Dự đoán rủi ro | `/predict` | Form sinh từ `/api/model-info` (đơn vị, miền train, nhãn "ngoài miền"), xác suất + nhóm ưu tiên, cảnh báo, JSON request/response, giải thích log-odds |
| Đánh giá mô hình | `/evaluation/overview`, `/thresholds`, `/calibration`, `/odds`, `/errors` | Baseline, ba ngưỡng và ma trận nhầm lẫn, reliability diagram, odds ratio, sai số theo nhóm; mọi khung ghi rõ Validation hay Test |
| Model card | `/model-card` | Render nguyên văn `reports/model_card.md` |
| Dữ liệu | `/data` | Nguồn, giấy phép, checksum, chất lượng, data dictionary |

- Tìm kiếm toàn cục `Ctrl/⌘ K`, không cần gõ dấu: màn hình, biến của mô hình (nhảy tới dòng odds ratio), biến
  trong từ điển dữ liệu.
- `/predict?demo=high` (hoặc `low`, `medium`, `ood`) tự điền booking mẫu và gửi, dùng khi demo.
- Không lưu dữ liệu booking (không localStorage, không cơ sở dữ liệu); kết quả mất khi tải lại trang.
- Mọi số liệu và biểu đồ đọc từ file đã sinh (`models/metrics.json`, `reports/curves.json`, `reports/*.csv`); UI không
  chứa logic mô hình.

Sửa giao diện (cần Node.js 20+):

```bash
cd frontend && npm ci
npm run dev        # http://localhost:5173, tự proxy /api tới uvicorn ở cổng 8000 (chạy make app song song)
make ui            # build lại vào app/web
```

Endpoint chỉ đọc (không tính lại, chỉ đọc file đã lưu): `GET /api/health`, `/api/model-info` (phiên bản, ngưỡng, trường
đầu vào kèm miền giá trị, booking mẫu), `/api/metrics` (validation, test, đường ROC/PR/calibration, odds ratio, sai số
theo nhóm), `/api/model-card`, `/api/data-card`, `/api/files/{metrics.json|data_dictionary.csv|model_card.md}`.

### API `POST /api/cancellation-risk`

```bash
curl -X POST http://localhost:8000/api/cancellation-risk -H "Content-Type: application/json" -d '{
  "hotel": "City Hotel", "lead_time": 120, "arrival_date_month": "August",
  "stays_in_weekend_nights": 1, "stays_in_week_nights": 2, "adults": 2, "children": 0, "babies": 0,
  "meal": "BB", "market_segment": "Online TA", "distribution_channel": "TA/TO", "reserved_room_type": "A",
  "customer_type": "Transient", "is_repeated_guest": false,
  "previous_cancellations": 0, "previous_bookings_not_canceled": 0}'
```

```json
{
  "probability": 0.5246,
  "risk_group": "Cao",
  "action": "Gửi nhắc/xác nhận chủ động khi còn năng lực",
  "threshold_used": 0.3345,
  "thresholds": {"high_recall": 0.2408, "balanced_f1": 0.3345, "capacity": 0.5555},
  "model_version": "logreg-1.0-5638e346",
  "warnings": []
}
```

| Tình huống | Mã | Ví dụ body lỗi |
|---|---|---|
| Thiếu trường / body không phải JSON | 400 | `{"detail": [{"field": "hotel", "message": "Thiếu trường bắt buộc", "type": "missing"}]}` |
| Sai kiểu (ví dụ `"lead_time": "12"`), hạng mục không hợp lệ, ngoài miền, trường lạ, 0 khách | 422 | `{"detail": [{"field": "lead_time", "message": "Phải là số nguyên", "type": "int_type"}]}` |
| Lỗi nội bộ | 500 | `{"detail": "Lỗi nội bộ; không có dữ liệu nào được lưu. Vui lòng thử lại."}` |

`POST /api/explain` nhận cùng body và trả về hệ số chặn, đóng góp log-odds của từng biến (tổng của chúng qua hàm
sigmoid cho đúng xác suất) và đường xác suất theo lead time; giao diện dùng endpoint này để vẽ biểu đồ.

Không có giá trị nào bị tự điền hay tự ép kiểu. Đầu vào hợp lệ nhưng hiếm hoặc nằm ngoài miền train (ví dụ
`lead_time` > 737) vẫn được dự đoán, kèm cảnh báo trong `warnings`.

## Tái lập và chống rò rỉ

- Dữ liệu tải bằng script, kiểm tra SHA-256 của zip và từng CSV, số dòng (119.390), tên/kiểu cột (`data/README.md`).
- Chia theo ngày đến **trước** mọi bước học; mọi encoder/scaler nằm trong `Pipeline` và chỉ fit trên train.
- Mô hình, tham số, `class_weight` và 3 ngưỡng chọn **chỉ trên validation**; `src/train.py` không đọc test.
- Mỗi lần đánh giá test được ghi vào `reports/test_runs.log` (thời điểm, SHA-256 mô hình, commit).
- `seed: 42` và mọi tham số ở `config.yaml`; phiên bản thư viện pin trong `requirements.txt` và ghi trong `models/config.json`.
- `tests/test_leakage.py` khẳng định không có biến sau-đặt nào trong đặc trưng của pipeline đã lưu.

## Cấu trúc

```
config.yaml            seed, URL + checksum dữ liệu, mốc chia, lưới tham số, ngưỡng
Makefile               make data / train / evaluate / test / app / all
src/data.py            tải, kiểm tra checksum/schema, làm sạch, chia theo thời gian, báo cáo chất lượng
src/features.py        danh sách đặc trưng hợp lệ / bị cấm, ColumnTransformer
src/train.py           baseline, tuning trên validation, ablation, chọn 3 ngưỡng, lưu pipeline
src/evaluate.py        đánh giá test (1 lần), calibration, ngưỡng, odds ratio, phân tích lỗi, hình
app/                   FastAPI (main.py, schemas.py); app/web = bản build giao diện
frontend/              mã nguồn giao diện React + TypeScript (Vite)
tests/                 test leakage, tiền xử lý, API
notebooks/eda.ipynb    EDA chỉ trên train
data/                  README (nguồn, giấy phép, checksum), data_dictionary.csv; raw/ bị gitignore
models/                model.joblib, baselines.joblib, config.json, metrics.json
reports/               data_quality.md, results.md, model_card.md, experiments.csv, figures/, report/, slides/
docs/                  project_brief.md, decisions.md, worklog.md, contribution.md
archive/               notebook phiên bản đầu (bộ dữ liệu Kaggle khác, xem docs/decisions.md D-01)
```

## Sử dụng công cụ AI

Repo được tái cấu trúc với sự hỗ trợ của Claude Code (Claude Opus 5.5): rà soát so với đề, viết lại pipeline,
app, test và bản nháp tài liệu. Cách kiểm chứng và phần việc của từng thành viên: `docs/contribution.md`.

## Trích dẫn dữ liệu

Antonio, N., de Almeida, A., & Nunes, L. (2019). Hotel booking demand datasets. *Data in Brief*, 22, 41–49.
https://doi.org/10.1016/j.dib.2018.11.126. Giấy phép CC BY 4.0.
