// Backend/src/services/productService.js
const createError = require('http-errors');

const prisma = require('../lib/prisma');

const PUBLIC_PRODUCT_SELECT = {
  id: true,
  shopeeItemId: true,
  sku: true,
  name: true,
  description: true,
  priceIdr: true,
  stock: true,
  shopeeUrl: true,
  shopId: true,
  location: true,
  sold: true,
  rating: true,
  imageUrls: true,
  lastSyncedAt: true,
  _count: { select: { listings: true } },
};

function toPublicProduct(product) {
  return {
    id: product.id.toString(),
    shopeeItemId: product.shopeeItemId ? product.shopeeItemId.toString() : null,
    sku: product.sku,
    name: product.name,
    description: product.description,
    priceIdr: product.priceIdr ? product.priceIdr.toString() : null,
    stock: product.stock,
    shopeeUrl: product.shopeeUrl,
    shopId: product.shopId,
    location: product.location,
    sold: product.sold,
    rating: product.rating ? product.rating.toString() : null,
    imageUrls: product.imageUrls,
    lastSyncedAt: product.lastSyncedAt,
    listingCount: product._count?.listings ?? 0,
    hasListing: (product._count?.listings ?? 0) > 0,
  };
}

async function createProduct(data) {
  const payload = { ...data };
  if (typeof payload.priceIdr === 'number' || typeof payload.priceIdr === 'bigint') {
    payload.priceIdr = String(payload.priceIdr);
  }
  const product = await prisma.product.create({ data: payload, select: PUBLIC_PRODUCT_SELECT });
  return toPublicProduct(product);
}

async function getProductById(id) {
  const product = await prisma.product.findUnique({ where: { id: BigInt(id) }, select: PUBLIC_PRODUCT_SELECT });
  if (!product) throw createError(404, 'Product not found');
  return toPublicProduct(product);
}

async function listProducts({ page = 1, limit = 20, search, hasListing, minPrice, maxPrice } = {}) {
  const skip = (page - 1) * limit;
  const andFilters = [];
  if (search) {
    andFilters.push({
      OR: [
        { name: { contains: search, mode: 'insensitive' } },
        { sku: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ],
    });
  }
  if (minPrice) andFilters.push({ priceIdr: { gte: minPrice } });
  if (maxPrice) andFilters.push({ priceIdr: { lte: maxPrice } });
  if (hasListing === true) andFilters.push({ listings: { some: {} } });
  if (hasListing === false) andFilters.push({ listings: { none: {} } });

  const where = andFilters.length ? { AND: andFilters } : {};
  const [products, total] = await Promise.all([
    prisma.product.findMany({ skip, take: limit, where, orderBy: { id: 'desc' }, select: PUBLIC_PRODUCT_SELECT }),
    prisma.product.count({ where }),
  ]);
  return { products: products.map(toPublicProduct), total, page, limit };
}

async function updateProduct(id, data) {
  const payload = { ...data };
  if (payload.priceIdr !== undefined && (typeof payload.priceIdr === 'number' || typeof payload.priceIdr === 'bigint')) {
    payload.priceIdr = String(payload.priceIdr);
  }
  try {
    const product = await prisma.product.update({ where: { id: BigInt(id) }, data: payload, select: PUBLIC_PRODUCT_SELECT });
    return toPublicProduct(product);
  } catch (err) {
    if (err.code === 'P2025') throw createError(404, 'Product not found');
    throw err;
  }
}

async function deleteProduct(id) {
  try {
    await prisma.product.delete({ where: { id: BigInt(id) } });
    return true;
  } catch (err) {
    if (err.code === 'P2025') throw createError(404, 'Product not found');
    throw err;
  }
}

module.exports = {
  createProduct,
  getProductById,
  listProducts,
  updateProduct,
  deleteProduct,
};

