// Backend/src/services/akulakuOrderSyncService.js
/**
 * Ambil order baru dari Akulaku Seller Center via otomasi browser, lalu simpan
 * lewat akulakuOrderService (idempotent + otomatis bikin notifikasi).
 *
 * Selektor dikonfigurasi lewat env:
 *   AKULAKU_ORDERS_URL              - path halaman daftar order
 *   AKULAKU_ORDERS_ROW_SELECTOR     - selektor row pesanan
 *   AKULAKU_ORDER_ID_SELECTOR       - selektor teks no. order di dalam row
 *   AKULAKU_ORDER_ROW_LIMIT         - batas jumlah row yang diproses (default 20)
 */
const { openLoggedInContext, CONFIG } = require('./akulakuBrowser');
const { createAkulakuOrder } = require('./akulakuOrderService');

const prisma = require('../lib/prisma');

const ORDERS = {
  url: process.env.AKULAKU_ORDERS_URL || '/orders',
  row: process.env.AKULAKU_ORDERS_ROW_SELECTOR || '[data-testid="order-row"], tr.order-row',
  orderId: process.env.AKULAKU_ORDER_ID_SELECTOR || '[data-testid="order-id"], .order-id',
  limit: Number(process.env.AKULAKU_ORDER_ROW_LIMIT || 20),
};

/**
 * Scrape order untuk satu akun. Mengembalikan array order mentah.
 * Implementasi generik: ambil teks no. order per row. Detail item diisi
 * menyusul sesuai struktur UI (bisa diperluas tanpa mengubah service lain).
 */
async function scrapeOrdersForAccount(accountId) {
  const { browser, page } = await openLoggedInContext(accountId);
  try {
    await page.goto(`${CONFIG.baseUrl}${ORDERS.url}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForLoadState('networkidle', { timeout: 60000 });

    const rows = await page.locator(ORDERS.row).all();
    const orders = [];
    for (const row of rows.slice(0, ORDERS.limit)) {
      const externalId = (await row.locator(ORDERS.orderId).first().innerText().catch(() => '')).trim();
      if (!externalId) continue;
      orders.push({
        externalId,
        buyerName: null,
        totalAmt: '0',
        items: [],
      });
    }
    return orders;
  } finally {
    await browser.close();
  }
}

/**
 * Sync order untuk satu akun dan simpan ke DB.
 */
async function syncOrdersForAccount(accountId) {
  const scraped = await scrapeOrdersForAccount(accountId);
  let created = 0;
  let skipped = 0;
  let failed = 0;

  for (const order of scraped) {
    // Lewati order yang tidak lengkap (belum ada item) supaya tidak bikin data sampah.
    if (!order.items || order.items.length === 0) {
      skipped += 1;
      continue;
    }
    try {
      const result = await createAkulakuOrder({
        externalId: order.externalId,
        accountId: BigInt(accountId),
        buyerName: order.buyerName,
        totalAmt: order.totalAmt,
        items: order.items,
      });
      if (result.created) created += 1;
      else skipped += 1;
    } catch {
      failed += 1;
    }
  }

  return { accountId: accountId.toString(), scraped: scraped.length, created, skipped, failed };
}

/**
 * Sync order untuk semua akun Akulaku yang aktif.
 */
async function syncAllAccounts() {
  const accounts = await prisma.akulakuAccount.findMany({ where: { status: 'active' }, select: { id: true } });
  const results = [];
  for (const account of accounts) {
    try {
      results.push(await syncOrdersForAccount(account.id));
    } catch (err) {
      results.push({ accountId: account.id.toString(), error: String(err.message || err) });
    }
  }
  return results;
}

module.exports = { scrapeOrdersForAccount, syncOrdersForAccount, syncAllAccounts, ORDERS };

