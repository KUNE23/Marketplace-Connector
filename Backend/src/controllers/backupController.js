// Backend/src/controllers/backupController.js
const fs = require('fs');
const createError = require('http-errors');
const {
  createBackup,
  listBackups,
  readBackupMeta,
  deleteBackup,
  restoreBackup,
  backupStats,
} = require('../services/backupService');
const { runCycle, getSchedulerStatus, cleanupOldLogs } = require('../services/backupScheduler');
const path = require('path');
const { BACKUP_DIR } = require('../services/backupService');

/** GET /api/backups — daftar + statistik folder backup. */
async function listHandler(req, res, next) {
  try {
    const [stats, scheduler] = await Promise.all([backupStats(), Promise.resolve(getSchedulerStatus())]);
    res.json({ ...stats, scheduler });
  } catch (err) { next(err); }
}

/** POST /api/backups — buat backup manual. */
async function createHandler(req, res, next) {
  try {
    const result = await createBackup({ reason: 'manual', createdBy: req.user?.id ?? null });
    req.audit?.('backup.create', { resource: 'backup', resourceId: result.fileName, detail: { sizeMb: result.sizeMb } });
    res.status(201).json(result);
  } catch (err) { next(err); }
}

/** GET /api/backups/:fileName/meta — metadata satu backup. */
async function metaHandler(req, res, next) {
  try {
    res.json(await readBackupMeta(req.params.fileName));
  } catch (err) { next(err); }
}

/** GET /api/backups/:fileName/download — unduh file backup. */
async function downloadHandler(req, res, next) {
  try {
    const fileName = req.params.fileName;
    if (path.basename(fileName) !== fileName || !fileName.endsWith('.json.gz')) {
      return next(createError(400, 'Nama file tidak valid'));
    }
    const filePath = path.join(BACKUP_DIR, fileName);
    if (!fs.existsSync(filePath)) return next(createError(404, 'File backup tidak ditemukan'));
    req.audit?.('backup.download', { resource: 'backup', resourceId: fileName });
    res.download(filePath, fileName);
  } catch (err) { next(err); }
}

/** DELETE /api/backups/:fileName */
async function deleteHandler(req, res, next) {
  try {
    await deleteBackup(req.params.fileName);
    req.audit?.('backup.delete', { resource: 'backup', resourceId: req.params.fileName });
    res.status(204).send();
  } catch (err) { next(err); }
}

/**
 * POST /api/backups/:fileName/restore
 * Body: { confirm: "<nama file backup>" } — wajib sama untuk mencegah salah klik.
 */
async function restoreHandler(req, res, next) {
  try {
    const fileName = req.params.fileName;
    const confirm = String(req.body?.confirm ?? '');
    if (confirm !== fileName) {
      return next(createError(400, 'Konfirmasi tidak cocok. Kirim { "confirm": "<nama file>" } yang sama.'));
    }
    const result = await restoreBackup(fileName, { createdBy: req.user?.id ?? null });
    req.audit?.('backup.restore', {
      resource: 'backup',
      resourceId: fileName,
      detail: { safetyBackup: result.safetyBackup },
    });
    res.json(result);
  } catch (err) { next(err); }
}

/** POST /api/backups/run-cycle — jalankan backup + prune + cleanup log sekarang. */
async function runCycleHandler(req, res, next) {
  try {
    const result = await runCycle('manual-cycle');
    req.audit?.('backup.cycle', { resource: 'backup', detail: result });
    res.json(result);
  } catch (err) { next(err); }
}

/** POST /api/backups/cleanup-logs — hapus log lama saja. */
async function cleanupLogsHandler(req, res, next) {
  try {
    const result = await cleanupOldLogs();
    req.audit?.('logs.cleanup', { resource: 'log', detail: result });
    res.json(result);
  } catch (err) { next(err); }
}

module.exports = {
  listHandler,
  createHandler,
  metaHandler,
  downloadHandler,
  deleteHandler,
  restoreHandler,
  runCycleHandler,
  cleanupLogsHandler,
};
