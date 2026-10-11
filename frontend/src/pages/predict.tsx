import { useEffect, useMemo, useRef, useState } from "react"
import { Controller, useForm, type FieldValues } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation } from "@tanstack/react-query"
import { useSearchParams } from "react-router"
import { AnimatePresence, motion } from "motion/react"
import { z } from "zod"
import { toast } from "sonner"
import {
  Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ReferenceArea, ReferenceDot, ReferenceLine, ResponsiveContainer,
  Tooltip as ChartTooltip, XAxis, YAxis,
} from "recharts"
import { Check, ChevronDown, Copy, Eraser, Gauge, Loader2, Sparkles, TriangleAlert } from "lucide-react"
import { CountUp, EmptyState, Frame, LoadingBlock, Mono, PageHeader, RiskBadge, SrTable } from "@/components/common"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ApiError, api, useModelInfo, type Explain, type FieldSpec, type ModelInfo, type RiskResponse, type ThresholdKey } from "@/lib/api"
import { fmtInt, fmtNum, fmtPct } from "@/lib/format"
import { reportOffline } from "@/lib/hooks"
import { cn } from "@/lib/utils"

const MONTHS_VI: Record<string, string> = {
  January: "Tháng 1", February: "Tháng 2", March: "Tháng 3", April: "Tháng 4", May: "Tháng 5", June: "Tháng 6",
  July: "Tháng 7", August: "Tháng 8", September: "Tháng 9", October: "Tháng 10", November: "Tháng 11", December: "Tháng 12",
}
const TH_LABEL: Record<ThresholdKey, string> = { high_recall: "ưu tiên recall", balanced_f1: "cân bằng F1", capacity: "năng lực gọi" }
const GROUP_ORDER = ["Thông tin đặt phòng", "Khách", "Kênh & loại phòng", "Lịch sử"]
const RARE = 50

type Result = { request: Record<string, unknown>; response: RiskResponse; explain: Explain | null; at: number }

/** Schema Zod dựng từ model-info: miền cứng của API -> lỗi; không tự thay thế giá trị. */
function buildSchema(fields: FieldSpec[]) {
  const shape: Record<string, z.ZodType> = {}
  for (const f of fields) {
    const required = z.string().trim().min(1, "Thiếu trường bắt buộc")
    if (f.type === "integer") {
      shape[f.name] = required.regex(/^-?\d+$/, "Phải là số nguyên").transform(Number)
        .pipe(z.number().min(f.min ?? -Infinity, `Phải ≥ ${fmtInt(f.min)}`).max(f.max ?? Infinity, `Phải ≤ ${fmtInt(f.max)}`))
    } else if (f.type === "boolean") {
      shape[f.name] = required.refine((v) => v === "true" || v === "false", "Giá trị không hợp lệ").transform((v) => v === "true")
    } else {
      const allowed = new Set((f.options ?? []).map((o) => o.value))
      shape[f.name] = required.refine((v) => allowed.has(v), "Giá trị không hợp lệ")
    }
  }
  return z.object(shape).superRefine((v: Record<string, unknown>, ctx) => {
    const total = ["adults", "children", "babies"].reduce((s, k) => s + (typeof v[k] === "number" ? (v[k] as number) : 0), 0)
    if (["adults", "children", "babies"].every((k) => typeof v[k] === "number") && total < 1)
      ctx.addIssue({ code: "custom", path: ["adults"], message: "Tổng số khách (người lớn + trẻ em + em bé) phải ≥ 1" })
  })
}

const toFormValues = (fields: FieldSpec[], b?: Record<string, unknown>) =>
  Object.fromEntries(fields.map((f) => [f.name, b && b[f.name] !== undefined ? String(b[f.name]) : ""]))

function optionLabel(f: FieldSpec, v: string) {
  if (f.type === "boolean") return v === "true" ? "Có" : v === "false" ? "Không" : v
  if (f.name === "arrival_date_month") return `${MONTHS_VI[v] ?? v} (${v})`
  return v
}

function outOfTrain(f: FieldSpec, raw: string) {
  if (f.type === "integer" && f.train && /^\d+$/.test(raw)) {
    const n = Number(raw)
    return n < f.train.min || n > f.train.max ? "ngoài miền" : null
  }
  if (f.type === "category" && raw) {
    const o = f.options?.find((x) => x.value === raw)
    return o && o.train_count < RARE ? "hiếm" : null
  }
  return null
}

