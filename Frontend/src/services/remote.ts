import { apiFetch } from './api'

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? '/api'

export interface RemoteSessionInfo {
  sessionId: string
  accountId: string
  accountLabel: string
  ownerId: string | null
  startedAt: string
  idleMs: number
  viewers: number
  url: string | null
  needsLogin?: boolean
}

export interface StartRemoteResult {
  sessionId: string
  accountId: string
  accountLabel: string
  viewport: { width: number; height: number }
  url: string
  needsLogin: boolean
  loginError: string | null
  /** true bila email & password sudah diisi otomatis di halaman login Akulaku. */
  credentialsFilled?: boolean
}

export function listRemoteSessions() {
  return apiFetch<{ sessions: RemoteSessionInfo[]; maxSessions: number; idleMs: number }>(
    '/remote/sessions',
  )
}

export function startRemoteSession(accountId: string) {
  return apiFetch<StartRemoteResult>(`/remote/${accountId}/start`, { method: 'POST', body: {} })
}

export function stopRemoteSession(sessionId: string) {
  return apiFetch<{ stopped: boolean; sessionId?: string }>(`/remote/${sessionId}/stop`, {
    method: 'POST',
    body: {},
  })
}

export function saveRemoteSession(sessionId: string) {
  return apiFetch<{ saved: boolean; accountId: string; cookies: number; url: string }>(
    `/remote/${sessionId}/save-session`,
    { method: 'POST', body: {} },
  )
}

export interface RemoteInputEvent {
  type: 'mouse' | 'wheel' | 'key' | 'text' | 'navigate' | 'reload' | 'back'
  action?: 'down' | 'up' | 'move'
  x?: number
  y?: number
  button?: 'left' | 'right' | 'middle'
  clickCount?: number
  deltaX?: number
  deltaY?: number
  key?: string
  code?: string
  keyCode?: number
  text?: string
  url?: string
}

/** Kirim masukan. Tidak menunggu balasan agar responsif (fire-and-forget). */
export function sendRemoteInput(sessionId: string, event: RemoteInputEvent): Promise<unknown> {
  return apiFetch(`/remote/${sessionId}/input`, { method: 'POST', body: event }).catch(() => null)
}

/**
 * Berlangganan aliran gambar (SSE) dari sesi remote.
 *
 * EventSource mengirim cookie otomatis (same-origin), jadi tidak perlu header.
 * Mengembalikan fungsi untuk menutup koneksi.
 */
export function subscribeRemoteStream(
  sessionId: string,
  handlers: {
    onMeta?: (meta: { width: number; height: number }) => void
    onFrame?: (dataUrl: string) => void
    onUrl?: (url: string) => void
    onError?: () => void
  },
): () => void {
  const es = new EventSource(`${API_BASE}/remote/${sessionId}/stream`, { withCredentials: true })

  es.addEventListener('meta', (e) => {
    try {
      handlers.onMeta?.(JSON.parse((e as MessageEvent).data))
    } catch {
      /* abaikan */
    }
  })
  es.addEventListener('frame', (e) => {
    handlers.onFrame?.(`data:image/jpeg;base64,${(e as MessageEvent).data}`)
  })
  es.addEventListener('url', (e) => {
    try {
      handlers.onUrl?.(JSON.parse((e as MessageEvent).data).url)
    } catch {
      /* abaikan */
    }
  })
  es.onerror = () => {
    handlers.onError?.()
  }

  return () => es.close()
}
