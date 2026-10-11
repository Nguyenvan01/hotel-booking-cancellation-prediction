import { useEffect, useRef, useState } from "react"
import { useSearchParams } from "react-router"
import { toast } from "sonner"
import { api } from "@/lib/api"

export function useMediaQuery(query: string) {
  const [match, setMatch] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const on = () => setMatch(mq.matches)
    mq.addEventListener("change", on)
    return () => mq.removeEventListener("change", on)
  }, [query])
  return match
}

// localStorage chỉ cho tiện ích giao diện (trạng thái menu); có thể bị chặn nên bọc try/catch.
export function readStored<T>(key: string, fallback: T): T {
  try {
    const v = window.localStorage.getItem(key)
    return v === null ? fallback : (JSON.parse(v) as T)
  } catch {
    return fallback
  }
}
export function writeStored(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* bỏ qua: trình duyệt chặn lưu trữ */
  }
}
export function useStoredState<T>(key: string, fallback: T) {
  const [v, setV] = useState<T>(() => readStored(key, fallback))
  useEffect(() => writeStored(key, v), [key, v])
  return [v, setV] as const
}

export function useDebounced<T>(value: T, ms = 250) {
  const [v, setV] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms)
    return () => clearTimeout(id)
  }, [value, ms])
  return v
}

// ---- Giám sát kết nối: sau một lần mất kết nối, thử /api/health mỗi 4 giây; nối lại thì báo toast.
let offline = false
let timer: ReturnType<typeof setInterval> | undefined
export function reportOffline() {
  if (offline) return
  offline = true
  timer = setInterval(async () => {
    try {
      await api.health()
      offline = false
      clearInterval(timer)
      toast.success("Đã kết nối lại")
    } catch {
      /* vẫn mất kết nối */
    }
  }, 4000)
}

/** Dòng được nhảy tới từ ô tìm kiếm (?focus=...): cuộn tới và nháy nền 1,4 giây. `resolve` đổi focus -> id dòng. */
export function useFocusRow(ready: boolean, resolve: (focus: string) => string | undefined = (f) => f) {
  const [params] = useSearchParams()
  const focus = params.get("focus")
  const [flash, setFlash] = useState<string | null>(null)
  const done = useRef<string | null>(null)
  const resolveRef = useRef(resolve)
  resolveRef.current = resolve
  useEffect(() => {
    if (!ready || !focus || done.current === focus) return
    done.current = focus
    const target = resolveRef.current(focus)
    if (!target) return
    requestAnimationFrame(() => document.querySelector(`[data-row-id="${CSS.escape(target)}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" }))
    setFlash(target)
    setTimeout(() => setFlash(null), 1400)
  }, [ready, focus])
  return { focus, flash }
}