function FieldControl({ f, form }: { f: FieldSpec; form: ReturnType<typeof useForm<FieldValues>> }) {
  const raw = (form.watch(f.name) as string) ?? ""
  const error = form.formState.errors[f.name]?.message as string | undefined
  const tag = outOfTrain(f, raw)
  const hint = f.type === "integer" && f.train
    ? `Theo train: ${fmtInt(f.train.min)}–${fmtInt(f.train.max)}${f.unit ? ` ${f.unit}` : ""} · cho phép ${fmtInt(f.min)}–${fmtInt(f.max)}`
    : f.description ?? (f.type === "category" ? `${f.options?.length ?? 0} giá trị hợp lệ` : "Có / Không")
  const id = `f-${f.name}`
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className="flex min-w-0 flex-col text-sm font-medium">
        <span className="flex min-w-0 items-baseline gap-1.5">
          <span className="truncate">{f.label}</span>
          {f.unit && <span className="text-xs font-normal text-muted-foreground">({f.unit})</span>}
          {tag && <span className="ml-auto shrink-0 rounded-full bg-[#fffaeb] px-1.5 text-xs font-medium text-[#b45309]">{tag}</span>}
        </span>
        <Mono className="truncate font-normal">{f.name}</Mono>
      </label>
      {f.type === "integer" ? (
        <Input id={id} inputMode="numeric" autoComplete="off" aria-invalid={!!error} aria-describedby={`${id}-msg`}
          {...form.register(f.name)} className="h-9 rounded-xl border-input bg-card text-sm tnum" />
      ) : (
        <Controller control={form.control} name={f.name} render={({ field }) => {
          const values = f.type === "boolean" ? ["true", "false"] : (f.options ?? []).map((o) => o.value)
          return (
            <Select value={field.value || null} onValueChange={(v) => field.onChange(v ?? "")}
              items={values.map((v) => ({ value: v, label: optionLabel(f, v) }))}>
              <SelectTrigger id={id} aria-invalid={!!error} aria-describedby={`${id}-msg`} onBlur={field.onBlur}
                className="h-9 w-full rounded-xl border-input bg-card text-sm">
                <SelectValue placeholder="Chọn…" />
              </SelectTrigger>
              <SelectContent>
                {values.map((v) => {
                  const count = f.options?.find((o) => o.value === v)?.train_count
                  return (
                    <SelectItem key={v} value={v}>
                      {optionLabel(f, v)}
                      {count !== undefined && count < RARE && <span className="text-xs text-[#b45309]">hiếm (n = {count})</span>}
                    </SelectItem>
                  )
                })}
              </SelectContent>
            </Select>
          )
        }} />
      )}
      <p id={`${id}-msg`} className={cn("min-h-4 text-xs", error ? "text-destructive" : "text-muted-foreground")}>{error ?? hint}</p>
    </div>
  )
}

function ProbabilityBar({ p, thresholds }: { p: number; thresholds: Record<ThresholdKey, number> }) {
  return (
    <div className="pt-6 pb-6" role="img" aria-label={`Xác suất ${fmtPct(p)} trên thang 0–100%, ngưỡng ${Object.values(thresholds).map(fmtPct).join(", ")}`}>
      <div className="relative h-2.5 rounded-full bg-muted">
        <motion.div className="absolute inset-y-0 left-0 rounded-full bg-primary/25" initial={{ width: 0 }} animate={{ width: `${p * 100}%` }} transition={{ duration: 0.8, ease: "easeOut" }} />
        {(Object.entries(thresholds) as [ThresholdKey, number][]).map(([k, t], i) => (
          <div key={k} className="absolute -top-1 h-[18px] w-0.5 rounded bg-[var(--chart-threshold)]" style={{ left: `${t * 100}%` }}>
            {/* nhãn xen kẽ trên/dưới để hai ngưỡng gần nhau không đè lên nhau */}
            <span className={cn("absolute -translate-x-1/2 text-xs whitespace-nowrap text-muted-foreground tnum", i % 2 ? "bottom-5" : "top-5")}>{fmtPct(t)}</span>
          </div>
        ))}
        <motion.div className="absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card bg-primary shadow"
          initial={{ left: "0%" }} animate={{ left: `${p * 100}%` }} transition={{ duration: 0.8, ease: "easeOut" }} />
      </div>
    </div>
  )
}

function CopyJson({ text }: { text: string }) {
  const [done, setDone] = useState(false)
  return (
    <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={async () => {
      try {
        await navigator.clipboard.writeText(text)
        setDone(true)
        toast.success("Đã sao chép JSON")
        setTimeout(() => setDone(false), 1500)
      } catch {
        toast.error("Trình duyệt không cho sao chép")
      }
    }}>
      {done ? <Check className="text-better" /> : <Copy />} {done ? "Đã chép" : "Sao chép"}
    </Button>
  )
}

