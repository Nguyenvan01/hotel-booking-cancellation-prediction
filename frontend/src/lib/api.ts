import { useQuery } from "@tanstack/react-query"

// ---- Kiểu dữ liệu trả về từ FastAPI (app/main.py). UI chỉ đọc, không chứa logic mô hình.
export type FieldSpec = {
  name: string
  label: string
  description?: string | null
  group: string
  unit?: string | null
  required: boolean
  type: "integer" | "boolean" | "category"
  min?: number
  max?: number
  train?: { min: number; max: number; p01: number; p99: number } | null
  options?: { value: string; train_count: number }[]
}
export type ThresholdKey = "high_recall" | "balanced_f1" | "capacity"
export type RiskGroup = { name: string; min_probability: number; action: string }
export type DemoBooking = { id: string; label: string; booking: Record<string, string | number | boolean> }
export type ModelInfo = {
  model_version: string
  trained_at: string
  params: { C: number; penalty: string; class_weight: string | null; solver: string }
  split: { val_start: string; test_start: string; n_train: number; n_val: number }
  hotels: string[]
  thresholds: Record<ThresholdKey, number>
  risk_groups: RiskGroup[]
  fields: FieldSpec[]
  demo_bookings: DemoBooking[]
  excluded: { variable: string; role: string; available_at: string; reason: string }[]
}
export type ModelId = "main" | "lead_time" | "prior" | "balanced"
export type Score = {
  roc_auc: number
  pr_auc: number
  log_loss: number
  brier: number
  ci95: Record<"roc_auc" | "pr_auc" | "log_loss" | "brier", [number, number]>
}
export type ThresholdSummary = {
  threshold: number
  tn: number
  fp: number
  fn: number
  tp: number
  precision: number
  recall: number
  f1: number
  flagged_share: number
}
export type CalBin = {
  bin_start: number
  bin_end: number
  count: number
  n_canceled: number
  n_not_canceled: number
  mean_predicted: number | null
  observed_rate: number | null
}
export type OddsRow = {
  feature: string
  label: string
  group: string | null
  term: string
  level: string | null
  comparison: string
  coef: number
  odds_ratio: number
}
export type ErrorRow = {
  variable: string
  variable_label: string
  group: string
  n: number
  observed_rate: number
  mean_predicted: number
  roc_auc: number | null
  log_loss: number | null
  precision: number
  recall: number
  flagged_share: number
}
export type Metrics = {
  model_version: string
  validation: {
    models: Partial<Record<ModelId, Score>>
    thresholds: Record<ThresholdKey, ThresholdSummary>
    threshold_curve?: { threshold: number; precision: number | null; recall: number; flagged_share: number }[]
  } | null
  test: {
    evaluated_at: string
    n: number
    cancel_rate: number
    models: Partial<Record<ModelId, Score>>
    thresholds: Record<ThresholdKey, ThresholdSummary>
    calibration: { mean_predicted: number; observed_rate: number }
  } | null
  curves: {
    split: string
    cancel_rate: number
    roc: Partial<Record<ModelId, [number, number][]>>
    pr: Partial<Record<ModelId, [number, number][]>>
    calibration: Record<string, Partial<Record<ModelId, CalBin[]>>>
  } | null
  odds: OddsRow[]
  error_groups: ErrorRow[]
  calibration_notes: string[]
}
export type DictRow = {
  variable: string
  raw_name: string
  type: string
  unit: string
  role: string
  available_at: string
  description: string
  decision: string
}
export type DataCard = {
  name: string
  authors: string
  citation: string
  doi: string
  page: string
  license: string
  url: string
  zip_sha256: string
  expected_rows: number
  files: { name: string; hotel: string; rows: number; sha256: string }[]
  downloaded_at: string | null
  dictionary: DictRow[] | null
  quality: {
    n_raw: number
    n_columns: number
    n_clean: number
    missing: Record<string, number>
    duplicates_full: number
    outliers: Record<string, number>
    removed: { reason: string; rows: number }[]
    target: { set: string; n: number; n_canceled: number; cancel_rate: number; arrival_from: string; arrival_to: string }[]
    by_hotel: { hotel: string; n: number; cancel_rate: number }[]
  } | null
}
export type RiskResponse = {
  probability: number
  risk_group: "Rất cao" | "Cao" | "Trung bình" | "Thấp"
  action: string
  threshold_used: number
  thresholds: Record<ThresholdKey, number>
  model_version: string
  warnings: string[]
}
export type Explain = {
  intercept: number
  probability: number
  contributions: { feature: string; label: string; value: string | number | boolean; contribution: number }[]
  lead_time_curve: { lead_time: number; probability: number }[]
  train_lead_time_max: number
}
export type FieldError = { field: string; message: string; type: string }

/** Lỗi gọi API: status 0 = không kết nối được máy chủ. */
export class ApiError extends Error {
  status: number
  fieldErrors: FieldError[]
  constructor(status: number, message: string, fieldErrors: FieldError[] = []) {
    super(message)
    this.status = status
    this.fieldErrors = fieldErrors
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(url, init)
  } catch {
    throw new ApiError(0, "Không gọi được máy chủ mô hình")
  }
  const text = await res.text()
  let body: unknown = text
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    /* phản hồi không phải JSON (ví dụ markdown) */
  }
  if (!res.ok) {
    const detail = (body as { detail?: unknown } | null)?.detail
    if (Array.isArray(detail)) throw new ApiError(res.status, "Dữ liệu chưa hợp lệ", detail as FieldError[])
    throw new ApiError(res.status, typeof detail === "string" ? detail : "Không gọi được máy chủ mô hình")
  }
  return body as T
}

const getJson = <T,>(url: string) => () => request<T>(url)
const postJson = <T,>(url: string, body: unknown) =>
  request<T>(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })

export const api = {
  predict: (body: unknown) => postJson<RiskResponse>("/api/cancellation-risk", body),
  explain: (body: unknown) => postJson<Explain>("/api/explain", body),
  health: () => request<{ status: string }>("/api/health"),
}

const STATIC = { staleTime: Infinity, retry: 1 } as const
export const useModelInfo = () => useQuery({ queryKey: ["model-info"], queryFn: getJson<ModelInfo>("/api/model-info"), ...STATIC })
export const useMetrics = () => useQuery({ queryKey: ["metrics"], queryFn: getJson<Metrics>("/api/metrics"), ...STATIC })
export const useDataCard = (enabled = true) =>
  useQuery({ queryKey: ["data-card"], queryFn: getJson<DataCard>("/api/data-card"), enabled, ...STATIC })
export const useModelCard = () =>
  useQuery({ queryKey: ["model-card"], queryFn: getJson<string>("/api/model-card"), ...STATIC })
