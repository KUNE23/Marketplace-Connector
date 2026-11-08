// Backend/src/services/markupTierService.js
const prisma = require('../lib/prisma');
const createError = require('http-errors');

/**
 * Ambil semua tier (urut berdasarkan harga naik).
 */
async function listMarkupTiers() {
  const tiers = await prisma.markupTier.findMany({ orderBy: [{ minPrice: 'asc' }, { sortOrder: 'asc' }] });
  return { tiers: tiers.map(serialize) };
}

function serialize(t) {
  return {
    id: t.id.toString(),
    label: t.label,
    minPrice: t.minPrice.toString(),
    maxPrice: t.maxPrice === null ? null : t.maxPrice.toString(),
    markupType: t.markupType,
    markupValue: t.markupValue.toString(),
    active: t.active,
    sortOrder: t.sortOrder,
  };
}

/**
 * Cari tier yang cocok untuk sebuah harga.
 * Aturan batas: harga >= minPrice dan (maxPrice null atau harga <= maxPrice).
 * Jika beberapa tier cocok, ambil minPrice terbesar (paling spesifik).
 */
async function resolveTierForPrice(priceIdr) {
  const price = Number(priceIdr ?? 0);
  const tiers = await prisma.markupTier.findMany({
    where: { active: true, minPrice: { lte: price } },
    orderBy: { minPrice: 'desc' },
  });
  const match = tiers.find((t) => t.maxPrice === null || price <= Number(t.maxPrice));
  if (!match) return null;
  return { markupType: match.markupType, markupValue: match.markupValue.toString(), label: match.label };
}

/**
 * Ganti seluruh daftar tier (bulk replace) - dipakai dari halaman pengaturan.
 */
async function replaceMarkupTiers(tiers) {
  const ops = [prisma.markupTier.deleteMany({})];
  for (let i = 0; i < tiers.length; i += 1) {
    const t = tiers[i];
    ops.push(
      prisma.markupTier.create({
        data: {
          label: t.label,
          minPrice: t.minPrice,
          maxPrice: t.maxPrice ?? null,
          markupType: t.markupType ?? 'percent',
          markupValue: t.markupValue,
          active: t.active ?? true,
          sortOrder: t.sortOrder ?? i,
        },
      }),
    );
  }
  await prisma.$transaction(ops);
  return listMarkupTiers();
}

/**
 * Seed default bila tabel kosong.
 * Aturan: <=100rb 45%, 100rb-599.999 30%, >=600rb 25%.
 */
async function ensureDefaultTiers() {
  const count = await prisma.markupTier.count();
  if (count > 0) return;
  await prisma.markupTier.createMany({
    data: [
      { label: 'Under 100rb', minPrice: '0', maxPrice: '100000', markupType: 'percent', markupValue: '45', sortOrder: 1 },
      { label: '100rb - 599rb', minPrice: '100001', maxPrice: '599999', markupType: 'percent', markupValue: '30', sortOrder: 2 },
      { label: '600rb ke atas', minPrice: '600000', maxPrice: null, markupType: 'percent', markupValue: '25', sortOrder: 3 },
    ],
  });
}

module.exports = { listMarkupTiers, resolveTierForPrice, replaceMarkupTiers, ensureDefaultTiers };
