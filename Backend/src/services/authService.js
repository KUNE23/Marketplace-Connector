// Backend/src/services/authService.js
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');
const createError = require('http-errors');

const prisma = new PrismaClient();

/**
 * Helper to generate JWT access token.
 */
function generateAccessToken(user) {
  const payload = {
    sub: user.id.toString(),
    role: user.role,
  };
  const secret = process.env.JWT_ACCESS_SECRET;
  const expiresIn = process.env.ACCESS_TOKEN_EXPIRES_IN || '15m';
  return jwt.sign(payload, secret, { expiresIn });
}

/**
 * Helper to generate a refresh token, store its hash, and return the raw token.
 */
async function generateRefreshToken(userId) {
  // Generate a 48‑byte random string (hex encoded ~96 chars)
  const rawToken = crypto.randomBytes(48).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30); // 30‑day validity by default

  await prisma.refreshToken.create({
    data: {
      tokenHash,
      user: { connect: { id: userId } },
      expiresAt,
    },
  });

  return rawToken;
}

/**
 * Login with email & password.
 * Returns { accessToken, refreshToken, user } on success.
 */
async function login({ email, password }) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw createError(401, 'Invalid credentials');
  if (!user.active) throw createError(403, 'User account is inactive');

  const passwordMatches = await bcrypt.compare(password, user.passwordHash);
  if (!passwordMatches) throw createError(401, 'Invalid credentials');

  const accessToken = generateAccessToken(user);
  const refreshToken = await generateRefreshToken(user.id);

  return { accessToken, refreshToken, user };
}

/**
 * Refresh access token using a valid refresh token.
 */
async function refresh({ token }) {
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash },
    include: { user: true },
  });

  if (!stored) throw createError(401, 'Refresh token not recognized');
  if (stored.revokedAt) throw createError(401, "Refresh token has been revoked");
  if (new Date() > stored.expiresAt) throw createError(401, 'Refresh token expired');

  // Rotate: revoke old token, issue new pair inside a transaction
  return await prisma.$transaction(async (tx) => {
    await tx.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });
    const newAccess = generateAccessToken(stored.user);
    const newRefresh = await generateRefreshToken(stored.user.id);
    return { accessToken: newAccess, refreshToken: newRefresh };
  });
}

/**
 * Logout – revoke a refresh token.
 */
async function logout({ token }) {
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  await prisma.refreshToken.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  // Idempotent – no error if already revoked
  return true;
}

module.exports = { login, refresh, logout };
