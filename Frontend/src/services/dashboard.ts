import { apiFetch } from './api'

export interface DashboardSummary {
  products: { total: number; withListing: number; withoutListing: number }
  listings: { total: number; draft: number; queued: number; posted: number; failed: number }
  accounts: { total: number; active: number }
  orders: {
    total: number
    today: number
    new: number
    processing: number
    shipped: number
    delivered: number
    cancelled: number
  }
  revenue: { total: string; today: string }
  jobs: { pending: number; failed: number }
}

export interface RecapEntry {
  date: string
  orders: number
  revenue: number
}

export interface RecentOrder {
  id: string
  externalId: string
  buyerName: string | null
  status: string
  totalAmt: string
  orderedAt: string
  accountLabel: string | null
}

export function getDashboardSummary() {
  return apiFetch<DashboardSummary>('/dashboard/summary')
}

export function getDashboardRecap(days = 14) {
  return apiFetch<{ days: number; recap: RecapEntry[] }>(`/dashboard/recap?days=${days}`)
}

export function getRecentOrders(limit = 5) {
  return apiFetch<{ orders: RecentOrder[] }>(`/dashboard/recent-orders?limit=${limit}`)
}
