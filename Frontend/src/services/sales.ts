import { apiFetch } from './api'

export interface SaleItem {
  id: string
  orderId: string
  productId: string
  sku: string
  name: string
  qty: number
  unitPrice: string
  discount: string | null
  total: string
}

export interface SaleOrder {
  id: string
  shopName: string
  externalId: string
  currency: string
  status: string
  totalAmt: string
  soldAt: string
  syncedAt: string
  items: SaleItem[]
}

export interface SaleListParams {
  page?: number
  limit?: number
  status?: string
  startDate?: string
  endDate?: string
}

export interface SaleListResponse {
  sales: SaleOrder[]
  total: number
  page: number
  limit: number
}

export interface RecapEntry {
  period: string
  revenue: string
}

export function listSales(params: SaleListParams = {}) {
  const query = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') query.set(key, String(value))
  })
  const qs = query.toString()
  return apiFetch<SaleListResponse>(`/sales/orders${qs ? `?${qs}` : ''}`)
}

export function getSalesRecap(params: { period?: 'daily' | 'monthly'; startDate?: string; endDate?: string } = {}) {
  const query = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') query.set(key, String(value))
  })
  const qs = query.toString()
  return apiFetch<{ recap: RecapEntry[] }>(`/sales/recap${qs ? `?${qs}` : ''}`)
}
