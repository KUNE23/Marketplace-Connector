import { apiFetch } from './api'

export type JobStatus = 'pending' | 'running' | 'done' | 'failed'

export interface Job {
  id: string
  type: string
  payload: unknown
  status: JobStatus
  priority: number
  attempts: number
  maxAttempts: number
  lastError: string | null
  runAt: string
  startedAt: string | null
  finishedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface JobListResponse {
  jobs: Job[]
  total: number
  page: number
  limit: number
}

export function listJobs(params: { page?: number; limit?: number; status?: JobStatus | 'all'; type?: string } = {}) {
  const query = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '' && value !== 'all') query.set(key, String(value))
  })
  const qs = query.toString()
  return apiFetch<JobListResponse>(`/jobs${qs ? `?${qs}` : ''}`)
}

export function enqueuePostListing(listingId: string) {
  return apiFetch<Job>('/jobs/post-listing', { method: 'POST', body: { listingId } })
}

export function enqueueSyncOrders() {
  return apiFetch<Job>('/jobs/sync-orders', { method: 'POST', body: {} })
}

export function retryJob(id: string) {
  return apiFetch<Job>(`/jobs/${id}/retry`, { method: 'POST' })
}
