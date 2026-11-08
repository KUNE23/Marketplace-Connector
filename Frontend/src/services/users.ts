import { apiFetch } from './api'

export type UserRole = 'ADMIN' | 'EMPLOYEE'

export interface User {
  id: string
  email: string
  name: string | null
  role: UserRole | string
  active: boolean
  createdAt?: string
}

export interface UserListParams {
  page?: number
  limit?: number
  search?: string
}

export interface UserListResponse {
  users: User[]
  total: number
  page: number
  limit: number
}

export interface UserPayload {
  email: string
  password?: string
  name?: string
  role?: UserRole | string
  active?: boolean
}

export function listUsers(params: UserListParams = {}) {
  const query = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') query.set(key, String(value))
  })
  const qs = query.toString()
  return apiFetch<UserListResponse>(`/users${qs ? `?${qs}` : ''}`)
}

export function createUser(payload: UserPayload) {
  return apiFetch<User>('/users', { method: 'POST', body: payload })
}

export function updateUser(id: string, payload: Partial<UserPayload>) {
  return apiFetch<User>(`/users/${id}`, { method: 'PATCH', body: payload })
}

export function deleteUser(id: string) {
  return apiFetch<void>(`/users/${id}`, { method: 'DELETE' })
}

export function updateOwnProfile(name: string) {
  return apiFetch<User>('/users/me/profile', { method: 'PATCH', body: { name } })
}

export function changeOwnPassword(currentPassword: string, newPassword: string) {
  return apiFetch<{ message: string }>('/users/me/password', {
    method: 'PATCH',
    body: { currentPassword, newPassword },
  })
}
