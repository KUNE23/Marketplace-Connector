import { ref } from 'vue'
import { apiFetch } from '@/services/api'

export interface AuthUser {
  id: string
  email: string
  name: string | null
  role: 'ADMIN' | 'EMPLOYEE' | string
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
        .catch(() => {
          user.value = null
          return null
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

  return { user, load, clear, isAdmin: () => user.value?.role === 'ADMIN' }
}
