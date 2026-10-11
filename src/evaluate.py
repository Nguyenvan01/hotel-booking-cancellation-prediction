"""Đánh giá cuối trên tập test (chạy MỘT lần sau khi đã chốt mô hình và ngưỡng ở src/train.py).

Chạy: python -m src.evaluate          -> đánh giá trên test, ghi models/metrics.json (phần test), reports/, figures
      python -m src.evaluate val      -> chạy thử toàn bộ code trên validation (ghi vào reports/dryrun_val/),
                                         dùng khi sửa code để không phải nhìn tập test
Mỗi lần chạy trên test được ghi vào reports/test_runs.log (thời điểm, hash mô hình).
"""
import json
import subprocess
import sys
from datetime import datetime, timezone

import joblib
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.ticker as mtick
import numpy as np
import pandas as pd
from matplotlib.colors import LinearSegmentedColormap
from sklearn.calibration import calibration_curve
from sklearn.metrics import precision_recall_curve, roc_auc_score, roc_curve

from src.data import ROOT, load_config, load_splits, md_table, sha256
from src.features import CATEGORICAL, FEATURES, NUMERIC, TARGET
from src.train import bootstrap_ci, score, threshold_summary

# Bảng màu thống nhất (palette mặc định của skill dataviz; giống notebook cũ)
BLUE, ORANGE, AQUA, RED = "#2a78d6", "#eb6834", "#1baf7a", "#e34948"
INK, INK_2, MUTED, GRID, AXIS, SURFACE = "#0b0b0b", "#52514e", "#898781", "#e1e0d9", "#c3c2b7", "#fcfcfb"
SEQ_BLUE = LinearSegmentedColormap.from_list("seq_blue", ["#cde2fb", "#104281"])
plt.rcParams.update({
    "figure.facecolor": SURFACE, "axes.facecolor": SURFACE, "savefig.facecolor": SURFACE,
    "axes.edgecolor": AXIS, "axes.labelcolor": INK_2, "axes.titlecolor": INK, "axes.titleweight": "bold",
    "axes.titlesize": 11, "axes.titlelocation": "left", "axes.spines.top": False, "axes.spines.right": False,
    "axes.grid": True, "axes.axisbelow": True, "grid.color": GRID, "grid.linewidth": 0.6,
    "xtick.color": AXIS, "ytick.color": AXIS, "xtick.labelcolor": INK_2, "ytick.labelcolor": INK_2,
    "text.color": INK, "legend.frameon": False, "font.size": 9.5, "figure.dpi": 110, "lines.linewidth": 2,
})
MAIN = "LR đầy đủ (mô hình chính)"
LEAD_BINS = [-1, 7, 30, 90, 180, 365, np.inf]
LEAD_LABELS = ["0–7", "8–30", "31–90", "91–180", "181–365", ">365"]
THRESHOLD_NAMES = {"high_recall": "Ưu tiên recall", "balanced_f1": "Cân bằng (F1 max)",
                   "capacity": "Theo năng lực gọi (~15%)"}


def log_test_run(path, model_hash):
    try:
        commit = subprocess.run(["git", "rev-parse", "--short", "HEAD"], capture_output=True, text=True,
                                cwd=ROOT).stdout.strip() or "none"
    except OSError:
        commit = "none"
    previous = [l for l in path.read_text(encoding="utf-8").splitlines() if model_hash in l] if path.exists() else []
    if previous:
        print(f"CẢNH BÁO: mô hình này đã được đánh giá trên test ({len(previous)} lần, lần đầu: {previous[0][:25]}). "
              "Lần chạy này chỉ để tái lập; không được dùng kết quả để chỉnh mô hình/ngưỡng.")
    with path.open("a", encoding="utf-8") as f:
        f.write(f"{datetime.now(timezone.utc).isoformat(timespec='seconds')} model_sha256={model_hash} git={commit}\n")


def group_table(df, p, key, t):
    rows = []
    for level, idx in df.groupby(key, observed=True).indices.items():
        y, q = df[TARGET].to_numpy()[idx], p[idx]
        s = threshold_summary(y, q, t)
        rows.append({"Biến": key, "Nhóm": str(level), "n": len(idx), "Tỷ lệ hủy thực tế": y.mean(),
                     "Xác suất dự đoán TB": q.mean(),
                     "ROC-AUC": roc_auc_score(y, q) if 0 < y.sum() < len(y) else np.nan,
                     "Log loss": score(y, q)["log_loss"] if 0 < y.sum() < len(y) else np.nan,
                     "Precision@F1": s["precision"], "Recall@F1": s["recall"], "Tỷ lệ gắn cờ": s["flagged_share"]})
    return rows


