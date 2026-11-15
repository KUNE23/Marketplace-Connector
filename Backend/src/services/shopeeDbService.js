// Backend/src/services/shopeeDbService.js
/**
 * Kelola berkas SQLite hasil scraping Shopee (`shopee.db`) di server.
 *
 * Kenapa perlu upload:
 *   Scraper berjalan di komputer pengguna (Shopee memblokir IP datacenter VPS).
 *   Hasilnya berupa SQLite. Agar impor produk bisa dijalankan di server, berkas
 *   itu perlu dipindahkan ke VPS. Endpoint ini menerimanya lewat unggahan
 *   biner (application/octet-stream) sehingga tidak butuh dependensi tambahan.
 *
 * Keamanan:
 *   - Hanya SUPERADMIN (dijaga di route).
 *   - Ukuran dibatasi (SHOPEE_DB_MAX_MB, default 500 MB).
 *   - Header berkas divalidasi ("SQLite format 3").
 *   - Ditulis ke berkas sementara lalu di-rename (tidak merusak berkas lama
 *     bila unggahan gagal di tengah).
 */
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const createError = require('http-errors');

const DB_PATH =
  process.env.SHOPEE_DB_PATH || path.join(__dirname, '..', '..', 'shopee.db');

const MAX_MB = Number(process.env.SHOPEE_DB_MAX_MB || 500);
const SQLITE_MAGIC = Buffer.from('SQLite format 3\0', 'utf8');

/** Bukti singkat berkas benar-benar SQLite. */
function isSqlite(buf) {
  if (!buf || buf.length < SQLITE_MAGIC.length) return false;
  return buf.subarray(0, SQLITE_MAGIC.length).equals(SQLITE_MAGIC);
}

/** Buka DB read-only dan kembalikan info singkat. */
function readDbInfo() {
  if (!fs.existsSync(DB_PATH)) return null;

  let DatabaseSync;
  try {
    ({ DatabaseSync } = require('node:sqlite'));
  } catch {
    return { available: false, reason: 'node:sqlite tidak didukung (butuh Node 22+)' };
  }

  const db = new DatabaseSync(DB_PATH, { readOnly: true });
  try {
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((t) => t.name);

    const info = { available: true, tables };

    if (tables.includes('products')) {
      info.products = db.prepare('SELECT COUNT(*) AS c FROM products').get().c;
      const last = db
        .prepare('SELECT MAX(last_seen) AS m FROM products')
        .get();
      info.lastSeen = last?.m ?? null;
    }
    if (tables.includes('scrape_runs')) {
      info.scrapeRuns = db.prepare('SELECT COUNT(*) AS c FROM scrape_runs').get().c;
      const run = db
        .prepare('SELECT id, started_at, status FROM scrape_runs ORDER BY id DESC LIMIT 1')
        .get();
      info.lastRun = run ?? null;
    }
    if (tables.includes('kw_progress')) {
      const rows = db
        .prepare('SELECT status, COUNT(*) AS n FROM kw_progress GROUP BY status')
        .all();
      info.progress = Object.fromEntries(rows.map((r) => [r.status, r.n]));
    }
    return info;
  } finally {
    db.close();
  }
}

/** Info berkas + isi ringkas. */
async function getInfo() {
  const exists = fs.existsSync(DB_PATH);
  if (!exists) {
    return {
      path: DB_PATH,
      exists: false,
      message: 'Berkas shopee.db belum ada di server. Unggah hasil scraping.',
    };
  }

  const stat = await fsp.stat(DB_PATH);
  let dbInfo = null;
  let dbError = null;
  try {
    dbInfo = readDbInfo();
  } catch (err) {
    dbError = String(err.message || err).slice(0, 200);
  }

  return {
    path: DB_PATH,
    exists: true,
    sizeBytes: stat.size,
    sizeMb: Number((stat.size / 1024 / 1024).toFixed(2)),
    modifiedAt: stat.mtime.toISOString(),
    maxUploadMb: MAX_MB,
    db: dbInfo,
    dbError,
  };
}

/** Hapus berkas sementara beserta pendamping SQLite (-shm, -wal). */
async function cleanupTemp(base) {
  for (const f of [base, `${base}-shm`, `${base}-wal`]) {
    await fsp.unlink(f).catch(() => {});
  }
}

/**
 * Simpan unggahan ke DB_PATH. Mengembalikan info berkas setelah tersimpan.
 * `buffer` harus berupa Buffer utuh (route memakai express.raw).
 */
async function saveFromBuffer(buffer) {
  if (!buffer || !buffer.length) throw createError(400, 'Berkas kosong');

  const maxBytes = MAX_MB * 1024 * 1024;
  if (buffer.length > maxBytes) {
    throw createError(413, `Berkas terlalu besar (maksimal ${MAX_MB} MB)`);
  }
  if (!isSqlite(buffer)) {
    throw createError(400, 'Berkas bukan database SQLite yang valid');
  }

  await fsp.mkdir(path.dirname(DB_PATH), { recursive: true });

  // Tulis ke berkas sementara dulu, lalu ganti (atomic pada filesystem yang sama).
  const tmp = `${DB_PATH}.upload-${Date.now()}.tmp`;
  await fsp.writeFile(tmp, buffer);

  // Validasi isi sebelum menimpa berkas lama.
  let DatabaseSync;
  try {
    ({ DatabaseSync } = require('node:sqlite'));
    const db = new DatabaseSync(tmp, { readOnly: true });
    try {
      const hasProducts = db
        .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='products'")
        .get();
      if (!hasProducts) throw new Error('tabel products tidak ditemukan');
      db.prepare('SELECT COUNT(*) FROM products').get();
    } finally {
      db.close();
    }
  } catch (err) {
    await cleanupTemp(tmp);
    throw createError(400, `Berkas SQLite tidak valid: ${String(err.message || err).slice(0, 150)}`);
  }

  // SQLite membuat berkas pendamping -shm/-wal; buang sebelum rename.
  await fsp.unlink(`${tmp}-shm`).catch(() => {});
  await fsp.unlink(`${tmp}-wal`).catch(() => {});

  // Simpan salinan berkas lama sekali, untuk jaga-jaga.
  if (fs.existsSync(DB_PATH)) {
    const backup = `${DB_PATH}.sebelum-upload`;
    await fsp.copyFile(DB_PATH, backup).catch(() => {});
  }

  await fsp.rename(tmp, DB_PATH);
  // Bersihkan sisa pendamping milik path sementara (jika rename gagal separuh).
  await cleanupTemp(`${tmp}`);

  return getInfo();
}

module.exports = { getInfo, saveFromBuffer, isSqlite, DB_PATH, MAX_MB };