function Section({ title, children, defaultOpen = false }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  return (
    <Collapsible defaultOpen={defaultOpen} className="rounded-xl border">
      <CollapsibleTrigger className="focus-ring group flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-semibold">
        {title}
        <ChevronDown className="ml-auto size-4 text-label transition-transform duration-200 group-data-[panel-open]:rotate-180" aria-hidden />
      </CollapsibleTrigger>
      <CollapsibleContent className="border-t px-3 py-3">{children}</CollapsibleContent>
    </Collapsible>
  )
}

function ExplainCharts({ ex, leadTime, thresholds }: { ex: Explain; leadTime: number; thresholds: Record<ThresholdKey, number> }) {
  const top = ex.contributions.slice(0, 8)
  const rest = ex.contributions.slice(8).reduce((s, c) => s + c.contribution, 0)
  const bars = [...top.map((c) => ({ name: `${c.label} = ${typeof c.value === "boolean" ? (c.value ? "có" : "không") : c.value}`, v: c.contribution })),
    { name: `Các biến còn lại (${ex.contributions.length - 8})`, v: rest }]
  const total = ex.contributions.reduce((s, c) => s + c.contribution, 0)
  const z = ex.intercept + total
  const xmax = Math.max(ex.train_lead_time_max, leadTime)
  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="mb-2 text-xs text-muted-foreground">Đóng góp vào log-odds so với booking tham chiếu. Thanh sang phải làm odds hủy cao hơn, sang trái làm thấp hơn; đây là liên hệ có điều kiện, không phải nguyên nhân.</p>
        <div className="h-[260px]">
          <ResponsiveContainer>
            <BarChart data={bars} layout="vertical" margin={{ left: 8, right: 16 }}>
              <CartesianGrid horizontal={false} stroke="#e9edf3" />
              <XAxis type="number" tickFormatter={(v) => fmtNum(v, 1)} fontSize={12} stroke="#94a3b8" />
              <YAxis type="category" dataKey="name" width={170} fontSize={12} tickLine={false} stroke="#64748b" />
              <ReferenceLine x={0} stroke="#94a3b8" />
              <ChartTooltip formatter={(v) => [fmtNum(Number(v), 3), "log-odds"]} cursor={{ fill: "#f1f4f8" }} />
              <Bar dataKey="v" radius={3} barSize={14}>{bars.map((b) => <Cell key={b.name} fill="var(--chart-neutral)" />)}</Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="text-xs text-muted-foreground tnum">
          log-odds = hệ số chặn ({fmtNum(ex.intercept, 2)}) + tổng đóng góp ({fmtNum(total, 2)}) = {fmtNum(z, 2)} → p = 1 / (1 + e<sup>{fmtNum(-z, 2)}</sup>) = {fmtPct(ex.probability)}
        </p>
        <SrTable caption="Đóng góp log-odds của từng biến" columns={["Biến", "Đóng góp"]} rows={bars.map((b) => [b.name, fmtNum(b.v, 3)])} />
      </div>
      <div>
        <p className="mb-2 text-xs text-muted-foreground">Xác suất của chính booking này khi chỉ thay đổi lead time; nét đứt vàng là 3 ngưỡng.</p>
        <div className="h-[200px]">
          <ResponsiveContainer>
            <LineChart data={ex.lead_time_curve} margin={{ left: 0, right: 16, top: 8 }}>
              <CartesianGrid stroke="#e9edf3" />
              <XAxis type="number" dataKey="lead_time" domain={[0, xmax]} fontSize={12} stroke="#94a3b8" tickFormatter={(v) => fmtInt(v)} />
              <YAxis domain={[0, 1]} tickFormatter={(v) => `${Math.round(v * 100)}%`} fontSize={12} stroke="#94a3b8" width={40} />
              {leadTime > ex.train_lead_time_max && <ReferenceArea x1={ex.train_lead_time_max} x2={xmax} fill="#f1f4f8" label={{ value: "ngoài miền train", fontSize: 11, fill: "#64748b" }} />}
              {Object.values(thresholds).map((t) => <ReferenceLine key={t} y={t} stroke="var(--chart-threshold)" strokeDasharray="4 3" />)}
              <ChartTooltip formatter={(v) => [fmtPct(Number(v)), "Xác suất"]} labelFormatter={(l) => `Lead time ${fmtInt(Number(l))} ngày`} />
              <Line dataKey="probability" stroke="var(--chart-main)" strokeWidth={2} dot={false} />
              <ReferenceDot x={leadTime} y={ex.probability} r={5} fill="var(--chart-main)" stroke="#fff" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <SrTable caption="Xác suất theo lead time" columns={["Lead time (ngày)", "Xác suất"]} rows={ex.lead_time_curve.map((d) => [d.lead_time, fmtPct(d.probability)])} />
      </div>
    </div>
  )
}

