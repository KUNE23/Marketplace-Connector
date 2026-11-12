import { apiFetch } from './api'

export interface BackupItem {
  fileName: string
  sizeBytes: number
  sizeMb: number
  createdAt: string
}

export interface BackupScheduler {
  enabled: boolean
  intervalHours: number
  retentionKeep: number
  logRetentionDays: number
  lastRun: string | null
  lastResult: unknown
}

export interface BackupListResponse {
  dir: string
  count: number
  totalMb: number
  latest: BackupItem | null
  items: BackupItem[]
  scheduler: BackupScheduler
}

export interface BackupCreateResult {
  fileName: string
  sizeBytes: number
  sizeMb: number
  createdAt: string
  reason: string
  totalRows: number
  tables: Record<string, number>
}

export interface RestoreResult {
  restoredFrom: string
  safetyBackup: string
  backupCreatedAt: string | null
  deleted: Record<string, number>
  inserted: Record<string, number>
}

export function listBackups() {
  return apiFetch<BackupListResponse>('/backups')
}

export function createBackup() {
  return apiFetch<BackupCreateResult>('/backups', { method: 'POST', body: {} })
}

export function deleteBackup(fileName: string) {
  return apiFetch<void>(`/backups/${encodeURIComponent(fileName)}`, { method: 'DELETE' })
}

export function restoreBackup(fileName: string, confirm: string) {
  return apiFetch<RestoreResult>(`/backups/${encodeURIComponent(fileName)}/restore`, {
    method: 'POST',
    body: { confirm },
  })
}

export function runBackupCycle() {
  return apiFetch<{ ok: boolean; backup?: BackupCreateResult; pruned?: { deleted: string[] }; logs?: unknown }>(
    '/backups/run-cycle',
    { method: 'POST', body: {} },
  )
}

export function cleanupLogs() {
  return apiFetch<{ auditDeleted: number; metricsDeleted: number; cutoff: string }>('/backups/cleanup-logs', {
    method: 'POST',
    body: {},
  })
}

/** URL unduhan langsung (cookie dikirim otomatis oleh browser). */
export function backupDownloadUrl(fileName: string) {
  const base = (import.meta.env.VITE_API_URL as string | undefined) ?? '/api'
  return `${base}/backups/${encodeURIComponent(fileName)}/download`
}
