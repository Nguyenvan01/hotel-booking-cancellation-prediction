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

form.addEventListener("submit", async ev => {
  ev.preventDefault();
  clearErrors();
  statusEl.textContent = "Đang tính…";
  try {
    const resp = await fetch("/api/cancellation-risk", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(readForm()) });
    const data = await resp.json();
    if (!resp.ok) { document.getElementById("result").classList.remove("show"); showErrors(data.detail); return; }
    statusEl.textContent = "";
    showResult(data);
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
