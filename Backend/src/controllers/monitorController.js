// Backend/src/controllers/monitorController.js
const {
  getServerMetrics,
  getRequestStats,
  getRecentAudit,
  getOverview,
  getDatabaseStatus,
  getWorkerStatus,
  tailLogFile,
  pruneWorkerLogs,
} = require('../services/monitorService');

/** GET /api/monitor — ringkasan + metrik server + status DB. */
async function overviewHandler(req, res, next) {
  try {
    const [overview, database] = await Promise.all([getOverview(), getDatabaseStatus()]);
    res.json({ overview, server: getServerMetrics(), database });
  } catch (err) { next(err); }
}

/** GET /api/monitor/requests?minutes=60 */
async function requestStatsHandler(req, res, next) {
  try {
    const minutes = Math.min(Math.max(Number(req.query.minutes) || 60, 5), 1440);
    res.json(await getRequestStats({ minutes }));
  } catch (err) { next(err); }
}

/** GET /api/monitor/audit?limit=50&action=&userId= */
async function auditHandler(req, res, next) {
  try {
    res.json(
      await getRecentAudit({
        limit: Number(req.query.limit) || 50,
        action: req.query.action || undefined,
        userId: req.query.userId || undefined,
      }),
    );
  } catch (err) { next(err); }
}

/** GET /api/monitor/worker — status worker, antrean job, aktivitas terakhir. */
async function workerStatusHandler(req, res, next) {
  try {
    res.json(await getWorkerStatus());
  } catch (err) { next(err); }
}

/** GET /api/monitor/worker/logs?file=worker.out&lines=200 — ekor berkas log PM2. */
async function workerLogsHandler(req, res, next) {
  try {
    const file = String(req.query.file || 'worker.out');
    const lines = Number(req.query.lines) || 200;
    res.json(await tailLogFile(file, { lines }));
  } catch (err) { next(err); }
}

/** POST /api/monitor/worker/prune-logs — hapus catatan aktivitas lama. */
async function pruneWorkerLogsHandler(req, res, next) {
  try {
    const keep = Number(req.body?.keep) || 2000;
    const result = await pruneWorkerLogs({ keep });
    req.audit?.('worker.prune_logs', { resource: 'worker', detail: result });
    res.json(result);
  } catch (err) { next(err); }
}

module.exports = {
  overviewHandler,
  requestStatsHandler,
  auditHandler,
  workerStatusHandler,
  workerLogsHandler,
  pruneWorkerLogsHandler,
};
