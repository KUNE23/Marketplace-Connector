// Backend/src/middleware/auth.js
const jwt = require('jsonwebtoken');
const createError = require('http-errors');
const config = require('../config');
const prisma = require('../lib/prisma');
const { ACCESS_COOKIE } = require('../utils/cookies');

/**
 * Middleware to authenticate requests using JWT access token.
 * Expects Authorization header: Bearer <token>
 *
 * Selain memverifikasi JWT, middleware ini juga memeriksa ke DB bahwa user
 * masih ADA dan AKTIF, serta memakai role terbaru dari DB. Dengan begitu:
 * - user yang dinonaktifkan langsung kehilangan akses,
 * - perubahan role langsung berlaku (tidak perlu login ulang).
 */
async function authenticate(req, res, next) {
  // Token diutamakan dari cookie httpOnly; fallback ke header Authorization
  // (untuk tooling/klien yang memakai bearer token).
  const cookieToken = req.cookies ? req.cookies[ACCESS_COOKIE] : null;
  const authHeader = req.headers['authorization'];
  const headerToken = authHeader ? authHeader.split(' ')[1] : null;
  const token = cookieToken || headerToken;

  if (!token) return next(createError(401, 'Missing Authorization header'));

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
  } catch (err) {
    return next(createError(401, 'Invalid or expired token'));
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: BigInt(payload.sub) },
      select: { id: true, role: true, active: true },
    });
    if (!user || !user.active) {
      return next(createError(401, 'Akun tidak aktif atau tidak ditemukan'));
    }
    req.user = { id: user.id.toString(), role: user.role };
    next();
  } catch (err) {
    return next(createError(401, 'Invalid token'));
  }
}

/**
 * Role‑based authorization guard.
 * Usage: authorizeRoles('ADMIN', 'EMPLOYEE')
 */
function authorizeRoles(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) return next(createError(401, 'Unauthenticated'));
    if (!allowedRoles.includes(req.user.role)) {
      return next(createError(403, 'Forbidden: insufficient role'));
    }
    next();
  };
}

/**
 * Guard khusus SUPERADMIN (halaman Monitor / log sistem).
 * SUPERADMIN selalu lolos; role lain ditolak.
 */
function authorizeSuperAdmin() {
  return (req, res, next) => {
    if (!req.user) return next(createError(401, 'Unauthenticated'));
    if (req.user.role !== 'SUPERADMIN') {
      return next(createError(403, 'Forbidden: hanya SUPERADMIN'));
    }
    next();
  };
}

/**
 * Authorization guard that allows either:
 *   - a user with one of the allowedRoles (e.g., ADMIN), OR
 *   - the owner of the resource (when req.params.id matches req.user.id).
 * Usage: authorizeSelfOrRoles('ADMIN')
 */
function authorizeSelfOrRoles(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) return next(createError(401, 'Unauthenticated'));
    // If user has an allowed role, grant access immediately
    if (allowedRoles.includes(req.user.role)) return next();
    // Otherwise, allow only if the user is accessing their own resource
    if (req.params && req.params.id && req.params.id === req.user.id) return next();
    return next(createError(403, 'Forbidden: insufficient permissions'));
  };
}

module.exports = { authenticate, authorizeRoles, authorizeSuperAdmin, authorizeSelfOrRoles };
