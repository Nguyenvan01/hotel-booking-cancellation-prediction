import { useEffect, useMemo, useState } from "react"
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router"
import { AnimatePresence, motion } from "motion/react"
import { ChevronDown, ExternalLink, Menu, PanelLeftClose, PanelLeftOpen, Search } from "lucide-react"
import { Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Kbd } from "@/components/ui/kbd"
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useDataCard, useModelInfo } from "@/lib/api"
import { fmtDate, matches } from "@/lib/format"
import { useMediaQuery, useStoredState } from "@/lib/hooks"
import { NAV, LEAVES, type NavItem } from "@/lib/nav"
import { cn } from "@/lib/utils"

function Logo() {
  return (
    <svg viewBox="0 0 32 32" className="size-7 shrink-0" aria-hidden>
      <rect width="32" height="32" rx="8" fill="#3478F6" />
      <path d="M9 21V11h6.5a3.5 3.5 0 0 1 0 7H12m6 0 4 3" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

const itemBase = "focus-ring relative flex h-9 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium text-[#334155] transition-colors duration-150 hover:bg-muted"

function ActiveBg() {
  return <motion.span layoutId="nav-active-bg" className="absolute inset-0 -z-10 rounded-lg bg-[#eff4ff]" transition={{ type: "spring", stiffness: 500, damping: 40 }} />
}

function RailTip({ label, children }: { label: string; children: React.ReactElement }) {
  return (
    <Tooltip>
      <TooltipTrigger render={children} />
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  )
}

function NavEntry({ item, rail, onNavigate }: { item: NavItem; rail: boolean; onNavigate?: () => void }) {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const [open, setOpen] = useStoredState<Record<string, boolean>>("nav-open", { evaluation: true })
  const Icon = item.icon

  if ("href" in item) {
    const link = (
      <a href={item.href} target="_blank" rel="noreferrer" className={cn(itemBase, rail && "justify-center px-0")}>
        <Icon className="size-[18px] shrink-0 text-muted-foreground" aria-hidden />
        {!rail && <><span className="truncate">{item.label}</span><ExternalLink className="ml-auto size-3.5 text-label" aria-label="mở tab mới" /></>}
      </a>
    )
    return <li>{rail ? <RailTip label={`${item.label} (mở tab mới)`}>{link}</RailTip> : link}</li>
  }

  if ("children" in item) {
    const activeChild = item.children.find((c) => pathname.startsWith(c.path))
    const isOpen = open[item.id] ?? true
    if (rail) {
      return (
        <li>
          <RailTip label={item.label}>
            <button type="button" onClick={() => { navigate(item.children[0].path); onNavigate?.() }}
              className={cn(itemBase, "justify-center px-0", activeChild && "text-[#2563eb]")} aria-label={item.label}>
              {activeChild && <ActiveBg />}
              <Icon className="size-[18px]" aria-hidden />
            </button>
          </RailTip>
        </li>
      )
    }
    return (
      <li>
        <button type="button" aria-expanded={isOpen} onClick={() => setOpen({ ...open, [item.id]: !isOpen })} className={itemBase}>
          <Icon className={cn("size-[18px] shrink-0", activeChild ? "text-[#2563eb]" : "text-muted-foreground")} aria-hidden />
          <span className="truncate">{item.label}</span>
          <ChevronDown className={cn("ml-auto size-4 text-label transition-transform duration-[220ms] ease-in-out", isOpen && "rotate-180")} aria-hidden />
        </button>
        <AnimatePresence initial={false}>
          {isOpen && (
            <motion.ul initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.22, ease: "easeInOut" }} className="relative ml-[21px] overflow-hidden border-l border-[#e5e7eb] pl-[10px]">
              {item.children.map((c) => {
                const active = pathname.startsWith(c.path)
                return (
                  <li key={c.id} className="relative py-px">
                    {active && <motion.span layoutId="nav-active-bar" className="absolute top-1.5 bottom-1.5 left-[-11.5px] w-[3px] rounded-full bg-[#2563eb]" transition={{ type: "spring", stiffness: 500, damping: 40 }} />}
                    <NavLink to={c.path} onClick={onNavigate} className={cn(itemBase, "h-8 font-normal", active && "text-[#2563eb] font-medium")}>
                      {active && <ActiveBg />}
                      <span className="truncate">{c.label}</span>
                    </NavLink>
                  </li>
                )
              })}
            </motion.ul>
          )}
        </AnimatePresence>
      </li>
    )
  }

  const active = item.path === "/" ? pathname === "/" : pathname.startsWith(item.path)
  const link = (
    <NavLink to={item.path} onClick={onNavigate} aria-label={rail ? item.label : undefined}
      className={cn(itemBase, rail && "justify-center px-0", active && "text-[#2563eb]")}>
      {active && <ActiveBg />}
      <Icon className={cn("size-[18px] shrink-0", active ? "text-[#2563eb]" : "text-muted-foreground")} aria-hidden />
      {!rail && <span className="truncate">{item.label}</span>}
    </NavLink>
  )
  return <li>{rail ? <RailTip label={item.label}>{link}</RailTip> : link}</li>
}

