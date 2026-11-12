// Backend/src/services/recapService.js
/**
 * Rekap omzet fleksibel: per hari / minggu / bulan / tahun, dengan preset periode
 * dan rentang kustom. Dihitung dari AkulakuOrder (bukan dibatalkan) + modal listing
 * + biaya iklan, mengikuti isolasi akun (pegawai hanya melihat akunnya).
 *
 * Granularitas (bucket):
 *   daily   -> 1 hari per bucket
 *   weekly  -> 1 minggu (Senin–Minggu) per bucket
 *   monthly -> 1 bulan per bucket
 *   yearly  -> 1 tahun per bucket
 *
 * Preset periode:
 *   today | 7d | 30d | this_month | last_month | this_quarter | this_year
 *   all | custom(from,to)
 */
const prisma = require('../lib/prisma');
const { isAdmin } = require('../utils/scope');

const VALID_BUCKETS = ['daily', 'weekly', 'monthly', 'yearly'];
const VALID_PRESETS = ['today', '7d', '30d', 'this_month', 'last_month', 'this_quarter', 'this_year', 'all', 'custom'];

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

/** Mulai minggu (Senin). */
function startOfWeek(d) {
  const x = startOfDay(d);
  const day = x.getDay(); // 0=Minggu
  const diff = day === 0 ? 6 : day - 1;
  x.setDate(x.getDate() - diff);
  return x;
}

/** Hitung rentang tanggal dari preset. Mengembalikan { from, to } atau null. */
function resolvePreset(preset, { from, to } = {}) {
  const now = new Date();
  switch (preset) {
    case 'today':
      return { from: startOfDay(now), to: endOfDay(now) };
    case '7d': {
      const f = startOfDay(now);
      f.setDate(f.getDate() - 6);
      return { from: f, to: endOfDay(now) };
    }
    case '30d': {
      const f = startOfDay(now);
      f.setDate(f.getDate() - 29);
      return { from: f, to: endOfDay(now) };
    }
    case 'this_month': {
      const f = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: f, to: endOfDay(now) };
    }
    case 'last_month': {
      const f = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const t = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      return { from: f, to: t };
    }
    case 'this_quarter': {
      const q = Math.floor(now.getMonth() / 3);
      const f = new Date(now.getFullYear(), q * 3, 1);
      return { from: f, to: endOfDay(now) };
    }
    case 'this_year':
      return { from: new Date(now.getFullYear(), 0, 1), to: endOfDay(now) };
    case 'all':
      return { from: null, to: null };
    case 'custom':
      return {
        from: from ? startOfDay(new Date(from)) : null,
        to: to ? endOfDay(new Date(to)) : null,
      };
    default:
      return { from: null, to: null };
  }
}

/** Kunci bucket untuk sebuah tanggal. */
function bucketKey(date, bucket) {
  const d = new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  if (bucket === 'yearly') return String(y);
  if (bucket === 'monthly') return `${y}-${m}`;
  if (bucket === 'weekly') {
    const s = startOfWeek(d);
    return `${s.getFullYear()}-${String(s.getMonth() + 1).padStart(2, '0')}-${String(s.getDate()).padStart(2, '0')}`;
  }
  return `${y}-${m}-${day}`;
}

/** Label ramah untuk tampilan. */
function bucketLabel(key, bucket) {
  if (bucket === 'yearly') return key;
  if (bucket === 'monthly') {
    const [y, m] = key.split('-');
    const nama = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
    return `${nama[Number(m) - 1]} ${y}`;
  }
  if (bucket === 'weekly') {
    const [y, m, d] = key.split('-');
    const s = new Date(Number(y), Number(m) - 1, Number(d));
    const e = new Date(s);
    e.setDate(e.getDate() + 6);
    const fmt = (x) => `${String(x.getDate()).padStart(2, '0')}/${String(x.getMonth() + 1).padStart(2, '0')}`;
    return `${fmt(s)} - ${fmt(e)} ${y}`;
  }
  const [y, m, d] = key.split('-');
  return `${d}/${m}/${y}`;
}

