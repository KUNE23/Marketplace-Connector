// Backend/src/services/monitorService.js
/**
 * Data untuk halaman Monitor (khusus SUPERADMIN).
 *
 * Isi:
 *   - server: CPU load, RAM, uptime, versi Node, platform
 *   - requests: jumlah, rata-rata/p95 durasi, error rate, endpoint tersibuk
 *   - audit: aktivitas terakhir user (login, CRUD, perubahan role)
 */
const os = require('os');
const prisma = require('../lib/prisma');

const APP_START = Date.now();

function formatUptime(seconds) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return [d && `${d}h`, h && `${h}j`, m && `${m}m`, `${s}d`].filter(Boolean).join(' ');
}

/** Metrik server dari modul os (tanpa dependensi tambahan). */
function getServerMetrics() {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const cpus = os.cpus() || [];
  const load = os.loadavg();

  return {
    cpu: {
      cores: cpus.length,
      model: cpus[0]?.model?.trim() ?? '-',
      loadAvg1: Number(load[0]?.toFixed(2) ?? 0),
      loadAvg5: Number(load[1]?.toFixed(2) ?? 0),
      loadAvg15: Number(load[2]?.toFixed(2) ?? 0),
      // Persentase kasar: load1 / jumlah core
      usagePercent: cpus.length ? Math.min(100, Math.round((load[0] / cpus.length) * 100)) : 0,
    },
    memory: {
      totalMb: Math.round(totalMem / 1024 / 1024),
      usedMb: Math.round(usedMem / 1024 / 1024),
      freeMb: Math.round(freeMem / 1024 / 1024),
      usedPercent: Math.round((usedMem / totalMem) * 100),
    },
    process: {
      nodeVersion: process.version,
      pid: process.pid,
      uptimeSec: Math.floor(process.uptime()),
      uptimeHuman: formatUptime(process.uptime()),
      heapUsedMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      rssMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
      appUptimeSec: Math.floor((Date.now() - APP_START) / 1000),
    },
    system: {
      platform: process.platform,
      arch: process.arch,
      hostname: os.hostname(),
      systemUptimeHuman: formatUptime(os.uptime()),
    },
  };
}

/** Statistik request dalam rentang menit terakhir. */
async function getRequestStats({ minutes = 60 } = {}) {
  const since = new Date(Date.now() - minutes * 60 * 1000);

  const rows = await prisma.requestMetric.findMany({
    where: { createdAt: { gte: since } },
    select: { method: true, path: true, statusCode: true, durationMs: true, createdAt: true },
  });

  const total = rows.length;
  if (!total) {
    return {
      windowMinutes: minutes,
      total: 0,
      errorCount: 0,
      errorRate: 0,
      avgMs: 0,
      p95Ms: 0,
      slowest: [],
      busiest: [],
      statusBreakdown: {},
      timeline: [],
    };
  }

  const durations = rows.map((r) => r.durationMs).sort((a, b) => a - b);
  const avg = durations.reduce((s, v) => s + v, 0) / total;
  const p95 = durations[Math.min(total - 1, Math.floor(total * 0.95))];
  const errors = rows.filter((r) => r.statusCode >= 400);

  // Endpoint tersibuk
  const byPath = new Map();
  for (const r of rows) {
    const key = `${r.method} ${r.path}`;
    byPath.set(key, (byPath.get(key) || 0) + 1);
  }
  const busiest = [...byPath.entries()]
    .map(([endpoint, count]) => ({ endpoint, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Endpoint paling lambat (rata-rata)
  const byPathDur = new Map();
  for (const r of rows) {
    const key = `${r.method} ${r.path}`;
    const cur = byPathDur.get(key) || { sum: 0, n: 0 };
    cur.sum += r.durationMs;
    cur.n += 1;
    byPathDur.set(key, cur);
  }
  const slowest = [...byPathDur.entries()]
    .map(([endpoint, v]) => ({ endpoint, avgMs: Math.round(v.sum / v.n), calls: v.n }))
    .sort((a, b) => b.avgMs - a.avgMs)
    .slice(0, 10);

  // Breakdown status
  const statusBreakdown = {};
  for (const r of rows) {
    const bucket = `${Math.floor(r.statusCode / 100)}xx`;
    statusBreakdown[bucket] = (statusBreakdown[bucket] || 0) + 1;
  }

  // Timeline per menit (maks 60 titik)
  const timelineMap = new Map();
  for (const r of rows) {
    const minute = new Date(r.createdAt);
    minute.setSeconds(0, 0);
    const key = minute.toISOString().slice(0, 16);
    const cur = timelineMap.get(key) || { requests: 0, errors: 0, totalMs: 0 };
    cur.requests += 1;
    cur.totalMs += r.durationMs;
    if (r.statusCode >= 400) cur.errors += 1;
    timelineMap.set(key, cur);
  }
  const timeline = [...timelineMap.entries()]
    .map(([minute, v]) => ({
      minute,
      requests: v.requests,
      errors: v.errors,
      avgMs: Math.round(v.totalMs / v.requests),
    }))
    .sort((a, b) => (a.minute < b.minute ? -1 : 1));

  return {
    windowMinutes: minutes,
    total,
    errorCount: errors.length,
    errorRate: Number(((errors.length / total) * 100).toFixed(2)),
    avgMs: Math.round(avg),
    p95Ms: Math.round(p95),
    busiest,
    slowest,
    statusBreakdown,
    timeline,
  };
}

/** Log aktivitas terakhir (audit trail). */
async function getRecentAudit({ limit = 50, action, userId } = {}) {
  const where = {};
  if (action) where.action = action;
  if (userId) where.userId = BigInt(userId);

  const [rows, actions] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { id: 'desc' },
      take: Math.min(limit, 200),
    }),
    prisma.auditLog.findMany({ select: { action: true }, distinct: ['action'] }),
  ]);

  return {
    logs: rows.map((r) => ({
      id: r.id.toString(),
      userId: r.userId ? r.userId.toString() : null,
      userEmail: r.userEmail,
      userRole: r.userRole,
      action: r.action,
      resource: r.resource,
      resourceId: r.resourceId,
      status: r.status,
      ip: r.ip,
      userAgent: r.userAgent,
      detail: r.detail,
      createdAt: r.createdAt,
    })),
    actions: actions.map((a) => a.action).sort(),
  };
}

