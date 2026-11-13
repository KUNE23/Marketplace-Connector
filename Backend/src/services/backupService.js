// Backend/src/services/backupService.js
/**
 * Backup & restore database (khusus SUPERADMIN).
 *
 * KENAPA BUKAN pg_dump:
 *   `pg_dump` tidak tersedia di server dan DB berjalan di Supabase (managed),
 *   sehingga backup dilakukan lewat Prisma: baca semua tabel -> JSON -> gzip.
 *
 * Format file: `backup-<ISO>-<alasan>.json.gz` di folder BACKUP_DIR.
 * Isi: { meta: {...}, data: { <model>: [ ...baris ] } }
 *
 * Urutan restore mengikuti ketergantungan foreign key (parent lebih dulu).
 */
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const zlib = require('zlib');
const { promisify } = require('util');
const createError = require('http-errors');

const prisma = require('../lib/prisma');

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

const BACKUP_DIR = process.env.BACKUP_DIR || path.join(__dirname, '..', '..', 'backups');

/**
 * Urutan tabel untuk RESTORE (parent -> child) agar FK tidak dilanggar.
 * Urutan ini juga dipakai saat delete (dibalik: child -> parent).
 */
const TABLE_ORDER = [
  'User',
  'Shop',
  'AkulakuAccount',
  'RawShopee',
  'FieldMap',
  'Product',
  'Listing',
  'SaleOrder',
  'SaleOrderItem',
  'AkulakuOrder',
  'AkulakuOrderItem',
  'AkulakuOrderExtra',
  'SaleSummary',
  'Notification',
  'SyncLog',
  'Job',
  'AkulakuSession',
  'ImportState',
  'MarkupTier',
  'AdSpend',
  'AkulakuCategory',
  'CategoryRule',
  'Violation',
  'ViolationSummary',
  'ChatConversation',
  'ChatMessage',
  'RefreshToken',
  'AuditLog',
  'RequestMetric',
];

/** Nama delegate Prisma dari nama model (User -> user). */
function delegate(model) {
  return model.charAt(0).toLowerCase() + model.slice(1);
}

/** Pastikan folder backup ada. */
async function ensureDir() {
  await fsp.mkdir(BACKUP_DIR, { recursive: true });
}

/** JSON.stringify yang aman untuk BigInt & Decimal. */
function replacer(_key, value) {
  if (typeof value === 'bigint') return { __bigint: value.toString() };
  return value;
}

/** Kembalikan BigInt dari bentuk khusus di atas. */
function reviver(_key, value) {
  if (value && typeof value === 'object' && typeof value.__bigint === 'string') {
    return BigInt(value.__bigint);
  }
  return value;
}

/** Nama file aman dari timestamp. */
function buildFileName(reason = 'manual') {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const safeReason = String(reason).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 30) || 'manual';
  return `backup-${ts}-${safeReason}.json.gz`;
}

/**
 * Buat backup penuh. `reason`: manual | auto | pre-restore.
 * Mengembalikan metadata file (tanpa isi).
 */
async function createBackup({ reason = 'manual', createdBy = null } = {}) {
  await ensureDir();

  const data = {};
  const counts = {};
  for (const model of TABLE_ORDER) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const rows = await prisma[delegate(model)].findMany();
      data[model] = rows;
      counts[model] = rows.length;
    } catch (err) {
      // Model yang tidak ada di skema saat ini dilewati (tetap catat).
      counts[model] = -1;
      data[model] = [];
    }
  }

  const meta = {
    version: 1,
    createdAt: new Date().toISOString(),
    reason,
    createdBy,
    node: process.version,
    tables: counts,
    totalRows: Object.values(counts).filter((n) => n > 0).reduce((s, n) => s + n, 0),
  };

  const json = JSON.stringify({ meta, data }, replacer);
  const compressed = await gzip(Buffer.from(json, 'utf8'));

  const fileName = buildFileName(reason);
  const filePath = path.join(BACKUP_DIR, fileName);
  await fsp.writeFile(filePath, compressed);

  const stat = await fsp.stat(filePath);
  return {
    fileName,
    sizeBytes: stat.size,
    sizeMb: Number((stat.size / 1024 / 1024).toFixed(2)),
    createdAt: meta.createdAt,
    reason,
    totalRows: meta.totalRows,
    tables: counts,
  };
}

