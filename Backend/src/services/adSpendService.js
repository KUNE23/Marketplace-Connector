// Backend/src/services/adSpendService.js
const createError = require('http-errors');
const prisma = require('../lib/prisma');
const { isAdmin, assertAccountAccess } = require('../utils/scope');

const INCLUDE = { account: { select: { id: true, label: true } } };

function serialize(row) {
  return {
    id: row.id.toString(),
    accountId: row.accountId ? row.accountId.toString() : null,
    accountLabel: row.account?.label ?? null,
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

/** accountId boleh: null/kosong = Umum, angka/string = id akun. */
function normalizeAccountId(value) {
  if (value === undefined || value === null || value === '' || value === 'general') return null;
  return BigInt(value);
}

async function listAdSpends({ from, to, accountId, user } = {}) {
  const where = {};
  // Isolasi: pegawai hanya melihat biaya iklan milik akunnya.
  if (user && !isAdmin(user)) where.account = { ownerId: BigInt(user.id) };
  if (from || to) {
    where.period = {};
    if (from) where.period.gte = toDateOnly(from);
    if (to) where.period.lte = toDateOnly(to);
  }
  // accountId: 'all'/undefined = semua; 'general' = hanya Umum; selain itu = akun tertentu.
  if (accountId !== undefined && accountId !== '' && accountId !== 'all') {
    where.accountId = accountId === 'general' ? null : BigInt(accountId);
  }
  const rows = await prisma.adSpend.findMany({ where, orderBy: { period: 'desc' }, include: INCLUDE });
  const total = rows.reduce((sum, r) => sum + Number(r.amount ?? 0), 0);
  return { adSpends: rows.map(serialize), total: total.toFixed(2) };
}

async function createAdSpend({ period, amount, note, accountId }, user) {
  if (user && accountId && accountId !== 'general' && accountId !== 'all') {
    await assertAccountAccess(prisma, user, accountId);
  }
  const row = await prisma.adSpend.create({
    data: {
      period: toDateOnly(period),
      amount: String(amount),
      note: note ?? null,
      accountId: normalizeAccountId(accountId),
    },
    include: INCLUDE,
  });
  return serialize(row);
}

async function updateAdSpend(id, data) {
  const payload = {};
  if (data.period !== undefined) payload.period = toDateOnly(data.period);
  if (data.amount !== undefined) payload.amount = String(data.amount);
  if (data.note !== undefined) payload.note = data.note;
  if (data.accountId !== undefined) payload.accountId = normalizeAccountId(data.accountId);
  try {
    const row = await prisma.adSpend.update({ where: { id: BigInt(id) }, data: payload, include: INCLUDE });
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

/** Total biaya iklan dalam rentang tanggal (semua iklan, dipakai profit total). */
async function sumAdSpend({ from, to, user } = {}) {
  const where = {};
  if (user && !isAdmin(user)) where.account = { ownerId: BigInt(user.id) };
  if (from || to) {
    where.period = {};
    if (from) where.period.gte = toDateOnly(from);
    if (to) where.period.lte = toDateOnly(to);
  }
  const agg = await prisma.adSpend.aggregate({ _sum: { amount: true }, where });
  return Number(agg._sum.amount ?? 0);
}

module.exports = { listAdSpends, createAdSpend, updateAdSpend, deleteAdSpend, sumAdSpend };
