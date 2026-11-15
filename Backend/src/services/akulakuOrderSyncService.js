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
 * Normalisasi nama produk agar pencocokan tahan perbedaan format:
 * huruf kecil, tanda baca -> spasi, spasi ganda dirapikan.
 */
function normalizeName(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Skor kemiripan 0..1 berbasis irisan kata (Jaccard) + bonus awalan sama. */
function nameSimilarity(a, b) {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;

  const wa = new Set(na.split(' ').filter((w) => w.length > 1));
  const wb = new Set(nb.split(' ').filter((w) => w.length > 1));
  if (!wa.size || !wb.size) return 0;

  let inter = 0;
  for (const w of wa) if (wb.has(w)) inter += 1;
  const union = wa.size + wb.size - inter;
  const jaccard = union ? inter / union : 0;

  // Bonus bila 20 karakter pertama sama (nama produk biasanya dipotong di akhir).
  const prefix = na.slice(0, 20) === nb.slice(0, 20) ? 0.15 : 0;
  return Math.min(1, jaccard + prefix);
}

/**
 * Bangun fungsi penaut item order -> Listing milik akun ini (untuk modal).
 *
 * Urutan pencocokan (dari paling pasti):
 *   1) SKU persis
 *   2) Nama ternormalisasi persis
 *   3) Kemiripan nama >= AMBANG (default 0.75)
 *
 * Pencocokan berbasis nama diperlukan karena order Akulaku hanya mengembalikan
 * ID internal Akulaku, bukan SKU kita.
 */
async function buildListingLinker(accountId, { threshold = 0.75 } = {}) {
  const listings = await prisma.listing.findMany({
    where: { accountId: BigInt(accountId) },
    select: { id: true, product: { select: { name: true, sku: true } } },
  });

  const bySku = new Map();
  const byNorm = new Map();
  const candidates = [];
  for (const l of listings) {
    const name = l.product?.name || '';
    const sku = String(l.product?.sku || '').trim();
    const norm = normalizeName(name);
    if (sku) bySku.set(sku, l.id);
    if (norm) {
      byNorm.set(norm, l.id);
      candidates.push({ id: l.id, name, norm });
    }
  }

  return (item) => {
    // 1) SKU persis
    const sku = String(item.sku || '').trim();
    if (sku && bySku.has(sku)) return bySku.get(sku);

    // 2) Nama ternormalisasi persis
    const norm = normalizeName(item.name);
    if (norm && byNorm.has(norm)) return byNorm.get(norm);

    // 3) Kemiripan nama
    if (!norm) return null;
    let best = null;
    let bestScore = 0;
    for (const c of candidates) {
      const score = nameSimilarity(item.name, c.name);
      if (score > bestScore) {
        bestScore = score;
        best = c.id;
      }
    }
    return bestScore >= threshold ? best : null;
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

/**
 * Tautkan ulang item pesanan yang BELUM punya listing ke Listing, memakai
 * pencocokan cerdas terbaru. Berguna untuk data lama yang tersinkron sebelum
 * pencocokan diperbaiki.
 *
 * Mengembalikan { checked, linked, stillUnlinked, details }.
 */
async function relinkOrderItems({ accountId = null, threshold = 0.75 } = {}) {
  const where = { listingId: null };
  if (accountId) where.order = { accountId: BigInt(accountId) };

  const items = await prisma.akulakuOrderItem.findMany({
    where,
    select: {
      id: true,
      sku: true,
      name: true,
      order: { select: { accountId: true } },
    },
  });

  // Kelompokkan per akun agar linker dibangun sekali per akun.
  const byAccount = new Map();
  for (const it of items) {
    const key = it.order.accountId.toString();
    if (!byAccount.has(key)) byAccount.set(key, []);
    byAccount.get(key).push(it);
  }

  let linked = 0;
  const details = [];

  for (const [accId, rows] of byAccount) {
    // Linker perlu objek mirip item: { sku, name }
    // eslint-disable-next-line no-await-in-loop
    const linker = await buildListingLinker(accId, { threshold });

    for (const row of rows) {
      const listingId = linker({ sku: row.sku, name: row.name });
      if (!listingId) continue;
      // eslint-disable-next-line no-await-in-loop
      await prisma.akulakuOrderItem.update({
        where: { id: row.id },
        data: { listingId },
      });
      linked += 1;
      details.push({ itemId: row.id.toString(), accountId: accId, listingId: listingId.toString() });
    }
  }

  return {
    checked: items.length,
    linked,
    stillUnlinked: items.length - linked,
    details: details.slice(0, 50),
  };
}

module.exports = {
  fetchOrdersForAccount,
  syncOrdersForAccount,
  syncAllAccounts,
  relinkOrderItems,
  mapOrderRecord,
  buildListingLinker,
  normalizeName,
  nameSimilarity,
  ORDERS,
};
