// Backend/src/controllers/leaderboardController.js
const createError = require('http-errors');
const {
  getEmployeeLeaderboard,
  getEmployeeDetail,
  getDailyTrend,
} = require('../services/leaderboardService');
const prisma = require('../lib/prisma');

function handleError(err, next) {
  if (err.name === 'ZodError') {
    return next(createError(400, err.errors.map((e) => e.message).join(', ')));
  }
  return next(err);
}

function parseRange(q) {
  return {
    from: q.from ? String(q.from) : undefined,
    to: q.to ? String(q.to) : undefined,
  };
}

/** GET /api/leaderboard — peringkat omzet per pegawai. */
async function leaderboardHandler(req, res, next) {
  try {
    const { from, to } = parseRange(req.query);
    const result = await getEmployeeLeaderboard({ from, to, user: req.user });
    res.json(result);
  } catch (err) { handleError(err, next); }
}

/** GET /api/leaderboard/:userId — rincian omzet per akun milik pegawai. */
async function leaderboardDetailHandler(req, res, next) {
  try {
    const { from, to } = parseRange(req.query);
    const userId = req.params.userId === 'me' ? req.user.id : req.params.userId;
    const result = await getEmployeeDetail(userId, { from, to, user: req.user });
    res.json(result);
  } catch (err) { handleError(err, next); }
}

/** GET /api/leaderboard/:userId/trend — tren omzet harian per akun pegawai. */
async function leaderboardTrendHandler(req, res, next) {
  try {
    const { from, to } = parseRange(req.query);
    const userId = req.params.userId === 'me' ? req.user.id : req.params.userId;
    const detail = await getEmployeeDetail(userId, { from, to, user: req.user });
    const ids = detail.accounts.map((a) => BigInt(a.accountId));
    const trend = await getDailyTrend(ids, { from, to });
    res.json({ employee: detail.employee, trend });
  } catch (err) { handleError(err, next); }
}

/** GET /api/leaderboard/employees — daftar pegawai (untuk dropdown filter admin). */
async function employeesHandler(req, res, next) {
  try {
    const users = await prisma.user.findMany({
      select: { id: true, name: true, email: true, role: true, active: true },
      orderBy: { id: 'asc' },
    });
    res.json({ employees: users.map((u) => ({ ...u, id: u.id.toString() })) });
  } catch (err) { handleError(err, next); }
}

module.exports = {
  leaderboardHandler,
  leaderboardDetailHandler,
  leaderboardTrendHandler,
  employeesHandler,
};