def odds_ratio_table(model, train):
    pre, lr = model.named_steps["pre"], model.named_steps["model"]
    names, coefs = pre.get_feature_names_out(), lr.coef_[0]
    enc, scaler = pre.named_transformers_["cat"], pre.named_transformers_["num"][-1]
    refs = {c: cats[d] for c, cats, d in zip(CATEGORICAL, enc.categories_, enc.drop_idx_)}
    rows = []
    for name, b in zip(names, coefs):
        block, col = name.split("__", 1)
        if block == "cat":
            feat = next(c for c in CATEGORICAL if col.startswith(c + "_"))
            level = col[len(feat) + 1:].replace("infrequent_sklearn", "nhóm hiếm (<50 dòng train)")
            rows.append({"Đặc trưng": feat, "Số hạng": f"{feat} = {level}", "So sánh": f"so với {feat} = {refs[feat]}",
                         "Hệ số (log-odds)": b, "Odds ratio": np.exp(b)})
        elif block == "num":
            i = NUMERIC.index(col)
            q25, q50, q75 = train[col].quantile([0.25, 0.5, 0.75])
            a, c = (q25, q75) if q25 < q75 else (q50, q50 + 1)
            dz = (np.log1p(c) - np.log1p(a)) / scaler.scale_[i]
            rows.append({"Đặc trưng": col, "Số hạng": col, "So sánh": f"{a:g} → {c:g} (log1p, chuẩn hóa)",
                         "Hệ số (log-odds)": b, "Odds ratio": np.exp(b * dz)})
        else:
            rows.append({"Đặc trưng": col, "Số hạng": col, "So sánh": "1 so với 0 (khách lặp lại so với khách mới)",
                         "Hệ số (log-odds)": b, "Odds ratio": np.exp(b)})
    out = pd.DataFrame(rows)
    return out.reindex(out["Hệ số (log-odds)"].abs().sort_values(ascending=False).index).reset_index(drop=True)


def savefig(fig, path):
    fig.tight_layout()
    fig.savefig(path, dpi=150)
    plt.close(fig)


