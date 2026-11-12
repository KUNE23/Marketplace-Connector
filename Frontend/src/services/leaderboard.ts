import { apiFetch } from './api'

export interface LeaderboardRow {
  userId: string | null
  name: string
  email: string | null
  role: string | null
  rank: number
  accountCount: number
  activeAccounts: number
  omzet: number
  modal: number
  adSpend: number
  profit: number
  orderCount: number
}

export interface LeaderboardResponse {
  period: { from: string | null; to: string | null }
  totals: { omzet: number; profit: number; employees: number }
  leaderboard: LeaderboardRow[]
}

export interface EmployeeAccountRow {
  accountId: string
  label: string
  username: string
  status: string
  omzet: number
  modal: number
  adSpend: number
  profit: number
  orderCount: number
  matchedItems: number
  unmatchedItems: number
}

export interface EmployeeDetailResponse {
  period: { from: string | null; to: string | null }
  employee: { id: string | null; name: string; email: string | null; role: string | null }
  totals: { omzet: number; modal: number; adSpend: number; profit: number; orderCount: number }
  accounts: EmployeeAccountRow[]
}

export interface TrendPoint {
  date: string
  omzet: number
  orders: number
}

export interface EmployeeOption {
  id: string
  name: string | null
  email: string
  role: string
  active: boolean
}

function qs(params: Record<string, string | undefined>) {
  const q = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== '') q.set(k, v)
  })
  const s = q.toString()
  return s ? `?${s}` : ''
}

export function getLeaderboard(params: { from?: string; to?: string } = {}) {
  return apiFetch<LeaderboardResponse>(`/leaderboard${qs(params)}`)
}

export function getEmployeeDetail(
  userId: string,
  params: { from?: string; to?: string } = {},
) {
  return apiFetch<EmployeeDetailResponse>(`/leaderboard/${userId}${qs(params)}`)
}

export function getEmployeeTrend(userId: string, params: { from?: string; to?: string } = {}) {
  return apiFetch<{ employee: EmployeeDetailResponse['employee']; trend: TrendPoint[] }>(
    `/leaderboard/${userId}/trend${qs(params)}`,
  )
}

export function listEmployees() {
  return apiFetch<{ employees: EmployeeOption[] }>('/leaderboard/employees')
}

export function formatRupiah(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === '') return 'Rp0'
  const n = Number(value)
  if (!Number.isFinite(n)) return 'Rp0'
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(n)
}