/** Ringkasan cepat untuk kartu atas. */
async function getOverview() {
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [users, accounts, orders, listing, auditToday, reqToday] = await Promise.all([
    prisma.user.count(),
    prisma.akulakuAccount.count(),
    prisma.akulakuOrder.count(),
    prisma.listing.count(),
    prisma.auditLog.count({ where: { createdAt: { gte: since24h } } }),
    prisma.requestMetric.count({ where: { createdAt: { gte: since24h } } }),
  ]);
  return { users, accounts, orders, listings: listing, audit24h: auditToday, requests24h: reqToday };
}

/** Status koneksi database (query ringan). */
async function getDatabaseStatus() {
  const start = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { ok: true, latencyMs: Date.now() - start };
  } catch (err) {
    return { ok: false, latencyMs: Date.now() - start, error: String(err.message || err).slice(0, 200) };
  }
}

/**
 * Status worker: detak jantung, antrean job, dan aktivitas terakhir.
 *
 * `staleAfterMs` menentukan kapan worker dianggap mati (default 60 detik,
 * jauh lebih longgar dari interval poll 5 detik).
 */
async function getWorkerStatus({ staleAfterMs = 60000 } = {}) {
  const [heartbeats, jobByStatus, jobByType, recentLogs, oldestPending] = await Promise.all([
    prisma.workerHeartbeat.findMany({ orderBy: { name: 'asc' } }),
    prisma.job.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.job.groupBy({ by: ['type'], _count: { _all: true } }),
    prisma.workerLog.findMany({ orderBy: { id: 'desc' }, take: 100 }),
    prisma.job.findFirst({
      where: { status: 'pending' },
      orderBy: { runAt: 'asc' },
      select: { id: true, type: true, runAt: true, attempts: true },
    }),
  ]);

  const now = Date.now();
  const workers = heartbeats.map((h) => {
    const ageMs = now - new Date(h.lastSeenAt).getTime();
    const alive = ageMs < staleAfterMs && h.status !== 'stopped';
    return {
      name: h.name,
      pid: h.pid,
      hostname: h.hostname,
      status: h.status,
      alive,
      staleSeconds: Math.round(ageMs / 1000),
      currentJob: h.currentJob ? h.currentJob.toString() : null,
      polls: h.polls,
      jobsDone: h.jobsDone,
      jobsFailed: h.jobsFailed,
      version: h.version,
      startedAt: h.startedAt,
      lastSeenAt: h.lastSeenAt,
    };
  });

  const statusMap = Object.fromEntries(jobByStatus.map((r) => [r.status, r._count._all]));
  const pendingCount = statusMap.pending ?? 0;

  return {
    staleAfterMs,
    workers,
    queue: {
      pending: pendingCount,
      running: statusMap.running ?? 0,
      done: statusMap.done ?? 0,
      failed: statusMap.failed ?? 0,
      byType: jobByType.map((r) => ({ type: r.type, count: r._count._all })),
      oldestPending: oldestPending
        ? {
            id: oldestPending.id.toString(),
            type: oldestPending.type,
            runAt: oldestPending.runAt,
            attempts: oldestPending.attempts,
            waitingSeconds: Math.max(0, Math.round((now - new Date(oldestPending.runAt).getTime()) / 1000)),
          }
        : null,
    },
    // Peringatan agar UI bisa menandai masalah dengan jelas.
    warnings: [
      ...(workers.length === 0 ? ['Worker belum pernah melapor (heartbeat kosong).'] : []),
      ...(workers.length > 0 && workers.every((w) => !w.alive)
        ? ['Semua worker terdeteksi mati. Job tidak akan diproses.']
        : []),
      ...(pendingCount > 20 ? [`${pendingCount} job menunggu di antrean.`] : []),
      ...((statusMap.failed ?? 0) > 0 ? [`${statusMap.failed} job berstatus gagal.`] : []),
    ],
    logs: recentLogs.map((l) => ({
      id: l.id.toString(),
      worker: l.worker,
      level: l.level,
      message: l.message,
      jobId: l.jobId ? l.jobId.toString() : null,
      jobType: l.jobType,
      createdAt: l.createdAt,
    })),
  };
}

