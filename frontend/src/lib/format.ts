// Số kiểu Việt Nam: dấu chấm ngăn nghìn, dấu phẩy thập phân. Không có số liệu -> "—" (không tự điền 0).
const nf = (digits: number) =>
  new Intl.NumberFormat("vi-VN", { minimumFractionDigits: digits, maximumFractionDigits: digits })
const NF0 = nf(0), NF1 = nf(1), NF3 = nf(3)

export const NA = "—"
const ok = (v: number | null | undefined): v is number => typeof v === "number" && Number.isFinite(v)

export const fmtInt = (v: number | null | undefined) => (ok(v) ? NF0.format(v) : NA)
export const fmt3 = (v: number | null | undefined) => (ok(v) ? NF3.format(v) : NA)
export const fmtPct = (v: number | null | undefined) => (ok(v) ? `${NF1.format(v * 100)}%` : NA)
export const fmtSigned3 = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${NF3.format(Math.abs(v))}`
export const fmtDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" }) : NA
export const fmtNum = (v: number, digits = 3) => (ok(v) ? nf(digits).format(v) : NA)

/** Bỏ dấu tiếng Việt + chữ thường, để tìm kiếm không dấu. */
export const normalize = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase()

/** Các khoảng [start, end) trong chuỗi gốc khớp với truy vấn (so khớp không dấu). */
export function matchRanges(text: string, query: string): [number, number][] {
  const q = normalize(query.trim())
  if (!q) return []
  const chars = Array.from(text)
  const map: number[] = []
  let norm = ""
  chars.forEach((c, i) => {
    const n = normalize(c)
    norm += n
    for (let k = 0; k < n.length; k++) map.push(i)
  })
  const out: [number, number][] = []
  for (let at = norm.indexOf(q); at !== -1; at = norm.indexOf(q, at + q.length)) {
    const s = map[at], e = map[at + q.length - 1] + 1
    out.push([chars.slice(0, s).join("").length, chars.slice(0, e).join("").length])
  }
  return out
}

export const matches = (query: string, ...texts: (string | null | undefined)[]) => {
  const q = normalize(query.trim())
  return !q || texts.some((t) => t && normalize(t).includes(q))
}
