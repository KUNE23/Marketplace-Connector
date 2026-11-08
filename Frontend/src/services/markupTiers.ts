import { apiFetch } from './api'

export type MarkupType = 'percent' | 'fixed'

export interface MarkupTier {
  id: string
  label: string
  minPrice: string
  maxPrice: string | null
  markupType: MarkupType
  markupValue: string
  active: boolean
  sortOrder: number
}

export interface MarkupTierInput {
  label: string
  minPrice: string
  maxPrice: string | null
  markupType?: MarkupType
  markupValue: string
  active?: boolean
  sortOrder?: number
}

export function listMarkupTiers() {
  return apiFetch<{ tiers: MarkupTier[] }>('/markup-tiers')
}

export function saveMarkupTiers(tiers: MarkupTierInput[]) {
  return apiFetch<{ tiers: MarkupTier[] }>('/markup-tiers', { method: 'PUT', body: { tiers } })
}