function ResultPanel({ result, pending }: { result: Result | null; pending: boolean }) {
  if (!result) {
    return pending ? <LoadingBlock rows={5} /> : (
      <EmptyState icon={Gauge} title="Chưa có kết quả" description="Điền form hoặc chọn booking mẫu, rồi bấm “Dự đoán rủi ro”." />
    )
  }
  const { response: r, explain, request } = result
  const usedKey = (Object.entries(r.thresholds) as [ThresholdKey, number][]).find(([, t]) => t === r.threshold_used)?.[0]
  return (
    <div className="flex flex-col gap-4">
      <motion.div key={result.at} initial={{ backgroundColor: "rgba(52,120,246,0.12)" }} animate={{ backgroundColor: "rgba(52,120,246,0)" }}
        transition={{ duration: 0.9 }} className="-m-2 rounded-xl p-2">
        <div className="text-sm text-muted-foreground">Xác suất hủy ước lượng</div>
        <div className="flex flex-wrap items-center gap-3">
          <CountUp value={r.probability} format={fmtPct} className="text-3xl font-bold" />
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4, duration: 0.3 }}>
            <RiskBadge group={r.risk_group} />
          </motion.div>
        </div>
      </motion.div>
      <ProbabilityBar p={r.probability} thresholds={r.thresholds} />
      <div className="text-sm">
        <span className="text-muted-foreground">Gợi ý: </span>{r.action}.
        <div className="mt-1 text-xs text-muted-foreground tnum">
          {r.risk_group === "Thấp" ? `Dưới ngưỡng thấp nhất ${fmtPct(r.threshold_used)}` : `Vượt ngưỡng ${fmtPct(r.threshold_used)}${usedKey ? ` (${TH_LABEL[usedKey]})` : ""}`} · mô hình {r.model_version}
        </div>
      </div>
      {r.warnings.length > 0 && (
        <ul className="flex flex-col gap-1.5" aria-label="Cảnh báo từ API">
          {r.warnings.map((w) => (
            <li key={w} className="flex gap-2 text-xs text-[#92400e]"><TriangleAlert className="mt-px size-3.5 shrink-0 text-[var(--chart-warn)]" aria-hidden />{w}</li>
          ))}
        </ul>
      )}
      <p className="border-t pt-3 text-xs text-muted-foreground">Xác suất ước lượng từ dữ liệu 2015–2017; dùng để ưu tiên gọi xác nhận, không phải quyết định về khách.</p>
      {explain && (
        <Section title="Vì sao ra kết quả này?">
          <ExplainCharts ex={explain} leadTime={Number(request.lead_time)} thresholds={r.thresholds} />
        </Section>
      )}
      <Section title="Request/Response JSON">
        <div className="mb-2 flex items-center gap-2">
          <code className="font-mono text-xs text-muted-foreground">POST /api/cancellation-risk</code>
          <div className="ml-auto"><CopyJson text={JSON.stringify({ request, response: r }, null, 2)} /></div>
        </div>
        <pre className="max-h-64 overflow-auto rounded-lg bg-muted p-3 font-mono text-xs leading-relaxed">{JSON.stringify({ request, response: r }, null, 2)}</pre>
      </Section>
    </div>
  )
}

