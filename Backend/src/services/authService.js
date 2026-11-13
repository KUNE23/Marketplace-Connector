// Backend/src/services/authService.js
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const createError = require('http-errors');

const prisma = require('../lib/prisma');

/**
 * Helper to generate JWT access token.
 */
function generateAccessToken(user) {
  const payload = {
    sub: user.id.toString(),
    role: user.role,
    name: user.name ?? user.email.split('@')[0],
  };
  const secret = process.env.JWT_ACCESS_SECRET;
  // Dukung dua nama env (JWT_ACCESS_TOKEN_EXPIRES_IN dan ACCESS_TOKEN_EXPIRES_IN)
  // agar nilai di .env benar-benar terpakai, bukan selalu jatuh ke default.
  const expiresIn =
    process.env.ACCESS_TOKEN_EXPIRES_IN ||
    process.env.JWT_ACCESS_TOKEN_EXPIRES_IN ||
    '15m';
  return jwt.sign(payload, secret, { expiresIn });
}

/**
 * Helper to generate a refresh token, store its hash, and return the raw token.
 */
async function generateRefreshToken(userId) {
  // Generate a 48â€‘byte random string (hex encoded ~96 chars)
  const rawToken = crypto.randomBytes(48).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30); // 30â€‘day validity by default

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

  const passwordMatches = await bcrypt.compare(password, user.passwordHash);
  if (!passwordMatches) throw createError(401, 'Invalid credentials');

  const accessToken = generateAccessToken(user);
  const refreshToken = await generateRefreshToken(user.id);

  return { accessToken, refreshToken, user };
}

/**
 * Refresh access token using a valid refresh token.
 */
/**
 * Tenggang token yang baru di-revoke. Mencegah logout saat beberapa tab
 * melakukan refresh bersamaan dengan token yang sama.
 */
const REFRESH_GRACE_MS = Number(process.env.REFRESH_GRACE_MS || 60_000);

async function refresh({ token }) {
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash },
    include: { user: true },
  });

  if (!stored) throw createError(401, 'Refresh token not recognized');
  if (new Date() > stored.expiresAt) throw createError(401, 'Refresh token expired');

  // Token yang baru saja di-revoke (mis. tab lain baru refresh) masih diterima
  // dalam tenggang singkat, supaya sesi tidak putus.
  if (stored.revokedAt) {
    const age = Date.now() - new Date(stored.revokedAt).getTime();
    if (age > REFRESH_GRACE_MS) {
      throw createError(401, 'Refresh token has been revoked');
    }
  }

  // Rotate TANPA transaksi interaktif.
  // Alasan: pooler Supabase (pgbouncer) bisa >5 detik per transaksi, sementara
  // batas default Prisma 5 detik -> refresh gagal -> user ter-logout.
  // Urutan aman: terbitkan token baru DULU, baru revoke yang lama. Kalau langkah
  // kedua gagal, token lama tetap valid (tidak ada sesi yang hilang).
  const newAccess = generateAccessToken(stored.user);
  const newRefresh = await generateRefreshToken(stored.user.id);

  if (!stored.revokedAt) {
    await prisma.refreshToken
      .update({ where: { id: stored.id }, data: { revokedAt: new Date() } })
      .catch(() => {
        /* gagal revoke bukan alasan menggagalkan refresh */
      });
  }

  return { accessToken: newAccess, refreshToken: newRefresh };
}

/**
 * Logout â€“ revoke a refresh token.
 */
async function logout({ token }) {
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  await prisma.refreshToken.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  // Idempotent â€“ no error if already revoked
  return true;
}

module.exports = { login, refresh, logout };

