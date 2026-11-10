// Backend/src/utils/cookies.js
// Setelan cookie httpOnly untuk token (menggantikan localStorage).
const isProd = process.env.NODE_ENV === 'production';

const ACCESS_COOKIE = 'mc_access';
const REFRESH_COOKIE = 'mc_refresh';

const baseOptions = {
  httpOnly: true,
  secure: isProd, // hanya via HTTPS saat production
  sameSite: 'lax', // mitigasi CSRF dasar
};

/**
 * maxAgeMs: number = cookie persisten; undefined = session cookie (hilang saat browser ditutup).
 */
function accessCookieOptions(maxAgeMs) {
  return { ...baseOptions, path: '/', ...(maxAgeMs ? { maxAge: maxAgeMs } : {}) };
}

// Refresh token dibatasi path /api/auth agar tidak dikirim ke seluruh endpoint.
function refreshCookieOptions(maxAgeMs) {
  return { ...baseOptions, path: '/api/auth', ...(maxAgeMs ? { maxAge: maxAgeMs } : {}) };
}

const clearAccessOptions = { ...baseOptions, path: '/' };
const clearRefreshOptions = { ...baseOptions, path: '/api/auth' };

module.exports = {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  accessCookieOptions,
  refreshCookieOptions,
  clearAccessOptions,
  clearRefreshOptions,
};
