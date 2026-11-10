// Backend/src/middleware/security.js
// Header keamanan HTTP (helmet) + util CORS origin.
const helmet = require('helmet');

/**
 * Header keamanan untuk API JSON.
 * CSP dimatikan karena backend tidak menyajikan HTML (frontend terpisah).
 */
function securityHeaders() {
  return helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    referrerPolicy: { policy: 'no-referrer' },
  });
}

/**
 * CORS origin:
 * - CORS_ORIGIN boleh berisi beberapa origin dipisah koma.
 * - Bila kosong: di production TIDAK mengizinkan cross-origin (aman, karena
 *   frontend biasanya disajikan same-origin via nginx); di dev default '*'.
 */
function corsOptions() {
  const raw = (process.env.CORS_ORIGIN || '').trim();
  const list = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (list.length === 0) {
    const fallback = process.env.NODE_ENV === 'production' ? false : '*';
    return { origin: fallback };
  }
  return { origin: list };
}

module.exports = { securityHeaders, corsOptions };
