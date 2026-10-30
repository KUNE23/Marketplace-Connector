// Backend/src/services/shopeeSyncService.js
const axios = require('axios');
const { PrismaClient } = require('@prisma/client');
const createError = require('http-errors');

const prisma = new PrismaClient();

// Konfigurasi Shopee API – ambil dari env atau hard‑code untuk demo
const SHOPEE_API_BASE = process.env.SHOPEE_API_BASE || 'https://api.shopee.co.id';
const SHOPEE_API_TOKEN = process.env.SHOPEE_API_TOKEN || '';

/**
 * Ambil daftar item dari Shopee.
 * Endpoint contoh (disesuaikan dengan dokumen Shopee):
 * GET /items?updated_after=timestamp
 */
async function fetchShopeeItems(sinceTimestamp) {
  const url = `${SHOPEE_API_BASE}/items`;
  const params = {};
  if (sinceTimestamp) params.updated_after = sinceTimestamp;
  const headers = { Authorization: `Bearer ${SHOPEE_API_TOKEN}` };
  const response = await axios.get(url, { params, headers });
  return response.data; // diasumsikan array objek product
}

/**
 * Sinkronkan satu item Shopee ke tabel Product.
 * Jika belum ada (berdasarkan shopeeItemId) maka INSERT, else UPDATE.
 */
async function upsertProductFromShopee(item) {
  const data = {
    shopeeItemId: BigInt(item.item_id),
    sku: item.sku,
    name: item.name,
    description: item.description,
    priceIdr: item.price_idr ? item.price_idr.toString() : undefined,
    stock: item.stock,
    category: item.category,
    imageUrls: item.images || [],
    lastSyncedAt: new Date(),
  };

  await prisma.product.upsert({
    where: { shopeeItemId: data.shopeeItemId },
    update: data,
    create: data,
  });
}

/**
 * Job yang dipanggil setiap beberapa menit (misalnya dengan node‑cron).
 * Mengambil timestamp terakhir sinkronisasi dan mem-fetch item baru.
 */
async function syncShopeeProducts() {
  try {
    // ambil timestamp terakhir sinkronisasi terpakai; fallback ke 0
    const lastLog = await prisma.syncLog.findFirst({
      orderBy: { runAt: 'desc' },
    });
    const since = lastLog ? Math.floor(new Date(lastLog.runAt).getTime() / 1000) : 0;

    const items = await fetchShopeeItems(since);
    for (const item of items) {
      await upsertProductFromShopee(item);
    }
    // catat log sinkronisasi
    await prisma.syncLog.create({
      data: {
        status: 'SUCCESS',
        responseCode: 200,
        responseBody: items,
        // productId tidak relevan karena batch; set null
      },
    });
  } catch (err) {
    // Simpan log error
    await prisma.syncLog.create({
      data: {
        status: 'ERROR',
        responseCode: err.response ? err.response.status : 500,
        responseBody: err.response ? err.response.data : { message: err.message },
      },
    });
    // lempar kembali agar scheduler bisa menanganinya bila diperlukan
    throw err;
  }
}

module.exports = { syncShopeeProducts };
