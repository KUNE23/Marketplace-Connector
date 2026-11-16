import { apiFetch } from './api'

export interface AkulakuAccount {
  id: string
  label: string
  username: string
  status: 'active' | 'inactive' | string
  note: string | null
  listingCount: number
  /** Status sesi login Akulaku: missing | valid | expired */
  sessionStatus: 'missing' | 'valid' | 'expired' | string
  sessionUpdatedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface AkulakuAccountListParams {
  page?: number
  limit?: number
  search?: string
  status?: string
}

export interface AkulakuAccountListResponse {
  accounts: AkulakuAccount[]
  total: number
  page: number
  limit: number
}

export interface AkulakuAccountPayload {
  label: string
  username: string
  password?: string
  status?: string
  note?: string | null
}

export function listAkulakuAccounts(params: AkulakuAccountListParams = {}) {
  const query = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') query.set(key, String(value))
  })
  const qs = query.toString()
  return apiFetch<AkulakuAccountListResponse>(`/akulaku-accounts${qs ? `?${qs}` : ''}`)
}

export function createAkulakuAccount(payload: AkulakuAccountPayload) {
  return apiFetch<AkulakuAccount>('/akulaku-accounts', { method: 'POST', body: payload })
}

export function updateAkulakuAccount(id: string, payload: Partial<AkulakuAccountPayload>) {
  return apiFetch<AkulakuAccount>(`/akulaku-accounts/${id}`, { method: 'PATCH', body: payload })
}

export function deleteAkulakuAccount(id: string) {
  return apiFetch<void>(`/akulaku-accounts/${id}`, { method: 'DELETE' })
}

export interface LoginFlowResult {
  state: 'success' | 'otp_required' | 'pending' | 'cooldown'
  channels?: string[]
  phoneHint?: string | null
  message?: string
  /** Pesan asli dari halaman Akulaku (mis. "Kode dikirim ke WhatsApp 08****03"). */
  pageMessage?: string | null
  /** Hitungan mundur yang ditampilkan Akulaku, bila ada. */
  cooldownSeconds?: number | null
  /** Kalimat galat dari Akulaku (mis. batas pengiriman). */
  errorLine?: string | null
  /** Teks tombol kanal yang diklik saat kirim ulang. */
  clickedText?: string | null
  requestedChannel?: 'whatsapp' | 'sms'
  note?: string
}

/** Mulai login Akulaku lewat aplikasi (backend mengisi kredensial otomatis). */
export function startAkulakuLogin(id: string) {
  return apiFetch<LoginFlowResult>(`/akulaku-accounts/${id}/login`, { method: 'POST' })
}

/** Kirim kode OTP ke backend untuk diteruskan ke halaman Akulaku. */
export function submitAkulakuOtp(id: string, code: string, channel?: 'whatsapp' | 'sms') {
  return apiFetch<LoginFlowResult>(`/akulaku-accounts/${id}/login/otp`, {
    method: 'POST',
    body: { code, channel },
  })
}

/** Kirim (ulang) kode OTP. Ada jeda agar tidak dianggap spam oleh Akulaku. */
export function resendAkulakuOtp(id: string, channel: 'whatsapp' | 'sms' = 'sms') {
  return apiFetch<LoginFlowResult>(`/akulaku-accounts/${id}/login/resend`, {
    method: 'POST',
    body: { channel },
  })
}

/** Batalkan proses login yang sedang berjalan. */
export function cancelAkulakuLogin(id: string) {
  return apiFetch<void>(`/akulaku-accounts/${id}/login`, { method: 'DELETE' })
}

export function getAkulakuSession(id: string) {
  return apiFetch<{ accountId: string; status: string; updatedAt: string | null }>(
    `/akulaku-accounts/${id}/session`,
  )
}
