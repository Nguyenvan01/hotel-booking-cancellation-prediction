// Form được sinh từ JSON Schema của API (/api/model-info) nên miền giá trị và hạng mục luôn khớp với backend.
const DEMOS = [
  { hotel: "City Hotel", lead_time: 3, arrival_date_month: "March", stays_in_weekend_nights: 0, stays_in_week_nights: 2,
    adults: 1, children: 0, babies: 0, meal: "BB", market_segment: "Corporate", distribution_channel: "Corporate",
    reserved_room_type: "A", customer_type: "Transient", is_repeated_guest: true, previous_cancellations: 0,
    previous_bookings_not_canceled: 4 },
  { hotel: "Resort Hotel", lead_time: 60, arrival_date_month: "August", stays_in_weekend_nights: 2, stays_in_week_nights: 5,
    adults: 2, children: 1, babies: 0, meal: "HB", market_segment: "Online TA", distribution_channel: "TA/TO",
    reserved_room_type: "D", customer_type: "Transient", is_repeated_guest: false, previous_cancellations: 0,
    previous_bookings_not_canceled: 0 },
  { hotel: "City Hotel", lead_time: 250, arrival_date_month: "October", stays_in_weekend_nights: 0, stays_in_week_nights: 3,
    adults: 2, children: 0, babies: 0, meal: "BB", market_segment: "Groups", distribution_channel: "TA/TO",
    reserved_room_type: "A", customer_type: "Transient", is_repeated_guest: false, previous_cancellations: 1,
    previous_bookings_not_canceled: 0 },
  { hotel: "City Hotel", lead_time: 900, arrival_date_month: "May", stays_in_weekend_nights: 1, stays_in_week_nights: 2,
    adults: 2, children: 0, babies: 0, meal: "BB", market_segment: "Online TA", distribution_channel: "TA/TO",
    reserved_room_type: "A", customer_type: "Transient", is_repeated_guest: false, previous_cancellations: 0,
    previous_bookings_not_canceled: 0 },
];
const GROUP_ICON = { "Rất cao": "▲▲", "Cao": "▲", "Trung bình": "●", "Thấp": "▼" };
const THRESHOLD_LABEL = { high_recall: "ưu tiên recall", balanced_f1: "cân bằng F1", capacity: "năng lực gọi" };
const form = document.getElementById("booking-form");
const fieldsBox = document.getElementById("fields");
const statusEl = document.getElementById("form-status");
let schema;

function el(tag, attrs = {}, text) {
  const e = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v));
  if (text !== undefined) e.textContent = text;
  return e;
}

function buildForm(s) {
  schema = s;
  fieldsBox.replaceChildren();
  for (const [name, prop] of Object.entries(s.properties)) {
    const wrap = el("div", { class: "field", id: `f-${name}` });
    const label = el("label", { for: name }, prop.title || name);
    let hint = prop.description || "";
    let input;
    if (prop.enum) {
      input = el("select", { id: name, name });
      input.append(el("option", { value: "" }, "— chọn —"), ...prop.enum.map(v => el("option", { value: v }, v)));
    } else if (prop.type === "boolean") {
      input = el("select", { id: name, name, "data-type": "boolean" });
      input.append(el("option", { value: "" }, "— chọn —"), el("option", { value: "true" }, "Có"),
                   el("option", { value: "false" }, "Không"));
    } else {
      input = el("input", { id: name, name, type: "number", step: "1", min: prop.minimum, max: prop.maximum,
                            inputmode: "numeric", "data-type": "integer" });
    }
    const err = el("span", { class: "err", id: `e-${name}`, "aria-live": "polite" });
    input.setAttribute("aria-describedby", `h-${name} e-${name}`);
    wrap.append(label, el("span", { class: "hint", id: `h-${name}` }, hint), input, err);
    fieldsBox.append(wrap);
  }
}

function readForm() {
  const body = {};
  for (const [name, prop] of Object.entries(schema.properties)) {
    const raw = form.elements[name].value.trim();
    if (raw === "") continue;  // để trống -> API báo "Thiếu trường bắt buộc", không tự điền
    if (prop.type === "boolean") body[name] = raw === "true";
    else if (prop.type === "integer") body[name] = Number(raw);  // 1.5 vẫn gửi 1.5 -> API báo lỗi, không làm tròn
    else body[name] = raw;
  }
  return body;
}

function clearErrors() {
  document.querySelectorAll(".field").forEach(f => f.classList.remove("invalid"));
  document.querySelectorAll(".err").forEach(e => (e.textContent = ""));
}

