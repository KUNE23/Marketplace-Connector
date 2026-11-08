// Backend/src/services/listingService.js
const createError = require('http-errors');

const prisma = require('../lib/prisma');
const { resolveTierForPrice } = require('./markupTierService');

const SELECT = {
  id: true,
  productId: true,
  accountId: true,
  basePrice: true,
  markupType: true,
  markupValue: true,
  sellingPrice: true,
  status: true,
  akulakuProductId: true,
  akulakuUrl: true,
  errorMessage: true,
  retryCount: true,
  postedAt: true,
  createdAt: true,
  updatedAt: true,
  product: { select: { id: true, sku: true, name: true, imageUrls: true } },
  account: { select: { id: true, label: true } },
};

function toNumber(value) {
  if (value === null || value === undefined) return 0;
  return Number(value);
}

function computeSellingPrice(basePrice, markupType, markupValue) {
  const base = toNumber(basePrice);
  const markup = toNumber(markupValue);
  if (markupType === 'fixed') return Math.max(0, base + markup);
  // percent
  return Math.max(0, base + (base * markup) / 100);
}

function serialize(listing) {
  return {
    id: listing.id.toString(),
    productId: listing.productId.toString(),
    accountId: listing.accountId.toString(),
    basePrice: listing.basePrice?.toString() ?? '0',
    markupType: listing.markupType,
    markupValue: listing.markupValue?.toString() ?? '0',
    sellingPrice: listing.sellingPrice?.toString() ?? '0',
    status: listing.status,
    akulakuProductId: listing.akulakuProductId,
    akulakuUrl: listing.akulakuUrl,
    errorMessage: listing.errorMessage,
    retryCount: listing.retryCount,
    postedAt: listing.postedAt,
    createdAt: listing.createdAt,
    updatedAt: listing.updatedAt,
    product: listing.product
      ? {
          id: listing.product.id.toString(),
          sku: listing.product.sku,
          name: listing.product.name,
          imageUrls: listing.product.imageUrls,
        }
      : null,
    account: listing.account
      ? {
          id: listing.account.id.toString(),
          label: listing.account.label,
        }
      : null,
  };
}

async function resolveMarkup({ markupType, markupValue, basePrice }) {
  // 1) Nilai eksplisit menang.
  if (markupValue !== undefined && markupValue !== null && markupValue !== '') {
    return { markupType: markupType ?? 'percent', markupValue: String(markupValue) };
  }
  // 2) Kalau tidak diisi, pakai tier berdasarkan harga asal.
  if (basePrice !== undefined && basePrice !== null) {
    const tier = await resolveTierForPrice(basePrice);
    if (tier) return { markupType: tier.markupType, markupValue: tier.markupValue };
  }
  // 3) Fallback 0%.
  return { markupType: markupType ?? 'percent', markupValue: '0' };
}

async function createListing({ productId, accountId, markupType, markupValue }) {
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) throw createError(404, 'Product not found');
  const account = await prisma.akulakuAccount.findUnique({ where: { id: accountId } });
  if (!account) throw createError(404, 'Akun Akulaku tidak ditemukan');

  const existing = await prisma.listing.findUnique({
    where: { productId_accountId: { productId, accountId } },
  });
  if (existing) throw createError(409, 'Listing untuk produk & akun ini sudah ada');

  const resolved = await resolveMarkup({ markupType, markupValue, basePrice: product.priceIdr });
  const basePrice = product.priceIdr ?? 0;
  const sellingPrice = computeSellingPrice(basePrice, resolved.markupType, resolved.markupValue);

  const listing = await prisma.listing.create({
    data: {
      productId,
      accountId,
      basePrice,
      markupType: resolved.markupType,
      markupValue: resolved.markupValue,
      sellingPrice,
    },
    select: SELECT,
  });
  return serialize(listing);
}

/**
 * Buat listing untuk banyak produk sekaligus (satu akun, satu markup).
 * Produk yang sudah punya listing di akun sama / harga kosong akan dilewati.
 */
