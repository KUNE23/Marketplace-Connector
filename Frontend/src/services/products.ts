import { apiFetch } from './api'

export interface Product {
  id: string
  shopeeItemId: string | null
  sku: string | null
  name: string | null
  description: string | null
  priceIdr: string | null
  stock: number | null
  shopeeUrl: string | null
  shopId: string | null
  location: string | null
  sold: number | null
  rating: string | null
  imageUrls: string[]
  lastSyncedAt: string | null
  listingCount: number
  hasListing: boolean
}

export interface ProductListParams {
  page?: number
  limit?: number
  search?: string
  hasListing?: boolean
}

export interface ProductListResponse {
  products: Product[]
  total: number
  page: number
  limit: number
}

export function listProducts(params: ProductListParams = {}) {
  const query = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') query.set(key, String(value))
  })
  const qs = query.toString()
  return apiFetch<ProductListResponse>(`/products${qs ? `?${qs}` : ''}`)
}

export interface ImportState {
  source: string
  lastRowId: number
  imported: number
  updated: number
  skipped: number
  failed: number
  status: 'idle' | 'running' | 'done'
  lastError: string | null
  startedAt: string | null
  finishedAt: string | null
}

export interface ScrapeStats {
  total: number
  maxRowId: number
  remaining: number
  state: ImportState
}

export interface ImportBatchResult {
  processed: number
  inserted: number
  updated: number
  skipped: number
  failed: number
  done: boolean
  state: ImportState
}

export function getScrapeStats() {
  return apiFetch<ScrapeStats>('/products/scrape/stats')
}

export function importBatch(batchSize = 50) {
  return apiFetch<ImportBatchResult>('/products/scrape/import-batch', {
    method: 'POST',
    body: { batchSize },
  })
}

export function resetImport() {
  return apiFetch<ImportState>('/products/scrape/reset', { method: 'POST', body: {} })
}

export function deleteProduct(id: string) {
  return apiFetch<void>(`/products/${id}`, { method: 'DELETE' })
}

export function formatRupiah(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === '') return '-'
  const number = Number(value)
  if (!Number.isFinite(number)) return '-'
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(number)
}
