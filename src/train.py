"""Huấn luyện baseline + logistic regression; mọi lựa chọn (tham số, class_weight, ngưỡng) chỉ dựa trên validation.

Chạy: python -m src.train
Đầu ra: models/model.joblib, models/baselines.joblib, models/config.json, models/metrics.json (phần validation),
        reports/experiments.csv. Không đọc tập test.
"""
import json
import platform
import sys
from datetime import datetime, timezone

import joblib
import numpy as np
import pandas as pd
import scipy
import sklearn
from sklearn.compose import ColumnTransformer
from sklearn.dummy import DummyClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (average_precision_score, brier_score_loss, confusion_matrix, log_loss,
                             precision_recall_curve, roc_auc_score)
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

from src.data import ROOT, load_config, load_splits, sha256
from src.features import (BINARY, CATEGORICAL, FEATURES, FORBIDDEN, FORBIDDEN_BY_SPEC, NUMERIC, SENSITIVITY_ONLY,
                          TARGET, build_preprocessor)


def score(y, p):
    return {"roc_auc": roc_auc_score(y, p), "pr_auc": average_precision_score(y, p),
            "log_loss": log_loss(y, p, labels=[0, 1]), "brier": brier_score_loss(y, p)}


def bootstrap_ci(y, p, groups, n, seed):
    """Khoảng 95% bằng bootstrap theo cụm ngày đến (booking cùng ngày/cùng đoàn tương quan với nhau)."""
    y, p, groups = np.asarray(y), np.asarray(p), np.asarray(groups)
    clusters = [np.flatnonzero(groups == g) for g in np.unique(groups)]
    rng = np.random.default_rng(seed)
    draws = []
    for _ in range(n):
        idx = np.concatenate([clusters[j] for j in rng.integers(0, len(clusters), len(clusters))])
        draws.append(score(y[idx], p[idx]))
    return {k: [float(np.percentile([d[k] for d in draws], q)) for q in (2.5, 97.5)] for k in draws[0]}


def threshold_summary(y, p, t):
    tn, fp, fn, tp = confusion_matrix(y, p >= t, labels=[0, 1]).ravel().tolist()
    precision = tp / (tp + fp) if tp + fp else 0.0
    recall = tp / (tp + fn) if tp + fn else 0.0
    return {"threshold": float(t), "tn": tn, "fp": fp, "fn": fn, "tp": tp, "precision": precision,
            "recall": recall, "f1": 2 * precision * recall / (precision + recall) if precision + recall else 0.0,
            "flagged_share": (tp + fp) / len(y)}


def choose_thresholds(y, p, recall_target, capacity_share):
    prec, rec, thr = precision_recall_curve(y, p)
    prec, rec = prec[:-1], rec[:-1]
    f1 = 2 * prec * rec / np.maximum(prec + rec, 1e-12)
    t = {"high_recall": float(thr[rec >= recall_target].max()),
         "balanced_f1": float(thr[f1.argmax()]),
         "capacity": float(np.quantile(p, 1 - capacity_share))}
    if not t["high_recall"] < t["balanced_f1"] < t["capacity"]:
        raise ValueError(f"Ba ngưỡng không tăng dần, cần xem lại cấu hình: {t}")
    return t


def logreg(C, l1_ratio, class_weight, max_iter, seed):
    # lbfgs cho L2 (hội tụ nhanh, không phạt intercept); liblinear cho L1 (lbfgs không hỗ trợ L1)
    return LogisticRegression(C=C, l1_ratio=l1_ratio, class_weight=class_weight, max_iter=max_iter,
                              solver="lbfgs" if l1_ratio == 0 else "liblinear", random_state=seed)