function showErrors(detail) {
  const list = Array.isArray(detail) ? detail : [{ field: "body", message: String(detail) }];
  let general = [];
  for (const d of list) {
    const box = document.getElementById(`f-${d.field}`);
    if (box) { box.classList.add("invalid"); document.getElementById(`e-${d.field}`).textContent = d.message; }
    else general.push(d.message);
  }
  statusEl.textContent = `Có ${list.length} lỗi cần sửa. ${general.join(" ")}`;
  const first = document.querySelector(".field.invalid input, .field.invalid select");
  if (first) first.focus();
}

function showResult(r) {
  document.getElementById("r-prob").textContent = `${(r.probability * 100).toFixed(1)}%`;
  const badge = document.getElementById("r-group");
  badge.dataset.group = r.risk_group;
  badge.textContent = `${GROUP_ICON[r.risk_group]} Ưu tiên: ${r.risk_group}`;
  document.getElementById("r-action").textContent = `Gợi ý: ${r.action}`;
  document.getElementById("r-threshold").textContent =
    `Ngưỡng xác định nhóm: ${(r.threshold_used * 100).toFixed(1)}%. Ba ngưỡng (chọn trên validation): ` +
    Object.entries(r.thresholds).map(([k, v]) => `${THRESHOLD_LABEL[k]} ${(v * 100).toFixed(1)}%`).join(" · ");
  document.getElementById("r-version").textContent = `Phiên bản mô hình: ${r.model_version}`;
  const scale = document.getElementById("r-scale");
  scale.replaceChildren();
  for (const [k, v] of Object.entries(r.thresholds)) {
    const t = el("div", { class: "tick" }); t.style.left = `${v * 100}%`;
    t.append(el("span", {}, `${Math.round(v * 100)}%`)); scale.append(t);
  }
  const m = el("div", { class: "marker", title: "Booking này" }); m.style.left = `${r.probability * 100}%`; scale.append(m);
  const w = document.getElementById("r-warnings");
  w.replaceChildren();
  if (r.warnings.length) {
    const box = el("div", { class: "notice", role: "alert" });
    box.append(el("strong", {}, "Cảnh báo về đầu vào:"));
    const ul = el("ul", { class: "warnings" });
    r.warnings.forEach(x => ul.append(el("li", {}, x)));
    box.append(ul); w.append(box);
  }
  const res = document.getElementById("result");
  res.classList.add("show");
  res.scrollIntoView({ behavior: "smooth", block: "start" });
}

const SVGNS = "http://www.w3.org/2000/svg";
function svg(tag, attrs = {}, text) {
  const e = document.createElementNS(SVGNS, tag);
  Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v));
  if (text !== undefined) e.textContent = text;
  return e;
}
const fmtVal = v => (v === true ? "có" : v === false ? "không" : String(v));

function renderContrib(ex) {
  const top = ex.contributions.slice(0, 8);
  const rest = ex.contributions.slice(8).reduce((s, c) => s + c.contribution, 0);
  const rows = [...top.map(c => ({ label: `${c.label} = ${fmtVal(c.value)}`, v: c.contribution })),
                { label: `Các biến còn lại (${ex.contributions.length - 8})`, v: rest }];
  const W = 560, rowH = 26, left = 250, right = 60, H = rows.length * rowH + 10;
  const max = Math.max(...rows.map(r => Math.abs(r.v)), 0.1);
  const mid = left + (W - left - right) / 2, half = (W - left - right) / 2;
  const root = svg("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Đóng góp của từng biến vào log-odds" });
  root.append(svg("line", { class: "zero", x1: mid, x2: mid, y1: 0, y2: H }));
  rows.forEach((r, i) => {
    const y = i * rowH + 5, w = Math.abs(r.v) / max * half;
    const bar = svg("rect", { class: r.v >= 0 ? "up" : "down", x: r.v >= 0 ? mid : mid - w, y: y + 4, width: Math.max(w, 1),
                              height: rowH - 10, rx: 3 });
    bar.append(svg("title", {}, `${r.label}: ${r.v >= 0 ? "+" : ""}${r.v.toFixed(3)} log-odds`));
    root.append(svg("text", { x: left - 8, y: y + rowH / 2 + 3, "text-anchor": "end" }, r.label), bar,
                svg("text", { x: r.v >= 0 ? mid + w + 4 : mid - w - 4, y: y + rowH / 2 + 3,
                              "text-anchor": r.v >= 0 ? "start" : "end" }, `${r.v >= 0 ? "+" : ""}${r.v.toFixed(2)}`));
  });
  document.getElementById("r-contrib").replaceChildren(root);
  const total = ex.contributions.reduce((s, c) => s + c.contribution, 0), z = ex.intercept + total;
  document.getElementById("r-formula").textContent =
    `log-odds = hệ số chặn (${ex.intercept.toFixed(2)}) + tổng đóng góp (${total >= 0 ? "+" : ""}${total.toFixed(2)}) = ` +
    `${z.toFixed(2)} → p = 1 / (1 + e^(${(-z).toFixed(2)})) = ${(ex.probability * 100).toFixed(1)}%`;
}

