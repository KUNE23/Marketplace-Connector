import { apiFetch } from './api'

export interface AdSpend {
  id: string
  accountId: string | null
  accountLabel: string | null
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

export function listAdSpends(
  params: { from?: string; to?: string; accountId?: string } = {},
) {
  const query = new URLSearchParams()
  if (params.from) query.set('from', params.from)
  if (params.to) query.set('to', params.to)
  if (params.accountId && params.accountId !== 'all') query.set('accountId', params.accountId)
  const qs = query.toString()
  return apiFetch<AdSpendListResponse>(`/ad-spends${qs ? `?${qs}` : ''}`)
}

export function createAdSpend(payload: {
  period: string
  amount: string
  note?: string | null
  accountId?: string | null
}) {
  return apiFetch<AdSpend>('/ad-spends', { method: 'POST', body: payload })
}

export function updateAdSpend(
  id: string,
  payload: { period?: string; amount?: string; note?: string | null; accountId?: string | null },
) {
  return apiFetch<AdSpend>(`/ad-spends/${id}`, { method: 'PATCH', body: payload })
}

export function deleteAdSpend(id: string) {
  return apiFetch<void>(`/ad-spends/${id}`, { method: 'DELETE' })
}
