// Backend/src/services/akulakuOrderService.js
const createError = require('http-errors');

const prisma = require('../lib/prisma');

const SELECT = {
  id: true,
  externalId: true,
  accountId: true,
  buyerName: true,
  buyerPhone: true,
  shippingAddress: true,
  status: true,
  totalAmt: true,
  currency: true,
  orderedAt: true,
  syncedAt: true,
  updatedAt: true,
  account: { select: { id: true, label: true } },
  items: {
    select: {
      id: true,
      listingId: true,
      sku: true,
      name: true,
      qty: true,
      unitPrice: true,
      total: true,
    },
  },
};

function serialize(order) {
  return {
    id: order.id.toString(),
    externalId: order.externalId,
    accountId: order.accountId.toString(),
    accountLabel: order.account?.label ?? null,
    buyerName: order.buyerName,
    buyerPhone: order.buyerPhone,
    shippingAddress: order.shippingAddress,
    status: order.status,
    totalAmt: order.totalAmt?.toString() ?? '0',
    currency: order.currency,
    orderedAt: order.orderedAt,
    syncedAt: order.syncedAt,
    updatedAt: order.updatedAt,
    items: (order.items ?? []).map((item) => ({
      id: item.id.toString(),
      listingId: item.listingId ? item.listingId.toString() : null,
      sku: item.sku,
      name: item.name,
      qty: item.qty,
      unitPrice: item.unitPrice?.toString() ?? '0',
      total: item.total?.toString() ?? '0',
    })),
  };
}

/**
 * Buat order Akulaku. Kalau externalId sudah ada, order dianggap sudah tersinkron
 * (idempotent) dan tidak dibuat notifikasi baru.
 */
async function createAkulakuOrder(data) {
  const account = await prisma.akulakuAccount.findUnique({ where: { id: data.accountId } });
  if (!account) throw createError(400, 'Akun Akulaku tidak ditemukan');

  const existing = await prisma.akulakuOrder.findUnique({ where: { externalId: data.externalId } });
  if (existing) {
    return { order: serialize(await prisma.akulakuOrder.findUnique({ where: { id: existing.id }, select: SELECT })), created: false };
  }

  const order = await prisma.akulakuOrder.create({
    data: {
      externalId: data.externalId,
      accountId: data.accountId,
      buyerName: data.buyerName,
      buyerPhone: data.buyerPhone,
      shippingAddress: data.shippingAddress,
      status: data.status ?? 'new',
      totalAmt: data.totalAmt,
      currency: data.currency ?? 'IDR',
      orderedAt: data.orderedAt ?? new Date(),
      rawPayload: data.rawPayload ?? undefined,
      items: {
        create: data.items.map((item) => ({
          listingId: item.listingId ? BigInt(item.listingId) : null,
          sku: item.sku,
          name: item.name,
          qty: item.qty,
          unitPrice: item.unitPrice,
          total: item.total,
        })),
      },
    },
    select: SELECT,
  });

  // Notifikasi ke semua admin saat ada order baru.
  const admins = await prisma.user.findMany({ where: { role: 'ADMIN', active: true }, select: { id: true } });
  if (admins.length) {
    await prisma.notification.createMany({
      data: admins.map((admin) => ({
        userId: admin.id,
        type: 'akulaku_order_new',
        title: 'Pesanan Akulaku baru',
        body: `Order ${order.externalId} (${order.account?.label ?? 'akun'}) â€” ${order.totalAmt} ${order.currency}`,
      })),
    });
  }

  return { order: serialize(order), created: true };
}

async function listAkulakuOrders({ page = 1, limit = 20, search, status, accountId } = {}) {
  const skip = (page - 1) * limit;
  const where = {};
  if (status) where.status = status;
  if (accountId) where.accountId = BigInt(accountId);
  if (search) {
    where.OR = [
      { externalId: { contains: search, mode: 'insensitive' } },
      { buyerName: { contains: search, mode: 'insensitive' } },
    ];
  }
  const [orders, total] = await Promise.all([
    prisma.akulakuOrder.findMany({ skip, take: limit, where, orderBy: { orderedAt: 'desc' }, select: SELECT }),
    prisma.akulakuOrder.count({ where }),
  ]);
  return { orders: orders.map(serialize), total, page, limit };
}

async function getAkulakuOrderById(id) {
  const order = await prisma.akulakuOrder.findUnique({ where: { id: BigInt(id) }, select: SELECT });
  if (!order) throw createError(404, 'Order Akulaku tidak ditemukan');
  return serialize(order);
}

/** Semua order (tanpa paginasi) untuk export, mengikuti filter yang sama dengan list. */
async function listAkulakuOrdersForExport({ search, status, accountId } = {}) {
  const where = {};
  if (status) where.status = status;
  if (accountId) where.accountId = BigInt(accountId);
  if (search) {
    where.OR = [
      { externalId: { contains: search, mode: 'insensitive' } },
      { buyerName: { contains: search, mode: 'insensitive' } },
    ];
  }
  const orders = await prisma.akulakuOrder.findMany({ where, orderBy: { orderedAt: 'desc' }, select: SELECT });
  return orders.map(serialize);
}

async function updateAkulakuOrderStatus(id, status) {
  try {
    const order = await prisma.akulakuOrder.update({
      where: { id: BigInt(id) },
      data: { status },
      select: SELECT,
    });
    return serialize(order);
  } catch (err) {
    if (err.code === 'P2025') throw createError(404, 'Order Akulaku tidak ditemukan');
    throw err;
  }
}

module.exports = {
  createAkulakuOrder,
  listAkulakuOrders,
  getAkulakuOrderById,
  updateAkulakuOrderStatus,
  listAkulakuOrdersForExport,
};

