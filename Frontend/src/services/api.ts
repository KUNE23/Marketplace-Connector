const API_BASE_URL = import.meta.env.VITE_API_URL ?? '/api'
const ACCESS_TOKEN_KEY = 'mc_access_token'
const REFRESH_TOKEN_KEY = 'mc_refresh_token'

export class ApiError extends Error {
  status: number
  data: unknown

  constructor(message: string, status: number, data?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.data = data
  }
}

function readToken(key: string): string | null {
  return localStorage.getItem(key) ?? sessionStorage.getItem(key)
}

function tokenStorage(): Storage {
  return localStorage.getItem(ACCESS_TOKEN_KEY) ? localStorage : sessionStorage
}

export const tokenStore = {
  getAccessToken: () => readToken(ACCESS_TOKEN_KEY),
  getRefreshToken: () => readToken(REFRESH_TOKEN_KEY),
  save(accessToken: string, refreshToken: string, persist?: boolean) {
    // Kalau `persist` tidak diberikan, pertahankan storage yang sedang dipakai.
    const target = persist === undefined ? tokenStorage() : persist ? localStorage : sessionStorage
    const other = target === localStorage ? sessionStorage : localStorage
    target.setItem(ACCESS_TOKEN_KEY, accessToken)
    target.setItem(REFRESH_TOKEN_KEY, refreshToken)
    other.removeItem(ACCESS_TOKEN_KEY)
    other.removeItem(REFRESH_TOKEN_KEY)
  },
  clear() {
    for (const storage of [localStorage, sessionStorage]) {
      storage.removeItem(ACCESS_TOKEN_KEY)
      storage.removeItem(REFRESH_TOKEN_KEY)
    }
  },
}

/** Cek apakah access token sudah expired berdasarkan klaim `exp` (tanpa verifikasi). */
export function isAccessTokenExpired(token: string | null): boolean {
  if (!token) return true
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    if (typeof payload.exp !== 'number') return false
    // anggap expired 10 detik lebih awal untuk toleransi
    return Date.now() >= payload.exp * 1000 - 10_000
  } catch {
    return true
  }
}

// Satu proses refresh pada satu waktu (hindari race saat banyak request 401).
let refreshPromise: Promise<boolean> | null = null

async function performRefresh(): Promise<boolean> {
  const refreshToken = tokenStore.getRefreshToken()
  if (!refreshToken) return false
  try {
    const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    })
    if (!response.ok) return false
    const data = (await response.json()) as { accessToken?: string; refreshToken?: string }
    if (!data.accessToken || !data.refreshToken) return false
    tokenStore.save(data.accessToken, data.refreshToken)
    return true
  } catch {
    return false
  }
}

function refreshOnce(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = performRefresh().finally(() => {
      refreshPromise = null
    })
  }
  return refreshPromise
}

/** Dipakai router guard untuk mencoba memperbarui sesi sebelum redirect. */
export function tryRefreshSession(): Promise<boolean> {
  return refreshOnce()
}

let onUnauthenticated: (() => void) | null = null
/** Daftarkan handler saat sesi benar-benar tidak bisa dipulihkan (refresh gagal). */
export function setUnauthenticatedHandler(handler: () => void) {
  onUnauthenticated = handler
}

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown
  /** Lewati auto-refresh (dipakai untuk endpoint auth itu sendiri). */
  skipAuthRefresh?: boolean
}

async function doFetch(path: string, options: RequestOptions, token: string | null) {
  const { body, headers, skipAuthRefresh: _skip, ...rest } = options
  return fetch(`${API_BASE_URL}${path}`, {
    ...rest,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  let token = tokenStore.getAccessToken()

  // Proaktif: refresh dulu jika access token sudah expired (hindari 401 sia-sia).
  if (!options.skipAuthRefresh && isAccessTokenExpired(token) && tokenStore.getRefreshToken()) {
    const ok = await refreshOnce()
    if (ok) token = tokenStore.getAccessToken()
  }

  let response = await doFetch(path, options, token)

  if (response.status === 401 && !options.skipAuthRefresh && tokenStore.getRefreshToken()) {
    const ok = await refreshOnce()
    if (ok) {
      token = tokenStore.getAccessToken()
      response = await doFetch(path, options, token)
    }
  }

  if (response.status === 401 && !options.skipAuthRefresh) {
    tokenStore.clear()
    onUnauthenticated?.()
  }

  const text = await response.text()
  let data: unknown = null
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = text
    }
  }

  if (!response.ok) {
    const message =
      typeof data === 'object' && data && 'message' in data
        ? String((data as { message: unknown }).message)
        : `Request failed with status ${response.status}`
    throw new ApiError(message, response.status, data)
  }

  return data as T
}
