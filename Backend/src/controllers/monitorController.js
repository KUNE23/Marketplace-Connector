// Backend/src/controllers/monitorController.js
const {
  getServerMetrics,
  getRequestStats,
  getRecentAudit,
  getOverview,
  getDatabaseStatus,
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

module.exports = { overviewHandler, requestStatsHandler, auditHandler };
