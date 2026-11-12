// Backend/src/controllers/dashboardController.js
const { getSummary, getRecap, getRecentOrders } = require('../services/dashboardService');
const createError = require('http-errors');

async function summaryHandler(req, res, next) {
  try {
    res.json(await getSummary({ user: req.user }));
  } catch (err) { next(err); }
}

async function recapHandler(req, res, next) {
  try {
    const days = req.query.days ? Number(req.query.days) : 14;
    if (!Number.isFinite(days) || days < 1 || days > 90) {
      throw createError(400, 'days harus antara 1 dan 90');
    }
    res.json(await getRecap({ days, user: req.user }));
  } catch (err) { next(err); }
}

async function recentOrdersHandler(req, res, next) {
  try {
    const limit = req.query.limit ? Math.min(Number(req.query.limit), 20) : 5;
    res.json(await getRecentOrders({ limit, user: req.user }));
  } catch (err) { next(err); }
}

module.exports = { summaryHandler, recapHandler, recentOrdersHandler };