function Sidebar({ rail, onToggle, onNavigate, showToggle = true }: {
  rail: boolean; onToggle?: () => void; onNavigate?: () => void; showToggle?: boolean
}) {
  const info = useModelInfo()
  return (
    <aside className={cn("flex h-full flex-col border-r border-[#e5e7eb] bg-card transition-[width] duration-200", rail ? "w-16" : "w-60")}
      aria-label="Điều hướng chính">
      <div className={cn("flex h-16 shrink-0 items-center gap-2.5 px-4", rail && "justify-center px-0")}>
        {!rail && <Logo />}
        {!rail && <Link to="/" onClick={onNavigate} className="focus-ring truncate rounded-md text-[15px] font-bold">Rủi ro hủy phòng</Link>}
        {showToggle && (
          <button type="button" onClick={onToggle} className={cn("focus-ring grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-muted", !rail && "ml-auto")}
            aria-label={rail ? "Mở rộng thanh bên" : "Thu gọn thanh bên"}>
            {rail ? <PanelLeftOpen className="size-[18px]" /> : <PanelLeftClose className="size-[18px]" />}
          </button>
        )}
      </div>
      <nav className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        <ul className="isolate flex flex-col gap-0.5">
          {NAV.map((item) => <NavEntry key={item.id} item={item} rail={rail} onNavigate={onNavigate} />)}
        </ul>
      </nav>
      {!rail && (
        <div className="shrink-0 border-t border-[#e5e7eb] px-4 py-3 text-xs text-label">
          {info.data ? (<><div className="truncate">Mô hình {info.data.model_version}</div><div>Huấn luyện {fmtDate(info.data.trained_at)}</div></>) : <div>Đang tải thông tin mô hình…</div>}
        </div>
      )}
    </aside>
  )
}

