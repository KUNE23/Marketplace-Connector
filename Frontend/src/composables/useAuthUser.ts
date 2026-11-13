import { ref } from 'vue'
import { ApiError, apiFetch } from '@/services/api'

export interface AuthUser {
  id: string
  email: string
  name: string | null
  role: 'ADMIN' | 'SUPERADMIN' | 'EMPLOYEE' | string
  active?: boolean
}

const user = ref<AuthUser | null>(null)
let loading: Promise<AuthUser | null> | null = null

/** Ambil user yang sedang login (cache; dipakai bersama header & guard). */
export function useAuthUser() {
  async function load(force = false): Promise<AuthUser | null> {
    if (user.value && !force) return user.value
    if (!loading) {
      loading = apiFetch<{ user: AuthUser }>('/auth/me')
        .then((res) => {
          user.value = res.user
          return res.user
        })
        .catch((err) => {
          // Hanya kosongkan user bila server memastikan sesi tidak valid.
          // Error 503/429/jaringan tidak boleh membuat UI "ter-logout".
          if (err instanceof ApiError && err.status === 401) {
            user.value = null
          }
          return user.value
        })
        .finally(() => {
          loading = null
        })
    }
    return loading
  }

  function clear() {
    user.value = null
  }

  return { user, load, clear, isAdmin: () => user.value?.role === 'ADMIN' || user.value?.role === 'SUPERADMIN' }
}
