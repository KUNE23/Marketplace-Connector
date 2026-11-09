// Backend/src/services/akulakuOrderSyncService.js
/**
 * Ambil order dari Akulaku Seller Center lewat API internal yang dipakai
 * halaman "Pesanan", lalu simpan via akulakuOrderService (idempotent +
 * otomatis bikin notifikasi).
 *
 * Endpoint (cookie-based, dipanggil dari konteks halaman yang sudah login):
 *   POST /bapi/vendor-orders-biz/order/queryOrders
 *   body: { pageNo, pageSize, goodsName, userName, orderStatus, orderType }
 *
 * orderStatus (hasil pemetaan tab UI):
 *   ''  = semua   | 2 = menunggu pembayaran | 3 = memproses pesanan
 *   4   = menunggu pengiriman | 5 = dalam proses pengiriman
 *   6   = transaksi berhasil  | -1 = transaksi ditutup
 */
const { openLoggedInContext, CONFIG } = require('./akulakuBrowser');
const { createAkulakuOrder } = require('./akulakuOrderService');

const prisma = require('../lib/prisma');

const ORDERS = {
  url: process.env.AKULAKU_ORDERS_URL || '/order/list',
  apiPath: process.env.AKULAKU_ORDERS_API || '/bapi/vendor-orders-biz/order/queryOrders',
  pageSize: Number(process.env.AKULAKU_ORDER_PAGE_SIZE || 50),
  maxPages: Number(process.env.AKULAKU_ORDER_MAX_PAGES || 20),
};

// Peta orderStatus Akulaku -> status internal model AkulakuOrder.
const STATUS_MAP = {
  '2': 'new', // menunggu pembayaran
  '3': 'processing', // memproses pesanan
  '4': 'processing', // menunggu pengiriman
  '5': 'shipped', // dalam proses pengiriman
  '6': 'delivered', // transaksi berhasil
  '-1': 'cancelled', // transaksi ditutup
};

function mapStatus(code) {
  return STATUS_MAP[String(code)] || 'new';
}

function buildShippingAddress(addr) {
  if (!addr) return null;
  return [
    addr.name,
    addr.address,
    addr.town,
    addr.area,
    addr.city,
    addr.province,
    addr.zipCode,
  ]
    .filter(Boolean)
    .join(', ');
}

/** Ubah satu record order Akulaku -> input createAkulakuOrder.
 * `linker(item)` opsional: mengembalikan listingId (BigInt) untuk menghitung modal. */
function mapOrderRecord(o, accountId, linker) {
  const items = (o.orderItems || []).map((it) => ({
    listingId: linker ? linker(it) : null,
    sku: it.skuId != null ? String(it.skuId) : null,
    name: it.skuName || null,
    qty: Number(it.skuQty || 0),
    unitPrice: String(it.skuPrice ?? '0'),
    total: String(it.orderItemAmount ?? it.skuPrice ?? '0'),
  }));

  return {
    externalId: String(o.orderId || o.orderCode),
    accountId,
    buyerName: o.purchaser?.nickname ?? null,
    // Catatan: nomor telepon dari Akulaku berupa token terenkripsi (tidak bisa
    // dibaca & melebihi batas kolom), jadi tidak disimpan.
    buyerPhone: null,
    shippingAddress: buildShippingAddress(o.receiverAddress),
    status: mapStatus(o.orderStatus),
    totalAmt: String(o.payAmount ?? '0'),
    currency: 'IDR',
    orderedAt: o.createTime ? new Date(Number(o.createTime) * 1000) : new Date(),
    rawPayload: o,
    items,
  };
}

/**
 * Ambil order satu akun lewat API internal. Mengembalikan array record mentah.
 */
async function fetchOrdersForAccount(accountId, { orderStatus = '', pageSize = ORDERS.pageSize } = {}) {
  const { browser, page } = await openLoggedInContext(accountId);
  try {
    await page.goto(`${CONFIG.baseUrl}${ORDERS.url}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});

    const all = [];
    for (let pageNo = 1; pageNo <= ORDERS.maxPages; pageNo++) {
      const res = await page.evaluate(
        async ({ apiPath, pageNo, pageSize, orderStatus }) => {
          const r = await fetch(apiPath, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json;charset=UTF-8' },
            body: JSON.stringify({
              pageNo,
              pageSize,
              goodsName: '',
              userName: '',
              orderStatus,
              orderType: 'desc',
            }),
          });
          return { status: r.status, body: await r.json() };
        },
        { apiPath: ORDERS.apiPath, pageNo, pageSize, orderStatus },
      );

      if (res.status !== 200 || !res.body?.success) {
        throw new Error(`queryOrders gagal (page ${pageNo}): status ${res.status} ${res.body?.errMsg || ''}`);
      }
      const records = res.body.data?.records || [];
      all.push(...records);
      if (!res.body.data?.hasNext) break;
    }
    return all;
  } finally {
    await browser.close();
  }
}

/**
 * Bangun fungsi penaut item order -> Listing milik akun ini (untuk modal).
 * Pencocokan berbasis nama produk (case-insensitive) karena order Akulaku
 * hanya mengembalikan ID internal Akulaku, bukan SKU kita.
 * Mengembalikan (item) => listingId BigInt | null.
 */
async function buildListingLinker(accountId) {
  const listings = await prisma.listing.findMany({
    where: { accountId: BigInt(accountId) },
    select: { id: true, product: { select: { name: true, sku: true } } },
  });
  const byName = new Map();
  const bySku = new Map();
  for (const l of listings) {
    const name = (l.product?.name || '').trim().toLowerCase();
    const sku = String(l.product?.sku || '').trim();
    if (name) byName.set(name, l.id);
    if (sku) bySku.set(sku, l.id);
  }
  return (item) => {
    const name = (item.name || '').trim().toLowerCase();
    if (name && byName.has(name)) return byName.get(name);
    const sku = String(item.sku || '').trim();
    if (sku && bySku.has(sku)) return bySku.get(sku);
    return null;
  };
}

/**
 * Sync order satu akun: ambil lewat API lalu simpan ke DB.
 */
async function syncOrdersForAccount(accountId, options = {}) {
  const records = await fetchOrdersForAccount(accountId, options);
  const accountIdBig = BigInt(accountId);
  const linker = await buildListingLinker(accountIdBig);
  let created = 0;
  let skipped = 0;
  let failed = 0;

  for (const record of records) {
    const data = mapOrderRecord(record, accountIdBig, linker);
    if (!data.items.length || !data.externalId) {
      skipped += 1;
      continue;
    }
    try {
      const result = await createAkulakuOrder(data);
      if (result.created) created += 1;
      else skipped += 1;
    } catch {
      failed += 1;
    }
  }

  return { accountId: accountIdBig.toString(), scraped: records.length, created, skipped, failed };
}

/**
 * Sync order untuk semua akun Akulaku yang aktif.
 */
async function syncAllAccounts(options = {}) {
  const accounts = await prisma.akulakuAccount.findMany({ where: { status: 'active' }, select: { id: true } });
  const results = [];
  for (const account of accounts) {
    try {
      results.push(await syncOrdersForAccount(account.id, options));
    } catch (err) {
      results.push({ accountId: account.id.toString(), error: String(err.message || err) });
    }
  }
  return results;
}

module.exports = {
  fetchOrdersForAccount,
  syncOrdersForAccount,
  syncAllAccounts,
  mapOrderRecord,
  buildListingLinker,
  ORDERS,
};