function SearchCommand({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const navigate = useNavigate()
  const [q, setQ] = useState("")
  const info = useModelInfo()
  const card = useDataCard(open)
  useEffect(() => { if (!open) setQ("") }, [open])
  const go = (to: string) => { onOpenChange(false); navigate(to) }
  const screens = LEAVES.filter((l) => matches(q, l.label, l.description))
  const features = (info.data?.fields ?? []).filter((f) => matches(q, f.label, f.name))
  const vars = (card.data?.dictionary ?? []).filter((d) => matches(q, d.variable, d.description))
  const limit = q ? 8 : 5
  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title="Tìm kiếm" description="Tìm màn hình, biến của mô hình hoặc biến trong từ điển dữ liệu">
      <Command shouldFilter={false}>
        <CommandInput value={q} onValueChange={setQ} placeholder="Tìm màn hình, biến (không cần dấu)…" />
        <CommandList className="max-h-96">
          <CommandEmpty>Không tìm thấy kết quả.</CommandEmpty>
          {screens.length > 0 && (
            <CommandGroup heading="Màn hình">
              {screens.map((s) => (
                <CommandItem key={s.id} value={`screen-${s.id}`} onSelect={() => go(s.path)}>
                  <span>{s.label}</span><span className="ml-auto truncate text-xs text-muted-foreground">{s.description}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {features.length > 0 && (
            <CommandGroup heading="Biến của mô hình → bảng odds ratio">
              {features.slice(0, limit).map((f) => (
                <CommandItem key={f.name} value={`feat-${f.name}`} onSelect={() => go(`/evaluation/odds?focus=${f.name}`)}>
                  <span>{f.label}</span><code className="ml-auto font-mono text-xs text-muted-foreground">{f.name}</code>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {vars.length > 0 && (
            <CommandGroup heading="Từ điển dữ liệu">
              {vars.slice(0, limit).map((d) => (
                <CommandItem key={d.variable} value={`var-${d.variable}`} onSelect={() => go(`/data?focus=${d.variable}`)}>
                  <code className="font-mono text-xs">{d.variable}</code><span className="ml-auto max-w-64 truncate text-xs text-muted-foreground">{d.description}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </Command>
    </CommandDialog>
  )
}

export function AppShell() {
  const wide = useMediaQuery("(min-width: 1280px)")
  const desktop = useMediaQuery("(min-width: 900px)")
  const [collapsedPref, setCollapsedPref] = useStoredState<boolean | null>("sidebar-collapsed", null)
  const [drawer, setDrawer] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const location = useLocation()
  const rail = collapsedPref ?? !wide
  const isMac = useMemo(() => /Mac|iPhone|iPad/.test(navigator.platform), [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        setSearchOpen((v) => !v)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  return (
    <div className="relative flex min-h-screen bg-background fit:h-screen fit:overflow-hidden">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-card focus:px-3 focus:py-2">Bỏ qua điều hướng</a>
      {desktop && (
        <div className="sticky top-0 h-screen shrink-0">
          <Sidebar rail={rail} onToggle={() => setCollapsedPref(!rail)} />
        </div>
      )}
      <Sheet open={drawer && !desktop} onOpenChange={setDrawer}>
        <SheetContent side="left" showCloseButton={false} className="w-60 gap-0 p-0 data-[side=left]:w-60">
          <SheetTitle className="sr-only">Điều hướng</SheetTitle>
          <Sidebar rail={false} showToggle={false} onNavigate={() => setDrawer(false)} />
        </SheetContent>
      </Sheet>
      <div className="flex min-w-0 flex-1 flex-col fit:h-screen">
        <header className="flex h-16 shrink-0 items-center gap-3 px-4 nav:px-6">
          {!desktop && (
            <button type="button" onClick={() => setDrawer(true)} className="focus-ring grid size-10 place-items-center rounded-full border bg-card" aria-label="Mở điều hướng">
              <Menu className="size-[18px]" />
            </button>
          )}
          <button type="button" onClick={() => setSearchOpen(true)}
            className="focus-ring flex h-10 w-full max-w-md items-center gap-2 rounded-full border border-input bg-card px-4 text-sm text-muted-foreground transition-colors hover:border-[color-mix(in_oklab,var(--primary)_35%,var(--input))]">
            <Search className="size-4 text-label" aria-hidden />
            <span className="truncate">Tìm màn hình, biến, feature…</span>
            <Kbd className="ml-auto hidden nav:inline-flex">{isMac ? "⌘" : "Ctrl"} K</Kbd>
          </button>
        </header>
        <main id="main" className="min-h-0 flex-1 px-4 pb-6 nav:px-6 fit:overflow-hidden">
          <motion.div key={location.pathname} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, ease: "easeOut" }}
            className="h-full">
            <Outlet />
          </motion.div>
        </main>
      </div>
      <SearchCommand open={searchOpen} onOpenChange={setSearchOpen} />
    </div>
  )
}
