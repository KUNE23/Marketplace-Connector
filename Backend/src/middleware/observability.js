// Backend/src/middleware/observability.js
/**
 * Pencatatan untuk halaman Monitor (khusus SUPERADMIN).
 *
 * Dua middleware:
 *   1) requestMetrics  -> mencatat method/path/status/durasi tiap request API.
 *   2) attachAudit     -> menempelkan helper `req.audit(...)` untuk mencatat
 *                         aktivitas penting (login, CRUD, perubahan role).
 *
 * Pencatatan bersifat "best effort": kegagalan menulis log TIDAK boleh
 * menggagalkan request user.
 */
const prisma = require('../lib/prisma');

// Path yang tidak perlu dicatat (terlalu ramai / tidak informatif).
const SKIP_PATHS = [/^\/api\/health/, /^\/api\/status/];

function shouldSkip(path) {
  return SKIP_PATHS.some((re) => re.test(path));
}

/** Normalisasi path agar tidak meledak jumlah uniknya (ganti id angka). */
function normalizePath(path) {
  return String(path || '')
    .split('?')[0]
    .replace(/\/\d+/g, '/:id');
}

/** Catat satu request ke RequestMetric. */
function requestMetrics(req, res, next) {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    try {
      const path = req.originalUrl || req.url || '';
      if (!path.startsWith('/api')) return;
      if (shouldSkip(path)) return;

      const durationMs = Number((process.hrtime.bigint() - start) / 1000000n);
      prisma.requestMetric
        .create({
          data: {
            method: String(req.method || 'GET').slice(0, 10),
            path: normalizePath(path).slice(0, 200),
            statusCode: res.statusCode,
            durationMs: Math.min(durationMs, 600000),
            userId: req.user?.id ? BigInt(req.user.id) : null,
          },
        })
        .catch(() => {});
    } catch {
      /* abaikan */
    }
  });
  next();
}

/** Tempelkan helper audit ke req. */
function attachAudit(req, res, next) {
  req.audit = (action, options = {}) => {
    try {
      const { resource, resourceId, status = 'success', detail } = options;
      prisma.auditLog
        .create({
          data: {
            userId: req.user?.id ? BigInt(req.user.id) : null,
            userEmail: req.user?.email ?? options.userEmail ?? null,
            userRole: req.user?.role ?? options.userRole ?? null,
            action: String(action).slice(0, 100),
            resource: resource ? String(resource).slice(0, 100) : null,
            resourceId: resourceId ? String(resourceId).slice(0, 100) : null,
            status,
            ip: (req.ip || req.headers['x-forwarded-for'] || '').toString().slice(0, 60) || null,
            userAgent: String(req.headers['user-agent'] || '').slice(0, 300) || null,
            detail: detail ?? undefined,
          },
        })
        .catch(() => {});
    } catch {
      /* abaikan */
    }
  };
  next();
}

module.exports = { requestMetrics, attachAudit, normalizePath };
