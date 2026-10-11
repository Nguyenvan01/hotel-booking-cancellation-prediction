# Dùng: kích hoạt venv rồi chạy `make all`. Không có make (Windows): chạy từng lệnh python bên dưới.
PYTHON ?= python
PORT ?= 8000

.PHONY: all setup data train evaluate eda test app

all: data train evaluate test app   ## tải dữ liệu → huấn luyện → đánh giá test → kiểm thử → chạy web

setup:      ## cài thư viện đã pin version
	$(PYTHON) -m pip install -r requirements.txt

data:       ## tải + kiểm tra SHA-256/schema, ghi reports/data_quality.md
	$(PYTHON) -m src.data

train:      ## baseline + tuning trên validation, lưu models/ và reports/experiments.csv (không đọc test)
	$(PYTHON) -m src.train

evaluate:   ## đánh giá trên test (mỗi lần chạy được ghi vào reports/test_runs.log)
	$(PYTHON) -m src.evaluate

eda:        ## chạy lại notebook EDA (chỉ dùng train)
	$(PYTHON) -m nbconvert --to notebook --execute --inplace notebooks/eda.ipynb

test:       ## test leakage, tiền xử lý, API
	$(PYTHON) -m pytest -q tests

app:        ## web + API tại http://localhost:$(PORT)
	$(PYTHON) -m uvicorn app.main:app --port $(PORT)
