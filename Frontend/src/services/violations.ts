import { apiFetch } from './api'

export interface ViolationAccountSummary {
  accountId: string
  label: string
  status: string
  ownerName: string | null
  ownerEmail: string | null
  shopScore: number | null
  totalScore: number | null
  totalPenalty: string | null
  violationCount: number
  condition: string | null
  assessmentCycle: string | null
  lastCheckedAt: string | null
  catalogSize: number
}

export interface ViolationDetail {
  id: string
  key: string
  name: string
  category: string | null
  note: string | null
  score: number | null
  penalty: string | null
  count: number | null
  severity: string
  periodStart: string | null
  periodEnd: string | null
  detectedAt: string
}

export interface ViolationHistoryRow {
  id: string
  shopScore: number | null
  totalScore: number | null
  totalPenalty: string | null
  violationCount: number
  condition: string | null
  assessmentCycle: string | null
  capturedAt: string
}

export interface ViolationSyncResult {
  accountId: string
  label?: string
  ok?: boolean
  error?: string
  shopScore: number | null
  totalScore: number | null
  totalPenalty: string | null
  violationCount: number
  catalogSize: number
  penaltyRecords: number
  assessmentCycle: string | null
  condition: string | null
}

export function listViolations(accountId?: string) {
  const qs = accountId ? `?accountId=${encodeURIComponent(accountId)}` : ''
  return apiFetch<{ accounts: ViolationAccountSummary[] }>(`/violations${qs}`)
}

export function getViolationDetails(accountId: string) {
  return apiFetch<{ accountId: string; violations: ViolationDetail[] }>(`/violations/${accountId}`)
}

export function getViolationHistory(accountId: string, limit = 30) {
  return apiFetch<{ accountId: string; history: ViolationHistoryRow[] }>(
    `/violations/${accountId}/history?limit=${limit}`,
  )
}

export function syncViolations(accountId: string) {
  return apiFetch<ViolationSyncResult>(`/violations/${accountId}/sync`, { method: 'POST' })
}

export function syncAllViolations() {
  return apiFetch<{ synced: number; failed: number; results: ViolationSyncResult[] }>(
    '/violations/sync',
    { method: 'POST' },
  )
}
