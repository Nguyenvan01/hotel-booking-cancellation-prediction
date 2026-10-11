const MAIN = "LR đầy đủ (mô hình chính)";
const TH_LABEL = { high_recall: "Ưu tiên recall", balanced_f1: "Cân bằng (F1 max)", capacity: "Theo năng lực gọi (~15%)" };
const f3 = v => v.toFixed(3);
const pct = v => `${(v * 100).toFixed(1)}%`;
const ci = c => `${f3(c[0])}–${f3(c[1])}`;

function table(id, head, rows) {
  const t = document.getElementById(id);
  t.innerHTML = "";
  const tr = document.createElement("tr");
  head.forEach(h => { const th = document.createElement("th"); th.textContent = h; tr.append(th); });
  t.append(tr);
  rows.forEach(r => {
    const row = document.createElement("tr");
    r.forEach(c => { const td = document.createElement("td"); td.textContent = c; row.append(td); });
    t.append(row);
  });
}

fetch("/api/model-info").then(r => r.json()).then(info => {
  const { validation: val, test } = info.metrics;
  document.getElementById("meta").textContent =
    `Phiên bản ${info.model_version} · huấn luyện ${info.trained_at.slice(0, 10)} · LogisticRegression ` +
    `(${info.params.penalty.toUpperCase()}, C = ${info.params.C}, class_weight = ${info.params.class_weight ?? "None"}) · ` +
    `train ${info.split.n_train.toLocaleString("vi-VN")} booking, validation ${info.split.n_val.toLocaleString("vi-VN")}` +
    (test ? `, test ${test.n.toLocaleString("vi-VN")} (đánh giá ${test.evaluated_at.slice(0, 10)})` : "");
  if (!test) { document.getElementById("kpis").textContent = "Chưa chạy đánh giá test (make evaluate)."; return; }

  const m = test.models[MAIN], base = test.models["Baseline: LR chỉ lead_time"];
  const kpis = [
    [f3(m.roc_auc), `ROC-AUC (baseline lead_time: ${f3(base.roc_auc)})`],
    [f3(m.pr_auc), `PR-AUC (tỷ lệ hủy test: ${pct(test.cancel_rate)})`],
    [f3(m.log_loss), `Log loss (baseline prior: ${f3(test.models["Baseline: tỷ lệ hủy chung (prior)"].log_loss)})`],
    [f3(m.brier), "Brier score (càng thấp càng tốt)"],
  ];
  document.getElementById("kpis").innerHTML = "";
  kpis.forEach(([v, l]) => {
    const d = document.createElement("div"); d.className = "kpi";
    d.innerHTML = `<div class="v"></div><div class="l"></div>`;
    d.querySelector(".v").textContent = v; d.querySelector(".l").textContent = l;
    document.getElementById("kpis").append(d);
  });

  const rows = [];
  for (const name of Object.keys(test.models)) {
    for (const [part, src] of [["validation", val.models[name]], ["test", test.models[name]]]) {
      if (src) rows.push([name, part, f3(src.roc_auc), ci(src.ci95.roc_auc), f3(src.pr_auc), f3(src.log_loss), f3(src.brier)]);
    }
  }
  table("t-models", ["Mô hình", "Tập", "ROC-AUC", "CI95", "PR-AUC", "Log loss", "Brier"], rows);

  table("t-thresholds", ["Ngưỡng", "t", "Precision (val → test)", "Recall (val → test)", "Gắn cờ (val → test)", "TP", "FP", "FN", "TN"],
    Object.entries(test.thresholds).map(([k, r]) => {
      const v = val.thresholds[k];
      return [TH_LABEL[k], f3(r.threshold), `${f3(v.precision)} → ${f3(r.precision)}`, `${f3(v.recall)} → ${f3(r.recall)}`,
              `${pct(v.flagged_share)} → ${pct(r.flagged_share)}`, r.tp.toLocaleString("vi-VN"),
              r.fp.toLocaleString("vi-VN"), r.fn.toLocaleString("vi-VN"), r.tn.toLocaleString("vi-VN")];
    }));

  document.getElementById("cap-calib").textContent =
    `Reliability diagram (validation và test) và phân bố xác suất trên test. Xác suất dự đoán trung bình ` +
    `${pct(test.calibration.mean_predicted)} so với tỷ lệ hủy thực tế ${pct(test.calibration.observed_rate)}; ` +
    `log loss ${f3(m.log_loss)}, Brier ${f3(m.brier)}.`;
  document.getElementById("lim-val").textContent = f3(val.models[MAIN].roc_auc);
  document.getElementById("lim-test").textContent = f3(m.roc_auc);
}).catch(() => { document.getElementById("meta").textContent = "Không tải được dữ liệu đánh giá từ API."; });
