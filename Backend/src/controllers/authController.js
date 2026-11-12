// Backend/src/controllers/authController.js
const { loginSchema } = require('../validators/authValidator');
const { login, refresh, logout } = require('../services/authService');
const createError = require('http-errors');
const {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  accessCookieOptions,
  refreshCookieOptions,
  clearAccessOptions,
  clearRefreshOptions,
} = require('../utils/cookies');

const ACCESS_MAX_AGE_MS = 15 * 60 * 1000; // 15 menit
const REFRESH_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 hari

function publicUser(user) {
  return {
    id: user.id.toString(),
    email: user.email,
    role: user.role,
    name: user.name ?? user.email.split('@')[0],
  };
}

/** Set cookie access + refresh. `persist` true = cookie persisten (30 hari). */
function setAuthCookies(res, { accessToken, refreshToken }, persist) {
  res.cookie(ACCESS_COOKIE, accessToken, accessCookieOptions(ACCESS_MAX_AGE_MS));
  res.cookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions(persist ? REFRESH_MAX_AGE_MS : undefined));
}

function clearAuthCookies(res) {
  res.clearCookie(ACCESS_COOKIE, clearAccessOptions);
  res.clearCookie(REFRESH_COOKIE, clearRefreshOptions);
}

/**
 * POST /api/auth/login
 * Token dikirim sebagai cookie httpOnly (tidak pernah ke JS).
 */
async function loginHandler(req, res, next) {
  try {
    const parsed = loginSchema.parse(req.body);
    const persist = Boolean(req.body?.keepLoggedIn);
    const result = await login(parsed);
    setAuthCookies(res, result, persist);

    // Audit: login berhasil.
    req.audit?.('login', {
      resource: 'auth',
      status: 'success',
      userEmail: result.user?.email,
      userRole: result.user?.role,
      detail: { email: parsed.email },
    });

    res.json({ user: publicUser(result.user) });
  } catch (err) {
    if (err.name === 'ZodError') {
      return next(createError(400, err.errors.map((e) => e.message).join(', ')));
    }
    // Audit: login gagal.
    req.audit?.('login', {
      resource: 'auth',
      status: 'failed',
      userEmail: req.body?.email,
      detail: { reason: String(err.message || err).slice(0, 200) },
    });
    next(err);
  }
}

/**
 * POST /api/auth/refresh
 * Ambil refresh token dari cookie (fallback: body untuk kompatibilitas).
 */
async function refreshHandler(req, res, next) {
  try {
    const token = req.cookies?.[REFRESH_COOKIE] || req.body?.refreshToken;
    if (!token) return next(createError(401, 'Refresh token tidak ditemukan'));
    const result = await refresh({ token });
    setAuthCookies(res, result, true);
    res.json({ message: 'Token diperbarui' });
  } catch (err) {
    clearAuthCookies(res);
    next(err);
  }
}

/**
 * POST /api/auth/logout
 */
async function logoutHandler(req, res, next) {
  try {
    const token = req.cookies?.[REFRESH_COOKIE] || req.body?.refreshToken;
    if (token) await logout({ token });
    clearAuthCookies(res);
    res.json({ message: 'Berhasil keluar' });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/auth/me — info user yang sedang login.
 */
async function meHandler(req, res, next) {
  try {
    const user = await require('../services/userService').getUserById(req.user.id);
    res.json({ user });
  } catch (err) {
    next(err);
  }
}

module.exports = { loginHandler, refreshHandler, logoutHandler, meHandler };