function renderCurve(ex, booking, thresholds) {
  const W = 560, H = 260, L = 44, R = 16, T = 12, B = 36;
  const xmax = Math.max(ex.train_lead_time_max, booking.lead_time);
  const x = v => L + v / xmax * (W - L - R), y = p => T + (1 - p) * (H - T - B);
  const root = svg("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Xác suất hủy theo lead time" });
  if (booking.lead_time > ex.train_lead_time_max) {
    root.append(svg("rect", { class: "ood", x: x(ex.train_lead_time_max), y: T, width: x(xmax) - x(ex.train_lead_time_max), height: H - T - B }));
    root.append(svg("text", { x: x(ex.train_lead_time_max) + 4, y: T + 14 }, "ngoài miền train"));
  }
  [0, 0.25, 0.5, 0.75, 1].forEach(p => {
    root.append(svg("line", { class: "axis", x1: L, x2: W - R, y1: y(p), y2: y(p) }));
    root.append(svg("text", { x: L - 6, y: y(p) + 4, "text-anchor": "end" }, `${p * 100}%`));
  });
  [0, 90, 180, 365, 540, ex.train_lead_time_max].forEach(v =>
    root.append(svg("text", { x: x(v), y: H - B + 16, "text-anchor": "middle" }, String(v))));
  root.append(svg("text", { x: (L + W - R) / 2, y: H - 4, "text-anchor": "middle" }, "lead time (ngày)"));
  Object.entries(thresholds).forEach(([k, t]) => {
    root.append(svg("line", { class: "th", x1: L, x2: W - R, y1: y(t), y2: y(t) }));
    root.append(svg("text", { x: W - R, y: y(t) - 4, "text-anchor": "end" }, `${THRESHOLD_LABEL[k]} ${Math.round(t * 100)}%`));
  });
  root.append(svg("polyline", { class: "line", points: ex.lead_time_curve.map(d => `${x(d.lead_time)},${y(d.probability)}`).join(" ") }));
  const dot = svg("circle", { class: "dot", cx: x(booking.lead_time), cy: y(ex.probability), r: 6 });
  dot.append(svg("title", {}, `Booking này: lead time ${booking.lead_time} ngày, xác suất ${(ex.probability * 100).toFixed(1)}%`));
  root.append(dot);
  document.getElementById("r-curve").replaceChildren(root);
}

async function explain(booking, thresholds) {
  try {
    const resp = await fetch("/api/explain", { method: "POST", headers: { "Content-Type": "application/json" },
                                               body: JSON.stringify(booking) });
    if (!resp.ok) return;
    const ex = await resp.json();
    renderContrib(ex);
    renderCurve(ex, booking, thresholds);
  } catch (e) { /* phần giải thích là phụ; kết quả chính vẫn hiển thị */ }
}

form.addEventListener("submit", async ev => {
  ev.preventDefault();
  clearErrors();
  statusEl.textContent = "Đang tính…";
  const body = readForm();
  try {
    const resp = await fetch("/api/cancellation-risk", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await resp.json();
    if (!resp.ok) { document.getElementById("result").classList.remove("show"); showErrors(data.detail); return; }
    statusEl.textContent = "";
    showResult(data);
    explain(body, data.thresholds);
  } catch (e) {
    statusEl.textContent = "Không kết nối được tới API. Kiểm tra server đang chạy.";
  }
});

form.addEventListener("reset", () => { clearErrors(); statusEl.textContent = ""; document.getElementById("result").classList.remove("show"); });

document.querySelectorAll("[data-demo]").forEach(btn => btn.addEventListener("click", () => {
  clearErrors();
  for (const [k, v] of Object.entries(DEMOS[btn.dataset.demo])) form.elements[k].value = String(v);
  statusEl.textContent = `Đã điền booking mẫu: ${btn.textContent}`;
}));

fetch("/api/model-info").then(r => r.json()).then(info => {
  buildForm(info.input_schema);
  const demo = new URLSearchParams(location.search).get("demo");  // /predict?demo=2: điền mẫu và gửi luôn (demo)
  if (demo !== null) { document.querySelector(`[data-demo="${demo}"]`)?.click(); form.requestSubmit(); }
  const test = info.metrics.test;
  document.getElementById("test-auc").textContent = test ? test.models["LR đầy đủ (mô hình chính)"].roc_auc.toFixed(3) : "(chưa đánh giá)";
})
  .catch(() => { fieldsBox.textContent = "Không tải được schema từ API."; });
