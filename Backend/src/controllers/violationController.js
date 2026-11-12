// Backend/src/controllers/violationController.js
const createError = require('http-errors');
const {
  syncViolationsForAccount,
  syncAllViolations,
  listViolationOverview,
  getViolationHistory,
  getViolationDetails,
} = require('../services/violationService');

function handleError(err, next) {
  if (err.name === 'ZodError') {
    return next(createError(400, err.errors.map((e) => e.message).join(', ')));
  }
  return next(err);
}

/** GET /api/violations — ringkasan pelanggaran per akun. */
async function overviewHandler(req, res, next) {
  try {
    const rows = await listViolationOverview({
      user: req.user,
      accountId: req.query.accountId,
    });
    res.json({ accounts: rows });
  } catch (err) { handleError(err, next); }
}

/** GET /api/violations/:accountId — detail jenis pelanggaran satu akun. */
async function detailHandler(req, res, next) {
  try {
    const rows = await getViolationDetails(req.params.accountId, { user: req.user });
    res.json({ accountId: String(req.params.accountId), violations: rows });
  } catch (err) { handleError(err, next); }
}

/** GET /api/violations/:accountId/history — riwayat snapshot. */
async function historyHandler(req, res, next) {
  try {
    const rows = await getViolationHistory(req.params.accountId, {
      user: req.user,
      limit: Number(req.query.limit) || 30,
    });
    res.json({ accountId: String(req.params.accountId), history: rows });
  } catch (err) { handleError(err, next); }
}

/** POST /api/violations/:accountId/sync — sinkron satu akun. */
async function syncOneHandler(req, res, next) {
  try {
    const result = await syncViolationsForAccount(req.params.accountId, { user: req.user });
    res.json(result);
  } catch (err) { handleError(err, next); }
}

/** POST /api/violations/sync — sinkron semua akun yang boleh diakses. */
async function syncAllHandler(req, res, next) {
  try {
    const result = await syncAllViolations({ user: req.user });
    res.json(result);
  } catch (err) { handleError(err, next); }
}

module.exports = { overviewHandler, detailHandler, historyHandler, syncOneHandler, syncAllHandler };
