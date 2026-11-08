import { apiFetch } from './api'

export type ListingStatus = 'draft' | 'queued' | 'posted' | 'failed'
export type MarkupType = 'percent' | 'fixed'

export interface ListingProduct {
  id: string
  sku: string | null
  name: string | null
  imageUrls: string[]
}

export interface ListingAccount {
  id: string
  label: string
}

export interface Listing {
  id: string
  productId: string
  accountId: string
  basePrice: string
  markupType: MarkupType
  markupValue: string
  sellingPrice: string
  status: ListingStatus
  akulakuProductId: string | null
  akulakuUrl: string | null
  errorMessage: string | null
  retryCount: number
  postedAt: string | null
  createdAt: string
  updatedAt: string
  product: ListingProduct | null
  account: ListingAccount | null
}

export interface ListingListParams {
  page?: number
  limit?: number
  search?: string
  status?: ListingStatus | 'all'
  accountId?: string
}

export interface ListingListResponse {
  listings: Listing[]
  total: number
  page: number
  limit: number
}

export interface CreateListingPayload {
  productId: string
  accountId: string
  markupType?: MarkupType
  markupValue?: string
}

export function listListings(params: ListingListParams = {}) {
  const query = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '' && value !== 'all') query.set(key, String(value))
  })
  const qs = query.toString()
  return apiFetch<ListingListResponse>(`/listings${qs ? `?${qs}` : ''}`)
}

export function createListing(payload: CreateListingPayload) {
  return apiFetch<Listing>('/listings', { method: 'POST', body: payload })
}

export interface BulkCreatePayload {
  productIds: string[]
  accountId: string
  markupType?: MarkupType
  markupValue?: string
}

export interface BulkCreateResult {
  requested: number
  created: number
  skippedExisting: number
  skippedNoPrice: number
  skippedMissing: number
  failed: number
  errors: string[]
}

export function bulkCreateListings(payload: BulkCreatePayload) {
  return apiFetch<BulkCreateResult>('/listings/bulk', { method: 'POST', body: payload })
}

export function updateListing(
  id: string,
  payload: { markupType?: MarkupType; markupValue?: string; status?: ListingStatus },
) {
  return apiFetch<Listing>(`/listings/${id}`, { method: 'PATCH', body: payload })
}

export function deleteListing(id: string) {
  return apiFetch<void>(`/listings/${id}`, { method: 'DELETE' })
}
