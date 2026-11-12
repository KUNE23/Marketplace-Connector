// Backend/src/services/akulakuOrderService.js
const createError = require('http-errors');

const prisma = require('../lib/prisma');
const { accountRelationScope, assertAccountAccess } = require('../utils/scope');

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
  extra: true,
  items: {
    select: {
      id: true,
      listingId: true,
      sku: true,
      name: true,
      qty: true,
      unitPrice: true,
      total: true,
      imageUrl: true,
      variant: true,
      // Link produk Shopee (untuk barcode QR yang mengarah ke platform asal).
      listing: { select: { product: { select: { shopeeUrl: true, shopeeItemId: true, name: true } } } },
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
    // Info pembayaran & kode pesanan (hasil ekstraksi rawPayload).
    payment: order.extra
      ? {
          payType: order.extra.payType,
          label: order.extra.payTypeLabel,
          isCod: order.extra.isCod,
          payTime: order.extra.payTime,
          orderCode: order.extra.orderCode,
          refundStatus: order.extra.refundStatus,
          deliveryStatus: order.extra.deliveryStatus,
          createTime: order.extra.createTime,
        }
      : null,
    // Tautan langsung ke pesanan di Seller Center Akulaku.
    akulakuUrl: 'https://ec-vendor.akulaku.com/ec-vendor/order/list',
    items: (order.items ?? []).map((item) => ({
      id: item.id.toString(),
      listingId: item.listingId ? item.listingId.toString() : null,
      sku: item.sku,
      name: item.name,
      qty: item.qty,
      unitPrice: item.unitPrice?.toString() ?? '0',
      total: item.total?.toString() ?? '0',
      imageUrl: item.imageUrl ?? null,
      variant: item.variant ?? null,
      // Link produk Shopee untuk barcode/QR scan.
      shopeeUrl: item.listing?.product?.shopeeUrl ?? null,
      shopeeItemId: item.listing?.product?.shopeeItemId
        ? item.listing.product.shopeeItemId.toString()
        : null,
    })),
  };
}

/** Label metode pembayaran Akulaku (payType). */
const PAY_TYPE_LABEL = {
  1: 'Transfer Bank',
  2: 'Kartu Kredit',
  3: 'Akulaku PayLater',
  4: 'Virtual Account',
  5: 'E-Wallet',
  6: 'COD',
  7: 'Gerai Retail',
};

/** Ambil URL gambar item pesanan dari raw order Akulaku. */
function extractItemMeta(rawItem, idx, rawOrder) {
  const list = rawOrder?.orderItems || [];
  const it = list[idx] || {};
  return {
    imageUrl: it.skuImageUrl || null,
    variant: it.skuSpecValues || null,
  };
}

/** Bangun data AkulakuOrderExtra dari rawPayload. */
function buildExtra(raw) {
  if (!raw) return null;
  const toDate = (v) => {
    if (!v) return null;
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) return null;
    // Beberapa field sudah dalam milidetik (13 digit).
    return new Date(n > 1e12 ? n : n * 1000);
  };
  return {
    payType: raw.payType ?? null,
    payTypeLabel: PAY_TYPE_LABEL[raw.payType] ?? (raw.payType != null ? `Tipe ${raw.payType}` : null),
    orderCode: raw.orderCode ? String(raw.orderCode) : null,
    orderType: raw.orderType ?? null,
    refundStatus: raw.refundStatus ?? null,
    deliveryStatus: raw.deliveryStatus ?? null,
    isCod: Boolean(raw.ifCod),
    payTime: toDate(raw.payTime),
    createTime: toDate(raw.createTime),
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

  const raw = data.rawPayload ?? null;
  const extra = buildExtra(raw);

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
        create: data.items.map((item, idx) => {
          const meta = extractItemMeta(item, idx, raw);
          return {
            listingId: item.listingId ? BigInt(item.listingId) : null,
            sku: item.sku,
            name: item.name,
            qty: item.qty,
            unitPrice: item.unitPrice,
            total: item.total,
            imageUrl: meta.imageUrl,
            variant: meta.variant,
          };
        }),
      },
      ...(extra ? { extra: { create: extra } } : {}),
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
        body: `Order ${order.externalId} (${order.account?.label ?? 'akun'}) — ${order.totalAmt} ${order.currency}`,
      })),
    });
  }

  return { order: serialize(order), created: true };
}

/**
 * Lengkapi tautan Shopee untuk item pesanan yang belum tertaut listing.
 * Urutan: listingId -> SKU produk -> shopeeItemId.
 * Pesanan yang memang bukan berasal dari Shopee akan tetap null.
 */
async function attachShopeeLinks(items) {
  const needSku = items.filter((it) => !it.shopeeUrl && it.sku);
  if (!needSku.length) return items;

  const skus = [...new Set(needSku.map((it) => it.sku))];
  const products = await prisma.product.findMany({
    where: { OR: [{ sku: { in: skus } }, { shopeeItemId: { in: skus.map((s) => BigInt(String(s).replace(/\D/g, '') || '0')) } }] },
    select: { sku: true, shopeeItemId: true, shopeeUrl: true },
  });

  const byKey = new Map();
  for (const p of products) {
    if (p.sku) byKey.set(String(p.sku), p);
    if (p.shopeeItemId) byKey.set(String(p.shopeeItemId), p);
  }

  return items.map((it) => {
    if (it.shopeeUrl || !it.sku) return it;
    const p = byKey.get(String(it.sku)) || byKey.get(String(it.sku).replace(/\D/g, ''));
    if (!p || !p.shopeeUrl) return it;
    return { ...it, shopeeUrl: p.shopeeUrl, shopeeItemId: it.shopeeItemId ?? (p.shopeeItemId ? p.shopeeItemId.toString() : null) };
  });
}

async function listAkulakuOrders({ page = 1, limit = 20, search, status, accountId, user } = {}) {
  const skip = (page - 1) * limit;
  const where = user ? accountRelationScope(user) : {};
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
  // Lengkapi tautan Shopee (untuk barcode) bila item belum tertaut listing.
  const serialized = await Promise.all(
    orders.map(async (o) => {
      const s = serialize(o);
      s.items = await attachShopeeLinks(s.items);
      return s;
    }),
  );
  return { orders: serialized, total, page, limit };
}

async function getAkulakuOrderById(id, user) {
  const order = await prisma.akulakuOrder.findUnique({ where: { id: BigInt(id) }, select: SELECT });
  if (!order) throw createError(404, 'Order Akulaku tidak ditemukan');
  if (user) await assertAccountAccess(prisma, user, order.accountId);
  return serialize(order);
}

/** Semua order (tanpa paginasi) untuk export, mengikuti filter yang sama dengan list. */
async function listAkulakuOrdersForExport({ search, status, accountId, user } = {}) {
  const where = user ? accountRelationScope(user) : {};
  if (status) where.status = status;
  if (accountId) where.accountId = BigInt(accountId);
  if (search) {
    where.OR = [
      { externalId: { contains: search, mode: 'insensitive' } },
      { buyerName: { contains: search, mode: 'insensitive' } },
    ];
  }
  const orders = await prisma.akulakuOrder.findMany({ where, orderBy: { orderedAt: 'desc' }, select: SELECT });
  return Promise.all(
    orders.map(async (o) => {
      const s = serialize(o);
      s.items = await attachShopeeLinks(s.items);
      return s;
    }),
  );
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

