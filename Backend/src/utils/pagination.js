// Backend/src/utils/pagination.js
/**
 * Batas paginasi global supaya query berat tidak bisa diminta sembarangan.
 */
const MAX_LIMIT = Number(process.env.MAX_PAGE_LIMIT || 100);
const DEFAULT_LIMIT = Number(process.env.DEFAULT_PAGE_LIMIT || 20);

function clampLimit(value, fallback = DEFAULT_LIMIT) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.floor(n), MAX_LIMIT);
}

function clampPage(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.floor(n);
}

function clampOffset(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.floor(n);
}

module.exports = { MAX_LIMIT, DEFAULT_LIMIT, clampLimit, clampPage, clampOffset };
