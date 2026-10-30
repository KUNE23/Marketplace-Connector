// Backend/src/tasks/shopeeSyncJob.js
const cron = require('node-cron');
const { syncShopeeProducts } = require('../services/shopeeSyncService');

// Jadwalkan setiap 5 menit – dapat di‑ubah via env
const CRON_EXPRESSION = process.env.SHOPEE_SYNC_CRON || '*/5 * * * *';

console.log(`[ShopeeSync] Scheduling job with expression: ${CRON_EXPRESSION}`);

cron.schedule(CRON_EXPRESSION, async () => {
  console.log('[ShopeeSync] Starting synchronization job…');
  try {
    await syncShopeeProducts();
    console.log('[ShopeeSync] Job completed successfully');
  } catch (err) {
    console.error('[ShopeeSync] Job failed:', err.message);
  }
});

module.exports = { CRON_EXPRESSION };