async function createListingsBulk({ productIds, accountId, markupType, markupValue }) {
  const account = await prisma.akulakuAccount.findUnique({ where: { id: accountId } });
  if (!account) throw createError(404, 'Akun Akulaku tidak ditemukan');

  const ids = productIds.map((id) => BigInt(id));
  const products = await prisma.product.findMany({ where: { id: { in: ids } } });
  const productMap = new Map(products.map((p) => [p.id.toString(), p]));

  const existing = await prisma.listing.findMany({
    where: { accountId, productId: { in: ids } },
    select: { productId: true },
  });
  const existingSet = new Set(existing.map((e) => e.productId.toString()));

  // Kalau markup eksplisit diberikan, pakai sama untuk semua.
  // Kalau tidak, tiap produk dihitung dari tier harganya.
  const hasExplicitMarkup = markupValue !== undefined && markupValue !== null && markupValue !== '';
  const allTiers = hasExplicitMarkup ? null : await prisma.markupTier.findMany({ where: { active: true } });

  function tierForPrice(price) {
    const p = Number(price ?? 0);
    const candidates = allTiers
      .filter((t) => Number(t.minPrice) <= p)
      .sort((a, b) => Number(b.minPrice) - Number(a.minPrice));
    return candidates.find((t) => t.maxPrice === null || p <= Number(t.maxPrice)) || null;
  }

  let created = 0;
  let skippedExisting = 0;
  let skippedNoPrice = 0;
  let skippedMissing = 0;
  const errors = [];

  const rows = [];
  for (const id of productIds) {
    const key = String(id);
    const product = productMap.get(key);
    if (!product) {
      skippedMissing += 1;
      continue;
    }
    if (existingSet.has(key)) {
      skippedExisting += 1;
      continue;
    }
    if (product.priceIdr === null || product.priceIdr === undefined) {
      skippedNoPrice += 1;
      continue;
    }

    const basePrice = product.priceIdr;
    let resolved = { markupType: markupType ?? 'percent', markupValue: '0' };
    if (hasExplicitMarkup) {
      resolved = { markupType: markupType ?? 'percent', markupValue: String(markupValue) };
    } else {
      const tier = tierForPrice(basePrice);
      if (tier) resolved = { markupType: tier.markupType, markupValue: tier.markupValue.toString() };
    }

    rows.push({
      productId: product.id,
      accountId,
      basePrice,
      markupType: resolved.markupType,
      markupValue: resolved.markupValue,
      sellingPrice: computeSellingPrice(basePrice, resolved.markupType, resolved.markupValue),
    });
  }

  // Insert per batch (createMany) supaya cepat.
  const CHUNK = 100;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    try {
      const res = await prisma.listing.createMany({ data: chunk, skipDuplicates: true });
      created += res.count;
    } catch (err) {
      errors.push(String(err.message || err).slice(0, 200));
    }
  }

  return {
    requested: productIds.length,
    created,
    skippedExisting,
    skippedNoPrice,
    skippedMissing,
    failed: errors.length ? rows.length - created : 0,
    errors: errors.slice(0, 5),
  };
}

async function listListings({ page = 1, limit = 20, search, status, accountId } = {}) {
  const skip = (page - 1) * limit;
  const where = {};
  if (status) where.status = status;
  if (accountId) where.accountId = BigInt(accountId);
  if (search) {
    where.product = {
      OR: [
        { name: { contains: search, mode: 'insensitive' } },
        { sku: { contains: search, mode: 'insensitive' } },
      ],
    };
  }
  const [listings, total] = await Promise.all([
    prisma.listing.findMany({ skip, take: limit, where, orderBy: { id: 'desc' }, select: SELECT }),
    prisma.listing.count({ where }),
  ]);
  return { listings: listings.map(serialize), total, page, limit };
}

async function getListingById(id) {
  const listing = await prisma.listing.findUnique({ where: { id: BigInt(id) }, select: SELECT });
  if (!listing) throw createError(404, 'Listing not found');
  return serialize(listing);
}

async function updateListing(id, data) {
  const listing = await prisma.listing.findUnique({ where: { id: BigInt(id) } });
  if (!listing) throw createError(404, 'Listing not found');

  const payload = {};
  const markupType = data.markupType ?? listing.markupType;
  const markupValue = data.markupValue !== undefined ? data.markupValue : listing.markupValue.toString();
  if (data.markupType !== undefined || data.markupValue !== undefined) {
    payload.markupType = markupType;
    payload.markupValue = markupValue;
    payload.sellingPrice = computeSellingPrice(listing.basePrice, markupType, markupValue);
  }
  if (data.status !== undefined) {
    payload.status = data.status;
    if (data.status === 'posted') payload.postedAt = new Date();
  }

  const updated = await prisma.listing.update({ where: { id: BigInt(id) }, data: payload, select: SELECT });
  return serialize(updated);
}

async function deleteListing(id) {
  try {
    await prisma.listing.delete({ where: { id: BigInt(id) } });
    return true;
  } catch (err) {
    if (err.code === 'P2025') throw createError(404, 'Listing not found');
    throw err;
  }
}

module.exports = {
  createListing,
  createListingsBulk,
  listListings,
  getListingById,
  updateListing,
  deleteListing,
  computeSellingPrice,
};

