// Backend/src/services/shopeeImportRunner.js
/**
 * Import produk Shopee di BACKGROUND (dijalankan server, bukan browser).
 *
 * Tujuan: user bisa meninggalkan halaman Products / menutup tab, import tetap
 * lanjut. Progres sudah tersimpan di tabel ImportState (cursor rowid), jadi
 * import juga otomatis lanjut setelah server restart.
 *
 * Desain:
 *   - Satu runner per proses (singleton). Tidak ada dua loop paralel.
 *   - Loop memanggil importNextBatch() sampai habis / dihentikan.
 *   - Jeda kecil antar batch agar CPU & koneksi DB tidak jenuh.
 *   - State ringan disimpan di memori untuk ditampilkan di UI.
 *
 * Env:
 *   SHOPEE_IMPORT_AUTORESUME  default true  -> lanjut otomatis saat server start
 *                             jika status sebelumnya 'running'
 *   SHOPEE_IMPORT_BATCH_SIZE  default 100
 *   SHOPEE_IMPORT_DELAY_MS    default 150
 */
const { importNextBatch, getScrapeStats, resetImport } = require('./shopeeImportService');
const prisma = require('../lib/prisma');

const BATCH_SIZE = Math.min(Math.max(Number(process.env.SHOPEE_IMPORT_BATCH_SIZE || 100), 10), 200);
const DELAY_MS = Math.max(0, Number(process.env.SHOPEE_IMPORT_DELAY_MS || 150));
const AUTO_RESUME = String(process.env.SHOPEE_IMPORT_AUTORESUME ?? 'true') !== 'false';

/** State runner di memori (bukan sumber kebenaran — sumbernya ImportState di DB). */
const runner = {
  running: false,
  stopRequested: false,
  startedAt: null,
  finishedAt: null,
  lastError: null,
  session: { processed: 0, inserted: 0, updated: 0, skipped: 0, failed: 0 },
  batchCount: 0,
};

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function snapshot() {
  return {
    running: runner.running,
    stopRequested: runner.stopRequested,
    startedAt: runner.startedAt,
    finishedAt: runner.finishedAt,
    lastError: runner.lastError,
    session: { ...runner.session },
    batchCount: runner.batchCount,
    batchSize: BATCH_SIZE,
    delayMs: DELAY_MS,
    autoResume: AUTO_RESUME,
  };
}

/**
 * Mulai import di background. Mengembalikan status awal.
 * Kalau sudah berjalan, tidak memulai loop baru.
 */
async function start({ reset = false } = {}) {
  if (runner.running) {
    return { started: false, message: 'Import sudah berjalan', status: snapshot() };
  }

  if (reset) {
    await resetImport();
  }

  runner.running = true;
  runner.stopRequested = false;
  runner.startedAt = new Date().toISOString();
  runner.finishedAt = null;
  runner.lastError = null;
  runner.batchCount = 0;
  runner.session = { processed: 0, inserted: 0, updated: 0, skipped: 0, failed: 0 };

  // Jalankan loop tanpa ditunggu (fire & forget).
  runLoop().catch(() => {});

  return { started: true, message: 'Import dimulai di background', status: snapshot() };
}

/** Minta loop berhenti setelah batch saat ini selesai. */
function stop() {
  if (!runner.running) {
    return { stopped: false, message: 'Import tidak sedang berjalan', status: snapshot() };
  }
  runner.stopRequested = true;
  return { stopped: true, message: 'Permintaan berhenti dikirim (selesai setelah batch ini)', status: snapshot() };
}

/** Loop utama. */
async function runLoop() {
  try {
    for (;;) {
      if (runner.stopRequested) break;

      // eslint-disable-next-line no-await-in-loop
      const result = await importNextBatch({ batchSize: BATCH_SIZE });
      runner.batchCount += 1;
      runner.session.processed += result.processed;
      runner.session.inserted += result.inserted;
      runner.session.updated += result.updated;
      runner.session.skipped += result.skipped;
      runner.session.failed += result.failed;

      if (result.done) break;
      if (DELAY_MS) {
        // eslint-disable-next-line no-await-in-loop
        await sleep(DELAY_MS);
      }
    }
  } catch (err) {
    runner.lastError = String(err.message || err).slice(0, 500);
    console.error('[shopee-import] gagal:', runner.lastError);
  } finally {
    runner.running = false;
    runner.finishedAt = new Date().toISOString();
    console.log(
      `[shopee-import] selesai: +${runner.session.inserted} baru, ${runner.session.updated} update, ` +
        `${runner.session.failed} gagal (${runner.batchCount} batch)`,
    );
  }
}

/** Status lengkap: memori runner + progres DB. */
async function getStatus() {
  let dbStats = null;
  try {
    dbStats = await getScrapeStats();
  } catch (err) {
    dbStats = { error: String(err.message || err).slice(0, 200) };
  }
  return { runner: snapshot(), progress: dbStats };
}

/**
 * Lanjutkan otomatis bila sebelumnya status 'running' (mis. server restart
 * di tengah import). Dipanggil sekali dari server.js.
 */
async function autoResume() {
  if (!AUTO_RESUME) {
    console.log('[shopee-import] auto-resume nonaktif');
    return;
  }
  try {
    const state = await prisma.importState.findUnique({ where: { source: 'shopee_db' } });
    if (state?.status === 'running') {
      console.log('[shopee-import] melanjutkan import yang tertunda...');
      await start();
    }
  } catch {
    /* abaikan */
  }
}

module.exports = { start, stop, getStatus, autoResume, getRunnerState: snapshot };
