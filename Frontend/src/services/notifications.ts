import { apiFetch } from './api'

export interface Notification {
  id: string
  userId: string | null
  type: string
  title: string
  body: string | null
  readAt: string | null
  createdAt: string
}

export function listNotifications(params: { page?: number; limit?: number; unreadOnly?: boolean } = {}) {
  const query = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) query.set(key, String(value))
  })
  const qs = query.toString()
  return apiFetch<{ notifications: Notification[] }>(`/notifications${qs ? `?${qs}` : ''}`)
}

export function markNotificationRead(id: string) {
  return apiFetch<Notification>(`/notifications/${id}/read`, { method: 'PATCH' })
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