def main(split="test"):
    cfg = load_config()
    models_dir, reports = ROOT / cfg["paths"]["models"], ROOT / cfg["paths"]["reports"]
    out = ROOT / cfg["paths"]["figures"] if split == "test" else reports / "dryrun_val"
    tables = reports if split == "test" else out
    out.mkdir(parents=True, exist_ok=True)
    model = joblib.load(models_dir / "model.joblib")
    baselines = joblib.load(models_dir / "baselines.joblib")
    conf = json.loads((models_dir / "config.json").read_text(encoding="utf-8"))
    metrics = json.loads((models_dir / "metrics.json").read_text(encoding="utf-8"))
    if split == "test":
        log_test_run(reports / "test_runs.log", sha256(models_dir / "model.joblib"))

    s = load_splits(cfg)
    train, val, ev = s["train"], s["val"], s[split]
    y = ev[TARGET].to_numpy()
    probs = {MAIN: model.predict_proba(ev[FEATURES])[:, 1]}
    probs |= {name: b.predict_proba(ev[list(b.feature_names_in_)])[:, 1] for name, b in baselines.items()}
    p, p_val = probs[MAIN], model.predict_proba(val[FEATURES])[:, 1]
    days = ev["arrival_date"].dt.strftime("%Y-%m-%d")
    seed, n_boot = cfg["seed"], cfg["bootstrap_n"]
    res = {name: {**score(y, q), "ci95": bootstrap_ci(y, q, days, n_boot, seed)} for name, q in probs.items()}

    # --- Thí nghiệm 1: baseline vs mô hình đầy đủ (validation để chọn, test để kết luận)
    comp = []
    for name in res:
        for part, src in [("validation", metrics["validation"]["models"].get(name)), (split, res[name])]:
            if src:
                comp.append({"Mô hình": name, "Tập": part, **{k: src[k] for k in ("roc_auc", "pr_auc", "log_loss", "brier")},
                             "ROC-AUC CI95": "–".join(f"{v:.3f}" for v in src["ci95"]["roc_auc"]),
                             "PR-AUC CI95": "–".join(f"{v:.3f}" for v in src["ci95"]["pr_auc"]),
                             "Log loss CI95": "–".join(f"{v:.3f}" for v in src["ci95"]["log_loss"])})
    comp = pd.DataFrame(comp).drop_duplicates(["Mô hình", "Tập"])
    comp.to_csv(tables / "results_comparison.csv", index=False, float_format="%.4f")

    fig, axes = plt.subplots(1, 2, figsize=(11, 4.2))
    curves = [(MAIN, BLUE), ("Baseline: LR chỉ lead_time", ORANGE), ("Baseline: tỷ lệ hủy chung (prior)", AQUA)]
    for name, color in curves:
        fpr, tpr, _ = roc_curve(y, probs[name])
        axes[0].plot(fpr, tpr, color=color, label=f"{name} (AUC {res[name]['roc_auc']:.3f})")
        prec, rec, _ = precision_recall_curve(y, probs[name])
        axes[1].plot(rec, prec, color=color, label=f"{name} (AP {res[name]['pr_auc']:.3f})")
    axes[0].set(xlabel="False positive rate", ylabel="True positive rate", title=f"ROC ({split})")
    axes[1].set(xlabel="Recall", ylabel="Precision", ylim=(0, 1.02), title=f"Precision–Recall ({split})")
    for ax in axes:
        ax.legend(loc="lower right" if ax is axes[0] else "upper right", fontsize=8.5)
    savefig(fig, out / "fig_roc_pr.png")

    # --- Thí nghiệm 2: calibration
    calib = {}
    fig, (ax, ax2) = plt.subplots(1, 2, figsize=(11, 4.2), gridspec_kw={"width_ratios": [1.1, 1]})
    ax.plot([0, 1], [0, 1], color=MUTED, linestyle="--", linewidth=1, label="Hiệu chỉnh hoàn hảo")
    cw_name = next(n for n in baselines if n.startswith("LR đầy đủ"))
    for label, yy, q, color, style in [(f"{MAIN} – validation", val[TARGET], p_val, BLUE, ":"),
                                       (f"{MAIN} – {split}", y, p, BLUE, "-"),
                                       (f"{cw_name} – {split}", y, probs[cw_name], ORANGE, "-")]:
        frac, mean_pred = calibration_curve(yy, q, n_bins=10, strategy="quantile")
        calib[label] = {"mean_predicted": mean_pred.tolist(), "observed_rate": frac.tolist()}
        ax.plot(mean_pred, frac, color=color, linestyle=style, marker="o", markersize=4, label=label)
    ax.set(xlabel="Xác suất dự đoán trung bình (theo thập phân vị)", ylabel="Tỷ lệ hủy thực tế",
           xlim=(0, 1), ylim=(0, 1), title="Reliability diagram")
    ax.legend(fontsize=8)
    ax2.hist([p[y == 0], p[y == 1]], bins=np.linspace(0, 1, 26), stacked=True, color=[BLUE, ORANGE],
             label=["Không hủy", "Hủy"], edgecolor=SURFACE, linewidth=1)
    ax2.set(xlabel="Xác suất hủy dự đoán", ylabel="Số booking", title=f"Phân bố xác suất ({split})")
    ax2.legend()
    savefig(fig, out / "fig_calibration.png")

    # --- Thí nghiệm 3: ba ngưỡng hành động (chọn trên validation, áp dụng nguyên trạng)
    th = {k: threshold_summary(y, p, t) for k, t in conf["thresholds"].items()}
    fig, axes = plt.subplots(1, 3, figsize=(13, 4))
    for ax, (k, r) in zip(axes, th.items()):
        cm = np.array([[r["tn"], r["fp"]], [r["fn"], r["tp"]]])
        ax.imshow(cm, cmap=SEQ_BLUE)
        for (i, j), v in np.ndenumerate(cm):
            ax.text(j, i, f"{v:,}\n({v / cm.sum():.1%})", ha="center", va="center",
                    color="white" if v > cm.max() * 0.55 else INK, fontsize=10)
        ax.set_xticks([0, 1], ["Không hủy", "Hủy"])
        ax.set_yticks([0, 1], ["Không hủy", "Hủy"])
        ax.set(xlabel="Dự đoán", ylabel="Thực tế")
        ax.grid(False)
        ax.set_title(f"{THRESHOLD_NAMES[k]}: t = {r['threshold']:.3f}\n"
                     f"P {r['precision']:.2f} · R {r['recall']:.2f} · gắn cờ {r['flagged_share']:.0%}", fontsize=10)
    savefig(fig, out / "fig_confusion_thresholds.png")

    # --- Thí nghiệm 4: hệ số / odds ratio (từ mô hình đã fit trên train; không phụ thuộc tập đánh giá)
    odds = odds_ratio_table(model, train)
    odds.to_csv(tables / "odds_ratios.csv", index=False, float_format="%.4f")
    top = odds.head(20).iloc[::-1]
    fig, ax = plt.subplots(figsize=(9, 6.5))
    ax.barh(top["Số hạng"], top["Odds ratio"] - 1, left=1, height=0.6,
            color=[RED if v > 1 else BLUE for v in top["Odds ratio"]])
    ax.set_xscale("log")
    ax.axvline(1, color=AXIS, linewidth=1)
    ax.xaxis.set_major_formatter(mtick.FuncFormatter(lambda v, _: f"{v:g}"))
    ax.grid(axis="y", visible=False)
    ax.set(xlabel="Odds ratio, thang log (đỏ: odds hủy cao hơn, xanh: thấp hơn)",
           title="20 số hạng có |hệ số| lớn nhất\nGiữ các biến khác không đổi; tương quan, không phải nhân quả")
    savefig(fig, out / "fig_odds_ratios.png")

    # --- Phân tích lỗi theo nhóm (ngưỡng cân bằng F1)
    t_f1 = conf["thresholds"]["balanced_f1"]
    ev = ev.assign(lead_time_bin=pd.cut(ev["lead_time"], LEAD_BINS, labels=LEAD_LABELS),
                   guest_type=ev["is_repeated_guest"].map({0: "Khách mới", 1: "Khách lặp lại"}),
                   arrival_month=ev["arrival_date"].dt.strftime("%Y-%m"))
    keys = ["hotel", "distribution_channel", "market_segment", "customer_type", "lead_time_bin", "guest_type",
            "arrival_month"]
    groups = pd.DataFrame([r for k in keys for r in group_table(ev, p, k, t_f1)])
    groups.to_csv(tables / "error_by_group.csv", index=False, float_format="%.4f")

    panels = ["market_segment", "lead_time_bin", "distribution_channel", "hotel", "guest_type", "customer_type"]
    fig, axes = plt.subplots(2, 3, figsize=(14, 7.5))
    for ax, k in zip(axes.flat, panels):
        g = groups[groups["Biến"] == k].reset_index(drop=True)
        pos = np.arange(len(g))
        ax.hlines(pos, g["Tỷ lệ hủy thực tế"], g["Xác suất dự đoán TB"], color=AXIS, linewidth=1.5)
        ax.scatter(g["Tỷ lệ hủy thực tế"], pos, color=BLUE, s=36, zorder=3, label="Thực tế",
                   edgecolor=SURFACE, linewidth=1)
        ax.scatter(g["Xác suất dự đoán TB"], pos, color=ORANGE, s=36, zorder=3, label="Dự đoán TB",
                   edgecolor=SURFACE, linewidth=1)
        ax.set_yticks(pos, [f"{n}  (n={c:,})" for n, c in zip(g["Nhóm"], g["n"])])
        ax.invert_yaxis()
        ax.set_xlim(0, 1)
        ax.xaxis.set_major_formatter(mtick.PercentFormatter(1.0))
        ax.grid(axis="y", visible=False)
        ax.set_title(k)
    axes[0, 0].legend(loc="lower right")
    fig.suptitle(f"Tỷ lệ hủy thực tế và xác suất dự đoán trung bình theo nhóm ({split})", x=0.01, ha="left",
                 fontweight="bold")
    savefig(fig, out / "fig_error_groups.png")

    # Theo tháng đến: validation + tập đánh giá (độ trôi theo thời gian)
    both = pd.concat([val.assign(_p=p_val, _set="validation"), ev.assign(_p=p, _set=split)]).drop_duplicates(
        subset=None if split == "test" else ["arrival_date", "_p"])
    monthly = both.groupby(both["arrival_date"].dt.to_period("M")).agg(
        observed=(TARGET, "mean"), predicted=("_p", "mean"), n=(TARGET, "size"))
    fig, ax = plt.subplots(figsize=(9, 3.6))
    x = monthly.index.to_timestamp()
    ax.plot(x, monthly["observed"], color=BLUE, marker="o", markersize=5, label="Tỷ lệ hủy thực tế")
    ax.plot(x, monthly["predicted"], color=ORANGE, marker="o", markersize=5, label="Xác suất dự đoán TB")
    if split == "test":
        ax.axvspan(pd.Timestamp(cfg["split"]["test_start"]) - pd.Timedelta(days=15), x.max() + pd.Timedelta(days=15),
                   color=GRID, alpha=0.5, linewidth=0)
        ax.text(pd.Timestamp(cfg["split"]["test_start"]), 0.05, " test", color=INK_2)
    ax.set_ylim(0, 0.7)
    ax.yaxis.set_major_formatter(mtick.PercentFormatter(1.0))
    ax.legend(loc="upper left")
    ax.set_title("Theo tháng đến: validation (01–04/2017) và test (05–08/2017)")
    savefig(fig, out / "fig_monthly.png")

    # FP/FN điển hình và trường hợp ngoài miền
    show_cols = ["hotel", "lead_time", "market_segment", "distribution_channel", "customer_type", "deposit_type",
                 "previous_cancellations", "is_repeated_guest", "adults", "stays_in_week_nights", "arrival_date"]
    ev = ev.assign(probability=p)
    fp = ev[(y == 0) & (p >= t_f1)].nlargest(5, "probability").assign(loai="FP (dự đoán hủy, thực tế không)")
    fn = ev[(y == 1) & (p < t_f1)].nsmallest(5, "probability").assign(loai="FN (dự đoán không, thực tế hủy)")
    examples = pd.concat([fp, fn])[["loai", "probability", TARGET] + show_cols]
    examples.to_csv(tables / "fp_fn_examples.csv", index=False, float_format="%.3f")
    errors = ev.assign(err=np.select([(y == 0) & (p >= t_f1), (y == 1) & (p < t_f1)], ["FP", "FN"], "đúng"))
    err_mix = pd.crosstab(errors["market_segment"], errors["err"], normalize="columns").round(3)
    err_dep = pd.crosstab(errors["deposit_type"], errors["err"], normalize="columns").round(3)

    dom = conf["train_domain"]
    ood_num = np.column_stack([(ev[c] < d["min"]) | (ev[c] > d["max"]) for c, d in dom["numeric"].items()]).any(axis=1)
    ood_cat = np.column_stack([ev[c].map(dom["categories"][c]).fillna(0).lt(50) for c in CATEGORICAL]).any(axis=1)
    ood = ood_num | ood_cat
    ood_rows = [{"Nhóm": name, "n": int(mask.sum()),
                 **({"Tỷ lệ hủy thực tế": y[mask].mean(), "Xác suất dự đoán TB": p[mask].mean()} if mask.any() else {})}
                for name, mask in [("Trong miền train", ~ood), ("Ngoài miền số (ngoài [min, max] của train)", ood_num),
                                   ("Hạng mục hiếm/chưa gặp (< 50 dòng train)", ood_cat)]]
    probe_base = {"hotel": "City Hotel", "arrival_date_month": "August", "meal": "BB", "market_segment": "Online TA",
                  "distribution_channel": "TA/TO", "reserved_room_type": "A", "customer_type": "Transient",
                  "stays_in_weekend_nights": 1, "stays_in_week_nights": 2, "adults": 2, "children": 0, "babies": 0,
                  "previous_cancellations": 0, "previous_bookings_not_canceled": 0, "is_repeated_guest": 0}
    probe = pd.DataFrame([{**probe_base, "lead_time": lt} for lt in [0, 30, 100, 365, 629, 1000, 2000]])
    probe["probability"] = model.predict_proba(probe[FEATURES])[:, 1]
    probe_view = probe[["lead_time", "probability"]].assign(
        trong_mien=probe["lead_time"].between(dom["numeric"]["lead_time"]["min"], dom["numeric"]["lead_time"]["max"]))

    # --- Ghi kết quả
    summary = {
        "split": split, "evaluated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "model_version": conf["model_version"], "n": int(len(y)), "cancel_rate": float(y.mean()),
        "models": res, "thresholds": th,
        "calibration": {"bins": calib, "mean_predicted": float(p.mean()), "observed_rate": float(y.mean())},
    }
    if split == "test":
        metrics["test"] = summary
        (models_dir / "metrics.json").write_text(json.dumps(metrics, ensure_ascii=False, indent=2), encoding="utf-8")
    else:
        (out / "metrics_dryrun.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")

    fmt_th = pd.DataFrame.from_dict({THRESHOLD_NAMES[k]: {
        "Ngưỡng": r["threshold"], "Precision": r["precision"], "Recall": r["recall"], "F1": r["f1"],
        "Tỷ lệ gắn cờ": r["flagged_share"], "TP": r["tp"], "FP": r["fp"], "FN": r["fn"], "TN": r["tn"]}
        for k, r in th.items()}, orient="index")
    fmt_th.index.name = "Ngưỡng hành động"
    val_th = pd.DataFrame.from_dict({THRESHOLD_NAMES[k]: {
        "Ngưỡng": r["threshold"], "Precision": r["precision"], "Recall": r["recall"],
        "Tỷ lệ gắn cờ": r["flagged_share"]} for k, r in metrics["validation"]["thresholds"].items()}, orient="index")
    val_th.index.name = "Ngưỡng hành động"
    grp_view = groups[groups["Biến"] != "arrival_month"]
    report = f"""# Kết quả đánh giá ({split})

> Sinh tự động bởi `python -m src.evaluate{'' if split == 'test' else ' val'}` lúc {summary['evaluated_at']}.
> Mô hình: `{conf['model_version']}` (chọn trên validation: {conf['selected_experiment']}, {conf['params']}).
> Tập {split}: {len(y):,} booking, tỷ lệ hủy {y.mean():.1%}. Khoảng tin cậy 95%: bootstrap theo cụm ngày đến, {n_boot} lần.

## 1. Baseline và mô hình đầy đủ (cùng split, cùng đơn vị booking)

{md_table(comp, "{:.4f}")}

![ROC và PR](figures/fig_roc_pr.png)

## 2. Calibration

- Log loss {res[MAIN]['log_loss']:.4f}, Brier {res[MAIN]['brier']:.4f}.
- Xác suất dự đoán trung bình {p.mean():.3f} so với tỷ lệ hủy thực tế {y.mean():.3f}
  (calibration-in-the-large lệch {p.mean() - y.mean():+.3f}).
- Mô hình `class_weight` còn lại: log loss {res[cw_name]['log_loss']:.4f}, Brier {res[cw_name]['brier']:.4f}.

![Calibration](figures/fig_calibration.png)

## 3. Ba ngưỡng hành động (chọn trên validation, áp dụng nguyên trạng cho {split})

Trên validation (dùng để chọn):

{md_table(val_th)}

Trên {split}:

{md_table(fmt_th)}

![Ma trận nhầm lẫn](figures/fig_confusion_thresholds.png)

## 4. Hệ số và odds ratio (có điều kiện, không suy diễn nhân quả)

Odds ratio của biến số là cho thay đổi từ phân vị 25 → 75 của train (hoặc trung vị → trung vị + 1 nếu hai
phân vị bằng nhau), đã tính qua biến đổi log1p + chuẩn hóa. Biến phân loại so với hạng mục tham chiếu.

{md_table(odds, "{:.3f}")}

![Odds ratio](figures/fig_odds_ratios.png)

## 5. Phân tích lỗi

### 5.1 Theo nhóm (ngưỡng cân bằng F1 = {t_f1:.3f})

{md_table(grp_view, "{:.3f}")}

![Theo nhóm](figures/fig_error_groups.png)

### 5.2 Theo tháng đến

{md_table(groups[groups['Biến'] == 'arrival_month'], "{:.3f}")}

![Theo tháng](figures/fig_monthly.png)

### 5.3 Cơ cấu lỗi theo market_segment (tỷ lệ trong từng loại kết quả)

{md_table(err_mix)}

Cơ cấu theo `deposit_type` (biến KHÔNG có trong mô hình, chỉ dùng để giải thích lỗi):

{md_table(err_dep)}

### 5.4 FP/FN điển hình (tin chắc nhất mà sai)

{md_table(examples, "{:.3f}")}

### 5.5 Ngoài miền

{md_table(pd.DataFrame(ood_rows), "{:.3f}")}

Thử nghiệm ngoại suy `lead_time` cho một booking điển hình (City, Online TA, tháng 8, 2 người lớn, 3 đêm):

{md_table(probe_view, "{:.3f}")}
"""
    (tables / ("results.md" if split == "test" else "results_dryrun.md")).write_text(report, encoding="utf-8")
    print(md_table(comp, "{:.4f}"))
    print(md_table(fmt_th))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "test")
