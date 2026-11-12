// Backend/src/services/backupScheduler.js
/**
 * Penjadwal backup otomatis + pembersihan log lama.
 *
 * Dijalankan di proses API (interval ringan, bukan cron sistem) supaya tidak
 * butuh konfigurasi tambahan di VPS. Bisa dimatikan lewat env.
 *
 * Env:
 *   AUTO_BACKUP_ENABLED   default true
 *   AUTO_BACKUP_INTERVAL_HOURS  default 24
 *   BACKUP_RETENTION_KEEP default 14 (jumlah file yang disimpan)
 *   LOG_RETENTION_DAYS    default 30 (AuditLog & RequestMetric lebih tua dihapus)
 */
const { createBackup, pruneBackups } = require('./backupService');
const prisma = require('../lib/prisma');

const ENABLED = String(process.env.AUTO_BACKUP_ENABLED ?? 'true') !== 'false';
const INTERVAL_HOURS = Math.max(1, Number(process.env.AUTO_BACKUP_INTERVAL_HOURS || 24));
const RETENTION_KEEP = Math.max(1, Number(process.env.BACKUP_RETENTION_KEEP || 14));
const LOG_RETENTION_DAYS = Math.max(1, Number(process.env.LOG_RETENTION_DAYS || 30));

let timer = null;
let lastRun = null;
let lastResult = null;

/** Hapus log lama (AuditLog & RequestMetric) agar DB tidak membengkak. */
async function cleanupOldLogs() {
  const cutoff = new Date(Date.now() - LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const [audit, metrics] = await Promise.all([
    prisma.auditLog.deleteMany({ where: { createdAt: { lt: cutoff } } }),
    prisma.requestMetric.deleteMany({ where: { createdAt: { lt: cutoff } } }),
  ]);
  return { auditDeleted: audit.count, metricsDeleted: metrics.count, cutoff };
}

/** Satu siklus: backup + prune + cleanup. */
async function runCycle(trigger = 'auto') {
  const startedAt = new Date().toISOString();
  try {
    const backup = await createBackup({ reason: trigger });
    const pruned = await pruneBackups({ keep: RETENTION_KEEP });
    const logs = await cleanupOldLogs();
    lastRun = startedAt;
    lastResult = { ok: true, trigger, backup, pruned, logs };
    console.log(`[backup] ${trigger} selesai: ${backup.fileName} (${backup.sizeMb} MB), hapus ${pruned.deleted.length} lama`);
    return lastResult;
  } catch (err) {
    lastRun = startedAt;
    lastResult = { ok: false, trigger, error: String(err.message || err).slice(0, 300) };
    console.error('[backup] gagal:', err.message || err);
    return lastResult;
  }
}

/** Status penjadwal untuk ditampilkan di UI. */
function getSchedulerStatus() {
  return {
    enabled: ENABLED,
    intervalHours: INTERVAL_HOURS,
    retentionKeep: RETENTION_KEEP,
    logRetentionDays: LOG_RETENTION_DAYS,
    lastRun,
    lastResult,
    nextRunInMs: timer ? Math.max(0, INTERVAL_HOURS * 3600 * 1000 - (Date.now() % (INTERVAL_HOURS * 3600 * 1000))) : null,
  };
}

/** Mulai penjadwal (dipanggil sekali dari server.js). */
function startScheduler() {
  if (!ENABLED) {
    console.log('[backup] auto-backup nonaktif (AUTO_BACKUP_ENABLED=false)');
    return;
  }
  if (timer) return;

  const intervalMs = INTERVAL_HOURS * 60 * 60 * 1000;
  console.log(`[backup] auto-backup aktif tiap ${INTERVAL_HOURS} jam (simpan ${RETENTION_KEEP} file terakhir)`);

  // Jalankan sekali beberapa detik setelah start (agar tidak menghambat boot).
  setTimeout(() => { runCycle('auto-startup').catch(() => {}); }, 15000);

  timer = setInterval(() => { runCycle('auto').catch(() => {}); }, intervalMs);
  // Jangan menahan proses tetap hidup hanya karena timer ini.
  if (timer.unref) timer.unref();
}

function stopScheduler() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = { startScheduler, stopScheduler, runCycle, cleanupOldLogs, getSchedulerStatus };