def main():
    cfg = load_config()
    seed, m = cfg["seed"], cfg["model"]
    s = load_splits(cfg)
    train, val = s["train"], s["val"]
    y_tr, y_va = train[TARGET], val[TARGET]
    rows, val_proba = [], {}

    def run(exp_id, stage, desc, pipe, cols, **params):
        pipe.fit(train[cols], y_tr)
        p = pipe.predict_proba(val[cols])[:, 1]
        val_proba[exp_id] = p
        rows.append({"exp_id": exp_id, "stage": stage, "description": desc, "n_features_in": len(cols),
                     **params, **{f"val_{k}": v for k, v in score(y_va, p).items()}})
        return pipe

    # 1) Baseline
    baselines = {
        "Baseline: tỷ lệ hủy chung (prior)": run(
            "B0", "baseline", "Dự đoán tỷ lệ hủy chung của train cho mọi booking",
            DummyClassifier(strategy="prior"), ["lead_time"]),
        "Baseline: LR chỉ lead_time": run(
            "B1", "baseline", "LogisticRegression chỉ với lead_time (chuẩn hóa)",
            Pipeline([("pre", ColumnTransformer([("num", StandardScaler(), ["lead_time"])])),
                      ("model", LogisticRegression(max_iter=m["max_iter"]))]), ["lead_time"]),
    }

    # 2) Tuning C, penalty (l1_ratio), class_weight trên validation
    grid = []
    for cw in m["class_weight_grid"]:
        for l1 in m["l1_ratio_grid"]:
            for C in m["C_grid"]:
                exp_id = f"G{len(grid):02d}"
                params = {"C": C, "l1_ratio": l1, "class_weight": cw or "None"}
                run(exp_id, "grid", f"LR đầy đủ, {'L1' if l1 else 'L2'}, C={C}, class_weight={cw}",
                    Pipeline([("pre", build_preprocessor()), ("model", logreg(C, l1, cw, m["max_iter"], seed))]),
                    FEATURES, **params)
                grid.append((exp_id, C, l1, cw))
    metric = "val_" + m["selection_metric"]
    grid_df = pd.DataFrame(rows).set_index("exp_id").loc[[g[0] for g in grid]]
    best_id = grid_df[metric].idxmin() if metric in ("val_log_loss", "val_brier") else grid_df[metric].idxmax()
    _, C, l1, cw = next(g for g in grid if g[0] == best_id)
    best = Pipeline([("pre", build_preprocessor()), ("model", logreg(C, l1, cw, m["max_iter"], seed))])
    best.fit(train[FEATURES], y_tr)

    # Mô hình cùng tham số nhưng class_weight còn lại: dùng để so sánh calibration ở evaluate.py
    other_cw = "balanced" if cw is None else None
    other_id = next(g[0] for g in grid if g[1:] == (C, l1, other_cw))
    baselines[f"LR đầy đủ, class_weight={other_cw} (so sánh)"] = Pipeline(
        [("pre", build_preprocessor()), ("model", logreg(C, l1, other_cw, m["max_iter"], seed))]
    ).fit(train[FEATURES], y_tr)

    # 3) Ablation trên validation (không dùng để chọn mô hình cuối)
    best_params = {"C": C, "l1_ratio": l1, "class_weight": cw or "None"}
    lr = lambda: logreg(C, l1, cw, m["max_iter"], seed)
    run("A1", "ablation", "Bỏ log1p ở biến đếm (chỉ chuẩn hóa)",
        Pipeline([("pre", build_preprocessor(log_numeric=False)), ("model", lr())]), FEATURES, **best_params)
    train["adr"], val["adr"] = train["adr"].clip(lower=0), val["adr"].clip(lower=0)  # log1p cần giá trị >= 0
    run("A2", "ablation", "Thêm biến nghi vấn: deposit_type, adr, total_of_special_requests",
        Pipeline([("pre", build_preprocessor(CATEGORICAL + ["deposit_type"],
                                             NUMERIC + ["adr", "total_of_special_requests"])), ("model", lr())]),
        FEATURES + SENSITIVITY_ONLY, **best_params)
    leak_cat = ["assigned_room_type", "country"]
    leak_num = ["booking_changes", "days_in_waiting_list", "required_car_parking_spaces"]
    run("A3", "ablation", "MINH HỌA RÒ RỈ: thêm biến sau-đặt (assigned_room_type, booking_changes, "
        "days_in_waiting_list, required_car_parking_spaces, country)",
        Pipeline([("pre", build_preprocessor(CATEGORICAL + leak_cat, NUMERIC + leak_num)), ("model", lr())]),
        FEATURES + leak_cat + leak_num, **best_params)

    exp = pd.DataFrame(rows)
    exp["selected"] = exp["exp_id"].eq(best_id)
    reports, models = ROOT / cfg["paths"]["reports"], ROOT / cfg["paths"]["models"]
    reports.mkdir(parents=True, exist_ok=True)
    models.mkdir(parents=True, exist_ok=True)
    exp.to_csv(reports / "experiments.csv", index=False, float_format="%.5f")

    # 4) Ba ngưỡng hành động chọn trên validation
    p_val = val_proba[best_id]
    thresholds = choose_thresholds(y_va, p_val, cfg["thresholds"]["recall_target"], cfg["thresholds"]["capacity_share"])
    risk_groups = [
        {"name": "Rất cao", "min_probability": thresholds["capacity"],
         "action": "Gọi xác nhận sớm (nằm trong ~15% booking rủi ro nhất)"},
        {"name": "Cao", "min_probability": thresholds["balanced_f1"],
         "action": "Gửi nhắc/xác nhận chủ động khi còn năng lực"},
        {"name": "Trung bình", "min_probability": thresholds["high_recall"],
         "action": "Theo dõi; xác nhận lại gần ngày đến"},
        {"name": "Thấp", "min_probability": 0.0, "action": "Quy trình bình thường"},
    ]

    joblib.dump(best, models / "model.joblib")
    joblib.dump(baselines, models / "baselines.joblib")
    X_tr = train[FEATURES]
    config_out = {
        "model_version": f"logreg-1.0-{sha256(models / 'model.joblib')[:8]}",
        "trained_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "seed": seed,
        "selected_experiment": best_id,
        "selection_metric": metric,
        "params": {"C": C, "l1_ratio": l1, "penalty": "l1" if l1 else "l2", "class_weight": cw,
                   "solver": best.named_steps["model"].solver, "max_iter": m["max_iter"]},
        "features": {"categorical": CATEGORICAL, "numeric_log1p_scaled": NUMERIC, "binary": BINARY},
        "forbidden_columns": FORBIDDEN,
        "split": {**cfg["split"], "rule": "theo arrival_date; train < val_start <= val < test_start <= test",
                  "n_train": len(train), "n_val": len(val)},
        "thresholds": thresholds,
        "risk_groups": risk_groups,
        "train_domain": {
            "numeric": {c: {"min": float(X_tr[c].min()), "max": float(X_tr[c].max()),
                            "p01": float(X_tr[c].quantile(0.01)), "p99": float(X_tr[c].quantile(0.99))}
                        for c in NUMERIC + BINARY},
            "categories": {c: X_tr[c].value_counts().to_dict() for c in CATEGORICAL},
        },
        "environment": {"python": platform.python_version(), "platform": sys.platform,
                        "numpy": np.__version__, "pandas": pd.__version__, "scipy": scipy.__version__,
                        "scikit-learn": sklearn.__version__, "joblib": joblib.__version__},
    }
    (models / "config.json").write_text(json.dumps(config_out, ensure_ascii=False, indent=2), encoding="utf-8")

    groups = val["arrival_date"].dt.strftime("%Y-%m-%d")
    val_metrics = {
        name: {**score(y_va, val_proba[eid]),
               "ci95": bootstrap_ci(y_va, val_proba[eid], groups, cfg["bootstrap_n"], seed)}
        for name, eid in [("Baseline: tỷ lệ hủy chung (prior)", "B0"), ("Baseline: LR chỉ lead_time", "B1"),
                          ("LR đầy đủ (mô hình chính)", best_id),
                          (f"LR đầy đủ, class_weight={other_cw} (so sánh)", other_id)]
    }
    metrics = {"validation": {"models": val_metrics,
                              "thresholds": {k: threshold_summary(y_va, p_val, t) for k, t in thresholds.items()}}}
    (models / "metrics.json").write_text(json.dumps(metrics, ensure_ascii=False, indent=2), encoding="utf-8")

    show = exp.set_index("exp_id")[["description", "val_roc_auc", "val_pr_auc", "val_log_loss"]]
    print(show.to_string(float_format="%.4f", max_colwidth=70))
    print(f"\nChọn {best_id} theo {metric}: {config_out['params']}")
    print("Ngưỡng (validation):", {k: round(v, 3) for k, v in thresholds.items()})
    assert not set(FORBIDDEN) & set(best.feature_names_in_), "Mô hình chính chứa cột bị cấm"
    assert not set(FORBIDDEN_BY_SPEC) & set(FEATURES)


if __name__ == "__main__":
    main()