/** Daftar file backup (terbaru dulu). */
async function listBackups() {
  await ensureDir();
  const files = await fsp.readdir(BACKUP_DIR);
  const out = [];

  for (const f of files) {
    if (!f.endsWith('.json.gz')) continue;
    const fp = path.join(BACKUP_DIR, f);
    // eslint-disable-next-line no-await-in-loop
    const stat = await fsp.stat(fp);
    out.push({
      fileName: f,
      sizeBytes: stat.size,
      sizeMb: Number((stat.size / 1024 / 1024).toFixed(2)),
      createdAt: stat.mtime.toISOString(),
    });
  }
  return out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

/** Baca metadata satu file backup tanpa memuat seluruh isi ke memori lama. */
async function readBackupMeta(fileName) {
  const filePath = safePath(fileName);
  if (!fs.existsSync(filePath)) throw createError(404, 'File backup tidak ditemukan');
  const buf = await fsp.readFile(filePath);
  const json = await gunzip(buf);
  const parsed = JSON.parse(json.toString('utf8'), reviver);
  return { meta: parsed.meta, tableCounts: parsed.meta?.tables ?? {} };
}

/** Cegah path traversal: hanya nama file di folder backup. */
function safePath(fileName) {
  const base = path.basename(String(fileName));
  if (base !== String(fileName) || !base.endsWith('.json.gz')) {
    throw createError(400, 'Nama file backup tidak valid');
  }
  return path.join(BACKUP_DIR, base);
}

/** Hapus satu file backup. */
async function deleteBackup(fileName) {
  const filePath = safePath(fileName);
  if (!fs.existsSync(filePath)) throw createError(404, 'File backup tidak ditemukan');
  await fsp.unlink(filePath);
  return true;
}

/**
 * Setel ulang sequence autoincrement setiap tabel agar cocok dengan MAX(id)
 * yang baru di-restore. TANPA ini, insert berikutnya akan gagal
 * "duplicate key value violates unique constraint".
 */
async function resetSequences() {
  const results = {};
  for (const table of TABLE_ORDER) {
    try {
      // Sebagian tabel tidak punya kolom `id` (mis. FieldMap memakai shopeeKey
      // sebagai primary key). Cek dulu lewat information_schema agar tidak
      // memicu error query.
      // eslint-disable-next-line no-await-in-loop
      const cols = await prisma.$queryRawUnsafe(
        `SELECT 1 AS ada FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = '${table}' AND column_name = 'id';`,
      );
      if (!cols?.length) {
        results[table] = 'skip (tanpa kolom id)';
        continue;
      }

      // setval(seq, nilai, is_called)
      //  - tabel berisi  -> MAX(id), true  (berikutnya MAX+1)
      //  - tabel kosong  -> 1, false       (berikutnya 1)
      // eslint-disable-next-line no-await-in-loop
      await prisma.$executeRawUnsafe(
        `SELECT setval(
           pg_get_serial_sequence('"${table}"', 'id'),
           COALESCE((SELECT MAX("id") FROM "${table}"), 1),
           (SELECT COUNT(*) > 0 FROM "${table}")
         );`,
      );
      results[table] = 'ok';
    } catch (err) {
      results[table] = String(err.message || err).slice(0, 120);
    }
  }
  return results;
}

/**
 * Restore dari file backup: HAPUS semua data lalu isi ulang (full replace).
 * Sebelum menghapus, otomatis membuat backup "pre-restore" sebagai jaring aman.
 *
 * Catatan: dijalankan dalam transaksi supaya gagal di tengah tidak meninggalkan
 * database setengah kosong.
 */
async function restoreBackup(fileName, { createdBy = null, resetSeq = true } = {}) {
  const filePath = safePath(fileName);
  if (!fs.existsSync(filePath)) throw createError(404, 'File backup tidak ditemukan');

  const buf = await fsp.readFile(filePath);
  const json = await gunzip(buf);
  const parsed = JSON.parse(json.toString('utf8'), reviver);
  const data = parsed.data || {};

  if (!data || typeof data !== 'object') throw createError(400, 'Isi backup tidak valid');

  // Jaring aman: backup kondisi saat ini sebelum menimpa.
  const safety = await createBackup({ reason: 'pre-restore', createdBy });

  // Urutan hapus: anak -> induk.
  const deleteOrder = [...TABLE_ORDER].reverse();

  const stats = { deleted: {}, inserted: {} };

  await prisma.$transaction(
    async (tx) => {
      // 1) Hapus semua (child dulu).
      for (const model of deleteOrder) {
        try {
          // eslint-disable-next-line no-await-in-loop
          const res = await tx[delegate(model)].deleteMany({});
          stats.deleted[model] = res.count;
        } catch {
          stats.deleted[model] = -1;
        }
      }

      // 2) Isi ulang (parent dulu).
      for (const model of TABLE_ORDER) {
        const rows = data[model] || [];
        if (!rows.length) {
          stats.inserted[model] = 0;
          continue;
        }
        try {
          // createMany lebih cepat & cukup karena FK sudah terpenuhi berurutan.
          // eslint-disable-next-line no-await-in-loop
          const res = await tx[delegate(model)].createMany({ data: rows, skipDuplicates: true });
          stats.inserted[model] = res.count;
        } catch (err) {
          // Fallback: insert satu per satu (mis. tipe JSON/Decimal khusus).
          let ok = 0;
          for (const row of rows) {
            try {
              // eslint-disable-next-line no-await-in-loop
              await tx[delegate(model)].create({ data: row });
              ok += 1;
            } catch {
              /* baris dilewati */
            }
          }
          stats.inserted[model] = ok;
        }
      }
    },
    { timeout: 120000, maxWait: 20000 },
  );

  // Setel ulang sequence agar insert berikutnya tidak bentrok dengan id hasil restore.
  const sequences = resetSeq ? await resetSequences() : null;

  return {
    restoredFrom: fileName,
    safetyBackup: safety.fileName,
    backupCreatedAt: parsed.meta?.createdAt ?? null,
    deleted: stats.deleted,
    inserted: stats.inserted,
    sequences,
  };
}

/**
 * Hapus backup lama sesuai retensi (jumlah file maksimum).
 * Mengembalikan daftar file yang dihapus.
 */
async function pruneBackups({ keep = 14 } = {}) {
  const all = await listBackups();
  const toDelete = all.slice(Math.max(0, keep));
  const deleted = [];
  for (const b of toDelete) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await deleteBackup(b.fileName);
      deleted.push(b.fileName);
    } catch {
      /* abaikan */
    }
  }
  return { kept: Math.min(all.length, keep), deleted };
}

/** Ringkasan folder backup (untuk UI). */
async function backupStats() {
  const items = await listBackups();
  const totalBytes = items.reduce((s, i) => s + i.sizeBytes, 0);
  return {
    dir: BACKUP_DIR,
    count: items.length,
    totalMb: Number((totalBytes / 1024 / 1024).toFixed(2)),
    latest: items[0] ?? null,
    items,
  };
}

module.exports = {
  createBackup,
  listBackups,
  readBackupMeta,
  deleteBackup,
  restoreBackup,
  pruneBackups,
  backupStats,
  resetSequences,
  BACKUP_DIR,
  TABLE_ORDER,
};
