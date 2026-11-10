// Frontend/src/utils/labels.ts
// Label & warna status dalam Bahasa Indonesia (dipakai di seluruh UI).
export type StatusColor = 'info' | 'warning' | 'primary' | 'success' | 'error' | 'gray'

export interface StatusMeta {
  label: string
  color: StatusColor
}

export const orderStatusMeta: Record<string, StatusMeta> = {
  new: { label: 'Baru', color: 'info' },
  processing: { label: 'Diproses', color: 'warning' },
  shipped: { label: 'Dikirim', color: 'primary' },
  delivered: { label: 'Selesai', color: 'success' },
  cancelled: { label: 'Dibatalkan', color: 'error' },
}

export const listingStatusMeta: Record<string, StatusMeta> = {
  draft: { label: 'Draf', color: 'gray' },
  queued: { label: 'Antrian', color: 'warning' },
  posted: { label: 'Tayang', color: 'success' },
  failed: { label: 'Gagal', color: 'error' },
}

export const jobStatusMeta: Record<string, StatusMeta> = {
  pending: { label: 'Menunggu', color: 'gray' },
  running: { label: 'Berjalan', color: 'warning' },
  done: { label: 'Selesai', color: 'success' },
  failed: { label: 'Gagal', color: 'error' },
}

export const accountStatusMeta: Record<string, StatusMeta> = {
  active: { label: 'Aktif', color: 'success' },
  inactive: { label: 'Nonaktif', color: 'gray' },
}

/** Status sesi login Akulaku (per akun). */
export const sessionStatusMeta: Record<string, StatusMeta> = {
  valid: { label: 'Sesi Aktif', color: 'success' },
  expired: { label: 'Sesi Kadaluarsa', color: 'error' },
  missing: { label: 'Belum Login', color: 'warning' },
}

/** Label pekerjaan worker (tipe job). */
export const jobTypeMeta: Record<string, string> = {
  post_listing: 'Posting Produk',
  sync_orders: 'Sinkron Pesanan',
}

function labelOf(map: Record<string, StatusMeta>, status: string | null | undefined) {
  if (!status) return '-'
  return map[status]?.label ?? status
}

export const orderStatusLabel = (s?: string | null) => labelOf(orderStatusMeta, s)
export const listingStatusLabel = (s?: string | null) => labelOf(listingStatusMeta, s)
export const jobStatusLabel = (s?: string | null) => labelOf(jobStatusMeta, s)
export const accountStatusLabel = (s?: string | null) => labelOf(accountStatusMeta, s)
export const sessionStatusLabel = (s?: string | null) => labelOf(sessionStatusMeta, s)

export function jobTypeLabel(type?: string | null) {
  if (!type) return '-'
  return jobTypeMeta[type] ?? type
}
