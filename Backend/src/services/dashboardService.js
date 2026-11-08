// Backend/src/services/dashboardService.js
const prisma = require('../lib/prisma');

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
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

  // Omzet: Akulaku order yang tidak dibatalkan.
  const revenueAgg = await prisma.akulakuOrder.aggregate({
    _sum: { totalAmt: true },
    where: { status: { not: 'cancelled' } },
  });
  const revenueToday = await prisma.akulakuOrder.aggregate({
    _sum: { totalAmt: true },
    where: { status: { not: 'cancelled' }, orderedAt: { gte: todayStart } },
  });

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
      total: revenueAgg._sum.totalAmt ? revenueAgg._sum.totalAmt.toString() : '0',
      today: revenueToday._sum.totalAmt ? revenueToday._sum.totalAmt.toString() : '0',
    },
    jobs: {
      pending: jobsPending,
      failed: jobsFailed,
    },
  };
}

/** Rekap omzet & jumlah order per periode (default 14 hari terakhir). */
async function getRecap({ days = 14 } = {}) {
  const since = new Date();
  since.setHours(0, 0, 0, 0);
  since.setDate(since.getDate() - (days - 1));

  const orders = await prisma.akulakuOrder.findMany({
    where: { orderedAt: { gte: since }, status: { not: 'cancelled' } },
    select: { orderedAt: true, totalAmt: true },
    orderBy: { orderedAt: 'asc' },
  });

  const buckets = new Map();
  for (let i = 0; i < days; i += 1) {
    const d = new Date(since);
    d.setDate(since.getDate() + i);
    buckets.set(d.toISOString().slice(0, 10), { date: d.toISOString().slice(0, 10), orders: 0, revenue: 0 });
  }
  for (const o of orders) {
    const key = new Date(o.orderedAt).toISOString().slice(0, 10);
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.orders += 1;
      bucket.revenue += Number(o.totalAmt ?? 0);
    }
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

module.exports = { getSummary, getRecap, getRecentOrders };
