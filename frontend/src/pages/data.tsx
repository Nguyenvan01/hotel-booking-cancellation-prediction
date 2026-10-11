import { useMemo, useState } from "react"
import { type ColumnDef } from "@tanstack/react-table"
import { Database, Download } from "lucide-react"
import { EmptyState, Frame, Highlight, InfoTip, LoadingBlock, Mono, PageHeader } from "@/components/common"
import { DataTable, type ColMeta } from "@/components/data-table"
import { buttonVariants } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useDataCard, type DataCard, type DictRow } from "@/lib/api"
import { fmtDate, fmtInt, fmtPct } from "@/lib/format"
import { useFocusRow } from "@/lib/hooks"
import { cn } from "@/lib/utils"

const ROLES: Record<string, { label: string; cls: string }> = {
  feature: { label: "Đặc trưng", cls: "bg-[#edf3ff] text-[#1d4ed8]" },
  target: { label: "Mục tiêu", cls: "bg-[#f3e8ff] text-[#7e22ce]" },
  split_key: { label: "Khóa chia tập", cls: "bg-muted text-muted-foreground" },
  not_used: { label: "Không dùng", cls: "bg-muted text-muted-foreground" },
  excluded_leakage: { label: "Đã loại: sau đặt", cls: "bg-[#fdecea] text-[#b4412f]" },
  excluded_suspect: { label: "Đã loại: nghi vấn", cls: "bg-[#fff4e5] text-[#92400e]" },
  sensitivity_only: { label: "Chỉ dùng ablation", cls: "bg-[#fffaeb] text-[#b45309]" },
}
const SET_LABEL: Record<string, string> = { all: "Toàn bộ (sau làm sạch)", train: "Train", val: "Validation", test: "Test" }

function SourceCard({ d }: { d: DataCard }) {
  const rows: [string, React.ReactNode][] = [
    ["Tác giả", d.authors],
    ["Giấy phép", d.license],
    ["DOI", <a key="doi" className="focus-ring rounded text-primary hover:underline" href={d.doi} target="_blank" rel="noreferrer">{d.doi.replace("https://doi.org/", "")}</a>],
    ["Trang dữ liệu", <a key="pmc" className="focus-ring rounded text-primary hover:underline" href={d.page} target="_blank" rel="noreferrer">PMC6297060</a>],
    ["Ngày tải", d.downloaded_at ? fmtDate(d.downloaded_at) : <span className="text-nodata">— (chưa tải trên máy này)</span>],
    ["SHA-256 zip", <InfoTip key="sha" content={<span className="font-mono break-all">{d.zip_sha256}</span>}><Mono className="truncate">{d.zip_sha256.slice(0, 16)}…</Mono></InfoTip>],
  ]
  return (
    <div className="flex flex-col gap-3 text-sm">
      <p className="font-semibold">{d.name}</p>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5">
        {rows.map(([k, v]) => <div key={k} className="contents"><dt className="text-muted-foreground">{k}</dt><dd className="min-w-0 truncate">{v}</dd></div>)}
      </dl>
      <div className="flex flex-col gap-1">
        {d.files.map((f) => (
          <div key={f.name} className="flex items-center gap-2 rounded-lg bg-muted px-2.5 py-1.5 text-xs">
            <Mono className="text-foreground">{f.name}</Mono><span className="text-muted-foreground">{f.hotel}</span>
            <span className="ml-auto tnum">{fmtInt(f.rows)} dòng</span>
          </div>
        ))}
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">Trích dẫn: {d.citation}</p>
    </div>
  )
}

