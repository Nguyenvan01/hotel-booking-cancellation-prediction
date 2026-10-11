import { useEffect, useRef, useState, type ReactNode } from "react"
import { animate, motion, useReducedMotion } from "motion/react"
import { CircleHelp, type LucideIcon } from "lucide-react"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { matchRanges } from "@/lib/format"
import { cn } from "@/lib/utils"

export const fadeUp = (i = 0) => ({
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.28, ease: "easeOut" as const, delay: i * 0.055 },
})

export function PageHeader({ title, description, actions }: { title: string; description: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

/** Khung lớn: bo 16px, viền 1px, không đổ bóng; hover chỉ đổi viền. */
export function Frame({
  title, badge, actions, children, className, bodyClassName, index = 0, id,
}: {
  title?: ReactNode
  badge?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
  index?: number
  id?: string
}) {
  return (
    <motion.section
      {...fadeUp(index)}
      id={id}
      className={cn("frame-hover relative flex min-h-0 min-w-0 flex-col rounded-2xl border bg-card p-6", className)}
    >
      {(title || badge || actions) && (
        <header className="mb-4 flex flex-wrap items-center gap-2">
          {title && <h2 className="text-base font-bold">{title}</h2>}
          {badge}
          {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={cn("min-h-0 flex-1", bodyClassName)}>{children}</div>
    </motion.section>
  )
}

export function DatasetBadge({ set }: { set: "validation" | "test" }) {
  return set === "validation" ? (
    <InfoTip content="Tập validation (01–04/2017): dùng để chọn tham số và ngưỡng.">
      <span className="inline-flex h-6 items-center rounded-full border border-[#bfdbfe] bg-[#e8f3ff] px-2.5 text-xs font-semibold text-[#1d4ed8]">Validation</span>
    </InfoTip>
  ) : (
    <InfoTip content="Tập test (05–08/2017): kết luận cuối, chỉ chạy một lần.">
      <span className="inline-flex h-6 items-center rounded-full border border-[#a7f3d0] bg-[#ecfdf5] px-2.5 text-xs font-semibold text-[#047857]">Test</span>
    </InfoTip>
  )
}

export function Mono({ children, className }: { children: ReactNode; className?: string }) {
  return <code className={cn("font-mono text-xs text-muted-foreground", className)}>{children}</code>
}

/** "Thời gian đặt trước — lead_time" */
export function VarLabel({ label, name, query = "" }: { label: string; name: string; query?: string }) {
  return (
    <span className="inline-flex min-w-0 items-baseline gap-1.5 truncate">
      <span className="truncate text-foreground"><Highlight text={label} query={query} /></span>
      {label !== name && (
        <>
          <span className="text-label">—</span>
          <Mono><Highlight text={name} query={query} /></Mono>
        </>
      )}
    </span>
  )
}

export const RISK_STYLE: Record<string, { text: string; bg: string; dot: string; label: string }> = {
  Thấp: { text: "#15803d", bg: "#ecfdf3", dot: "#22c55e", label: "Ưu tiên xác nhận thấp" },
  "Trung bình": { text: "#b45309", bg: "#fffaeb", dot: "#f59e0b", label: "Ưu tiên xác nhận trung bình" },
  Cao: { text: "#92400e", bg: "#fff4e5", dot: "#f97316", label: "Ưu tiên xác nhận cao" },
  "Rất cao": { text: "#7c2d12", bg: "#ffedd5", dot: "#ea580c", label: "Ưu tiên xác nhận rất cao" },
}

export function RiskBadge({ group, className }: { group: string; className?: string }) {
  const s = RISK_STYLE[group] ?? RISK_STYLE["Thấp"]
  return (
    <span className={cn("inline-flex h-7 items-center gap-2 rounded-full px-3 text-sm font-semibold", className)}
      style={{ color: s.text, background: s.bg }}>
      <span className="size-2 rounded-full" style={{ background: s.dot }} aria-hidden />
      {s.label}
    </span>
  )
}

/** Số chạy count-up ~800ms; tắt khi người dùng chọn giảm chuyển động. */
export function CountUp({ value, format, className }: { value: number; format: (v: number) => string; className?: string }) {
  const reduce = useReducedMotion()
  const [shown, setShown] = useState(reduce ? value : 0)
  const from = useRef(0)
  useEffect(() => {
    if (reduce) {
      setShown(value)
      return
    }
    const controls = animate(from.current, value, { duration: 0.8, ease: "easeOut", onUpdate: setShown })
    from.current = value
    return () => controls.stop()
  }, [value, reduce])
  return <span className={cn("tnum", className)}>{format(shown)}</span>
}

export function Highlight({ text, query }: { text: string; query: string }) {
  const ranges = query ? matchRanges(text, query) : []
  if (!ranges.length) return <>{text}</>
  const out: ReactNode[] = []
  let last = 0
  ranges.forEach(([s, e], i) => {
    out.push(text.slice(last, s), <mark key={i} className="rounded-sm bg-primary/15 text-inherit">{text.slice(s, e)}</mark>)
    last = e
  })
  out.push(text.slice(last))
  return <>{out}</>
}

export function InfoTip({ content, children }: { content: ReactNode; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger render={<span tabIndex={0} className="focus-ring inline-flex rounded-full" />}>{children}</TooltipTrigger>
      <TooltipContent className="max-w-72 text-xs leading-relaxed">{content}</TooltipContent>
    </Tooltip>
  )
}

export function HelpTip({ content }: { content: ReactNode }) {
  return (
    <InfoTip content={content}>
      <CircleHelp className="size-3.5 text-label" aria-label="Giải thích" />
    </InfoTip>
  )
}

export function EmptyState({ icon: Icon, title, description, className }: {
  icon: LucideIcon; title: string; description: string; className?: string
}) {
  return (
    <Empty className={cn("h-full border-0 p-6", className)}>
      <EmptyHeader>
        <EmptyMedia variant="icon"><Icon /></EmptyMedia>
        <EmptyTitle className="text-base">{title}</EmptyTitle>
        <EmptyDescription className="text-sm">{description}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}

export function LoadingBlock({ rows = 4 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-label="Đang tải">
      {Array.from({ length: rows }, (_, i) => <Skeleton key={i} className="h-8 w-full rounded-lg" />)}
    </div>
  )
}

/** Bảng số liệu thay thế cho biểu đồ, chỉ dành cho trình đọc màn hình. */
export function SrTable({ caption, columns, rows }: { caption: string; columns: string[]; rows: (string | number)[][] }) {
  return (
    <table className="sr-only">
      <caption>{caption}</caption>
      <thead><tr>{columns.map((c) => <th key={c} scope="col">{c}</th>)}</tr></thead>
      <tbody>{rows.map((r, i) => <tr key={i}>{r.map((v, j) => <td key={j}>{v}</td>)}</tr>)}</tbody>
    </table>
  )
}

/** Thẻ KPI nhỏ: nhãn 13px, số 30px, icon góc phải, ghi chú phụ. */
export function KpiCard({ label, value, format, icon: Icon, note, noteTone, index = 0, help }: {
  label: string; value: number | null | undefined; format: (v: number) => string; icon: LucideIcon
  note?: string; noteTone?: "better" | "worse" | "muted"; index?: number; help?: ReactNode
}) {
  return (
    <motion.div {...fadeUp(index)} className="lift relative rounded-2xl border bg-card p-5">
      <Icon className="absolute top-5 right-5 size-[18px] text-label" aria-hidden />
      <div className="flex items-center gap-1.5 pr-8 text-sm text-muted-foreground">
        <span className="truncate">{label}</span>
        {help && <HelpTip content={help} />}
      </div>
      <div className="mt-2 text-3xl font-bold">
        {typeof value === "number" ? <CountUp value={value} format={format} /> : <span className="text-nodata">—</span>}
      </div>
      {note && (
        <div className={cn("mt-1 truncate text-xs", noteTone === "better" ? "text-better" : noteTone === "worse" ? "text-worse" : "text-muted-foreground")}>
          {note}
        </div>
      )}
    </motion.div>
  )
}

export const METRIC_HELP: Record<string, string> = {
  roc_auc: "ROC-AUC: xác suất mô hình xếp một booking hủy cao hơn một booking không hủy; càng cao càng tốt (0,5 = ngẫu nhiên).",
  pr_auc: "PR-AUC (average precision): diện tích dưới đường precision–recall; mốc ngẫu nhiên bằng tỷ lệ hủy.",
  log_loss: "Log loss: phạt dự đoán tự tin nhưng sai; càng thấp càng tốt.",
  brier: "Brier score: trung bình bình phương sai lệch giữa xác suất và kết quả; càng thấp càng tốt.",
  precision: "Precision: trong các booking bị gắn cờ, tỷ lệ thực sự hủy.",
  recall: "Recall: trong các booking thực sự hủy, tỷ lệ được gắn cờ.",
  flagged_share: "Tỷ lệ gắn cờ: phần trăm booking vượt ngưỡng, tức khối lượng cuộc gọi xác nhận.",
}
