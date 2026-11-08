const createError = require('http-errors');
const prisma = require('../lib/prisma');

async function listSales({ page = 1, limit = 20, shopId, startDate, endDate, status }) {
  const skip = (page - 1) * limit;
  const where = {};
  if (shopId) where.shopId = BigInt(shopId);
  if (status) where.status = status;
  if (startDate || endDate) {
    where.soldAt = {};
    if (startDate) where.soldAt.gte = new Date(startDate);
    if (endDate) where.soldAt.lte = new Date(endDate);
  }
  const [rows, total] = await Promise.all([
    prisma.saleOrder.findMany({
      skip,
      take: limit,
      where,
      orderBy: { soldAt: 'desc' },
      include: { items: { include: { product: true } } },
    }),
    prisma.saleOrder.count({ where }),
  ]);
  return {
    sales: rows.map((o) => ({
      id: o.id.toString(),
      shopName: o.shopName,
      externalId: o.externalId,
      currency: o.currency,
      status: o.status,
      totalAmt: o.totalAmt.toString(),
      soldAt: o.soldAt,
      syncedAt: o.syncedAt,
      items: o.items.map((it) => ({
        id: it.id.toString(),
        orderId: it.orderId.toString(),
        productId: it.productId.toString(),
        sku: it.product.sku,
        name: it.product.name,
        qty: it.qty,
        unitPrice: it.unitPrice.toString(),
        discount: it.discount ? it.discount.toString() : null,
        total: it.total.toString(),
      })),
    })),
    total,
    page,
    limit,
  };
}

async function recapSales({ period = 'daily', startDate, endDate, shopId }) {
  const where = {};
  if (shopId) where.shopId = BigInt(shopId);
  if (startDate || endDate) {
    where.soldAt = {};
    if (startDate) where.soldAt.gte = new Date(startDate);
    if (endDate) where.soldAt.lte = new Date(endDate);
  }
  const rows = await prisma.saleOrder.findMany({ where, select: { soldAt: true, totalAmt: true } });
  const map = {};
  rows.forEach((r) => {
    const d = r.soldAt;
    let key;
    if (period === 'monthly') key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    else key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    map[key] = (map[key] || 0) + Number(r.totalAmt);
  });
  return Object.entries(map).map(([period, revenue]) => ({ period, revenue: revenue.toFixed(2) }));
}

async function upsertSaleOrder(data) {
  const items = data.items.map((it) => ({
    productId: BigInt(it.productId),
    qty: Number(it.qty),
    unitPrice: it.unitPrice,
    discount: it.discount,
    total: it.total,
  }))

  const result = await prisma.saleOrder.upsert({
    where: { externalId: data.externalId },
    update: {
      shopName: data.shopName,
      status: data.status,
      totalAmt: data.totalAmt,
      soldAt: new Date(data.soldAt),
      shopId: null,
      items: { deleteMany: {}, create: items },
    },
    create: {
      shopName: data.shopName,
      externalId: data.externalId,
      currency: data.currency || 'IDR',
      status: data.status,
      totalAmt: data.totalAmt,
      soldAt: new Date(data.soldAt),
      shopId: null,
      items: { create: items },
    },
  });
  return {
    id: result.id.toString(),
    shopName: result.shopName,
    externalId: result.externalId,
    currency: result.currency,
    status: result.status,
    totalAmt: result.totalAmt.toString(),
    soldAt: result.soldAt,
    syncedAt: result.syncedAt,
  };
}

module.exports = { listSales, recapSales, upsertSaleOrder };