function QualityCard({ q }: { q: NonNullable<DataCard["quality"]> }) {
  return (
    <div className="flex flex-col gap-4 text-sm">
      <div className="grid grid-cols-3 gap-2 text-center">
        {[["Dòng thô", q.n_raw], ["Sau làm sạch", q.n_clean], ["Trùng hoàn toàn", q.duplicates_full]].map(([k, v]) => (
          <div key={k} className="lift rounded-xl border px-2 py-2"><div className="text-xs text-muted-foreground">{k}</div><div className="font-bold tnum">{fmtInt(v as number)}</div></div>
        ))}
      </div>
      <div>
        <h3 className="mb-1 text-xs font-medium text-label">Giá trị thiếu</h3>
        <ul className="flex flex-col gap-0.5">{Object.entries(q.missing).map(([k, v]) => <li key={k} className="flex justify-between"><Mono>{k}</Mono><span className="tnum">{fmtInt(v)} · {fmtPct(v / q.n_raw)}</span></li>)}</ul>
      </div>
      <div>
        <h3 className="mb-1 text-xs font-medium text-label">Dòng bị loại</h3>
        <ul className="flex flex-col gap-1">{q.removed.map((r) => <li key={r.reason} className="flex justify-between gap-3"><span className="text-muted-foreground">{r.reason.replace(/`/g, "")}</span><span className="shrink-0 font-medium tnum">{fmtInt(r.rows)}</span></li>)}</ul>
      </div>
      <div>
        <h3 className="mb-1 text-xs font-medium text-label">Phân bố nhãn hủy</h3>
        <ul className="flex flex-col gap-0.5">{q.target.map((t) => (
          <li key={t.set} className="flex justify-between gap-3"><span>{SET_LABEL[t.set] ?? t.set}</span><span className="text-muted-foreground tnum">{fmtInt(t.n)} · hủy {fmtPct(t.cancel_rate)}</span></li>
        ))}</ul>
      </div>
      <p className="text-xs text-muted-foreground">Dòng trùng (booking theo đoàn) được giữ; chia theo ngày đến nên bản trùng luôn nằm cùng một tập. Chi tiết: reports/data_quality.md.</p>
    </div>
  )
}

function Dictionary({ rows }: { rows: DictRow[] }) {
  const [role, setRole] = useState("all")
  const data = useMemo(() => rows.filter((r) => role === "all" || r.role === role), [rows, role])
  const { flash } = useFocusRow(true)
  const roles = Array.from(new Set(rows.map((r) => r.role)))
  const columns = useMemo<ColumnDef<DictRow, unknown>[]>(() => [
    { accessorKey: "variable", header: "Tên biến", cell: ({ row, table }) => <code className="font-mono text-xs text-foreground"><Highlight text={row.original.variable} query={String(table.getState().globalFilter ?? "")} /></code> },
    { accessorKey: "type", header: "Kiểu", cell: ({ getValue }) => <span title={String(getValue())} className="block max-w-[120px] truncate text-muted-foreground">{String(getValue())}</span> },
    { accessorKey: "unit", header: "Đơn vị", cell: ({ getValue }) => (getValue() === "—" ? <span className="text-nodata">—</span> : String(getValue())) },
    { accessorKey: "role", header: "Vai trò", cell: ({ getValue }) => { const r = ROLES[String(getValue())]; return <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", r?.cls)}>{r?.label ?? String(getValue())}</span> } },
    { accessorKey: "available_at", header: "Thời điểm có sẵn", meta: { help: "Biến có sẵn ngay lúc đặt hay chỉ biết sau đó." } satisfies ColMeta },
    {
      accessorKey: "description", header: "Mô tả", enableSorting: false,
      cell: ({ row, table }) => (
        <InfoTip content={<>{row.original.description}<br /><b>Quyết định:</b> {row.original.decision}</>}>
          <span className="block max-w-[280px] truncate text-muted-foreground"><Highlight text={row.original.description} query={String(table.getState().globalFilter ?? "")} /></span>
        </InfoTip>
      ),
    },
  ], [])
  return (
    <DataTable data={data} total={rows.length} columns={columns} getRowId={(r) => r.variable} flashId={flash}
      searchText={(r) => `${r.variable} ${r.description} ${r.decision}`} searchPlaceholder="Tìm biến…" rowLabel="biến"
      toolbar={
        <Select value={role} onValueChange={(v) => setRole(v ?? "all")} items={[{ value: "all", label: "Mọi vai trò" }, ...roles.map((r) => ({ value: r, label: ROLES[r]?.label ?? r }))]}>
          <SelectTrigger className="h-9 min-w-44 rounded-full bg-card" aria-label="Lọc theo vai trò"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Mọi vai trò</SelectItem>
            {roles.map((r) => <SelectItem key={r} value={r}>{ROLES[r]?.label ?? r}</SelectItem>)}
          </SelectContent>
        </Select>
      } />
  )
}

export default function DataPage() {
  const q = useDataCard()
  return (
    <div className="flex h-full flex-col gap-4">
      <PageHeader title="Dữ liệu" description="Data card: nguồn, giấy phép, chất lượng và từ điển dữ liệu (thời điểm mỗi biến có sẵn)."
        actions={<a href="/api/files/data_dictionary.csv" download className={cn(buttonVariants({ variant: "outline" }), "h-9 rounded-full border-[#d5dce6] bg-card px-4 text-foreground hover:border-[#b8c2d1] hover:bg-[#f1f4f8]")}><Download /> Tải data_dictionary.csv</a>} />
      {q.isLoading ? <LoadingBlock rows={10} /> : q.isError || !q.data ? (
        <EmptyState icon={Database} title="Không tải được data card" description="Kiểm tra máy chủ FastAPI đang chạy." />
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 nav:grid-cols-12">
          <div className="flex min-h-0 flex-col gap-4 nav:col-span-4 fit:overflow-y-auto fit:pr-1">
            <Frame index={0} title="Nguồn & giấy phép" className="shrink-0"><SourceCard d={q.data} /></Frame>
            <Frame index={1} title="Chất lượng dữ liệu" className="shrink-0">
              {q.data.quality ? <QualityCard q={q.data.quality} /> : <EmptyState icon={Database} title="Chưa có báo cáo chất lượng" description="Chạy make data để sinh reports/data_quality.json." />}
            </Frame>
          </div>
          <Frame index={2} title="Từ điển dữ liệu" className="nav:col-span-8">
            {q.data.dictionary ? <Dictionary rows={q.data.dictionary} /> : <EmptyState icon={Database} title="Không có data_dictionary.csv" description="Tệp data/data_dictionary.csv bị thiếu." />}
          </Frame>
        </div>
      )}
    </div>
  )
}
