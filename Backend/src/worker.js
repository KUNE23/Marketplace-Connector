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
const { claimNextJob, markJobDone, markJobFailed, enqueueJobOnce } = require('./services/jobService');

const prisma = require('./lib/prisma');
const POLL_INTERVAL_MS = Number(process.env.WORKER_POLL_INTERVAL_MS || 5000);
// Auto-sync pesanan: enqueue job sync_orders berkala (tanpa klik manual).
const AUTO_SYNC_ENABLED = process.env.AUTO_SYNC_ORDERS !== 'false';
const AUTO_SYNC_INTERVAL_MS = Number(process.env.AUTO_SYNC_INTERVAL_MS || 300000); // default 5 menit
const HANDLED_TYPES = ['post_listing', 'sync_orders'];

let running = true;
let autoSyncTimer = null;

async function enqueueAutoSync() {
  try {
    const job = await enqueueJobOnce({ type: 'sync_orders', payload: { auto: true }, priority: 1 });
    if (job) console.log(`[worker] auto-enqueue sync_orders (job #${job.id})`);
  } catch (err) {
    console.error('[worker] gagal auto-enqueue sync_orders:', err.message || err);
  }
}

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

  if (AUTO_SYNC_ENABLED) {
    console.log(`[worker] auto-sync pesanan aktif setiap ${AUTO_SYNC_INTERVAL_MS}ms`);
    // Enqueue sekali di awal, lalu berkala.
    await enqueueAutoSync();
    autoSyncTimer = setInterval(enqueueAutoSync, AUTO_SYNC_INTERVAL_MS);
  } else {
    console.log('[worker] auto-sync pesanan nonaktif (AUTO_SYNC_ORDERS=false)');
  }

  while (running) {
    try {
      const didWork = await processOne();
      if (!didWork) await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    } catch (err) {
      console.error('[worker] loop error:', err.message || err);
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }
  }
  if (autoSyncTimer) clearInterval(autoSyncTimer);
  await prisma.$disconnect();
  console.log('[worker] stopped');
}

process.on('SIGINT', () => { running = false; });
process.on('SIGTERM', () => { running = false; });

if (require.main === module) {
  loop();
}

module.exports = { processOne };

