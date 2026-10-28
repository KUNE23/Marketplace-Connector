// Backend/src/middleware/auth.js
const jwt = require('jsonwebtoken');
const createError = require('http-errors');
const config = require('../config');

/**
 * Middleware to authenticate requests using JWT access token.
 * Expects Authorization header: Bearer <token>
 */
function authenticate(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return next(createError(401, 'Missing Authorization header'));

  const token = authHeader.split(' ')[1];
  if (!token) return next(createError(401, 'Invalid Authorization header format'));

  try {
    const payload = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
    // Attach user info to request for downstream handlers
    req.user = {
      id: payload.sub, // keep as string for easy comparison
      role: payload.role,
    };
    next();
  } catch (err) {
    return next(createError(401, 'Invalid or expired token'));
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

module.exports = { authenticate, authorizeRoles, authorizeSelfOrRoles };
