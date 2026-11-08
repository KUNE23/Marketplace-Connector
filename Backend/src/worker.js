// Backend/src/worker.js
/**
 * Worker Enzyy â€” proses terpisah dari API server.
 *
 * Menjalankan antrian `Job`:
 *   - post_listing   : posting satu listing ke Akulaku (payload: { listingId })
 *   - sync_orders    : tarik order Akulaku semua akun aktif
 *
 * Jalankan: node src/worker.js
 * Di VPS: pm2 start src/worker.js --name enzyy-worker
 */
require('dotenv').config();
const { claimNextJob, markJobDone, markJobFailed } = require('./services/jobService');

const prisma = require('../lib/prisma');
const POLL_INTERVAL_MS = Number(process.env.WORKER_POLL_INTERVAL_MS || 5000);
const HANDLED_TYPES = ['post_listing', 'sync_orders'];

let running = true;

async function handlePostListing(payload) {
  const listingId = payload?.listingId;
  if (!listingId) throw new Error('post_listing butuh payload.listingId');
  const { postListingById } = require('./services/akulakuPostingService');
  return postListingById(listingId);
}

async function handleSyncOrders() {
  const { syncAllAccounts } = require('./services/akulakuOrderSyncService');
  return syncAllAccounts();
}

const handlers = {
  post_listing: handlePostListing,
  sync_orders: handleSyncOrders,
};

async function processOne() {
  const job = await claimNextJob(HANDLED_TYPES);
  if (!job) return false;

  console.log(`[worker] job #${job.id} type=${job.type} attempt=${job.attempts}`);
  try {
    const handler = handlers[job.type];
    if (!handler) throw new Error(`Tipe job tidak dikenal: ${job.type}`);
    const result = await handler(job.payload || {});
    await markJobDone(job.id);
    console.log(`[worker] job #${job.id} done`, result ?? '');
  } catch (err) {
    await markJobFailed(job.id, err.message || err);
    console.error(`[worker] job #${job.id} failed:`, err.message || err);
  }
  return true;
}

async function loop() {
  console.log(`[worker] started, polling every ${POLL_INTERVAL_MS}ms`);
  while (running) {
    try {
      const didWork = await processOne();
      if (!didWork) await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    } catch (err) {
      console.error('[worker] loop error:', err.message || err);
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }
  }
  await prisma.$disconnect();
  console.log('[worker] stopped');
}

process.on('SIGINT', () => { running = false; });
process.on('SIGTERM', () => { running = false; });

if (require.main === module) {
  loop();
}

module.exports = { processOne };

