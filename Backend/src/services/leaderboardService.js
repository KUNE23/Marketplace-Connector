// Backend/src/services/leaderboardService.js
/**
 * Leaderboard omzet per PEGAWAI (pemilik akun Akulaku) dan rincian per akun.
 *
 * Sumber omzet: AkulakuOrder.totalAmt (order tidak dibatalkan).
 *   - omzet  : jumlah totalAmt
 *   - modal  : basePrice listing x qty (item yang tertaut listing)
 *   - adSpend: biaya iklan akun pada rentang tanggal
 *   - profit : omzet - modal - adSpend
 *
 * Isolasi: ADMIN melihat semua pegawai; EMPLOYEE hanya melihat dirinya sendiri.
 */
const prisma = require('../lib/prisma');
const { isAdmin } = require('../utils/scope');

function dateRange({ from, to } = {}) {
  const where = {};
  if (from || to) {
    where.gte = from ? new Date(from) : undefined;
    where.lte = to ? new Date(to) : undefined;
    Object.keys(where).forEach((k) => where[k] === undefined && delete where[k]);
  }
  return where;
}

/** Hitung metrik omzet untuk sekumpulan akun dalam rentang tanggal. */
async function metricsForAccounts(accountIds, { from, to } = {}) {
  const empty = { omzet: 0, modal: 0, adSpend: 0, profit: 0, orderCount: 0, matchedItems: 0, unmatchedItems: 0 };
  if (!accountIds.length) return empty;

  const orderWhere = { accountId: { in: accountIds }, status: { not: 'cancelled' } };
  const range = dateRange({ from, to });
  if (Object.keys(range).length) orderWhere.orderedAt = range;

  const [agg, count, items, adAgg] = await Promise.all([
    prisma.akulakuOrder.aggregate({ _sum: { totalAmt: true }, where: orderWhere }),
    prisma.akulakuOrder.count({ where: orderWhere }),
    prisma.akulakuOrderItem.findMany({
      where: { order: orderWhere },
      select: { qty: true, listingId: true, listing: { select: { basePrice: true } } },
    }),
    prisma.adSpend.aggregate({
      _sum: { amount: true },
      where: {
        accountId: { in: accountIds },
        ...(Object.keys(range).length ? { period: range } : {}),
      },
    }),
  ]);

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

  const omzet = Number(agg._sum.totalAmt ?? 0);
  const adSpend = Number(adAgg._sum.amount ?? 0);
  return {
    omzet,
    modal,
    adSpend,
    profit: omzet - modal - adSpend,
    orderCount: count,
    matchedItems,
    unmatchedItems,
  };
}

/**
 * Leaderboard per pegawai. Setiap baris = 1 user + jumlah akun + total omzet/profit.
 * ADMIN: semua pegawai (dan admin pemilik akun). EMPLOYEE: hanya dirinya.
 */
async function getEmployeeLeaderboard({ from, to, user } = {}) {
  const accountWhere = isAdmin(user) ? {} : { ownerId: BigInt(user.id) };

  const accounts = await prisma.akulakuAccount.findMany({
    where: accountWhere,
    select: {
      id: true,
      label: true,
      status: true,
      ownerId: true,
      owner: { select: { id: true, name: true, email: true, role: true } },
    },
  });

  // Kelompokkan akun per pemilik.
  const byOwner = new Map();
  for (const acc of accounts) {
    const key = acc.ownerId ? acc.ownerId.toString() : 'unassigned';
    if (!byOwner.has(key)) {
      byOwner.set(key, {
        userId: key === 'unassigned' ? null : key,
        name: acc.owner?.name ?? (key === 'unassigned' ? 'Tanpa Pemilik' : 'Tanpa Nama'),
        email: acc.owner?.email ?? null,
        role: acc.owner?.role ?? null,
        accounts: [],
      });
    }
    byOwner.get(key).accounts.push(acc);
  }

  const rows = [];
  for (const group of byOwner.values()) {
    const ids = group.accounts.map((a) => a.id);
    const m = await metricsForAccounts(ids, { from, to });
    rows.push({
      userId: group.userId,
      name: group.name,
      email: group.email,
      role: group.role,
      accountCount: group.accounts.length,
      activeAccounts: group.accounts.filter((a) => a.status === 'active').length,
      omzet: m.omzet,
      modal: m.modal,
      adSpend: m.adSpend,
      profit: m.profit,
      orderCount: m.orderCount,
    });
  }

  // Urutkan berdasarkan omzet tertinggi.
  rows.sort((a, b) => b.omzet - a.omzet);
  rows.forEach((r, i) => { r.rank = i + 1; });

  const totalOmzet = rows.reduce((s, r) => s + r.omzet, 0);
  const totalProfit = rows.reduce((s, r) => s + r.profit, 0);
  return {
    period: { from: from ?? null, to: to ?? null },
    totals: { omzet: totalOmzet, profit: totalProfit, employees: rows.length },
    leaderboard: rows,
  };
}

