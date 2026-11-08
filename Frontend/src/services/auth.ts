import { apiFetch, tokenStore } from './api'

export interface AuthUser {
  id: string
  email: string
  role: string
}

interface LoginResponse {
  accessToken: string
  refreshToken: string
  user: AuthUser
}

export async function login(email: string, password: string, keepLoggedIn = false): Promise<AuthUser> {
  const result = await apiFetch<LoginResponse>('/auth/login', {
    method: 'POST',
    body: { email, password },
  })
  tokenStore.save(result.accessToken, result.refreshToken, keepLoggedIn)
  return result.user
}

export async function getMe(): Promise<AuthUser> {
  const result = await apiFetch<{ user: AuthUser }>('/auth/me')
  return result.user
}

export async function logout(): Promise<void> {
  const refreshToken = tokenStore.getRefreshToken()
  try {
    if (refreshToken) {
      await apiFetch('/auth/logout', {
        method: 'POST',
        body: { refreshToken },
        skipAuthRefresh: true,
      })
    }
  } finally {
    tokenStore.clear()
  }
}
