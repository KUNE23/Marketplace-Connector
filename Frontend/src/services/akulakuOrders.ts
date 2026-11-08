import { apiFetch } from './api'

export type OrderStatus = 'new' | 'processing' | 'shipped' | 'delivered' | 'cancelled'

export interface OrderItem {
  id: string
  listingId: string | null
  sku: string | null
  name: string | null
  qty: number
  unitPrice: string
  total: string
}

export interface AkulakuOrder {
  id: string
  externalId: string
  accountId: string
  accountLabel: string | null
  categoryName: string | null
  buyerName: string | null
  buyerPhone: string | null
  shippingAddress: string | null
  status: OrderStatus
  totalAmt: string
  currency: string
  orderedAt: string
  syncedAt: string
  updatedAt: string
  items: OrderItem[]
}

export interface OrderListParams {
  page?: number
  limit?: number
  search?: string
  status?: OrderStatus | 'all'
  accountId?: string
}

export interface OrderListResponse {
  orders: AkulakuOrder[]
  total: number
  page: number
  limit: number
}

export function listOrders(params: OrderListParams = {}) {
  const query = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '' && value !== 'all') query.set(key, String(value))
  })
  const qs = query.toString()
  return apiFetch<OrderListResponse>(`/akulaku-orders${qs ? `?${qs}` : ''}`)
}

export function updateOrderStatus(id: string, status: OrderStatus) {
  return apiFetch<AkulakuOrder>(`/akulaku-orders/${id}/status`, {
    method: 'PATCH',
    body: { status },
  })
}
