import { useState, type ReactNode } from "react"
import {
  flexRender, getCoreRowModel, getFilteredRowModel, getSortedRowModel, useReactTable,
  type ColumnDef, type SortingState,
} from "@tanstack/react-table"
import { motion } from "motion/react"
import { ArrowUp, Search } from "lucide-react"
import { HelpTip } from "@/components/common"
import { Input } from "@/components/ui/input"
import { useDebounced } from "@/lib/hooks"
import { fmtInt, matches } from "@/lib/format"
import { cn } from "@/lib/utils"

export type ColMeta = { align?: "left" | "right" | "center"; help?: string; groupEnd?: boolean; width?: number }

/** Bảng có tiêu đề dính, cột đầu dính, sắp xếp, tìm kiếm không dấu (debounce 250ms) và nháy dòng được nhảy tới. */
export function DataTable<T>({
  data, columns, getRowId, searchText, searchPlaceholder = "Tìm…", toolbar, total, stickyFirst = true,
  flashId, isHighlighted, rowLabel = "dòng", empty,
}: {
  data: T[]
  columns: ColumnDef<T, unknown>[]
  getRowId: (row: T) => string
  searchText: (row: T) => string
  searchPlaceholder?: string
  toolbar?: ReactNode
  total?: number
  stickyFirst?: boolean
  flashId?: string | null
  isHighlighted?: (row: T) => boolean
  rowLabel?: string
  empty?: ReactNode
}) {
  const [raw, setRaw] = useState("")
  const query = useDebounced(raw, 250)
  const [sorting, setSorting] = useState<SortingState>([])
  const [scroll, setScroll] = useState({ x: false, y: false })
  const table = useReactTable({
    data,
    columns,
    state: { sorting, globalFilter: query },
    onSortingChange: setSorting,
    getRowId: (r) => getRowId(r),
    globalFilterFn: (row, _c, value: string) => matches(value, searchText(row.original)),
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })
  const rows = table.getRowModel().rows

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-64">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-label" aria-hidden />
          <Input value={raw} onChange={(e) => setRaw(e.target.value)} placeholder={searchPlaceholder}
            aria-label={searchPlaceholder} className="h-9 rounded-full border-input bg-card pl-9 text-sm" />
        </div>
        {toolbar}
        <span className="ml-auto text-xs text-muted-foreground tnum" aria-live="polite">
          {query ? `Tìm thấy ${fmtInt(rows.length)}/${fmtInt(total ?? data.length)}` : `${fmtInt(rows.length)} ${rowLabel}`}
        </span>
      </div>
      <div
        className="relative min-h-0 flex-1 overflow-auto rounded-xl border border-[#e2e8f0] fit:max-h-none max-h-[560px]"
        onScroll={(e) => {
          const t = e.currentTarget
          if ((t.scrollTop > 0) !== scroll.y || (t.scrollLeft > 0) !== scroll.x) setScroll({ x: t.scrollLeft > 0, y: t.scrollTop > 0 })
        }}
      >
        <table className="w-full border-separate border-spacing-0 text-sm">
          <thead className={cn("sticky top-0 z-20 transition-shadow", scroll.y && "shadow-[0_4px_8px_-6px_rgb(15_23_42/0.25)]")}>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((h, i) => {
                  const meta = (h.column.columnDef.meta ?? {}) as ColMeta
                  const sorted = h.column.getIsSorted()
                  const sticky = stickyFirst && i === 0
                  return (
                    <th key={h.id} scope="col" style={{ width: meta.width }}
                      aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : undefined}
                      className={cn(
                        "h-9 border-b border-[#e2e8f0] bg-[#f4f7fb] px-3 text-xs font-semibold whitespace-nowrap text-[#475569]",
                        meta.align === "right" ? "text-right" : meta.align === "center" ? "text-center" : "text-left",
                        meta.groupEnd && "border-r border-r-[#cbd5e1]",
                        sorted && "bg-[#e9f0fb]",
                        sticky && "sticky left-0 z-30",
                        sticky && scroll.x && "shadow-[4px_0_8px_-6px_rgb(15_23_42/0.25)]",
                      )}>
                      {h.isPlaceholder ? null : h.column.getCanSort() ? (
                        <span className={cn("inline-flex items-center gap-1", meta.align === "right" && "flex-row-reverse")}>
                          <button type="button" onClick={h.column.getToggleSortingHandler()}
                            className="focus-ring inline-flex items-center gap-1 rounded-md hover:text-foreground">
                            {flexRender(h.column.columnDef.header, h.getContext())}
                            <ArrowUp aria-hidden className={cn("size-3.5 transition-transform duration-200",
                              !sorted && "opacity-30", sorted === "desc" && "rotate-180")} />
                          </button>
                          {meta.help && <HelpTip content={meta.help} />}
                        </span>
                      ) : (
                        flexRender(h.column.columnDef.header, h.getContext())
                      )}
                    </th>
                  )
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {rows.map((row, ri) => {
              const hl = isHighlighted?.(row.original)
              return (
                <motion.tr key={row.id} layout="position" data-row-id={row.id}
                  initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.32, delay: Math.min(ri * 0.015, 0.3), layout: { duration: 0.25 } }}
                  className={cn("group/row", flashId === row.id && "flash-row")}>
                  {row.getVisibleCells().map((cell, i) => {
                    const meta = (cell.column.columnDef.meta ?? {}) as ColMeta
                    const sticky = stickyFirst && i === 0
                    return (
                      <td key={cell.id}
                        className={cn(
                          "h-[35px] border-b border-[#e2e8f0] px-3 whitespace-nowrap",
                          hl ? "bg-[#eef4ff] font-semibold text-[#1e3a5f]" : ri % 2 ? "bg-[#fafcff]" : "bg-card",
                          "group-hover/row:bg-[#f1f5f9]",
                          meta.align === "right" ? "text-right font-medium tnum" : meta.align === "center" ? "text-center tnum" : "text-left",
                          meta.groupEnd && "border-r border-r-[#cbd5e1]",
                          sticky && "sticky left-0 z-10",
                          sticky && scroll.x && "shadow-[4px_0_8px_-6px_rgb(15_23_42/0.25)]",
                        )}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    )
                  })}
                </motion.tr>
              )
            })}
          </tbody>
        </table>
        {rows.length === 0 && <div className="p-6">{empty ?? <p className="text-center text-sm text-muted-foreground">Không có dòng nào khớp.</p>}</div>}
      </div>
    </div>
  )
}

/** Ô số: "—" khi không có số liệu. */
export function NumCell({ value, format }: { value: number | null | undefined; format: (v: number) => string }) {
  return typeof value === "number" && Number.isFinite(value) ? <>{format(value)}</> : <span className="text-nodata">—</span>
}