/** Nama berkas log yang diizinkan dibaca (cegah path traversal). */
const ALLOWED_LOG_FILES = ['api.out', 'api.err', 'worker.out', 'worker.err'];

/**
 * Baca N baris terakhir sebuah berkas log PM2.
 * Hanya berkas dalam daftar putih, hanya di folder Backend/logs.
 */
async function tailLogFile(name, { lines = 200 } = {}) {
  const fs = require('fs');
  const path = require('path');

  const base = String(name || '').replace(/\.log$/i, '');
  if (!ALLOWED_LOG_FILES.includes(base)) {
    const err = new Error(`Berkas log tidak diizinkan: ${name}`);
    err.status = 400;
    throw err;
  }

  const file = path.join(__dirname, '..', '..', 'logs', `${base}.log`);
  if (!fs.existsSync(file)) {
    return { file: `${base}.log`, exists: false, lines: [], totalBytes: 0 };
  }

  const stat = fs.statSync(file);
  const take = Math.min(Math.max(Number(lines) || 200, 10), 2000);
  const maxBytes = 512 * 1024; // baca maksimal 512 KB terakhir

  const start = Math.max(0, stat.size - maxBytes);
  const fd = fs.openSync(file, 'r');
  const buf = Buffer.alloc(Math.min(stat.size - start, maxBytes));
  fs.readSync(fd, buf, 0, buf.length, start);
  fs.closeSync(fd);

  const all = buf.toString('utf8').split(/\r?\n/);
  // Buang baris pertama bila kita mulai dari tengah berkas.
  const sliced = start > 0 ? all.slice(1) : all;

  return {
    file: `${base}.log`,
    exists: true,
    totalBytes: stat.size,
    modifiedAt: stat.mtime.toISOString(),
    truncated: start > 0,
    lines: sliced.filter(Boolean).slice(-take),
  };
}

/** Hapus catatan aktivitas worker yang lama. */
async function pruneWorkerLogs({ keep = 2000 } = {}) {
  const total = await prisma.workerLog.count();
  if (total <= keep) return { removed: 0, remaining: total };
  const cutoff = await prisma.workerLog.findMany({
    orderBy: { id: 'desc' },
    skip: keep - 1,
    take: 1,
    select: { id: true },
  });
  if (!cutoff.length) return { removed: 0, remaining: total };
  const res = await prisma.workerLog.deleteMany({ where: { id: { lt: cutoff[0].id } } });
  return { removed: res.count, remaining: total - res.count };
}

module.exports = {
  getServerMetrics,
  getRequestStats,
  getRecentAudit,
  getOverview,
  getDatabaseStatus,
  getWorkerStatus,
  tailLogFile,
  pruneWorkerLogs,
  ALLOWED_LOG_FILES,
};
