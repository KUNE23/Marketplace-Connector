import { apiFetch } from './api'

export interface AdSpend {
  id: string
  period: string
  amount: string
  note: string | null
  createdAt: string
  updatedAt: string
}

export interface AdSpendListResponse {
  adSpends: AdSpend[]
  total: string
}

export function listAdSpends(params: { from?: string; to?: string } = {}) {
  const query = new URLSearchParams()
  if (params.from) query.set('from', params.from)
  if (params.to) query.set('to', params.to)
  const qs = query.toString()
  return apiFetch<AdSpendListResponse>(`/ad-spends${qs ? `?${qs}` : ''}`)
}

export function createAdSpend(payload: { period: string; amount: string; note?: string | null }) {
  return apiFetch<AdSpend>('/ad-spends', { method: 'POST', body: payload })
}

export function updateAdSpend(
  id: string,
  payload: { period?: string; amount?: string; note?: string | null },
) {
  return apiFetch<AdSpend>(`/ad-spends/${id}`, { method: 'PATCH', body: payload })
}

export function deleteAdSpend(id: string) {
  return apiFetch<void>(`/ad-spends/${id}`, { method: 'DELETE' })
}
