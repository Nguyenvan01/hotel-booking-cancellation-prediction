import { Link } from "react-router"
import { motion } from "motion/react"
import { ArrowRight, Ban, Clock, Database, ShieldCheck } from "lucide-react"
import { Frame, InfoTip, LoadingBlock, PageHeader, fadeUp } from "@/components/common"
import { buttonVariants } from "@/components/ui/button"
import { useDataCard, useModelInfo } from "@/lib/api"
import { fmtDate, fmtInt, fmtPct } from "@/lib/format"
import { cn } from "@/lib/utils"

const ROLE_LABEL: Record<string, string> = {
  excluded_leakage: "Chỉ biết sau khi đặt (đề bài cấm)",
  excluded_suspect: "Nghi ghi nhận sau khi đặt / rủi ro công bằng",
  sensitivity_only: "Nghi vấn, chỉ dùng cho ablation",
}

export default function IntroPage() {
  const info = useModelInfo()
  const card = useDataCard()
  const q = card.data?.quality
  const order = ["excluded_leakage", "excluded_suspect", "sensitivity_only"]
  const excluded = [...(info.data?.excluded ?? [])].sort((a, b) => order.indexOf(a.role) - order.indexOf(b.role))

  return (
    <div className="flex h-full flex-col gap-4">
      <PageHeader title="Giới thiệu & phạm vi"
        description="Công cụ nội bộ giúp lễ tân ưu tiên gọi xác nhận các booking có rủi ro hủy cao."
        actions={<Link to="/predict" className={cn(buttonVariants(), "h-9 rounded-full px-4")}>Bắt đầu dự đoán <ArrowRight /></Link>} />

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 nav:grid-cols-12 nav:grid-rows-[auto_minmax(0,1fr)]">
        <Frame index={0} className="nav:col-span-4" title={<span className="inline-flex items-center gap-2"><Clock className="size-[18px] text-primary" />Câu hỏi nghiên cứu</span>}>
          <p className="text-base leading-relaxed">
            Với thông tin có <b>ngay khi booking được tạo</b>, hồi quy logistic dự đoán xác suất hủy và hỗ trợ chọn ngưỡng hành động ra sao?
          </p>
          <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Đơn vị</dt><dd>Một booking tại thời điểm được tạo</dd>
            <dt className="text-muted-foreground">Đầu ra</dt><dd>Xác suất hủy và nhóm ưu tiên xác nhận</dd>
            <dt className="text-muted-foreground">Mô hình</dt><dd>Logistic regression, {info.data ? `${info.data.params.penalty.toUpperCase()}, C = ${info.data.params.C}` : "…"}</dd>
          </dl>
        </Frame>

        <Frame index={1} className="nav:col-span-4" title={<span className="inline-flex items-center gap-2"><Database className="size-[18px] text-primary" />Phạm vi dữ liệu</span>}>
          {card.isLoading ? <LoadingBlock rows={3} /> : (
            <div className="flex flex-col gap-3 text-sm">
              <p>
                <b>{card.data?.name ?? "Hotel Booking Demand"}</b> (Data in Brief, 2019),{" "}
                <a className="focus-ring rounded text-primary underline-offset-4 hover:underline" href={card.data?.doi} target="_blank" rel="noreferrer">DOI</a>, giấy phép {card.data?.license ?? "CC BY 4.0"}.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="lift rounded-xl border p-3"><div className="text-xs text-muted-foreground">Booking (thô)</div><div className="text-lg font-bold tnum">{fmtInt(q?.n_raw)}</div></div>
                <div className="lift rounded-xl border p-3"><div className="text-xs text-muted-foreground">Tỷ lệ hủy</div><div className="text-lg font-bold tnum">{fmtPct(q?.target.find((t) => t.set === "all")?.cancel_rate)}</div></div>
              </div>
              <p className="text-muted-foreground">Khách sạn: {(info.data?.hotels ?? []).join(" và ") || "…"} (Bồ Đào Nha), gộp chung. Chia theo ngày đến:</p>
              <ul className="flex flex-col gap-1 text-xs text-muted-foreground tnum">
                {(q?.target ?? []).filter((t) => t.set !== "all").map((t) => (
                  <li key={t.set} className="flex justify-between gap-2">
                    <span className="font-medium text-foreground">{t.set === "val" ? "Validation" : t.set === "train" ? "Train" : "Test"}</span>
                    <span>{fmtDate(t.arrival_from)} – {fmtDate(t.arrival_to)} · {fmtInt(t.n)} booking</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Frame>

        <Frame index={2} className="nav:col-span-4" title={<span className="inline-flex items-center gap-2"><ShieldCheck className="size-[18px] text-primary" />Cách dùng có trách nhiệm</span>}>
          <ul className="flex flex-col gap-2.5 text-sm">
            <li className="flex gap-2"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-better" aria-hidden /><span>Chỉ để <b className="font-semibold">ưu tiên gọi xác nhận</b>; quyết định cuối cùng thuộc về nhân viên.</span></li>
            <li className="flex gap-2"><Ban className="mt-0.5 size-4 shrink-0 text-worse" aria-hidden /><span>Không tự động hủy, không tăng giá, không phân biệt đối xử với khách.</span></li>
            <li className="flex gap-2"><Ban className="mt-0.5 size-4 shrink-0 text-worse" aria-hidden /><span>Không dùng quốc tịch hay thông tin định danh khách.</span></li>
            <li className="flex gap-2"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-better" aria-hidden /><span>Không lưu dữ liệu booking nhập vào; kết quả mất khi tải lại trang.</span></li>
          </ul>
        </Frame>

        <Frame index={3} className="nav:col-span-12" title="Biến đã loại vì chỉ biết sau khi đặt hoặc nghi vấn"
          actions={<span className="text-xs text-muted-foreground">Rê chuột hoặc Tab vào từng biến để xem lý do</span>}>
          {info.isLoading ? <LoadingBlock rows={2} /> : (
            <div className="flex flex-col gap-4">
              {order.map((role, gi) => (
                <div key={role}>
                  <div className="mb-2 text-xs font-medium text-label">{ROLE_LABEL[role]}</div>
                  <div className="flex flex-wrap gap-2">
                    {excluded.filter((e) => e.role === role).map((e, i) => (
                      <motion.span key={e.variable} {...fadeUp(gi * 3 + i * 0.3)}>
                        <InfoTip content={<><b>{e.variable}</b> · có sẵn: {e.available_at}<br />{e.reason}</>}>
                          <code className="lift inline-flex h-7 items-center rounded-full border bg-muted px-3 font-mono text-xs text-[#334155]">{e.variable}</code>
                        </InfoTip>
                      </motion.span>
                    ))}
                  </div>
                </div>
              ))}
              <p className="text-sm text-muted-foreground">
                Mô hình chỉ dùng {info.data?.fields.length ?? 16} biến có sẵn lúc đặt. Lý do chi tiết: <Link className="focus-ring rounded text-primary hover:underline" to="/data">Dữ liệu</Link> và <Link className="focus-ring rounded text-primary hover:underline" to="/model-card">Model card</Link>.
              </p>
            </div>
          )}
        </Frame>
      </div>
    </div>
  )
}
