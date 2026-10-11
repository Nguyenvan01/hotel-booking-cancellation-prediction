import { StrictMode, Suspense, lazy } from "react"
import { createRoot } from "react-dom/client"
import { BrowserRouter, Link, Navigate, Route, Routes } from "react-router"
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MotionConfig } from "motion/react"
import { toast } from "sonner"
import { SearchX } from "lucide-react"
import { AppShell } from "@/components/layout"
import { EmptyState, LoadingBlock } from "@/components/common"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { ApiError } from "@/lib/api"
import { reportOffline } from "@/lib/hooks"
import IntroPage from "@/pages/intro"
import "./index.css"

const PredictPage = lazy(() => import("@/pages/predict"))
const ModelCardPage = lazy(() => import("@/pages/model-card"))
const DataPage = lazy(() => import("@/pages/data"))
const evaluation = () => import("@/pages/evaluation")
const OverviewPage = lazy(() => evaluation().then((m) => ({ default: m.OverviewPage })))
const ThresholdsPage = lazy(() => evaluation().then((m) => ({ default: m.ThresholdsPage })))
const CalibrationPage = lazy(() => evaluation().then((m) => ({ default: m.CalibrationPage })))
const OddsPage = lazy(() => evaluation().then((m) => ({ default: m.OddsPage })))
const ErrorsPage = lazy(() => evaluation().then((m) => ({ default: m.ErrorsPage })))

// Lỗi khi tải số liệu (GET): mất kết nối hoặc 5xx -> một toast; dự đoán (POST) tự xử lý lỗi trong trang.
const onQueryError = (e: unknown) => {
  if (e instanceof ApiError && (e.status === 0 || e.status >= 500)) {
    if (e.status === 0) reportOffline()
    toast.error("Không gọi được máy chủ mô hình", { id: "server-down" })
  }
}
const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: onQueryError }),
  mutationCache: new MutationCache(),
  defaultOptions: { queries: { refetchOnWindowFocus: false } },
})

function NotFound() {
  return (
    <EmptyState icon={SearchX} title="Không có trang này"
      description="Đường dẫn không tồn tại. Dùng menu bên trái hoặc ô tìm kiếm (Ctrl/⌘ K) để chuyển màn hình." />
  )
}

const page = (el: React.ReactNode) => <Suspense fallback={<LoadingBlock rows={8} />}>{el}</Suspense>

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <MotionConfig reducedMotion="user">
        <TooltipProvider delay={200}>
          <BrowserRouter>
            <Routes>
              <Route element={<AppShell />}>
                <Route index element={<IntroPage />} />
                <Route path="predict" element={page(<PredictPage />)} />
                <Route path="evaluation" element={<Navigate to="/evaluation/overview" replace />} />
                <Route path="evaluation/overview" element={page(<OverviewPage />)} />
                <Route path="evaluation/thresholds" element={page(<ThresholdsPage />)} />
                <Route path="evaluation/calibration" element={page(<CalibrationPage />)} />
                <Route path="evaluation/odds" element={page(<OddsPage />)} />
                <Route path="evaluation/errors" element={page(<ErrorsPage />)} />
                <Route path="model-card" element={page(<ModelCardPage />)} />
                <Route path="data" element={page(<DataPage />)} />
                <Route path="*" element={<div className="flex h-full flex-col gap-3"><NotFound /><Link to="/" className="text-center text-sm text-primary">Về trang giới thiệu</Link></div>} />
              </Route>
            </Routes>
          </BrowserRouter>
          <Toaster />
        </TooltipProvider>
      </MotionConfig>
    </QueryClientProvider>
  </StrictMode>,
)
