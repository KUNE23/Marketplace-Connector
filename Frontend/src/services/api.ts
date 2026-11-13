// Autentikasi kini memakai cookie httpOnly (token tidak disimpan di JS).
// Semua request mengirim cookie via credentials: 'include'.
const API_BASE_URL = import.meta.env.VITE_API_URL ?? '/api'

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

// Satu proses refresh pada satu waktu (hindari race saat banyak request 401).
let refreshPromise: Promise<{ ok: boolean; definitive: boolean }> | null = null

/**
 * Coba perbarui sesi.
 * `definitive` = true hanya jika server MEMASTIKAN sesi tidak valid (401).
 * Error lain (503/429/jaringan) bukan alasan untuk menghapus sesi di klien.
 */
async function performRefresh(): Promise<{ ok: boolean; definitive: boolean }> {
  try {
    const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    })
    if (response.ok) return { ok: true, definitive: false }
    return { ok: false, definitive: response.status === 401 }
  } catch {
    // Gagal jaringan / server mati: jangan anggap sesi berakhir.
    return { ok: false, definitive: false }
  }
}

function refreshOnce(): Promise<{ ok: boolean; definitive: boolean }> {
  if (!refreshPromise) {
    refreshPromise = performRefresh().finally(() => {
      refreshPromise = null
    })
  }
  return refreshPromise
}

/** Dipakai router guard untuk mencoba memperbarui sesi sebelum redirect. */
export function tryRefreshSession(): Promise<boolean> {
  return refreshOnce().then((r) => r.ok)
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

async function doFetch(path: string, options: RequestOptions) {
  const { body, headers, skipAuthRefresh: _skip, ...rest } = options
  return fetch(`${API_BASE_URL}${path}`, {
    ...rest,
    credentials: 'include',
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  let response = await doFetch(path, options)
  let refreshResult: { ok: boolean; definitive: boolean } | null = null

  // Access token kedaluwarsa -> coba refresh via cookie, lalu ulangi sekali.
  if (response.status === 401 && !options.skipAuthRefresh) {
    refreshResult = await refreshOnce()
    if (refreshResult.ok) response = await doFetch(path, options)
  }

  // Logout HANYA bila server memastikan sesi tidak valid (401 definitif).
  // Error 503/429/jaringan tidak boleh menghapus sesi user.
  if (response.status === 401 && !options.skipAuthRefresh && refreshResult?.definitive) {
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

/**
 * Unduh file (mis. export CSV/Excel) dengan cookie sesi, lalu memicu unduhan
 * di browser. Melempar ApiError bila gagal.
 */
export async function apiDownload(path: string, filename: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}${path}`, { credentials: 'include' })
  if (!response.ok) {
    throw new ApiError('Gagal mengunduh file', response.status)
  }
  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
