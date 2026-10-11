import { BookOpen, ChartLine, Database, FileText, Gauge, Info, type LucideIcon } from "lucide-react"

export type NavLeaf = { id: string; label: string; path: string; description: string }
export type NavItem =
  | (NavLeaf & { icon: LucideIcon })
  | { id: string; label: string; icon: LucideIcon; children: NavLeaf[] }
  | { id: string; label: string; icon: LucideIcon; href: string }

export const NAV: NavItem[] = [
  { id: "intro", label: "Giới thiệu & phạm vi", icon: Info, path: "/", description: "Câu hỏi, dữ liệu, cách dùng có trách nhiệm" },
  { id: "predict", label: "Dự đoán rủi ro", icon: Gauge, path: "/predict", description: "Nhập booking, nhận xác suất hủy" },
  {
    id: "evaluation",
    label: "Đánh giá mô hình",
    icon: ChartLine,
    children: [
      { id: "overview", label: "Tổng quan & baseline", path: "/evaluation/overview", description: "ROC-AUC, PR-AUC, log loss so với baseline" },
      { id: "thresholds", label: "Ngưỡng hành động", path: "/evaluation/thresholds", description: "Ba ngưỡng, ma trận nhầm lẫn" },
      { id: "calibration", label: "Calibration", path: "/evaluation/calibration", description: "Reliability diagram, Brier" },
      { id: "odds", label: "Hệ số & odds ratio", path: "/evaluation/odds", description: "Diễn giải có điều kiện" },
      { id: "errors", label: "Phân tích lỗi", path: "/evaluation/errors", description: "Sai số theo nhóm và tháng đến" },
    ],
  },
  { id: "model-card", label: "Model card", icon: FileText, path: "/model-card", description: "Mục đích, giới hạn, phiên bản" },
  { id: "data", label: "Dữ liệu", icon: Database, path: "/data", description: "Nguồn, giấy phép, data dictionary" },
  { id: "docs", label: "Tài liệu API", icon: BookOpen, href: "/docs" },
]

export const LEAVES: NavLeaf[] = NAV.flatMap((n) => ("children" in n ? n.children : "path" in n ? [n] : []))
