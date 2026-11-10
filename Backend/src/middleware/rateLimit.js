// Backend/src/middleware/rateLimit.js
// Pembatas laju permintaan (rate limiting) untuk mencegah brute force & abuse.
const rateLimit = require('express-rate-limit');

const isTest = process.env.NODE_ENV === 'test';

function json(message) {
  return { status: 'error', message };
}

/** Limiter umum untuk seluruh /api. */
const apiLimiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000), // 15 menit
  max: Number(process.env.RATE_LIMIT_MAX || 1000),
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isTest,
  message: json('Terlalu banyak permintaan. Silakan coba lagi nanti.'),
});

/**
 * Limiter ketat untuk autentikasi (login/refresh).
 * Hanya menghitung permintaan yang GAGAL, supaya login normal tidak terkunci.
 */
const authLimiter = rateLimit({
  windowMs: Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000),
  max: Number(process.env.AUTH_RATE_LIMIT_MAX || 20),
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  skip: () => isTest,
  message: json('Terlalu banyak percobaan login. Coba lagi beberapa menit lagi.'),
});

module.exports = { apiLimiter, authLimiter };
