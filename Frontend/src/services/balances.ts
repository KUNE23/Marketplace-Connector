import { apiFetch } from './api'

export interface AccountBalance {
  accountId: string
  accountLabel: string | null
  accountStatus: string
  ownerName: string | null
  ownerEmail: string | null
  available: number
  pending: number
  total: number
  currency: string
  note: string | null
  lastSyncedAt: string | null
  syncError: string | null
  updatedAt: string | null
  neverSynced: boolean
}

export interface BalanceListResponse {
  balances: AccountBalance[]
  totals: { available: number; pending: number; total: number }
  accountsWithoutBalance: number
}

export interface BalanceSummary {
  available: number
  pending: number
  total: number
  accountCount: number
  lastSyncedAt: string | null
}

export interface BalanceHistoryPoint {
  capturedAt: string
  available: number
  pending: number
  total: number
}

export function listBalances() {
  return apiFetch<BalanceListResponse>('/balances')
}

export function getBalanceSummary() {
  return apiFetch<BalanceSummary>('/balances/summary')
}

export function getBalanceHistory(accountId: string, limit = 60) {
  return apiFetch<{ accountId: string; history: BalanceHistoryPoint[] }>(
    `/balances/${accountId}/history?limit=${limit}`,
  )
}

export function syncBalance(accountId: string) {
  return apiFetch<{
    accountId: string
    status: string
    message?: string
    available?: number
    total?: number
  }>(`/balances/${accountId}/sync`, { method: 'POST', body: {} })
}

export function setManualBalance(accountId: string, payload: { available: number; pending?: number; note?: string }) {
  return apiFetch<AccountBalance>(`/balances/${accountId}`, { method: 'POST', body: payload })
}

export function formatSaldo(value: number | null | undefined) {
  const n = Number(value ?? 0)
  if (!Number.isFinite(n)) return 'Rp0'
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(n)
}
