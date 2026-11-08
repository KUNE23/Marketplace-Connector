// Backend/src/services/jobService.js
const createError = require('http-errors');

const prisma = require('../lib/prisma');

const SELECT = {
  id: true,
  type: true,
  payload: true,
  status: true,
  priority: true,
  attempts: true,
  maxAttempts: true,
  lastError: true,
  runAt: true,
  startedAt: true,
  finishedAt: true,
  createdAt: true,
  updatedAt: true,
};

function serialize(job) {
  return {
    id: job.id.toString(),
    type: job.type,
    payload: job.payload,
    status: job.status,
    priority: job.priority,
    attempts: job.attempts,
    maxAttempts: job.maxAttempts,
    lastError: job.lastError,
    runAt: job.runAt,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
}

async function enqueueJob({ type, payload, priority = 0, runAt }) {
  const job = await prisma.job.create({
    data: { type, payload: payload ?? undefined, priority, runAt: runAt ?? new Date() },
    select: SELECT,
  });
  return serialize(job);
}

/**
 * Ambil satu job pending yang siap dijalankan, tandai running.
 * Menggunakan updateMany untuk klaim aman (race sederhana antar worker).
 */
async function claimNextJob(types = []) {
  const where = { status: 'pending', runAt: { lte: new Date() } };
  if (types.length) where.type = { in: types };

  const candidate = await prisma.job.findFirst({ where, orderBy: [{ priority: 'desc' }, { id: 'asc' }] });
  if (!candidate) return null;

  const claimed = await prisma.job.updateMany({
    where: { id: candidate.id, status: 'pending' },
    data: { status: 'running', startedAt: new Date(), attempts: { increment: 1 } },
  });
  if (claimed.count === 0) return null; // sudah diambil worker lain

  const job = await prisma.job.findUnique({ where: { id: candidate.id }, select: SELECT });
  return serialize(job);
}

async function markJobDone(id, payload) {
  await prisma.job.update({
    where: { id: BigInt(id) },
    data: {
      status: 'done',
      finishedAt: new Date(),
      lastError: null,
      ...(payload !== undefined ? { payload } : {}),
    },
  });
}

async function markJobFailed(id, error, retry = true) {
  const job = await prisma.job.findUnique({ where: { id: BigInt(id) } });
  if (!job) return;
  const shouldRetry = retry && job.attempts < job.maxAttempts;
  await prisma.job.update({
    where: { id: BigInt(id) },
    data: {
      status: shouldRetry ? 'pending' : 'failed',
      finishedAt: shouldRetry ? null : new Date(),
      lastError: String(error).slice(0, 1000),
      runAt: shouldRetry ? new Date(Date.now() + 60_000) : job.runAt,
    },
  });
}

async function listJobs({ page = 1, limit = 20, status, type } = {}) {
  const skip = (page - 1) * limit;
  const where = {};
  if (status) where.status = status;
  if (type) where.type = type;
  const [jobs, total] = await Promise.all([
    prisma.job.findMany({ skip, take: limit, where, orderBy: { id: 'desc' }, select: SELECT }),
    prisma.job.count({ where }),
  ]);
  return { jobs: jobs.map(serialize), total, page, limit };
}

async function retryJob(id) {
  try {
    const job = await prisma.job.update({
      where: { id: BigInt(id) },
      data: { status: 'pending', runAt: new Date(), lastError: null, finishedAt: null },
      select: SELECT,
    });
    return serialize(job);
  } catch (err) {
    if (err.code === 'P2025') throw createError(404, 'Job not found');
    throw err;
  }
}

module.exports = { enqueueJob, claimNextJob, markJobDone, markJobFailed, listJobs, retryJob };

