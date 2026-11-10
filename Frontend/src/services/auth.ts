import { apiFetch } from './api'
import { useAuthUser } from '@/composables/useAuthUser'

export interface AuthUser {
  id: string
  email: string
  name: string | null
  role: string
  active?: boolean
}

interface LoginResponse {
  user: AuthUser
}

export async function login(email: string, password: string, keepLoggedIn = false): Promise<AuthUser> {
  const result = await apiFetch<LoginResponse>('/auth/login', {
    method: 'POST',
    body: { email, password, keepLoggedIn },
    skipAuthRefresh: true,
  })
  const { user } = useAuthUser()
  user.value = result.user
  return result.user
}

export async function getMe(): Promise<AuthUser> {
  const result = await apiFetch<{ user: AuthUser }>('/auth/me')
  const { user } = useAuthUser()
  user.value = result.user
  return result.user
}

export async function logout(): Promise<void> {
  try {
    await apiFetch('/auth/logout', { method: 'POST', skipAuthRefresh: true })
  } finally {
    const { clear } = useAuthUser()
    clear()
  }
}
