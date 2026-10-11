import { Fragment, useCallback, useMemo, useState, type ReactNode } from "react"
import { motion } from "motion/react"
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer,
  Tooltip as ChartTooltip, XAxis, YAxis,
} from "recharts"
import { type ColumnDef } from "@tanstack/react-table"
import { Activity, ArrowUp, ChartLine, CircleDot, Download, Info, Search, Sigma, Target } from "lucide-react"
import {
  DatasetBadge, EmptyState, Frame, HelpTip, Highlight, KpiCard, LoadingBlock, METRIC_HELP, Mono, PageHeader, SrTable,
  VarLabel, fadeUp,
} from "@/components/common"
import { DataTable, NumCell, type ColMeta } from "@/components/data-table"
import { buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { useMetrics, type CalBin, type ErrorRow, type Metrics, type ModelId, type OddsRow, type ThresholdKey } from "@/lib/api"
import { fmt3, fmtInt, fmtNum, fmtPct, fmtSigned3, matches } from "@/lib/format"
import { useDebounced, useFocusRow } from "@/lib/hooks"
import { cn } from "@/lib/utils"

const MODEL_LABEL: Record<ModelId, string> = {
  prior: "Tỷ lệ hủy chung", lead_time: "Logistic chỉ lead_time", main: "Logistic đầy đủ", balanced: "Logistic đầy đủ, class_weight = balanced",
}
const TH_INFO: Record<ThresholdKey, { name: string; desc: string }> = {
  high_recall: { name: "Ưu tiên recall", desc: "Ngưỡng cao nhất vẫn bắt ≥ 90% booking hủy (validation)" },
  balanced_f1: { name: "Cân bằng", desc: "Ngưỡng có F1 lớn nhất (validation)" },
  capacity: { name: "Theo năng lực gọi", desc: "Gắn cờ khoảng 15% booking rủi ro nhất (validation)" },
}
const C = { main: "var(--chart-main)", base: "var(--chart-base)", random: "var(--chart-random)", th: "var(--chart-threshold)", neutral: "var(--chart-neutral)" }
const AXIS = { fontSize: 12, stroke: "#94a3b8" }
const pctTick = (v: number) => `${Math.round(v * 100)}%`
const UNIT_TICKS = [0, 0.2, 0.4, 0.6, 0.8, 1]
const downloadMetrics = (
  <a href="/api/files/metrics.json" download className={cn(buttonVariants({ variant: "outline" }), "h-9 rounded-full px-4")}><Download /> Tải metrics.json</a>
)

/** Khung chờ/lỗi chung cho các trang đánh giá: số liệu chỉ đến từ /api/metrics, thiếu thì hiện Empty. */
function WithMetrics({ title, description, children }: { title: string; description: string; children: (m: Metrics) => ReactNode }) {
  const q = useMetrics()
  return (
    <div className="flex h-full flex-col gap-4">
      <PageHeader title={title} description={description} actions={q.data?.test ? downloadMetrics : undefined} />
      {q.isLoading ? <LoadingBlock rows={8} /> : q.isError || !q.data ? (
        <EmptyState icon={ChartLine} title="Không tải được số liệu đánh giá" description="Kiểm tra máy chủ FastAPI đang chạy rồi tải lại trang." />
      ) : !q.data.test ? (
        <EmptyState icon={ChartLine} title="Chưa có kết quả trên tập test" description="Chạy make evaluate để sinh models/metrics.json và reports/curves.json." />
      ) : children(q.data)}
    </div>
  )
}

function ChartLegend({ items }: { items: { label: string; color: string; dashed?: boolean }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          <svg width="18" height="6" aria-hidden><line x1="0" y1="3" x2="18" y2="3" stroke={i.color} strokeWidth="2.5" strokeDasharray={i.dashed ? "4 3" : undefined} /></svg>
          {i.label}
        </li>
      ))}
    </ul>
  )
}

const toXY = (pts?: [number, number][]) => (pts ?? []).map(([x, y]) => ({ x, y }))

