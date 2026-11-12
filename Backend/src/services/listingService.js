// Backend/src/services/listingService.js
const createError = require('http-errors');

const prisma = require('../lib/prisma');
const { resolveTierForPrice } = require('./markupTierService');
const { enqueueJob } = require('./jobService');
const { accountRelationScope, assertAccountAccess } = require('../utils/scope');

const SELECT = {
  id: true,
  productId: true,
  accountId: true,
  basePrice: true,
  markupType: true,
  markupValue: true,
  sellingPrice: true,
  status: true,
  categoryPath: true,
  specs: true,
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

/**
 * Hitung harga jual dari harga asal + markup.
 * PENTING: dibulatkan ke rupiah utuh (integer). Harga berdesimal (mis. 81379.8)
 * ditafsirkan keliru oleh Akulaku (titik dianggap pemisah ribuan -> 813798).
 * Rupiah tidak memakai sen, jadi pembulatan ke bilangan bulat adalah benar.
 */
function computeSellingPrice(basePrice, markupType, markupValue) {
  const base = toNumber(basePrice);
  const markup = toNumber(markupValue);
  const raw = markupType === 'fixed' ? base + markup : base + (base * markup) / 100;
  return Math.max(0, Math.round(raw));
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
    categoryPath: listing.categoryPath ?? null,
    specs: listing.specs ?? null,
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

async function createListing({ productId, accountId, markupType, markupValue, categoryPath, specs }, user) {
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) throw createError(404, 'Product not found');
  if (user) await assertAccountAccess(prisma, user, accountId);
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
      categoryPath: categoryPath ?? null,
      specs: specs ?? undefined,
    },
    select: SELECT,
  });
  return serialize(listing);
}

/**
 * Buat listing untuk banyak produk sekaligus (satu akun, satu markup).
 * Produk yang sudah punya listing di akun sama / harga kosong akan dilewati.
 */
async function createListingsBulk({ productIds, accountId, markupType, markupValue, categoryPath, specs }, user) {
  if (user) await assertAccountAccess(prisma, user, accountId);
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
      categoryPath: categoryPath ?? null,
      specs: specs ?? undefined,
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

/**
 * Masukkan listing ke antrian posting (worker akan memproses `post_listing`).
 * Kategori ditentukan otomatis dari nama produk bila belum diisi. Kalau kategori
 * tidak bisa ditentukan, ditolak cepat (400) supaya tidak gagal di tengah antrian.
 */
async function queueListing(id, { priority = 5, user } = {}) {
  const listing = await prisma.listing.findUnique({
    where: { id: BigInt(id) },
    include: { product: { select: { name: true } } },
  });
  if (!listing) throw createError(404, 'Listing not found');
  if (user) await assertAccountAccess(prisma, user, listing.accountId);
  if (listing.status === 'posted') throw createError(409, 'Listing sudah tayang di Akulaku');

  const account = await prisma.akulakuAccount.findUnique({ where: { id: listing.accountId } });
  if (!account || account.status !== 'active') {
    throw createError(400, 'Akun Akulaku tidak aktif');
  }

  // Tentukan kategori sekarang (otomatis bila kosong) agar gagal cepat & tersimpan.
  const { resolveListingCategory } = require('./categoryService');
  const resolved = await resolveListingCategory({
    productName: listing.product?.name,
    categoryPath: listing.categoryPath,
  });
  if (!resolved) {
    throw createError(
      400,
      `Kategori Akulaku tidak bisa ditentukan untuk produk "${listing.product?.name || '-'}". ` +
        'Tambahkan aturan kata kunci atau isi kategori manual.',
    );
  }

  const updated = await prisma.listing.update({
    where: { id: listing.id },
    data: {
      status: 'queued',
      errorMessage: null,
      // Simpan hasil auto-resolve supaya posting & UI konsisten.
      categoryPath: resolved.path,
    },
    select: SELECT,
  });
  const job = await enqueueJob({
    type: 'post_listing',
    payload: { listingId: listing.id.toString() },
    priority,
  });
  return { listing: serialize(updated), job, category: resolved };
}

/** Masukkan banyak listing sekaligus ke antrian posting. */
async function queueListingsBulk(ids, { priority = 5, user } = {}) {
  const queued = [];
  const skipped = [];
  for (const id of ids) {
    try {
      const res = await queueListing(id, { priority, user });
      queued.push(res.listing.id);
    } catch (err) {
      skipped.push({ id: String(id), reason: err.message });
    }
  }
  return { queued: queued.length, skipped, queuedIds: queued };
}

async function listListings({ page = 1, limit = 20, search, status, accountId, user } = {}) {
  const skip = (page - 1) * limit;
  // Isolasi: pegawai hanya melihat listing dari akun miliknya.
  const where = user ? accountRelationScope(user) : {};
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

async function getListingById(id, user) {
  const listing = await prisma.listing.findUnique({ where: { id: BigInt(id) }, select: SELECT });
  if (!listing) throw createError(404, 'Listing not found');
  // Isolasi: cek kepemilikan akun listing.
  if (user) await assertAccountAccess(prisma, user, listing.accountId);
  return serialize(listing);
}

async function updateListing(id, data, user) {
  const listing = await prisma.listing.findUnique({ where: { id: BigInt(id) } });
  if (!listing) throw createError(404, 'Listing not found');
  if (user) await assertAccountAccess(prisma, user, listing.accountId);

  const payload = {};
  const markupType = data.markupType ?? listing.markupType;
  const markupValue = data.markupValue !== undefined ? data.markupValue : listing.markupValue.toString();
  if (data.markupType !== undefined || data.markupValue !== undefined) {
    payload.markupType = markupType;
    payload.markupValue = markupValue;
    payload.sellingPrice = computeSellingPrice(listing.basePrice, markupType, markupValue);
  }
  if (data.status !== undefined) {
    // `posted` hanya boleh dihasilkan dari posting nyata (worker). Update manual
    // tidak boleh mengklaim tayang � pakai endpoint queue untuk memicu posting.
    if (data.status === 'posted') {
      throw createError(400, 'Status "posted" hanya dihasilkan dari posting ke Akulaku. Gunakan aksi Queue/Posting.');
    }
    payload.status = data.status;
  }
  if (data.categoryPath !== undefined) {
    payload.categoryPath = data.categoryPath;
  }
  if (data.specs !== undefined) {
    payload.specs = data.specs ?? undefined;
  }

  const updated = await prisma.listing.update({ where: { id: BigInt(id) }, data: payload, select: SELECT });
  return serialize(updated);
}

async function deleteListing(id, user) {
  const owned = await prisma.listing.findUnique({ where: { id: BigInt(id) }, select: { accountId: true } });
  if (owned && user) await assertAccountAccess(prisma, user, owned.accountId);
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
  queueListing,
  queueListingsBulk,
  listListings,
  getListingById,
  updateListing,
  deleteListing,
  computeSellingPrice,
};

