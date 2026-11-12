import { apiFetch } from './api'

export type NotificationCategory = 'order' | 'violation' | 'chat' | 'system'

export interface Notification {
  id: string
  userId: string | null
  type: string
  category?: NotificationCategory
  title: string
  body: string | null
  readAt: string | null
  createdAt: string
}

export interface NotificationCategoryInfo {
  key: NotificationCategory
  label: string
  count: number
}

export interface NotificationListResponse {
  notifications: Notification[]
  total: number
  unread: number
  page: number
  limit: number
  categories: NotificationCategoryInfo[]
}

export interface ListNotificationParams {
  page?: number
  limit?: number
  unreadOnly?: boolean
  search?: string
  category?: NotificationCategory | 'all'
}

export function listNotifications(params: ListNotificationParams = {}) {
  const query = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '' && value !== 'all') {
      query.set(key, String(value))
    }
  })
  const qs = query.toString()
  return apiFetch<NotificationListResponse>(`/notifications${qs ? `?${qs}` : ''}`)
}

/** Versi ringkas untuk dropdown header (tanpa metadata tambahan). */
export function listNotificationsSimple(limit = 6) {
  return apiFetch<{ notifications: Notification[] }>(`/notifications?limit=${limit}&simple=1`)
}

export function markNotificationRead(id: string) {
  return apiFetch<Notification>(`/notifications/${id}/read`, { method: 'PATCH' })
}

export function markAllNotificationsRead() {
  return apiFetch<{ updated: number }>('/notifications/read-all', { method: 'PATCH' })
}

export function deleteNotification(id: string) {
  return apiFetch<void>(`/notifications/${id}`, { method: 'DELETE' })
}

export function formatRelativeTime(value: string) {
  const then = new Date(value).getTime()
  if (Number.isNaN(then)) return ''
  const diff = Date.now() - then
  const mins = Math.round(diff / 60000)
  if (mins < 1) return 'baru saja'
  if (mins < 60) return `${mins} menit lalu`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours} jam lalu`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days} hari lalu`
  return new Date(value).toLocaleDateString('id-ID')
}

export const CATEGORY_LABEL: Record<string, string> = {
  order: 'Pesanan',
  violation: 'Pelanggaran',
  chat: 'Chat',
  system: 'Sistem',
}
