// Backend/src/services/dashboardService.js
const prisma = require('../lib/prisma');
const { sumAdSpend } = require('./adSpendService');

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Hitung omzet, modal, biaya iklan, dan profit untuk rentang tanggal.
 * Profit = omzet - modal produk (dari listing tertaut) - biaya iklan.
 * `matchedItems`/`unmatchedItems` dipakai UI untuk menandai data modal yang belum lengkap.
 */
async function computeProfit({ from, to } = {}) {
  const orderWhere = { status: { not: 'cancelled' } };
  if (from || to) {
    orderWhere.orderedAt = {};
    if (from) orderWhere.orderedAt.gte = from;
    if (to) orderWhere.orderedAt.lte = to;
  }

  const [omzetAgg, items] = await Promise.all([
    prisma.akulakuOrder.aggregate({ _sum: { totalAmt: true }, where: orderWhere }),
    prisma.akulakuOrderItem.findMany({
      where: { order: orderWhere },
      select: { qty: true, listingId: true, listing: { select: { basePrice: true } } },
    }),
  ]);

  const omzet = Number(omzetAgg._sum.totalAmt ?? 0);
  let modal = 0;
  let matchedItems = 0;
  let unmatchedItems = 0;
  for (const it of items) {
    if (it.listingId && it.listing) {
      modal += Number(it.listing.basePrice ?? 0) * it.qty;
      matchedItems += 1;
    } else {
      unmatchedItems += 1;
    }
  }
  const adSpend = await sumAdSpend({ from, to });
  const profit = omzet - modal - adSpend;

  return { omzet, modal, adSpend, profit, matchedItems, unmatchedItems };
}

async function getSummary() {
  const todayStart = startOfToday();

  const [
    productTotal,
    productsWithListing,
    listingTotal,
    listingByStatus,
    accountTotal,
    accountActive,
    orderTotal,
    orderByStatus,
    ordersToday,
    jobsPending,
    jobsFailed,
  ] = await Promise.all([
    prisma.product.count(),
    prisma.product.count({ where: { listings: { some: {} } } }),
    prisma.listing.count(),
    prisma.listing.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.akulakuAccount.count(),
    prisma.akulakuAccount.count({ where: { status: 'active' } }),
    prisma.akulakuOrder.count(),
    prisma.akulakuOrder.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.akulakuOrder.count({ where: { orderedAt: { gte: todayStart } } }),
    prisma.job.count({ where: { status: 'pending' } }),
    prisma.job.count({ where: { status: 'failed' } }),
  ]);

  // Omzet & profit: Akulaku order yang tidak dibatalkan.
  const [profitAll, profitToday] = await Promise.all([
    computeProfit(),
    computeProfit({ from: todayStart }),
  ]);

  const listingMap = Object.fromEntries(listingByStatus.map((r) => [r.status, r._count._all]));
  const orderMap = Object.fromEntries(orderByStatus.map((r) => [r.status, r._count._all]));

  return {
    products: {
      total: productTotal,
      withListing: productsWithListing,
      withoutListing: productTotal - productsWithListing,
    },
    listings: {
      total: listingTotal,
      draft: listingMap.draft ?? 0,
      queued: listingMap.queued ?? 0,
      posted: listingMap.posted ?? 0,
      failed: listingMap.failed ?? 0,
    },
    accounts: {
      total: accountTotal,
      active: accountActive,
    },
    orders: {
      total: orderTotal,
      today: ordersToday,
      new: orderMap.new ?? 0,
      processing: orderMap.processing ?? 0,
      shipped: orderMap.shipped ?? 0,
      delivered: orderMap.delivered ?? 0,
      cancelled: orderMap.cancelled ?? 0,
    },
    revenue: {
      total: profitAll.omzet.toFixed(2),
      today: profitToday.omzet.toFixed(2),
    },
    profit: {
      // Profit = omzet - modal produk - biaya iklan.
      total: profitAll.profit.toFixed(2),
      today: profitToday.profit.toFixed(2),
      modal: profitAll.modal.toFixed(2),
      adSpend: profitAll.adSpend.toFixed(2),
      // Item order yang belum punya modal (tidak tertaut ke listing).
      unmatchedItems: profitAll.unmatchedItems,
      matchedItems: profitAll.matchedItems,
    },
    jobs: {
      pending: jobsPending,
      failed: jobsFailed,
    },
  };
}

/** Rekap omzet, modal, biaya iklan & profit per periode (default 14 hari terakhir). */
async function getRecap({ days = 14 } = {}) {
  const since = new Date();
  since.setHours(0, 0, 0, 0);
  since.setDate(since.getDate() - (days - 1));

  const keyOf = (d) => new Date(d).toISOString().slice(0, 10);

  const [orders, items, adSpends] = await Promise.all([
    prisma.akulakuOrder.findMany({
      where: { orderedAt: { gte: since }, status: { not: 'cancelled' } },
      select: { orderedAt: true, totalAmt: true },
    }),
    prisma.akulakuOrderItem.findMany({
      where: { order: { orderedAt: { gte: since }, status: { not: 'cancelled' } } },
      select: {
        qty: true,
        listingId: true,
        listing: { select: { basePrice: true } },
        order: { select: { orderedAt: true } },
      },
    }),
    prisma.adSpend.findMany({
      where: { period: { gte: since } },
      select: { period: true, amount: true },
    }),
  ]);

  const buckets = new Map();
  for (let i = 0; i < days; i += 1) {
    const d = new Date(since);
    d.setDate(since.getDate() + i);
    buckets.set(keyOf(d), { date: keyOf(d), orders: 0, revenue: 0, modal: 0, adSpend: 0, profit: 0 });
  }
  for (const o of orders) {
    const bucket = buckets.get(keyOf(o.orderedAt));
    if (bucket) {
      bucket.orders += 1;
      bucket.revenue += Number(o.totalAmt ?? 0);
    }
  }
  for (const it of items) {
    const bucket = buckets.get(keyOf(it.order.orderedAt));
    if (bucket && it.listingId && it.listing) {
      bucket.modal += Number(it.listing.basePrice ?? 0) * it.qty;
    }
  }
  for (const a of adSpends) {
    const bucket = buckets.get(keyOf(a.period));
    if (bucket) bucket.adSpend += Number(a.amount ?? 0);
  }
  for (const bucket of buckets.values()) {
    bucket.profit = bucket.revenue - bucket.modal - bucket.adSpend;
  }

  return { days, recap: Array.from(buckets.values()) };
}

/** Order Akulaku terbaru untuk daftar dashboard. */
async function getRecentOrders({ limit = 5 } = {}) {
  const rows = await prisma.akulakuOrder.findMany({
    take: limit,
    orderBy: { orderedAt: 'desc' },
    select: {
      id: true,
      externalId: true,
      buyerName: true,
      status: true,
      totalAmt: true,
      orderedAt: true,
      account: { select: { label: true } },
    },
  });
  return {
    orders: rows.map((o) => ({
      id: o.id.toString(),
      externalId: o.externalId,
      buyerName: o.buyerName,
      status: o.status,
      totalAmt: o.totalAmt.toString(),
      orderedAt: o.orderedAt,
      accountLabel: o.account?.label ?? null,
    })),
  };
}

module.exports = { getSummary, getRecap, getRecentOrders, computeProfit };
