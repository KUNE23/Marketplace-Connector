// Backend/src/controllers/balanceController.js
const createError = require('http-errors');
const {
  listBalances,
  getBalanceSummary,
  getBalanceHistory,
  syncBalanceFromAkulaku,
  setManualBalance,
} = require('../services/balanceService');
const { assertAccountAccess } = require('../utils/scope');
const prisma = require('../lib/prisma');

function handleError(err, next) {
  if (err.name === 'ZodError') {
    return next(createError(400, err.errors.map((e) => e.message).join(', ')));
  }
  return next(err);
}

/** GET /api/balances — saldo semua akun yang boleh diakses. */
async function listHandler(req, res, next) {
  try {
    res.json(await listBalances({ user: req.user }));
  } catch (err) { handleError(err, next); }
}

/** GET /api/balances/summary — ringkasan untuk dashboard. */
async function summaryHandler(req, res, next) {
  try {
    res.json(await getBalanceSummary({ user: req.user }));
  } catch (err) { handleError(err, next); }
}

/** GET /api/balances/:accountId/history — riwayat snapshot. */
async function historyHandler(req, res, next) {
  try {
    await assertAccountAccess(prisma, req.user, req.params.accountId);
    const rows = await getBalanceHistory(req.params.accountId, { limit: req.query.limit });
    res.json({ accountId: String(req.params.accountId), history: rows });
  } catch (err) { handleError(err, next); }
}

/** POST /api/balances/:accountId/sync — tarik saldo terbaru dari Akulaku. */
async function syncHandler(req, res, next) {
  try {
    const result = await syncBalanceFromAkulaku(req.params.accountId, { user: req.user });
    req.audit?.('balance.sync', {
      resource: 'balance',
      resourceId: String(req.params.accountId),
      detail: { status: result.status },
    });
    res.json(result);
  } catch (err) { handleError(err, next); }
}

/**
 * POST /api/balances/:accountId — isi saldo manual (ADMIN/SUPERADMIN).
 * Body: { available, pending?, note? }
 */
async function setManualHandler(req, res, next) {
  try {
    const available = Number(req.body?.available);
    if (!Number.isFinite(available) || available < 0) {
      return next(createError(400, 'available wajib berupa angka >= 0'));
    }
    const pending = Number(req.body?.pending ?? 0);
    if (!Number.isFinite(pending) || pending < 0) {
      return next(createError(400, 'pending wajib berupa angka >= 0'));
    }
    const saved = await setManualBalance(
      req.params.accountId,
      { available, pending, note: req.body?.note },
      { user: req.user },
    );
    req.audit?.('balance.set_manual', {
      resource: 'balance',
      resourceId: String(req.params.accountId),
      detail: { available, pending },
    });
    res.json(saved);
  } catch (err) { handleError(err, next); }
}

module.exports = { listHandler, summaryHandler, historyHandler, syncHandler, setManualHandler };
