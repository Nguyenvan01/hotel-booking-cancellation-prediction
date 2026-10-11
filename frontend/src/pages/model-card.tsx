import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import Markdown, { type Components } from "react-markdown"
import remarkGfm from "remark-gfm"
import { Download, FileText } from "lucide-react"
import { EmptyState, Frame, LoadingBlock, PageHeader } from "@/components/common"
import { buttonVariants } from "@/components/ui/button"
import { useModelCard } from "@/lib/api"
import { normalize } from "@/lib/format"
import { cn } from "@/lib/utils"

const slug = (s: string) => normalize(s).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
const textOf = (n: ReactNode): string =>
  typeof n === "string" || typeof n === "number" ? String(n) : Array.isArray(n) ? n.map(textOf).join("") :
    n && typeof n === "object" && "props" in n ? textOf((n as { props: { children?: ReactNode } }).props.children) : ""

const components: Components = {
  h1: ({ children }) => <h2 className="mb-3 text-lg font-bold">{children}</h2>,
  h2: ({ children }) => <h2 id={slug(textOf(children))} className="mt-8 mb-3 scroll-mt-4 border-t pt-6 text-lg font-bold first:mt-0 first:border-0 first:pt-0">{children}</h2>,
  h3: ({ children }) => <h3 className="mt-5 mb-2 text-base font-bold">{children}</h3>,
  p: ({ children }) => <p className="mb-3 max-w-[75ch] text-[15px] leading-relaxed">{children}</p>,
  ul: ({ children }) => <ul className="mb-3 flex max-w-[75ch] list-disc flex-col gap-1.5 pl-5 text-[15px] leading-relaxed">{children}</ul>,
  ol: ({ children }) => <ol className="mb-3 flex max-w-[75ch] list-decimal flex-col gap-1.5 pl-5 text-[15px] leading-relaxed">{children}</ol>,
  a: ({ children, href }) => <a href={href} target="_blank" rel="noreferrer" className="focus-ring rounded text-primary underline-offset-4 hover:underline">{children}</a>,
  code: ({ children }) => <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs text-[#334155]">{children}</code>,
  pre: ({ children }) => <pre className="mb-3 overflow-auto rounded-lg bg-muted p-3 font-mono text-xs [&_code]:bg-transparent [&_code]:p-0">{children}</pre>,
  table: ({ children }) => <div className="mb-4 overflow-auto rounded-xl border border-[#e2e8f0]"><table className="w-full border-separate border-spacing-0 text-sm">{children}</table></div>,
  th: ({ children }) => <th className="h-9 border-b border-[#e2e8f0] bg-[#f4f7fb] px-3 text-left text-xs font-semibold whitespace-nowrap text-[#475569]">{children}</th>,
  td: ({ children }) => <td className="h-[35px] border-b border-[#e2e8f0] px-3 align-top tnum [tr:nth-child(even)>&]:bg-[#fafcff]">{children}</td>,
}

export default function ModelCardPage() {
  const q = useModelCard()
  const scroller = useRef<HTMLDivElement>(null)
  const toc = useMemo(() => (q.data ?? "").split("\n").filter((l) => l.startsWith("## ")).map((l) => l.slice(3).trim()), [q.data])
  const [active, setActive] = useState<string | null>(null)

  useEffect(() => {
    const el = scroller.current
    if (!el || !toc.length) return
    const onScroll = () => {
      // mục đang đọc = tiêu đề cuối cùng đã cuộn qua mép trên
      const top = el.getBoundingClientRect().top + 80
      let cur = toc[0]
      for (const t of toc) {
        const h = document.getElementById(slug(t))
        if (h && h.getBoundingClientRect().top <= top) cur = t
      }
      setActive(cur)
    }
    onScroll()
    const target = el.scrollHeight > el.clientHeight ? el : window
    target.addEventListener("scroll", onScroll, { passive: true })
    return () => target.removeEventListener("scroll", onScroll)
  }, [toc])

  return (
    <div className="flex h-full flex-col gap-4">
      <PageHeader title="Model card" description="Nội dung lấy nguyên văn từ reports/model_card.md."
        actions={<a href="/api/files/model_card.md" download className={cn(buttonVariants({ variant: "outline" }), "h-9 rounded-full px-4")}><Download /> Tải model_card.md</a>} />
      {q.isLoading ? <LoadingBlock rows={10} /> : q.isError || !q.data ? (
        <EmptyState icon={FileText} title="Không tải được model card" description="Kiểm tra máy chủ và tệp reports/model_card.md." />
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 nav:grid-cols-12">
          <Frame index={0} title="Mục lục" className="hidden nav:col-span-3 nav:flex nav:self-start nav:sticky nav:top-4 fit:static fit:self-stretch">
            <nav aria-label="Mục lục model card">
              <ol className="flex flex-col gap-0.5 border-l border-[#e5e7eb]">
                {toc.map((t) => (
                  <li key={t}>
                    <a href={`#${slug(t)}`} onClick={(e) => { e.preventDefault(); document.getElementById(slug(t))?.scrollIntoView({ behavior: "smooth", block: "start" }) }}
                      aria-current={active === t ? "location" : undefined}
                      className={cn("focus-ring -ml-px block border-l-[3px] border-transparent py-1.5 pr-2 pl-3 text-sm text-[#334155] hover:text-foreground",
                        active === t && "border-[#2563eb] bg-selected font-medium text-[#2563eb]")}>{t}</a>
                  </li>
                ))}
              </ol>
            </nav>
          </Frame>
          <Frame index={1} className="nav:col-span-9">
            <div ref={scroller} className="h-full fit:overflow-y-auto fit:-mr-3 fit:pr-3">
              <article><Markdown remarkPlugins={[remarkGfm]} components={components}>{q.data}</Markdown></article>
            </div>
          </Frame>
        </div>
      )}
    </div>
  )
}
