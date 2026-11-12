import { apiFetch } from './api'

export type RecapPreset =
  | 'today'
  | '7d'
  | '30d'
  | 'this_month'
  | 'last_month'
  | 'this_quarter'
  | 'this_year'
  | 'all'
  | 'custom'

export type RecapBucket = 'daily' | 'weekly' | 'monthly' | 'yearly'

export interface RecapBucketRow {
  key: string
  label: string
  omzet: number
  modal: number
  adSpend: number
  profit: number
  orderCount: number
}

export interface RecapSummary {
  omzet: number
  modal: number
  adSpend: number
  profit: number
  orderCount: number
  avgOrderValue: number
}

export interface RecapResponse {
  period: { preset: RecapPreset; from: string | null; to: string | null; bucket: RecapBucket }
  summary: RecapSummary
  buckets: RecapBucketRow[]
}

export function getRecap(params: {
  preset?: RecapPreset
  bucket?: RecapBucket
  from?: string
  to?: string
  accountId?: string
} = {}) {
  const q = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== '') q.set(k, String(v))
  })
  const qs = q.toString()
  return apiFetch<RecapResponse>(`/recap${qs ? `?${qs}` : ''}`)
}

export const PRESET_OPTIONS: { value: RecapPreset; label: string }[] = [
  { value: 'today', label: 'Hari Ini' },
  { value: '7d', label: '7 Hari' },
  { value: '30d', label: '30 Hari' },
  { value: 'this_month', label: 'Bulan Ini' },
  { value: 'last_month', label: 'Bulan Lalu' },
  { value: 'this_quarter', label: 'Kuartal Ini' },
  { value: 'this_year', label: 'Tahun Ini' },
  { value: 'all', label: 'Semua' },
  { value: 'custom', label: 'Kustom' },
]

export const BUCKET_OPTIONS: { value: RecapBucket; label: string }[] = [
  { value: 'daily', label: 'Harian' },
  { value: 'weekly', label: 'Mingguan' },
  { value: 'monthly', label: 'Bulanan' },
  { value: 'yearly', label: 'Tahunan' },
]

export function formatRupiahRecap(value: number | string | null | undefined) {
  const n = Number(value ?? 0)
  if (!Number.isFinite(n)) return 'Rp0'
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(n)
}
