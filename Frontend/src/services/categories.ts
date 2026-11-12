import { apiFetch } from './api'

export interface CategoryPath {
  id: string
  path: string
  level: number
  rootName: string | null
}

export interface CategoryListResponse {
  categories: CategoryPath[]
  total: number
}

export interface ResolvedCategory {
  path: string
  matchedKeyword?: string
  source: 'manual' | 'keyword'
}

export interface ResolveResponse {
  resolved: ResolvedCategory | null
  suggestions: { path: string; level: number }[]
}

export function listCategories(params: { search?: string; limit?: number } = {}) {
  const query = new URLSearchParams()
  if (params.search) query.set('search', params.search)
  if (params.limit) query.set('limit', String(params.limit))
  const qs = query.toString()
  return apiFetch<CategoryListResponse>(`/categories${qs ? `?${qs}` : ''}`)
}

/** Preview kategori otomatis untuk sebuah nama produk. */
export function resolveCategory(params: { productName?: string; categoryPath?: string }) {
  const query = new URLSearchParams()
  if (params.productName) query.set('productName', params.productName)
  if (params.categoryPath) query.set('categoryPath', params.categoryPath)
  return apiFetch<ResolveResponse>(`/categories/resolve?${query.toString()}`)
}

export interface CategoryRule {
  id: string
  keyword: string
  path: string
  priority: number
  active: boolean
  note: string | null
}

export function listCategoryRules() {
  return apiFetch<{ rules: CategoryRule[] }>('/categories/rules')
}

export function upsertCategoryRule(payload: { keyword: string; path: string; priority?: number }) {
  return apiFetch<CategoryRule>('/categories/rules', { method: 'POST', body: payload })
}

export function deleteCategoryRule(id: string) {
  return apiFetch<void>(`/categories/rules/${id}`, { method: 'DELETE' })
}
