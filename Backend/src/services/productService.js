// Backend/src/services/productService.js
const { PrismaClient } = require('@prisma/client');
const createError = require('http-errors');

const prisma = new PrismaClient();

// Public fields to expose (omit internal fields like price decimal handling if needed)
const PUBLIC_PRODUCT_SELECT = {
  id: true,
  shopeeItemId: true,
  sku: true,
  name: true,
  description: true,
  priceIdr: true,
  stock: true,
  category: true,
  imageUrls: true,
  lastSyncedAt: true,
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
    category: product.category,
    imageUrls: product.imageUrls,
    lastSyncedAt: product.lastSyncedAt,
  };
}

async function createProduct(data) {
  const product = await prisma.product.create({
    data,
    select: PUBLIC_PRODUCT_SELECT,
  });
  return toPublicProduct(product);
}

async function getProductById(id) {
  const product = await prisma.product.findUnique({
    where: { id },
    select: PUBLIC_PRODUCT_SELECT,
  });
  if (!product) throw createError(404, 'Product not found');
  return toPublicProduct(product);
}

async function listProducts({ page = 1, limit = 20, search, category, minPrice, maxPrice }) {
  const skip = (page - 1) * limit;
  let where = {};
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
  if (category) {
    andFilters.push({ category: { equals: category, mode: 'insensitive' } });
  }
  if (minPrice) {
    andFilters.push({ priceIdr: { gte: minPrice } });
  }
  if (maxPrice) {
    andFilters.push({ priceIdr: { lte: maxPrice } });
  }
  if (andFilters.length) {
    where = { AND: andFilters };
  }
  const [products, total] = await Promise.all([
    prisma.product.findMany({
      skip,
      take: limit,
      where,
      orderBy: { id: 'asc' },
      select: PUBLIC_PRODUCT_SELECT,
    }),
    prisma.product.count({ where }),
  ]);
  return { products: products.map(toPublicProduct), total, page, limit };
}
  const skip = (page - 1) * limit;
  let where = {};
  if (search) {
    where = {
      OR: [
        { name: { contains: search, mode: 'insensitive' } },
        { sku: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ],
    };
  }
  const [products, total] = await Promise.all([
    prisma.product.findMany({
      skip,
      take: limit,
      where,
      orderBy: { id: 'asc' },
      select: PUBLIC_PRODUCT_SELECT,
    }),
    prisma.product.count({ where }),
  ]);
  return { products: products.map(toPublicProduct), total, page, limit };
}

async function updateProduct(id, data) {
  const product = await prisma.product.update({
    where: { id },
    data,
    select: PUBLIC_PRODUCT_SELECT,
  });
  return toPublicProduct(product);
}

async function deleteProduct(id) {
  await prisma.product.delete({ where: { id } });
  return true;
}

module.exports = {
  createProduct,
  getProductById,
  listProducts,
  updateProduct,
  deleteProduct,
};
