// Backend/src/controllers/authController.js
const { loginSchema } = require('../validators/authValidator');
const { login, refresh, logout } = require('../services/authService');
const createError = require('http-errors');

/**
 * POST /api/auth/login
 */
async function loginHandler(req, res, next) {
  try {
    const parsed = loginSchema.parse(req.body);
    const result = await login(parsed);
    // Respond with tokens and minimal user info (no password hash)
    const { accessToken, refreshToken, user } = result;
    res.json({ accessToken, refreshToken, user: { id: user.id, email: user.email, role: user.role } });
  } catch (err) {
    if (err.name === 'ZodError') {
      return next(createError(400, err.errors.map(e => e.message).join(', ')));
    }
    next(err);
  }
}

/**
 * POST /api/auth/refresh
 */
async function refreshHandler(req, res, next) {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return next(createError(400, 'refreshToken is required'));
    const result = await refresh({ token: refreshToken });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/auth/logout (protected – requires valid access token)
 */
async function logoutHandler(req, res, next) {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return next(createError(400, 'refreshToken is required'));
    await logout({ token: refreshToken });
    res.json({ message: 'Logged out successfully' });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/auth/me – returns currently authenticated user info.
 */
function meHandler(req, res) {
  // req.user is set by authenticate middleware
  res.json({ user: req.user });
}

module.exports = { loginHandler, refreshHandler, logoutHandler, meHandler };