function PredictForm({ info }: { info: ModelInfo }) {
  const fields = info.fields
  const schema = useMemo(() => buildSchema(fields), [fields])
  const empty = useMemo(() => toFormValues(fields), [fields])
  const form = useForm<FieldValues>({ resolver: zodResolver(schema as never), defaultValues: empty, mode: "onTouched" })
  const [result, setResult] = useState<Result | null>(null)
  const [params, setParams] = useSearchParams()
  const autoRan = useRef(false)

  const mutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const [response, explain] = await Promise.all([api.predict(body), api.explain(body).catch(() => null)])
      return { request: body, response, explain, at: Date.now() }
    },
    onSuccess: (res) => {
      setResult(res)
      // màn hình hẹp: khung kết quả nằm dưới form, cuộn tới để người dùng thấy ngay
      if (window.innerWidth < 900) requestAnimationFrame(() => document.getElementById("ket-qua")?.scrollIntoView({ behavior: "smooth", block: "start" }))
      toast.success(`Đã dự đoán: ${fmtPct(res.response.probability)} · nhóm ${res.response.risk_group.toLowerCase()}`)
    },
    onError: (e) => {
      const err = e instanceof ApiError ? e : new ApiError(500, String(e))
      if (err.fieldErrors.length) {
        err.fieldErrors.forEach((fe) => form.setError(fields.some((f) => f.name === fe.field) ? fe.field : "root", { message: fe.message }))
        toast.error(`Dữ liệu chưa hợp lệ: ${err.fieldErrors.length} trường cần sửa`)
      } else {
        if (err.status === 0) reportOffline()
        toast.error("Không gọi được máy chủ mô hình", { description: "Dữ liệu trên form vẫn được giữ nguyên." })
      }
    },
  })

  const submit = form.handleSubmit(
    (values) => mutation.mutate(values),
    (errors) => toast.error(`Còn ${Object.keys(errors).length} trường chưa hợp lệ`, { description: "Xem thông báo dưới từng ô." }),
  )

  const fill = (id: string) => {
    const demo = info.demo_bookings.find((d) => d.id === id)
    if (!demo) return false
    form.reset(toFormValues(fields, demo.booking))
    setResult(null)
    return true
  }

  useEffect(() => {
    const demo = params.get("demo")
    if (demo && !autoRan.current && fill(demo)) {
      autoRan.current = true
      setParams({}, { replace: true })
      void submit()
    }
  })

  const groups = GROUP_ORDER.filter((g) => fields.some((f) => f.group === g))
  return (
    <div className="flex h-full flex-col gap-4">
      <PageHeader title="Dự đoán rủi ro" description="Nhập thông tin có ngay lúc tạo booking để ước lượng xác suất hủy và nhóm ưu tiên xác nhận."
        actions={<>
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="outline" className="h-9 rounded-full px-4" />}>
              <Sparkles /> Điền booking mẫu <ChevronDown className="text-label" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-72">
              {info.demo_bookings.map((d) => <DropdownMenuItem key={d.id} onClick={() => fill(d.id)}>{d.label}</DropdownMenuItem>)}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="outline" className="h-9 rounded-full px-4" onClick={() => { form.reset(empty); setResult(null) }}><Eraser /> Xoá form</Button>
        </>} />
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 nav:grid-cols-12">
        <Frame index={0} className="nav:col-span-7" bodyClassName="fit:overflow-y-auto fit:-mr-3 fit:pr-3">
          <form onSubmit={submit} noValidate className="flex flex-col gap-5" aria-label="Thông tin booking">
            {groups.map((g) => (
              <fieldset key={g} className="flex flex-col gap-3">
                <legend className="mb-1 text-base font-bold">{g}</legend>
                <div className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">
                  {fields.filter((f) => f.group === g).map((f) => <FieldControl key={f.name} f={f} form={form} />)}
                </div>
              </fieldset>
            ))}
            {form.formState.errors.root && <p className="text-xs text-destructive">{String(form.formState.errors.root.message)}</p>}
            <div className="sticky bottom-0 -mx-1 flex items-center gap-3 border-t bg-card px-1 pt-3">
              <Button type="submit" disabled={mutation.isPending} className="h-10 rounded-full px-5">
                {mutation.isPending ? <><Loader2 className="animate-spin" /> Đang dự đoán…</> : <><Gauge /> Dự đoán rủi ro</>}
              </Button>
              <span className="text-xs text-muted-foreground">Không lưu dữ liệu; chỉ gửi tới API dự đoán.</span>
            </div>
          </form>
        </Frame>
        <Frame index={1} id="ket-qua" title="Kết quả" className="nav:col-span-5 nav:sticky nav:top-4 nav:self-start fit:static fit:self-stretch"
          bodyClassName="fit:overflow-y-auto fit:-mr-3 fit:pr-3" actions={<AnimatePresence>{mutation.isPending && <Loader2 className="size-4 animate-spin text-primary" aria-label="Đang dự đoán" />}</AnimatePresence>}>
          <ResultPanel result={result} pending={mutation.isPending} />
        </Frame>
      </div>
    </div>
  )
}

export default function PredictPage() {
  const info = useModelInfo()
  if (info.isError) return <EmptyState icon={Gauge} title="Không tải được thông tin mô hình" description="Kiểm tra máy chủ FastAPI đang chạy (make app) rồi tải lại trang." />
  if (!info.data) return <div className="flex flex-col gap-4"><PageHeader title="Dự đoán rủi ro" description="Đang tải thông tin mô hình…" /><LoadingBlock rows={8} /></div>
  return <PredictForm info={info.data} />
}
