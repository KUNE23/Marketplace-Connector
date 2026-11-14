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

/**
 * Cache daftar kategori untuk pencocokan nama (fallback lapis kedua).
 * Menyimpan pasangan { leaf, path } dengan leaf = segmen terakhir kategori.
 */
let leafCache = null;
let leafCacheAt = 0;

async function loadCategoryLeaves(force = false) {
  const now = Date.now();
  if (!force && leafCache && now - leafCacheAt < CACHE_TTL_MS) return leafCache;
  const rows = await prisma.akulakuCategory.findMany({ select: { path: true } });
  leafCache = rows
    .map((r) => {
      const leaf = String(r.path).split('/').pop().trim();
      return { path: r.path, leaf, lower: leaf.toLowerCase() };
    })
    // Leaf terlalu pendek berisiko salah cocok (mis. "Tas", "Lain").
    .filter((x) => x.lower.length >= 4);
  leafCacheAt = now;
  return leafCache;
}

function clearCategoryCache() {
  cache = null;
  cacheAt = 0;
  leafCache = null;
  leafCacheAt = 0;
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
 * Fallback lapis kedua: cocokkan NAMA KATEGORI (segmen terakhir) ke nama produk.
 *
 * Contoh: "mascara waterproof" mengandung "mascara"
 *   -> Kecantikan & Kesehatan/Kosmetik/Bulu Mata/Mascara
 *
 * Nama kategori terpanjang yang cocok dipilih (lebih spesifik).
 * Kata harus utuh (batas kata) supaya "tas" tidak cocok di dalam "atasan".
 */
async function resolveByCategoryName(productName) {
  const name = String(productName || '').toLowerCase();
  if (!name) return null;

  const leaves = await loadCategoryLeaves();

  // Kategori hewan peliharaan sering salah cocok (mis. "popok bayi" -> "Popok"
  // milik Perawatan Hewan). Hanya izinkan bila produk memang soal hewan.
  const animalContext = /(hewan|kucing|anjing|burung|ikan|hamster|kelinci|reptil|peliharaan)/.test(name);

  let best = null;
  let bestScore = -1;

  for (const item of leaves) {
    if (!animalContext && /Perawatan Hewan/i.test(item.path)) continue;

    // Batas kata: karakter sebelum/sesudah bukan huruf/angka.
    const re = new RegExp(`(^|[^a-z0-9])${escapeRegExp(item.lower)}([^a-z0-9]|$)`);
    if (!re.test(name)) continue;

    // Skor: panjang leaf + bonus bila segmen induk juga muncul di nama produk.
    const segments = item.path.split('/').map((s) => s.toLowerCase().trim());
    const parentHit = segments
      .slice(0, -1)
      .filter((s) => s.length >= 4 && name.includes(s)).length;
    const score = item.lower.length + parentHit * 10;

    if (score > bestScore) {
      bestScore = score;
      best = { path: item.path, leaf: item.leaf };
    }
  }

  if (!best) return null;
  return { path: best.path, matchedKeyword: `[kategori] ${best.leaf}`, source: 'category-name' };
}

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Resolve kategori untuk sebuah listing:
 *   1) `categoryPath` manual bila valid;
 *   2) aturan kata kunci (CategoryRule);
 *   3) fallback: cocokkan nama kategori ke nama produk.
 * Mengembalikan { path, source, matchedKeyword } atau null.
 */
async function resolveListingCategory({ productName, categoryPath } = {}) {
  if (categoryPath && (await isKnownCategoryPath(categoryPath))) {
    return { path: categoryPath, source: 'manual' };
  }
  const auto = await resolveCategoryByKeyword(productName);
  if (auto) return auto;

  const byName = await resolveByCategoryName(productName);
  if (byName) return byName;

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
  resolveByCategoryName,
  resolveListingCategory,
  isKnownCategoryPath,
  suggestCategoryPaths,
  loadRules,
  loadCategoryLeaves,
  clearCategoryCache,
};
