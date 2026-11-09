// Backend/src/services/adSpendService.js
const createError = require('http-errors');
const prisma = require('../lib/prisma');

function serialize(row) {
  return {
    id: row.id.toString(),
    period: row.period,
    amount: row.amount?.toString() ?? '0',
    note: row.note ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** Normalisasi tanggal ke awal hari (UTC date-only). */
function toDateOnly(value) {
  const d = value ? new Date(value) : new Date();
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}

async function listAdSpends({ from, to } = {}) {
  const where = {};
  if (from || to) {
    where.period = {};
    if (from) where.period.gte = toDateOnly(from);
    if (to) where.period.lte = toDateOnly(to);
  }
  const rows = await prisma.adSpend.findMany({ where, orderBy: { period: 'desc' } });
  const total = rows.reduce((sum, r) => sum + Number(r.amount ?? 0), 0);
  return { adSpends: rows.map(serialize), total: total.toFixed(2) };
}

async function createAdSpend({ period, amount, note }) {
  const row = await prisma.adSpend.create({
    data: { period: toDateOnly(period), amount: String(amount), note: note ?? null },
  });
  return serialize(row);
}

async function updateAdSpend(id, data) {
  const payload = {};
  if (data.period !== undefined) payload.period = toDateOnly(data.period);
  if (data.amount !== undefined) payload.amount = String(data.amount);
  if (data.note !== undefined) payload.note = data.note;
  try {
    const row = await prisma.adSpend.update({ where: { id: BigInt(id) }, data: payload });
    return serialize(row);
  } catch (err) {
    if (err.code === 'P2025') throw createError(404, 'Biaya iklan tidak ditemukan');
    throw err;
  }
}

async function deleteAdSpend(id) {
  try {
    await prisma.adSpend.delete({ where: { id: BigInt(id) } });
    return true;
  } catch (err) {
    if (err.code === 'P2025') throw createError(404, 'Biaya iklan tidak ditemukan');
    throw err;
  }
}

/** Total biaya iklan dalam rentang tanggal (dipakai perhitungan profit). */
async function sumAdSpend({ from, to } = {}) {
  const where = {};
  if (from || to) {
    where.period = {};
    if (from) where.period.gte = toDateOnly(from);
    if (to) where.period.lte = toDateOnly(to);
  }
  const agg = await prisma.adSpend.aggregate({ _sum: { amount: true }, where });
  return Number(agg._sum.amount ?? 0);
}

module.exports = { listAdSpends, createAdSpend, updateAdSpend, deleteAdSpend, sumAdSpend };