/**
 * Rekap omzet dengan bucket fleksibel.
 * Mengembalikan { period, bucket, summary, buckets[] }.
 */
async function getRecap({ preset = '30d', from, to, bucket = 'daily', accountIds = null, user } = {}) {
  const granularity = VALID_BUCKETS.includes(bucket) ? bucket : 'daily';
  const range = resolvePreset(VALID_PRESETS.includes(preset) ? preset : '30d', { from, to });

  // Isolasi akun.
  let ids = accountIds;
  if (!ids) {
    const where = isAdmin(user) ? {} : { ownerId: BigInt(user.id) };
    const accounts = await prisma.akulakuAccount.findMany({ where, select: { id: true } });
    ids = accounts.map((a) => a.id);
  }
  if (!ids.length) {
    return {
      period: { preset, from: range.from, to: range.to, bucket: granularity },
      summary: { omzet: 0, modal: 0, adSpend: 0, profit: 0, orderCount: 0, avgOrderValue: 0 },
      buckets: [],
    };
  }

  const orderWhere = { accountId: { in: ids }, status: { not: 'cancelled' } };
  if (range.from || range.to) {
    orderWhere.orderedAt = {};
    if (range.from) orderWhere.orderedAt.gte = range.from;
    if (range.to) orderWhere.orderedAt.lte = range.to;
  }

  const [orders, items, adSpends] = await Promise.all([
    prisma.akulakuOrder.findMany({
      where: orderWhere,
      select: { orderedAt: true, totalAmt: true, externalId: true },
    }),
    prisma.akulakuOrderItem.findMany({
      where: { order: orderWhere },
      select: { qty: true, listingId: true, listing: { select: { basePrice: true } }, order: { select: { orderedAt: true } } },
    }),
    prisma.adSpend.findMany({
      where: {
        accountId: { in: ids },
        ...(range.from || range.to ? { period: { ...(range.from ? { gte: range.from } : {}), ...(range.to ? { lte: range.to } : {}) } } : {}),
      },
      select: { period: true, amount: true },
    }),
  ]);

  const buckets = new Map();
  const ensure = (key) => {
    if (!buckets.has(key)) {
      buckets.set(key, { key, label: bucketLabel(key, granularity), omzet: 0, modal: 0, adSpend: 0, profit: 0, orderCount: 0 });
    }
    return buckets.get(key);
  };

  let totalOmzet = 0;
  for (const o of orders) {
    const b = ensure(bucketKey(o.orderedAt, granularity));
    b.omzet += Number(o.totalAmt ?? 0);
    b.orderCount += 1;
    totalOmzet += Number(o.totalAmt ?? 0);
  }
  for (const it of items) {
    if (!it.listingId || !it.listing) continue;
    const b = ensure(bucketKey(it.order.orderedAt, granularity));
    b.modal += Number(it.listing.basePrice ?? 0) * it.qty;
  }
  for (const a of adSpends) {
    const b = ensure(bucketKey(a.period, granularity));
    b.adSpend += Number(a.amount ?? 0);
  }

  for (const b of buckets.values()) b.profit = b.omzet - b.modal - b.adSpend;

  const list = [...buckets.values()].sort((x, y) => (x.key < y.key ? 1 : -1));
  const summary = list.reduce(
    (t, b) => ({
      omzet: t.omzet + b.omzet,
      modal: t.modal + b.modal,
      adSpend: t.adSpend + b.adSpend,
      profit: t.profit + b.profit,
      orderCount: t.orderCount + b.orderCount,
    }),
    { omzet: 0, modal: 0, adSpend: 0, profit: 0, orderCount: 0 },
  );
  summary.avgOrderValue = summary.orderCount ? summary.omzet / summary.orderCount : 0;

  return {
    period: { preset, from: range.from, to: range.to, bucket: granularity },
    summary,
    buckets: list,
  };
}

module.exports = { getRecap, resolvePreset, bucketKey, VALID_BUCKETS, VALID_PRESETS };
