import puppeteer from "puppeteer-core"
import fs from "node:fs"

// Kiểm thử end-to-end bằng Chrome headless (puppeteer-core, dùng Chrome có sẵn trên máy).
// Chạy: make app (cổng 8000) rồi  CHROME_PATH=/đường/dẫn/chrome npm run e2e   -> in PASS/FAIL, lưu ảnh vào e2e-shots/
const BASE = process.env.BASE_URL ?? "http://localhost:8000"
const OUT = process.argv[2] ?? "e2e-shots"
fs.mkdirSync(OUT, { recursive: true })
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true, args: ["--no-sandbox", "--lang=vi-VN"] })
const errors = [], checks = [], scroll = {}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const check = (name, ok, extra = "") => checks.push(`${ok ? "PASS" : "FAIL"} ${name}${extra ? " — " + extra : ""}`)

async function newPage(w, h) {
  const p = await browser.newPage()
  await p.setViewport({ width: w, height: h, deviceScaleFactor: 1 })
  p.on("console", (m) => { if (["error", "warn", "warning"].includes(m.type())) errors.push(`[${w}x${h} ${m.type()}] ${m.text().slice(0, 300)}`) })
  p.on("pageerror", (e) => errors.push(`[${w}x${h} pageerror] ${e.message}`))
  return p
}
const text = (p, sel) => p.$eval(sel, (el) => el.textContent).catch(() => null)
async function typeInto(p, sel, value) {
  await p.click(sel, { clickCount: 3 })
  await p.keyboard.press("Backspace")
  if (value) await p.type(sel, value)
  await p.keyboard.press("Tab")
  await sleep(200)
}

const PAGES = [["intro", "/"], ["predict", "/predict"], ["overview", "/evaluation/overview"], ["thresholds", "/evaluation/thresholds"],
  ["calibration", "/evaluation/calibration"], ["odds", "/evaluation/odds"], ["errors", "/evaluation/errors"], ["model-card", "/model-card"], ["data", "/data"]]

// 1) Mọi trang ở 1440x900: chụp ảnh, đo cuộn trang (phải = 0 ở chế độ vừa màn hình)
let p = await newPage(1440, 900)
for (const [name, path] of PAGES) {
  await p.goto(BASE + path, { waitUntil: "networkidle0" })
  await sleep(1600)
  scroll[name] = await p.evaluate(() => document.documentElement.scrollHeight - window.innerHeight)
  await p.screenshot({ path: `${OUT}/1440-${name}.png` })
}

// 2) Luồng chính: booking mẫu -> dự đoán -> nhóm ưu tiên -> dashboard -> model card
await p.goto(BASE + "/predict", { waitUntil: "networkidle0" })
await p.locator("::-p-text(Điền booking mẫu)").click()
await sleep(300)
await p.locator("::-p-text(Rủi ro cao: đoàn đặt sớm)").click()
await sleep(300)
check("demo điền lead_time = 250", (await p.$eval("#f-lead_time", (e) => e.value)) === "250")
await p.click('button[type="submit"]')
await p.waitForFunction(() => document.body.innerText.includes("Ưu tiên xác nhận"), { timeout: 8000 }).catch(() => {})
await sleep(1500)
const body = await p.evaluate(() => document.body.innerText)
check("kết quả có nhóm ưu tiên", /Ưu tiên xác nhận (rất cao|cao|trung bình|thấp)/.test(body))
check("có dòng chú thích cố định", body.includes("không phải quyết định về khách"))
await p.screenshot({ path: `${OUT}/1440-predict-result.png` })
await p.locator("::-p-text(Vì sao ra kết quả này?)").click()
await sleep(900)
await p.screenshot({ path: `${OUT}/1440-predict-explain.png` })
await p.locator("::-p-text(Tổng quan & baseline)").click()
await sleep(1500)
check("điều hướng tới tổng quan", p.url().endsWith("/evaluation/overview"))
await p.locator("::-p-text(Model card)").click()
await sleep(1200)
check("model card render", (await p.evaluate(() => document.querySelectorAll("article h2").length)) >= 8)

