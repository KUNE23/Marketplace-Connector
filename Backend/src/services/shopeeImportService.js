// Backend/src/services/shopeeImportService.js
/**
 * Import produk hasil scraping dari SQLite `shopee.db` ke tabel Product Enzyy.
 *
 * - Read-only ke shopee.db (node:sqlite bawaan Node 22+).
 * - Cursor-based pakai rowid (bukan offset) agar aman walau data berubah.
 * - Progres disimpan di tabel ImportState supaya bisa lanjut berkali-kali.
 * - 1 batch = jumlah baris dibatasi (default 50, max 200).
 */
const path = require('path');
const fs = require('fs');
const createError = require('http-errors');
const { clampLimit } = require('../utils/pagination');

const prisma = require('../lib/prisma');

const DEFAULT_DB_PATH = process.env.SHOPEE_DB_PATH || path.join(__dirname, '..', '..', 'shopee.db');
const SOURCE = 'shopee_db';

function openScrapeDb() {
  if (!fs.existsSync(DEFAULT_DB_PATH)) {
    throw createError(404, `File scraping tidak ditemukan: ${DEFAULT_DB_PATH}`);
  }
  let DatabaseSync;
  try {
    ({ DatabaseSync } = require('node:sqlite'));
  } catch {
    throw createError(500, 'Node runtime tidak mendukung node:sqlite (butuh Node 22+).');
  }
  return new DatabaseSync(DEFAULT_DB_PATH, { readOnly: true });
}

function toProductData(row) {
  return {
    shopeeItemId: row.itemid ? BigInt(row.itemid) : undefined,
    sku: row.itemid ? String(row.itemid) : null,
    name: row.judul ?? null,
    description: row.deskripsi ?? null,
    priceIdr: row.harga_idr != null ? String(row.harga_idr) : null,
    stock: row.stok ?? null,
    shopeeUrl: row.produk_url ?? null,
    shopId: row.shopid != null ? String(row.shopid) : null,
    location: row.lokasi ?? null,
    sold: row.terjual ?? null,
    rating: row.rating != null ? String(row.rating) : null,
    imageUrls: row.gambar_url ? [row.gambar_url] : [],
    lastSyncedAt: row.last_seen ? new Date(row.last_seen) : new Date(),
  };
}

async function getState() {
  return prisma.importState.upsert({
    where: { source: SOURCE },
    create: { source: SOURCE },
    update: {},
  });
}

function serializeState(s) {
  return {
    source: s.source,
    lastRowId: s.lastRowId,
    imported: s.imported,
    updated: s.updated,
    skipped: s.skipped,
    failed: s.failed,
    status: s.status,
    lastError: s.lastError,
    startedAt: s.startedAt,
    finishedAt: s.finishedAt,
  };
}

async function getScrapeStats() {
  const db = openScrapeDb();
  try {
    const total = db.prepare('SELECT COUNT(*) AS c FROM products').get().c;
    const maxRowId = db.prepare('SELECT COALESCE(MAX(rowid), 0) AS m FROM products').get().m;
    const state = await getState();
    return {
      total,
      maxRowId,
      state: serializeState(state),
      remaining: Math.max(0, total - state.imported - state.updated),
    };
  } finally {
    db.close();
  }
}

/**
 * Import satu batch mulai dari state.lastRowId.
 */
async function importNextBatch({ batchSize } = {}) {
  const size = clampLimit(batchSize, 50);
  const state = await getState();
  const db = openScrapeDb();

  let summary = { processed: 0, inserted: 0, updated: 0, skipped: 0, failed: 0, done: false };
  try {
    const rows = db
      .prepare('SELECT rowid AS _rowid, * FROM products WHERE rowid > ? ORDER BY rowid LIMIT ?')
      .all(state.lastRowId, size);

    if (rows.length === 0) {
      await prisma.importState.update({
        where: { source: SOURCE },
        data: { status: 'done', finishedAt: new Date() },
      });
      return { ...summary, done: true, state: serializeState(await getState()) };
    }

    await prisma.importState.update({
      where: { source: SOURCE },
      data: { status: 'running', startedAt: state.startedAt ?? new Date() },
    });

    let lastRowId = state.lastRowId;
    for (const row of rows) {
      lastRowId = row._rowid;
      summary.processed += 1;

      if (!row.itemid) {
        summary.skipped += 1;
        continue;
      }
      const data = toProductData(row);
      try {
        const existing = await prisma.product.findUnique({ where: { shopeeItemId: data.shopeeItemId } });
        if (existing) {
          await prisma.product.update({ where: { id: existing.id }, data });
          summary.updated += 1;
        } else {
          await prisma.product.create({ data });
          summary.inserted += 1;
        }
      } catch {
        summary.failed += 1;
      }
    }

    const updatedState = await prisma.importState.update({
      where: { source: SOURCE },
      data: {
        lastRowId,
        imported: { increment: summary.inserted },
        updated: { increment: summary.updated },
        skipped: { increment: summary.skipped },
        failed: { increment: summary.failed },
        status: rows.length < size ? 'done' : 'running',
        finishedAt: rows.length < size ? new Date() : null,
      },
    });

    return { ...summary, done: rows.length < size, state: serializeState(updatedState) };
  } catch (err) {
    await prisma.importState.update({
      where: { source: SOURCE },
      data: { status: 'idle', lastError: String(err.message || err).slice(0, 500) },
    });
    throw err;
  } finally {
    db.close();
  }
}

async function resetImport() {
  const state = await prisma.importState.upsert({
    where: { source: SOURCE },
    create: { source: SOURCE },
    update: {
      lastRowId: 0,
      imported: 0,
      updated: 0,
      skipped: 0,
      failed: 0,
      status: 'idle',
      lastError: null,
      startedAt: null,
      finishedAt: null,
    },
  });
  return serializeState(state);
}

module.exports = {
  importNextBatch,
  getScrapeStats,
  resetImport,
  DEFAULT_DB_PATH,
};

