// Backend/src/services/categoryService.js
/**
 * Resolusi kategori Akulaku otomatis dari nama produk.
 *
 * Strategi (berurutan):
 *   1) Cocokkan `CategoryRule.keyword` (case-insensitive) ke nama produk.
 *      Aturan dengan `priority` tertinggi menang; keyword lebih panjang menang
 *      bila priority sama (lebih spesifik).
 *   2) Validasi hasilnya ada di tabel `AkulakuCategory` (jalur asli Akulaku).
 *   3) Bila tidak ada aturan yang cocok -> null (pemanggil memutuskan fallback).
 */
const prisma = require('../lib/prisma');

/** Ambil semua aturan aktif (di-cache per proses, invalidasi manual bila perlu). */
let cache = null;
let cacheAt = 0;
const CACHE_TTL_MS = 60_000;

async function loadRules(force = false) {
  const now = Date.now();
  if (!force && cache && now - cacheAt < CACHE_TTL_MS) return cache;
  const rules = await prisma.categoryRule.findMany({
    where: { active: true },
    select: { keyword: true, path: true, priority: true },
  });
  cache = rules.map((r) => ({ ...r, lower: r.keyword.toLowerCase() }));
  cacheAt = now;
  return cache;
}

function clearCategoryCache() {
  cache = null;
  cacheAt = 0;
}

/**
 * Cari kategori Akulaku dari nama produk.
 * Mengembalikan { path, matchedKeyword, source } atau null.
 */
async function resolveCategoryByKeyword(productName) {
  const name = String(productName || '').trim().toLowerCase();
  if (!name) return null;

  const rules = await loadRules();
  let best = null;
  for (const rule of rules) {
    if (!rule.lower) continue;
    if (!name.includes(rule.lower)) continue;
    // Pilih priority lebih tinggi; bila sama, keyword lebih panjang (lebih spesifik).
    const better =
      !best ||
      rule.priority > best.priority ||
      (rule.priority === best.priority && rule.lower.length > best.lower.length);
    if (better) best = rule;
  }
  if (!best) return null;

  // Validasi jalur ada di kategori Akulaku (cegah kategori palsu).
  const valid = await isKnownCategoryPath(best.path);
  if (!valid) return null;

  return { path: best.path, matchedKeyword: best.keyword, source: 'keyword' };
}

/** Apakah jalur ini kategori Akulaku yang dikenal (exact atau prefix untuk root). */
async function isKnownCategoryPath(path) {
  if (!path) return false;
  const exact = await prisma.akulakuCategory.findUnique({ where: { path } });
  if (exact) return true;
  // Rule boleh menunjuk root (mis. "Pakaian Muslim") yang punya anak-anak.
  const child = await prisma.akulakuCategory.findFirst({ where: { path: { startsWith: `${path}/` } } });
  return Boolean(child);
}

/**
 * Resolve kategori untuk sebuah listing:
 *   - pakai `listing.categoryPath` bila diisi DAN valid;
 *   - kalau kosong -> coba otomatis dari nama produk.
 * Mengembalikan { path, source, matchedKeyword } atau null bila gagal semua.
 */
async function resolveListingCategory({ productName, categoryPath } = {}) {
  if (categoryPath && (await isKnownCategoryPath(categoryPath))) {
    return { path: categoryPath, source: 'manual' };
  }
  const auto = await resolveCategoryByKeyword(productName);
  if (auto) return auto;
  return null;
}

/** Cari jalur kategori yang mirip (untuk saran saat manual salah). */
async function suggestCategoryPaths(query, limit = 5) {
  const q = String(query || '').trim();
  if (!q) return [];
  return prisma.akulakuCategory.findMany({
    where: { path: { contains: q, mode: 'insensitive' } },
    select: { path: true, level: true },
    take: limit,
    orderBy: { level: 'asc' },
  });
}

module.exports = {
  resolveCategoryByKeyword,
  resolveListingCategory,
  isKnownCategoryPath,
  suggestCategoryPaths,
  loadRules,
  clearCategoryCache,
};