// 3) Input xấu
await p.goto(BASE + "/predict", { waitUntil: "networkidle0" })
await typeInto(p, "#f-lead_time", "abc")
check("chữ trong ô số", (await text(p, "#f-lead_time-msg")) === "Phải là số nguyên", await text(p, "#f-lead_time-msg"))
await typeInto(p, "#f-lead_time", "")
check("để trống", (await text(p, "#f-lead_time-msg")) === "Thiếu trường bắt buộc", await text(p, "#f-lead_time-msg"))
await typeInto(p, "#f-lead_time", "-5")
check("số âm", (await text(p, "#f-lead_time-msg"))?.startsWith("Phải ≥ 0"), await text(p, "#f-lead_time-msg"))
await typeInto(p, "#f-lead_time", "1.5")
check("số thập phân", (await text(p, "#f-lead_time-msg")) === "Phải là số nguyên", await text(p, "#f-lead_time-msg"))
let posts = 0
p.on("request", (r) => { if (r.method() === "POST") posts++ })
await p.click('button[type="submit"]')
await sleep(800)
check("form thiếu/sai không gửi request", posts === 0, `POST = ${posts}`)
await p.locator("::-p-text(Điền booking mẫu)").click(); await sleep(300)
await p.locator("::-p-text(Rủi ro trung bình)").click(); await sleep(300)
await typeInto(p, "#f-lead_time", "900")
check("gắn nhãn ngoài miền", (await p.evaluate(() => document.querySelector('label[for="f-lead_time"]').innerText)).includes("ngoài miền"))
await p.click('button[type="submit"]')
await p.waitForFunction(() => document.body.innerText.includes("ngoài miền dữ liệu train"), { timeout: 8000 }).catch(() => {})
check("ngoài miền vẫn gửi và hiện cảnh báo API", (await p.evaluate(() => document.body.innerText)).includes("ngoài miền dữ liệu train"))
await sleep(1200)
await p.screenshot({ path: `${OUT}/1440-predict-ood.png` })
const api = await p.evaluate(async () => {
  const info = await (await fetch("/api/model-info")).json()
  const base = info.demo_bookings[0].booking
  const r1 = await fetch("/api/cancellation-risk", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...base, market_segment: "Undefined" }) })
  const r2 = await fetch("/api/cancellation-risk", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{oops" })
  return [r1.status, r2.status]
})
check("Select không hợp lệ qua API -> 422, JSON hỏng -> 400", api[0] === 422 && api[1] === 400, api.join(","))
check("app vẫn sống sau input xấu", (await p.evaluate(async () => (await fetch("/api/health")).status)) === 200)

// 4) Tìm kiếm không dấu (Ctrl+K) -> nhảy tới dòng odds ratio
await p.keyboard.down("Control"); await p.keyboard.press("k"); await p.keyboard.up("Control")
await sleep(400)
await p.keyboard.type("thoi gian dat truoc")
await sleep(400)
await p.screenshot({ path: `${OUT}/1440-search.png` })
await p.keyboard.press("Enter")
await sleep(500)
check("tìm không dấu nhảy tới odds", p.url().includes("/evaluation/odds?focus=lead_time"), p.url())
check("dòng được nháy", (await p.$$(".flash-row")).length > 0)
await sleep(1500)

// 5) Các khung nhìn khác cho 3 màn hình chính
for (const [w, h] of [[1280, 800], [1024, 768], [390, 844]]) {
  const q = await newPage(w, h)
  for (const [name, path] of [["intro", "/"], ["predict", "/predict?demo=high"], ["overview", "/evaluation/overview"]]) {
    await q.goto(BASE + path, { waitUntil: "networkidle0" })
    await sleep(2200)
    await q.screenshot({ path: `${OUT}/${w}-${name}.png`, fullPage: w === 390 })
    if (w >= 900) scroll[`${w}x${h}-${name}`] = await q.evaluate(() => document.documentElement.scrollHeight - window.innerHeight)
    const overflowX = await q.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    if (overflowX > 0) check(`không cuộn ngang ${w} ${name}`, false, `${overflowX}px`)
  }
  if (w === 390) {
    await q.goto(BASE + "/", { waitUntil: "networkidle0" })
    await q.click('button[aria-label="Mở điều hướng"]')
    await sleep(600)
    await q.screenshot({ path: `${OUT}/390-drawer.png` })
    check("ngăn kéo điều hướng mở", (await q.$$('[role="dialog"]')).length > 0)
  }
  await q.close()
}
console.log(JSON.stringify({ checks, scroll, errors }, null, 1))
await browser.close()
process.exit(checks.some((c) => c.startsWith("FAIL")) ? 1 : 0)