// ======================================================================================= Tổng quan & baseline
function CompareTable({ m }: { m: Metrics }) {
  const rows: ModelId[] = ["prior", "lead_time", "main"]
  const metrics = ["roc_auc", "pr_auc", "log_loss"] as const
  const head = { roc_auc: "ROC-AUC", pr_auc: "PR-AUC", log_loss: "Log loss" }
  const groups = [
    { key: "validation" as const, label: "Validation (chọn)", bg: "#e8f3ff", bar: "#3b82f6", data: m.validation?.models },
    { key: "test" as const, label: "Test (kết luận)", bg: "#ecfdf5", bar: "#10b981", data: m.test?.models },
  ]
  return (
    <div className="min-h-0 overflow-auto rounded-xl border border-[#e2e8f0]">
      <table className="w-full border-separate border-spacing-0 text-sm">
        <thead className="sticky top-0 z-20">
          <tr>
            <th rowSpan={2} scope="col" className="sticky left-0 z-30 border-r border-b border-r-[#cbd5e1] border-[#e2e8f0] bg-[#eaf2fb] px-3 text-left text-xs font-bold text-[#334155]">Mô hình</th>
            {groups.map((g) => (
              <th key={g.key} colSpan={3} scope="colgroup" className="h-8 border-r border-b border-r-[#cbd5e1] border-[#e2e8f0] px-3 text-center text-xs font-bold text-[#334155]"
                style={{ background: g.bg, boxShadow: `inset 0 3px 0 ${g.bar}` }}>{g.label}</th>
            ))}
          </tr>
          <tr>
            {groups.map((g) => metrics.map((k, i) => (
              <th key={g.key + k} scope="col" className={cn("h-8 border-b border-[#e2e8f0] bg-[#f4f7fb] px-3 text-right text-xs font-semibold whitespace-nowrap text-[#475569]", i === 2 && "border-r border-r-[#cbd5e1]")}>
                <span className="inline-flex items-center gap-1">{head[k]}<HelpTip content={METRIC_HELP[k]} /></span>
              </th>
            )))}
          </tr>
        </thead>
        <tbody>
          {rows.map((id, ri) => {
            const main = id === "main"
            return (
              <motion.tr key={id} {...fadeUp(ri)} className="group/row">
                <th scope="row" className={cn("sticky left-0 z-10 h-[40px] border-r border-b border-r-[#cbd5e1] border-[#e2e8f0] px-3 text-left font-medium whitespace-nowrap",
                  main ? "bg-[#eef4ff] font-semibold text-[#1e3a5f]" : ri % 2 ? "bg-[#fafcff]" : "bg-card")}>{MODEL_LABEL[id]}</th>
                {groups.map((g) => metrics.map((k, i) => {
                  const s = g.data?.[id]
                  const ci = s?.ci95?.[k]
                  return (
                    <td key={g.key + k} className={cn("h-[40px] border-b border-[#e2e8f0] px-3 text-right tnum whitespace-nowrap group-hover/row:bg-[#f1f5f9]",
                      main ? "bg-[#eef4ff] font-semibold text-[#1e3a5f]" : ri % 2 ? "bg-[#fafcff]" : "bg-card", i === 2 && "border-r border-r-[#cbd5e1]")}>
                      <span className="font-medium"><NumCell value={s?.[k]} format={fmt3} /></span>
                      {ci && id !== "prior" && <span className="ml-1.5 text-xs font-normal text-muted-foreground">({fmt3(ci[0])}–{fmt3(ci[1])})</span>}
                    </td>
                  )
                }))}
              </motion.tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function CurveChart({ m, kind }: { m: Metrics; kind: "roc" | "pr" }) {
  const cur = m.curves?.[kind]
  if (!cur?.main) return <EmptyState icon={ChartLine} title="Chưa có dữ liệu đường cong" description="Chạy make evaluate để sinh reports/curves.json." />
  const s = m.test!.models
  const metric = kind === "roc" ? "roc_auc" : "pr_auc"
  const items = [
    { id: "main" as const, color: C.main, width: 2.5 },
    { id: "lead_time" as const, color: C.base, width: 2 },
    { id: "prior" as const, color: C.random, width: 1.5, dashed: true },
  ]
  return (
    <div className="flex h-full flex-col gap-2">
      <div className="min-h-[220px] flex-1">
        <ResponsiveContainer>
          <LineChart margin={{ top: 4, right: 12, left: -8, bottom: 4 }}>
            <CartesianGrid stroke="#e9edf3" />
            <XAxis type="number" dataKey="x" domain={[0, 1]} ticks={UNIT_TICKS} tickFormatter={(v) => fmtNum(v, 1)} {...AXIS}
              label={{ value: kind === "roc" ? "False positive rate" : "Recall", position: "insideBottom", offset: -2, fontSize: 12, fill: "#64748b" }} height={36} />
            <YAxis type="number" domain={[0, 1]} ticks={UNIT_TICKS} tickFormatter={(v) => fmtNum(v, 1)} {...AXIS} width={40}
              label={{ value: kind === "roc" ? "True positive rate" : "Precision", angle: -90, position: "insideLeft", offset: 14, fontSize: 12, fill: "#64748b" }} />
            <ChartTooltip formatter={(v) => fmt3(Number(v))} labelFormatter={(l) => `${kind === "roc" ? "FPR" : "Recall"} ${fmt3(Number(l))}`} />
            {items.map((i) => (
              <Line key={i.id} data={toXY(cur[i.id])} dataKey="y" name={MODEL_LABEL[i.id]} stroke={i.color} strokeWidth={i.width}
                strokeDasharray={i.dashed ? "5 4" : undefined} dot={false} isAnimationActive />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <ChartLegend items={items.map((i) => ({ label: `${i.id === "prior" ? "Ngẫu nhiên / tỷ lệ chung" : MODEL_LABEL[i.id]} (${fmt3(s[i.id]?.[metric])})`, color: i.color, dashed: i.dashed }))} />
      <SrTable caption={`Đường ${kind.toUpperCase()} trên test`} columns={["Mô hình", kind === "roc" ? "ROC-AUC" : "PR-AUC"]}
        rows={items.map((i) => [MODEL_LABEL[i.id], fmt3(s[i.id]?.[metric])])} />
    </div>
  )
}

export function OverviewPage() {
  return (
    <WithMetrics title="Tổng quan & baseline" description="So sánh mô hình chính với hai baseline trên cùng split và cùng đơn vị booking.">
      {(m) => {
        const t = m.test!.models
        const kpis = [
          { k: "roc_auc" as const, label: "ROC-AUC", icon: Activity, higher: true },
          { k: "pr_auc" as const, label: "PR-AUC", icon: Target, higher: true },
          { k: "log_loss" as const, label: "Log loss", icon: Sigma, higher: false },
          { k: "brier" as const, label: "Brier score", icon: CircleDot, higher: false },
        ]
        return (
          <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 nav:grid-cols-12 nav:grid-rows-[auto_auto_minmax(0,1fr)]">
            <div className="grid grid-cols-2 gap-4 nav:col-span-12 nav:grid-cols-4">
              {kpis.map((kp, i) => {
                const main = t.main?.[kp.k]
                const bases = (["prior", "lead_time"] as const).filter((b) => typeof t[b]?.[kp.k] === "number")
                const best = bases.sort((a, b) => (kp.higher ? t[b]![kp.k] - t[a]![kp.k] : t[a]![kp.k] - t[b]![kp.k]))[0]
                const diff = main !== undefined && best ? main - t[best]![kp.k] : undefined
                const better = diff !== undefined && (kp.higher ? diff > 0 : diff < 0)
                return (
                  <KpiCard key={kp.k} index={i} label={`${kp.label} · test`} value={main} format={fmt3} icon={kp.icon} help={METRIC_HELP[kp.k]}
                    note={diff !== undefined ? `${fmtSigned3(diff)} so với ${MODEL_LABEL[best].toLowerCase()}` : undefined}
                    noteTone={diff === undefined ? "muted" : better ? "better" : "worse"} />
                )
              })}
            </div>
            <Frame index={4} title="Bảng so sánh" badge={<span className="text-xs text-muted-foreground">Khoảng 95%: bootstrap theo cụm ngày đến</span>}
              className="nav:col-span-12 !py-5" bodyClassName="flex flex-col">
              <CompareTable m={m} />
              <p className="mt-2 text-xs text-muted-foreground">Validation dùng để chọn tham số và ngưỡng; test chỉ chạy một lần để kết luận. Kết quả test thấp hơn validation do trôi theo thời gian (xem Phân tích lỗi).</p>
            </Frame>
            <Frame index={5} title="Đường ROC" badge={<DatasetBadge set="test" />} className="nav:col-span-6"><CurveChart m={m} kind="roc" /></Frame>
            <Frame index={6} title="Đường Precision–Recall" badge={<DatasetBadge set="test" />} className="nav:col-span-6"><CurveChart m={m} kind="pr" /></Frame>
          </div>
        )
      }}
    </WithMetrics>
  )
}

// ======================================================================================= Ngưỡng hành động
function Confusion({ s }: { s: { tn: number; fp: number; fn: number; tp: number } }) {
  const total = s.tn + s.fp + s.fn + s.tp
  const cell = (v: number, ok: boolean, label: string) => (
    <div className={cn("flex items-baseline justify-center gap-1.5 rounded-lg px-2 py-1.5", ok ? "bg-[#edf3ff]" : "bg-muted")} aria-label={`${label}: ${fmtInt(v)} booking`}>
      <span className="text-sm font-semibold tnum">{fmtInt(v)}</span>
      <span className="text-xs text-muted-foreground tnum">{fmtPct(v / total)}</span>
    </div>
  )
  return (
    <div className="grid grid-cols-[auto_1fr_1fr] gap-1.5 text-xs">
      <div className="text-muted-foreground">Thực tế ↓ / Dự đoán →</div>
      <div className="text-center text-muted-foreground">Không hủy</div>
      <div className="text-center text-muted-foreground">Hủy</div>
      <div className="self-center pr-1 text-muted-foreground">Không hủy</div>
      {cell(s.tn, true, "Đúng không hủy")}{cell(s.fp, false, "Gắn cờ nhầm")}
      <div className="self-center pr-1 text-muted-foreground">Hủy</div>
      {cell(s.fn, false, "Bỏ sót")}{cell(s.tp, true, "Gắn cờ đúng")}
    </div>
  )
}

function ThresholdExplorer({ m }: { m: Metrics }) {
  const curve = m.validation?.threshold_curve
  const th = m.validation!.thresholds
  const [t, setT] = useState(th.balanced_f1.threshold)
  if (!curve?.length) return <EmptyState icon={ChartLine} title="Chưa có đường theo ngưỡng" description="Chạy make train để lưu threshold_curve vào models/metrics.json." />
  const near = curve.reduce((a, b) => (Math.abs(b.threshold - t) < Math.abs(a.threshold - t) ? b : a))
  return (
    <div className="flex h-full flex-col gap-3">
      <div className="min-h-[140px] flex-1">
        <ResponsiveContainer>
          <LineChart data={curve} margin={{ top: 16, right: 12, left: 0, bottom: 4 }}>
            <CartesianGrid stroke="#e9edf3" />
            <XAxis type="number" dataKey="threshold" domain={[0, 1]} ticks={UNIT_TICKS} tickFormatter={(v) => fmtNum(v, 1)} {...AXIS}
              label={{ value: "Ngưỡng xác suất", position: "insideBottom", offset: -2, fontSize: 12, fill: "#64748b" }} height={36} />
            <YAxis domain={[0, 1]} ticks={UNIT_TICKS} tickFormatter={pctTick} {...AXIS} width={48} />
            <ChartTooltip formatter={(v, n) => [fmtPct(Number(v)), n]} labelFormatter={(l) => `Ngưỡng ${fmt3(Number(l))}`} />
            {(Object.keys(TH_INFO) as ThresholdKey[]).map((k) => (
              <ReferenceLine key={k} x={th[k].threshold} stroke={C.th} strokeWidth={2} label={{ value: TH_INFO[k].name, position: "top", fontSize: 11, fill: "#92400e" }} />
            ))}
            <ReferenceLine x={near.threshold} stroke={C.main} strokeDasharray="3 3" />
            <Line dataKey="precision" name="Precision" stroke={C.main} strokeWidth={2.5} dot={false} connectNulls={false} />
            <Line dataKey="recall" name="Recall" stroke={C.base} strokeWidth={2.5} dot={false} />
            <Line dataKey="flagged_share" name="Tỷ lệ gắn cờ" stroke={C.random} strokeWidth={2} strokeDasharray="5 4" dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <ChartLegend items={[{ label: "Precision", color: C.main }, { label: "Recall", color: C.base }, { label: "Tỷ lệ gắn cờ", color: C.random, dashed: true }, { label: "3 ngưỡng đã chọn", color: C.th }]} />
      <div className="flex flex-col gap-2 rounded-xl border bg-muted/50 p-3 nav:flex-row nav:items-center nav:gap-4">
        <div className="w-full nav:max-w-72">
          <label className="mb-2 block text-xs font-medium" htmlFor="th-slider">Thử ngưỡng khác: <span className="tnum">{fmt3(near.threshold)}</span></label>
          <Slider id="th-slider" min={0.01} max={0.99} step={0.01} value={[t]} onValueChange={(v) => setT(Array.isArray(v) ? v[0] : v)} aria-label="Ngưỡng thử" />
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm tnum" aria-live="polite">
          <span>Precision <b><NumCell value={near.precision} format={fmtPct} /></b></span>
          <span>Recall <b>{fmtPct(near.recall)}</b></span>
          <span>Gắn cờ <b>{fmtPct(near.flagged_share)}</b></span>
        </div>
        <p className="text-xs text-muted-foreground nav:ml-auto nav:max-w-60">Khám phá trên đường validation đã tính sẵn; không thay ngưỡng của mô hình.</p>
      </div>
      <SrTable caption="Precision, recall, tỷ lệ gắn cờ theo ngưỡng (validation)" columns={["Ngưỡng", "Precision", "Recall", "Gắn cờ"]}
        rows={curve.filter((_, i) => i % 5 === 4).map((r) => [fmt3(r.threshold), r.precision === null ? "—" : fmtPct(r.precision), fmtPct(r.recall), fmtPct(r.flagged_share)])} />
    </div>
  )
}

export function ThresholdsPage() {
  return (
    <WithMetrics title="Ngưỡng hành động" description="Ba ngưỡng chọn trên validation; kết quả áp dụng nguyên trạng trên test.">
      {(m) => (
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 nav:grid-cols-12 nav:grid-rows-[auto_minmax(0,1fr)]">
          {(Object.keys(TH_INFO) as ThresholdKey[]).map((k, i) => {
            const s = m.test!.thresholds[k], v = m.validation!.thresholds[k]
            return (
              <motion.section key={k} {...fadeUp(i)} className="lift flex flex-col gap-2.5 rounded-2xl border bg-card p-4 nav:col-span-4">
                <header className="flex items-start gap-2">
                  <div className="min-w-0">
                    <h2 className="text-base font-bold">{TH_INFO[k].name}</h2>
                    <p className="text-xs text-muted-foreground">{TH_INFO[k].desc}</p>
                  </div>
                  <div className="ml-auto flex flex-col items-end gap-1">
                    <span className="rounded-full bg-[#fff7e0] px-2.5 py-0.5 text-sm font-bold whitespace-nowrap text-[#92400e] tnum">t = {fmt3(s.threshold)}</span>
                    <DatasetBadge set="test" />
                  </div>
                </header>
                <dl className="grid grid-cols-3 gap-2 text-center">
                  {([["Precision", s.precision, v.precision, METRIC_HELP.precision], ["Recall", s.recall, v.recall, METRIC_HELP.recall], ["Gắn cờ", s.flagged_share, v.flagged_share, METRIC_HELP.flagged_share]] as const).map(([lab, val, vv, help]) => (
                    <div key={lab} className="rounded-xl border px-2 py-1.5">
                      <dt className="flex items-center justify-center gap-1 text-xs text-muted-foreground">{lab}<HelpTip content={help} /></dt>
                      <dd className="text-lg font-bold tnum">{fmtPct(val)}</dd>
                      <dd className="text-xs text-muted-foreground tnum">val {fmtPct(vv)}</dd>
                    </div>
                  ))}
                </dl>
                <Confusion s={s} />
              </motion.section>
            )
          })}
          <Frame index={3} title="Precision, recall và tỷ lệ gắn cờ theo ngưỡng" badge={<DatasetBadge set="validation" />} className="nav:col-span-12">
            <ThresholdExplorer m={m} />
          </Frame>
        </div>
      )}
    </WithMetrics>
  )
}

// ======================================================================================= Calibration
const binLabel = (b: CalBin) => `${fmtNum(b.bin_start, 1)}–${fmtNum(b.bin_end, 1)}`
const weighted = (bins: CalBin[], key: "mean_predicted" | "observed_rate") => {
  const n = bins.reduce((s, b) => s + b.count, 0)
  return n ? bins.reduce((s, b) => s + (b[key] ?? 0) * b.count, 0) / n : undefined
}
const stripMd = (s: string) => s.replace(/\*\*|`|\(`[^)]*`\)/g, "").replace(/\s*\(`?reports\/[^)]*\)/g, "")

export function CalibrationPage() {
  const [set, setSet] = useState<"test" | "validation">("test")
  return (
    <WithMetrics title="Calibration" description="Xác suất dự đoán có khớp tần suất hủy thực tế không (reliability diagram).">
      {(m) => {
        const cal = m.curves?.calibration?.[set]
        const main = cal?.main ?? []
        const score = (set === "test" ? m.test : m.validation)?.models.main
        const pts = main.filter((b) => b.count > 0).map((b) => ({ x: b.mean_predicted, y: b.observed_rate }))
        const bal = set === "test" ? (cal?.balanced ?? []).filter((b) => b.count > 0).map((b) => ({ x: b.mean_predicted, y: b.observed_rate })) : []
        return (
          <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 nav:grid-cols-12">
            <Frame index={0} title="Reliability diagram" badge={<DatasetBadge set={set} />} className="nav:col-span-8"
              actions={
                <ToggleGroup value={[set]} onValueChange={(v) => v[0] && setSet(v[0] as "test" | "validation")} variant="outline" size="sm" aria-label="Chọn tập dữ liệu">
                  <ToggleGroupItem value="test" className="rounded-full px-3">Test</ToggleGroupItem>
                  <ToggleGroupItem value="validation" className="rounded-full px-3">Validation</ToggleGroupItem>
                </ToggleGroup>
              } bodyClassName="flex flex-col gap-2">
              {!main.length ? <EmptyState icon={ChartLine} title="Chưa có dữ liệu calibration" description="Chạy make evaluate để sinh reports/curves.json." /> : (<>
                <div className="min-h-[220px] flex-[3]">
                  <ResponsiveContainer>
                    <LineChart margin={{ top: 8, right: 12, left: -8, bottom: 4 }}>
                      <CartesianGrid stroke="#e9edf3" />
                      <XAxis type="number" dataKey="x" domain={[0, 1]} ticks={UNIT_TICKS} tickFormatter={pctTick} {...AXIS} height={36}
                        label={{ value: "Xác suất dự đoán trung bình trong bin", position: "insideBottom", offset: -2, fontSize: 12, fill: "#64748b" }} />
                      <YAxis type="number" domain={[0, 1]} ticks={UNIT_TICKS} tickFormatter={pctTick} {...AXIS} width={48} />
                      <ChartTooltip formatter={(v) => fmtPct(Number(v))} labelFormatter={(l) => `Dự đoán TB ${fmtPct(Number(l))}`} />
                      <Line data={[{ x: 0, y: 0 }, { x: 1, y: 1 }]} dataKey="y" name="Hiệu chỉnh lý tưởng" stroke={C.random} strokeDasharray="5 4" dot={false} strokeWidth={1.5} />
                      {bal.length > 0 && <Line data={bal} dataKey="y" name={MODEL_LABEL.balanced} stroke={C.base} strokeWidth={2} dot={{ r: 3 }} />}
                      <Line data={pts} dataKey="y" name="Mô hình chính" stroke={C.main} strokeWidth={2.5} dot={{ r: 3.5 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <ChartLegend items={[{ label: "Mô hình chính", color: C.main }, ...(bal.length ? [{ label: "class_weight = balanced (so sánh)", color: C.base }] : []), { label: "Hiệu chỉnh lý tưởng", color: C.random, dashed: true }]} />
                <div className="min-h-[130px] flex-[2]">
                  <ResponsiveContainer>
                    <BarChart data={main.map((b) => ({ bin: binLabel(b), huy: b.n_canceled, khong: b.n_not_canceled }))} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
                      <CartesianGrid vertical={false} stroke="#e9edf3" />
                      <XAxis dataKey="bin" {...AXIS} interval={0} tick={{ fontSize: 11 }} />
                      <YAxis {...AXIS} width={52} tickFormatter={(v) => fmtInt(v)} />
                      <ChartTooltip formatter={(v, n) => [fmtInt(Number(v)), n]} cursor={{ fill: "#f1f4f8" }} />
                      <Legend iconType="square" iconSize={10} wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="khong" name="Không hủy" stackId="a" fill={C.base} />
                      <Bar dataKey="huy" name="Hủy" stackId="a" fill={C.main} radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <SrTable caption={`Reliability theo bin (${set})`} columns={["Bin", "Số booking", "Dự đoán TB", "Hủy thực tế"]}
                  rows={main.map((b) => [binLabel(b), fmtInt(b.count), b.mean_predicted === null ? "—" : fmtPct(b.mean_predicted), b.observed_rate === null ? "—" : fmtPct(b.observed_rate)])} />
              </>)}
            </Frame>
            <div className="flex min-h-0 flex-col gap-4 nav:col-span-4">
              <div className="grid grid-cols-2 gap-4">
                <KpiCard label="Log loss" value={score?.log_loss} format={fmt3} icon={Sigma} help={METRIC_HELP.log_loss} note={set === "test" ? "Test" : "Validation"} />
                <KpiCard index={1} label="Brier score" value={score?.brier} format={fmt3} icon={CircleDot} help={METRIC_HELP.brier} note={set === "test" ? "Test" : "Validation"} />
              </div>
              <Frame index={2} title="Mức tổng thể" badge={<DatasetBadge set={set} />}>
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <div><dt className="text-xs text-muted-foreground">Dự đoán trung bình</dt><dd className="text-lg font-bold tnum">{fmtPct(weighted(main, "mean_predicted"))}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Tỷ lệ hủy thực tế</dt><dd className="text-lg font-bold tnum">{fmtPct(weighted(main, "observed_rate"))}</dd></div>
                </dl>
              </Frame>
              <Frame index={3} title="Nhận xét (trích model card)" className="flex-1" bodyClassName="fit:overflow-y-auto">
                {m.calibration_notes.length ? (
                  <ul className="flex list-disc flex-col gap-2 pl-4 text-sm leading-relaxed">{m.calibration_notes.map((n) => <li key={n}>{stripMd(n)}</li>)}</ul>
                ) : <p className="text-sm text-muted-foreground">Model card chưa có mục Calibration.</p>}
              </Frame>
            </div>
          </div>
        )
      }}
    </WithMetrics>
  )
}

// ======================================================================================= Hệ số & odds ratio
const ODDS_TICKS = [0.01, 0.03, 0.1, 0.3, 1, 3, 10, 30, 100]

function OddsTable({ m }: { m: Metrics }) {
  const [group, setGroup] = useState<string>("all")
  const groups = useMemo(() => Array.from(new Set(m.odds.map((o) => o.group).filter(Boolean))) as string[], [m.odds])
  const data = useMemo(() => m.odds.map((o, i) => ({ ...o, rank: i + 1 })).filter((o) => group === "all" || o.group === group), [m.odds, group])
  const resolve = useCallback((f: string) => m.odds.find((o) => o.feature === f)?.term, [m.odds])
  const { flash } = useFocusRow(true, resolve)
  const columns = useMemo<ColumnDef<OddsRow & { rank: number }, unknown>[]>(() => [
    { accessorKey: "rank", header: "STT", meta: { align: "center", width: 56 } satisfies ColMeta },
    {
      id: "feature", header: "Feature", accessorFn: (r) => r.label, meta: { width: 280 } satisfies ColMeta,
      cell: ({ row, table }) => <VarLabel label={row.original.label} name={row.original.feature} query={String(table.getState().globalFilter ?? "")} />,
    },
    {
      id: "level", header: "Mức / so sánh", accessorFn: (r) => r.level ?? r.comparison, enableSorting: false,
      cell: ({ row, table }) => (
        <span className="text-xs text-muted-foreground">
          {row.original.level ? <><span className="font-medium text-foreground"><Highlight text={`= ${row.original.level}`} query={String(table.getState().globalFilter ?? "")} /></span> · {row.original.comparison}</> : row.original.comparison}
        </span>
      ),
    },
    { accessorKey: "coef", header: "Hệ số", meta: { align: "right", help: "Hệ số log-odds trong mô hình (sau one-hot, log1p, chuẩn hóa)." } satisfies ColMeta, cell: ({ getValue }) => fmtNum(getValue() as number, 3) },
    { accessorKey: "odds_ratio", header: "Odds ratio", meta: { align: "right", help: "exp(hệ số): odds hủy nhân bao nhiêu lần khi giữ các biến khác không đổi." } satisfies ColMeta, cell: ({ getValue }) => fmtNum(getValue() as number, 3) },
  ], [])
  const chart = [...data].sort((a, b) => Math.abs(b.coef) - Math.abs(a.coef)).slice(0, 14)
    .map((o) => ({ name: o.level ? `${o.label} = ${o.level}` : o.label, v: Math.log10(o.odds_ratio), or: o.odds_ratio })).reverse()
  const lim = Math.max(1, Math.ceil(Math.max(...chart.map((c) => Math.abs(c.v)), 0.5) * 2) / 2)
  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 nav:grid-cols-12">
      <Frame index={0} title="Bảng hệ số" badge={<span className="text-xs text-muted-foreground">Mô hình fit trên train</span>} className="nav:col-span-7">
        <DataTable data={data} total={m.odds.length} columns={columns} getRowId={(r) => r.term} flashId={flash}
          searchText={(r) => `${r.label} ${r.feature} ${r.term} ${r.level ?? ""}`} searchPlaceholder="Tìm feature…" rowLabel="số hạng"
          toolbar={
            <Select value={group} onValueChange={(v) => setGroup(v ?? "all")} items={[{ value: "all", label: "Tất cả nhóm biến" }, ...groups.map((g) => ({ value: g, label: g }))]}>
              <SelectTrigger className="h-9 min-w-44 rounded-full bg-card" aria-label="Lọc theo nhóm biến"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả nhóm biến</SelectItem>
                {groups.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
              </SelectContent>
            </Select>
          } />
      </Frame>
      <Frame index={1} title="Odds ratio (trục log)" badge={<span className="text-xs text-muted-foreground">14 số hạng |hệ số| lớn nhất theo bộ lọc</span>} className="nav:col-span-5">
        <div className="flex h-full min-h-[360px] flex-col">
          <div className="min-h-0 flex-1">
            <ResponsiveContainer>
              <BarChart data={chart} layout="vertical" margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                <CartesianGrid horizontal={false} stroke="#e9edf3" />
                <XAxis type="number" domain={[-lim, lim]} ticks={ODDS_TICKS.map(Math.log10).filter((t) => Math.abs(t) <= lim + 1e-9)}
                  tickFormatter={(v) => (10 ** v >= 1 ? fmtInt(Math.round(10 ** v)) : fmtNum(10 ** v, 2).replace(/0+$/, ""))} {...AXIS} />
                <YAxis type="category" dataKey="name" width={190} tick={{ fontSize: 11 }} stroke="#64748b" tickLine={false} />
                <ReferenceLine x={0} stroke="#64748b" />
                <ChartTooltip formatter={(_v, _n, p) => [fmtNum((p.payload as { or: number }).or, 3), "Odds ratio"]} cursor={{ fill: "#f1f4f8" }} />
                <Bar dataKey="v" barSize={12} radius={3}>{chart.map((c) => <Cell key={c.name} fill={C.neutral} />)}</Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Mốc 1 ở giữa: thanh sang phải = odds hủy cao hơn, sang trái = thấp hơn. Cùng một màu vì đây không phải quan hệ tốt/xấu hay nhân quả.</p>
          <SrTable caption="Odds ratio các số hạng lớn nhất" columns={["Số hạng", "Odds ratio"]} rows={chart.map((c) => [c.name, fmtNum(c.or, 3)])} />
        </div>
      </Frame>
    </div>
  )
}

export function OddsPage() {
  return (
    <WithMetrics title="Hệ số & odds ratio" description="Hệ số log-odds và odds ratio của mô hình chính.">
      {(m) => (<>
        <motion.div {...fadeUp(0)} className="flex items-start gap-2 rounded-xl border border-[#c7dafc] bg-selected px-4 py-2.5 text-sm text-[#1e3a5f]">
          <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
          Diễn giải có điều kiện khi giữ các biến khác không đổi; không phải tác động nhân quả.
        </motion.div>
        {m.odds.length ? <OddsTable m={m} /> : <EmptyState icon={ChartLine} title="Chưa có bảng odds ratio" description="Chạy make evaluate để sinh reports/odds_ratios.csv." />}
      </>)}
    </WithMetrics>
  )
}

// ======================================================================================= Phân tích lỗi
type SortKey = "n" | "observed_rate" | "mean_predicted" | "roc_auc" | "precision" | "recall" | "flagged_share"
const SMALL_N = 100
const ERR_COLS: { key: SortKey; label: string; fmt: (v: number) => string; help?: string }[] = [
  { key: "n", label: "Số booking", fmt: fmtInt },
  { key: "observed_rate", label: "Tỷ lệ hủy thực", fmt: fmtPct },
  { key: "mean_predicted", label: "Xác suất TB", fmt: fmtPct, help: "Trung bình xác suất dự đoán; càng gần tỷ lệ hủy thực càng được hiệu chỉnh tốt." },
  { key: "roc_auc", label: "ROC-AUC", fmt: fmt3, help: METRIC_HELP.roc_auc },
  { key: "precision", label: "Precision", fmt: fmtPct, help: `${METRIC_HELP.precision} Tại ngưỡng cân bằng.` },
  { key: "recall", label: "Recall", fmt: fmtPct, help: `${METRIC_HELP.recall} Tại ngưỡng cân bằng.` },
  { key: "flagged_share", label: "Gắn cờ", fmt: fmtPct, help: METRIC_HELP.flagged_share },
]
const groupName = (r: ErrorRow) => (r.variable === "arrival_month" ? r.group.split("-").reverse().join("/") : r.group)

export function ErrorsPage() {
  const [raw, setRaw] = useState("")
  const query = useDebounced(raw, 250)
  const [variable, setVariable] = useState("all")
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean } | null>(null)
  const [scrolled, setScrolled] = useState(false)
  return (
    <WithMetrics title="Phân tích lỗi" description="Sai số theo nhóm và theo tháng đến trên tập test, tại ngưỡng cân bằng.">
      {(m) => {
        const vars = Array.from(new Map(m.error_groups.map((r) => [r.variable, r.variable_label])))
        const rows = m.error_groups.filter((r) => (variable === "all" || r.variable === variable) && matches(query, r.variable_label, r.variable, groupName(r)))
        const grouped = vars.map(([v, label]) => {
          let g = rows.filter((r) => r.variable === v)
          if (sort) g = [...g].sort((a, b) => ((a[sort.key] ?? -1) - (b[sort.key] ?? -1)) * (sort.desc ? -1 : 1))
          return { v, label, rows: g }
        }).filter((g) => g.rows.length)
        const th = m.test!.thresholds.balanced_f1.threshold
        return (
          <Frame index={0} title="Sai số theo nhóm" badge={<><DatasetBadge set="test" /><span className="text-xs text-muted-foreground">Ngưỡng cân bằng t = {fmt3(th)}</span></>} className="min-h-0 flex-1">
            <div className="flex h-full min-h-0 flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative w-full max-w-64">
                  <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-label" aria-hidden />
                  <Input value={raw} onChange={(e) => setRaw(e.target.value)} placeholder="Tìm nhóm…" aria-label="Tìm nhóm" className="h-9 rounded-full bg-card pl-9" />
                </div>
                <Select value={variable} onValueChange={(v) => setVariable(v ?? "all")} items={[{ value: "all", label: "Tất cả nhóm biến" }, ...vars.map(([v, l]) => ({ value: v, label: l }))]}>
                  <SelectTrigger className="h-9 min-w-48 rounded-full bg-card" aria-label="Lọc nhóm biến"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tất cả nhóm biến</SelectItem>
                    {vars.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                  </SelectContent>
                </Select>
                <span className="ml-auto text-xs text-muted-foreground tnum" aria-live="polite">
                  {query || variable !== "all" ? `Tìm thấy ${fmtInt(rows.length)}/${fmtInt(m.error_groups.length)}` : `${fmtInt(rows.length)} nhóm`}
                </span>
              </div>
              <div className="relative max-h-[560px] min-h-0 flex-1 overflow-auto rounded-xl border border-[#e2e8f0] fit:max-h-none" onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 0)}>
                <table className="w-full border-separate border-spacing-0 text-sm">
                  <thead className={cn("sticky top-0 z-20", scrolled && "shadow-[0_4px_8px_-6px_rgb(15_23_42/0.25)]")}>
                    <tr>
                      <th scope="col" className="sticky left-0 z-30 h-9 border-r border-b border-r-[#cbd5e1] border-[#e2e8f0] bg-[#f4f7fb] px-3 text-left text-xs font-semibold text-[#475569]">Nhóm biến</th>
                      <th scope="col" className="h-9 border-r border-b border-r-[#cbd5e1] border-[#e2e8f0] bg-[#f4f7fb] px-3 text-left text-xs font-semibold text-[#475569]">Nhóm</th>
                      {ERR_COLS.map((c) => {
                        const active = sort?.key === c.key
                        return (
                          <th key={c.key} scope="col" aria-sort={active ? (sort!.desc ? "descending" : "ascending") : undefined}
                            className={cn("h-9 border-b border-[#e2e8f0] bg-[#f4f7fb] px-3 text-right text-xs font-semibold whitespace-nowrap text-[#475569]", active && "bg-[#e9f0fb]")}>
                            <span className="inline-flex flex-row-reverse items-center gap-1">
                              <button type="button" className="focus-ring inline-flex items-center gap-1 rounded-md hover:text-foreground"
                                onClick={() => setSort(active ? (sort!.desc ? null : { key: c.key, desc: true }) : { key: c.key, desc: false })}>
                                {c.label}
                                <ArrowUp aria-hidden className={cn("size-3.5 transition-transform duration-200", !active && "opacity-30", active && sort!.desc && "rotate-180")} />
                              </button>
                              {c.help && <HelpTip content={c.help} />}
                            </span>
                          </th>
                        )
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {grouped.map((g) => (
                      <Fragment key={g.v}>
                        {g.rows.map((r, i) => (
                          <motion.tr key={r.variable + r.group} layout="position" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.32, delay: Math.min(i * 0.02, 0.2) }} className="group/row">
                            {i === 0 && (
                              <th scope="rowgroup" rowSpan={g.rows.length} className="sticky left-0 z-10 border-r border-b border-r-[#cbd5e1] border-[#e2e8f0] bg-card px-3 py-2 text-left align-top font-semibold">
                                <Highlight text={g.label} query={query} /><div><Mono><Highlight text={g.v} query={query} /></Mono></div>
                              </th>
                            )}
                            <td className={cn("h-[35px] border-r border-b border-r-[#cbd5e1] border-[#e2e8f0] px-3 whitespace-nowrap group-hover/row:bg-[#f1f5f9]", i % 2 ? "bg-[#fafcff]" : "bg-card")}>
                              <span className="inline-flex items-center gap-2"><Highlight text={groupName(r)} query={query} />
                                {r.n < SMALL_N && <span title={`Dưới ${SMALL_N} booking: số liệu dao động lớn`} className="rounded-full bg-muted px-2 text-xs text-muted-foreground">ít dữ liệu</span>}
                              </span>
                            </td>
                            {ERR_COLS.map((c) => (
                              <td key={c.key} className={cn("h-[35px] border-b border-[#e2e8f0] px-3 text-right font-medium whitespace-nowrap tnum group-hover/row:bg-[#f1f5f9]", i % 2 ? "bg-[#fafcff]" : "bg-card")}>
                                <NumCell value={r[c.key]} format={c.fmt} />
                              </td>
                            ))}
                          </motion.tr>
                        ))}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
                {!grouped.length && <p className="p-6 text-center text-sm text-muted-foreground">Không có nhóm nào khớp.</p>}
              </div>
              <p className="text-xs text-muted-foreground">Nhóm dưới {SMALL_N} booking gắn nhãn “ít dữ liệu”. Sắp xếp áp dụng trong từng nhóm biến. ROC-AUC trống (—) khi nhóm chỉ có một lớp.</p>
            </div>
          </Frame>
        )
      }}
    </WithMetrics>
  )
}