/** Rincian per akun untuk satu pegawai (atau semua bila admin tanpa userId). */
async function getEmployeeDetail(userId, { from, to, user } = {}) {
  const targetId = userId ?? (isAdmin(user) ? null : user.id);
  // Pegawai hanya boleh membuka datanya sendiri.
  if (!isAdmin(user) && String(targetId) !== String(user.id)) {
    const createError = require('http-errors');
    throw createError(403, 'Anda tidak punya akses ke data pegawai lain');
  }

  const accountWhere = targetId ? { ownerId: BigInt(targetId) } : {};
  const accounts = await prisma.akulakuAccount.findMany({
    where: accountWhere,
    select: { id: true, label: true, username: true, status: true },
    orderBy: { id: 'asc' },
  });

  const perAccount = [];
  for (const acc of accounts) {
    const m = await metricsForAccounts([acc.id], { from, to });
    perAccount.push({
      accountId: acc.id.toString(),
      label: acc.label,
      username: acc.username,
      status: acc.status,
      ...m,
    });
  }
  perAccount.sort((a, b) => b.omzet - a.omzet);

  const owner = targetId
    ? await prisma.user.findUnique({ where: { id: BigInt(targetId) }, select: { id: true, name: true, email: true, role: true } })
    : null;

  const totals = perAccount.reduce(
    (t, a) => ({
      omzet: t.omzet + a.omzet,
      modal: t.modal + a.modal,
      adSpend: t.adSpend + a.adSpend,
      profit: t.profit + a.profit,
      orderCount: t.orderCount + a.orderCount,
    }),
    { omzet: 0, modal: 0, adSpend: 0, profit: 0, orderCount: 0 },
  );

  return {
    period: { from: from ?? null, to: to ?? null },
    employee: owner
      ? { id: owner.id.toString(), name: owner.name, email: owner.email, role: owner.role }
      : { id: null, name: 'Semua Akun', email: null, role: null },
    totals,
    accounts: perAccount,
  };
}

/** Rekap harian omzet untuk sekumpulan akun (grafik tren). */
async function getDailyTrend(accountIds, { from, to } = {}) {
  if (!accountIds.length) return [];
  const orderWhere = { accountId: { in: accountIds }, status: { not: 'cancelled' } };
  const range = dateRange({ from, to });
  if (Object.keys(range).length) orderWhere.orderedAt = range;

  const orders = await prisma.akulakuOrder.findMany({
    where: orderWhere,
    select: { orderedAt: true, totalAmt: true },
    orderBy: { orderedAt: 'asc' },
  });

  const buckets = new Map();
  for (const o of orders) {
    const key = new Date(o.orderedAt).toISOString().slice(0, 10);
    if (!buckets.has(key)) buckets.set(key, { date: key, omzet: 0, orders: 0 });
    const b = buckets.get(key);
    b.omzet += Number(o.totalAmt ?? 0);
    b.orders += 1;
  }
  return [...buckets.values()];
}

module.exports = { getEmployeeLeaderboard, getEmployeeDetail, metricsForAccounts, getDailyTrend };
