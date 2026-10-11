# Phân công, tự đánh giá và khai báo dùng AI

> **Mẫu để nhóm tự điền.** Theo đề, mỗi thành viên phải có đóng góp đáng kể ở **cả** phần dữ liệu/mô hình **và**
> phần web/báo cáo, và cả hai phải trả lời được câu hỏi về leakage, metric, mô hình và API. Commit của từng người
> phải thể hiện trong Git history.

Thành viên: **A** = `<Họ tên, MSSV>` · **B** = `<Họ tên, MSSV>`

## 1. Bảng phân công

Đánh dấu người **chính** (C) và người **hỗ trợ/review** (H) cho mỗi hạng mục.

| Hạng mục | Tệp / minh chứng | A | B |
|---|---|---|---|
| Đặc tả bài toán, brief | `docs/project_brief.md` | | |
| Tải dữ liệu, checksum, schema | `src/data.py`, `data/README.md` | | |
| Data dictionary, quyết định leakage | `data/data_dictionary.csv`, `docs/decisions.md` | | |
| Báo cáo chất lượng dữ liệu, EDA | `reports/data_quality.md`, `notebooks/eda.ipynb` | | |
| Đặc trưng, pipeline tiền xử lý | `src/features.py` | | |
| Baseline, tuning, ablation | `src/train.py`, `reports/experiments.csv` | | |
| Đánh giá test, calibration, ngưỡng, odds ratio | `src/evaluate.py`, `reports/results.md` | | |
| Phân tích lỗi theo nhóm/thời gian | `reports/error_by_group.csv`, hình | | |
| API FastAPI + validation | `app/main.py`, `app/schemas.py` | | |
| Giao diện 3 màn hình | `app/static/` | | |
| Test tự động (leakage, tiền xử lý, API) | `tests/` | | |
| Model card | `reports/model_card.md` | | |
| Báo cáo DOCX/PDF | `reports/report/` | | |
| Slide + kịch bản demo | `reports/slides/` | | |
| Tái lập trên máy sạch | README, Makefile | | |

## 2. Tự đánh giá theo rubric

| Tiêu chí | Điểm tối đa | Nhóm tự chấm | Bằng chứng / điểm còn yếu |
|---|---|---|---|
| 1. Bài toán & phạm vi | 8 | | |
| 2. Dữ liệu & EDA | 12 | | |
| 3. Split, leakage & tái lập | 15 | | |
| 4. Mô hình & thí nghiệm | 18 | | |
| 5. Đánh giá & phân tích lỗi | 18 | | |
| 6. Web/API | 12 | | |
| 7. Mã nguồn & bàn giao | 7 | | |
| 8. Báo cáo, trình bày & nhóm | 10 | | |
| **Tổng** | **100** | | |

## 3. Khai báo sử dụng công cụ AI

| Công cụ | Phạm vi sử dụng | Cách nhóm kiểm chứng |
|---|---|---|
| Claude Code (Claude Opus 5.5, Anthropic) | Rà soát repo so với tài liệu giao nhiệm vụ; viết lại pipeline dữ liệu/mô hình/đánh giá, ứng dụng web, test tự động; soạn bản nháp tài liệu, báo cáo, slide | (1) Chạy lại `make all` trên môi trường sạch; (2) 39 test tự động pass; (3) đối chiếu mọi con số trong báo cáo với `models/metrics.json` và `reports/*.csv`; (4) đọc lại từng quyết định trong `docs/decisions.md` và kiểm tra lại bằng dữ liệu; (5) `<nhóm bổ sung phần tự kiểm chứng của mình>` |

Nhóm chịu trách nhiệm toàn bộ nội dung nộp, kể cả phần do AI soạn nháp.
