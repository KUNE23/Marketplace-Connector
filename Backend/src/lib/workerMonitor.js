// Backend/src/lib/workerMonitor.js
/**
 * Pemantau worker: detak jantung + catatan aktivitas.
 *
 * Kenapa lewat database (bukan hanya berkas log):
 *   Worker berjalan sebagai PROSES TERPISAH dari API. Halaman Monitor berjalan
 *   di proses API. Berkas log PM2 hanya ada kalau worker dijalankan lewat PM2,
 *   dan API tidak selalu punya akses ke stdout proses lain. Dengan menyimpan
 *   detak jantung + catatan ke DB, Monitor bisa memantau worker apa pun caranya
 *   dijalankan.
 *
 * Semua penulisan bersifat "best effort": kegagalan mencatat TIDAK boleh
 * menghentikan worker.
 */
const os = require('os');
const prisma = require('./prisma');

const WORKER_NAME = process.env.WORKER_NAME || 'enzyy-worker';
const MAX_LOG_ROWS = Number(process.env.WORKER_LOG_KEEP || 2000);
let startedAt = new Date();
let pruneCounter = 0;

/** Kirim detak jantung. Dipanggil tiap siklus poll. */
async function heartbeat({ status = 'idle', currentJob = null } = {}) {
  try {
    await prisma.workerHeartbeat.upsert({
      where: { name: WORKER_NAME },
      create: {
        name: WORKER_NAME,
        pid: process.pid,
        hostname: os.hostname(),
        status,
        currentJob: currentJob ? BigInt(currentJob) : null,
        polls: 1,
        version: process.version,
        startedAt,
        lastSeenAt: new Date(),
      },
      update: {
        pid: process.pid,
        hostname: os.hostname(),
        status,
        currentJob: currentJob ? BigInt(currentJob) : null,
        polls: { increment: 1 },
        version: process.version,
        lastSeenAt: new Date(),
      },
    });
  } catch {
    /* abaikan */
  }
}

/** Tambah hitungan job selesai/gagal. */
async function countJob({ done = 0, failed = 0 } = {}) {
  try {
    await prisma.workerHeartbeat.update({
      where: { name: WORKER_NAME },
      data: {
        ...(done ? { jobsDone: { increment: done } } : {}),
        ...(failed ? { jobsFailed: { increment: failed } } : {}),
      },
    });
  } catch {
    /* abaikan */
  }
}

/** Tandai worker berhenti (dipanggil saat shutdown). */
async function markStopped() {
  try {
    await prisma.workerHeartbeat.update({
      where: { name: WORKER_NAME },
      data: { status: 'stopped', currentJob: null, lastSeenAt: new Date() },
    });
  } catch {
    /* abaikan */
  }
}

/** Catat satu aktivitas. */
async function log(level, message, { jobId = null, jobType = null } = {}) {
  try {
    await prisma.workerLog.create({
      data: {
        worker: WORKER_NAME,
        level: String(level).slice(0, 10),
        message: String(message ?? '').slice(0, 1000),
        jobId: jobId ? BigInt(jobId) : null,
        jobType: jobType ? String(jobType).slice(0, 50) : null,
      },
    });
    // Bersihkan berkala (tiap 50 tulisan) agar tabel tidak membengkak.
    pruneCounter += 1;
    if (pruneCounter >= 50) {
      pruneCounter = 0;
      await prune();
    }
  } catch {
    /* abaikan */
  }
}

const info = (msg, opts) => log('info', msg, opts);
const warn = (msg, opts) => log('warn', msg, opts);
const error = (msg, opts) => log('error', msg, opts);

/** Sisakan MAX_LOG_ROWS catatan terbaru. */
async function prune() {
  try {
    const total = await prisma.workerLog.count({ where: { worker: WORKER_NAME } });
    if (total <= MAX_LOG_ROWS) return { removed: 0 };
    const cutoff = await prisma.workerLog.findMany({
      where: { worker: WORKER_NAME },
      orderBy: { id: 'desc' },
      skip: MAX_LOG_ROWS - 1,
      take: 1,
      select: { id: true },
    });
    if (!cutoff.length) return { removed: 0 };
    const res = await prisma.workerLog.deleteMany({
      where: { worker: WORKER_NAME, id: { lt: cutoff[0].id } },
    });
    return { removed: res.count };
  } catch {
    return { removed: 0 };
  }
}

/** Reset startedAt (dipakai saat worker start). */
function resetStart() {
  startedAt = new Date();
}

module.exports = {
  WORKER_NAME,
  heartbeat,
  countJob,
  markStopped,
  log,
  info,
  warn,
  error,
  prune,
  resetStart,
};
