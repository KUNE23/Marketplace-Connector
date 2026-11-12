import { apiFetch } from './api'

export interface MonitorOverview {
  overview: {
    users: number
    accounts: number
    orders: number
    listings: number
    audit24h: number
    requests24h: number
  }
  server: {
    cpu: { cores: number; model: string; loadAvg1: number; loadAvg5: number; loadAvg15: number; usagePercent: number }
    memory: { totalMb: number; usedMb: number; freeMb: number; usedPercent: number }
    process: {
      nodeVersion: string
      pid: number
      uptimeSec: number
      uptimeHuman: string
      heapUsedMb: number
      rssMb: number
      appUptimeSec: number
    }
    system: { platform: string; arch: string; hostname: string; systemUptimeHuman: string }
  }
  database: { ok: boolean; latencyMs: number; error?: string }
}

export interface EndpointStat {
  endpoint: string
  count?: number
  avgMs?: number
  calls?: number
}

export interface RequestStats {
  windowMinutes: number
  total: number
  errorCount: number
  errorRate: number
  avgMs: number
  p95Ms: number
  busiest: EndpointStat[]
  slowest: EndpointStat[]
  statusBreakdown: Record<string, number>
  timeline: { minute: string; requests: number; errors: number; avgMs: number }[]
}

export interface AuditLogEntry {
  id: string
  userId: string | null
  userEmail: string | null
  userRole: string | null
  action: string
  resource: string | null
  resourceId: string | null
  status: string
  ip: string | null
  userAgent: string | null
  detail: unknown
  createdAt: string
}

export interface AuditResponse {
  logs: AuditLogEntry[]
  actions: string[]
}

export function getMonitorOverview() {
  return apiFetch<MonitorOverview>('/monitor')
}

export function getRequestStats(minutes = 60) {
  return apiFetch<RequestStats>(`/monitor/requests?minutes=${minutes}`)
}

export function getAuditLog(params: { limit?: number; action?: string; userId?: string } = {}) {
  const q = new URLSearchParams()
  if (params.limit) q.set('limit', String(params.limit))
  if (params.action) q.set('action', params.action)
  if (params.userId) q.set('userId', params.userId)
  const qs = q.toString()
  return apiFetch<AuditResponse>(`/monitor/audit${qs ? `?${qs}` : ''}`)
}
