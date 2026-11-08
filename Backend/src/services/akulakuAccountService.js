// Backend/src/services/akulakuAccountService.js
const createError = require('http-errors');
const { encryptSecret } = require('../utils/crypto');

const prisma = require('../lib/prisma');

const SELECT = {
  id: true,
  label: true,
  username: true,
  status: true,
  note: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { listings: true } },
};

function serialize(account) {
  return {
    id: account.id.toString(),
    label: account.label,
    username: account.username,
    status: account.status,
    note: account.note,
    listingCount: account._count?.listings ?? 0,
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
  };
}

async function listAkulakuAccounts({ page = 1, limit = 20, search, status } = {}) {
  const skip = (page - 1) * limit;
  const where = {};
  if (status) where.status = status;
  if (search) {
    where.OR = [
      { label: { contains: search, mode: 'insensitive' } },
      { username: { contains: search, mode: 'insensitive' } },
    ];
  }
  const [accounts, total] = await Promise.all([
    prisma.akulakuAccount.findMany({ skip, take: limit, where, orderBy: { id: 'asc' }, select: SELECT }),
    prisma.akulakuAccount.count({ where }),
  ]);
  return { accounts: accounts.map(serialize), total, page, limit };
}

async function createAkulakuAccount({ label, username, password, status, note }) {
  const account = await prisma.akulakuAccount.create({
    data: {
      label,
      username,
      passwordEnc: encryptSecret(password),
      status: status ?? 'active',
      note,
    },
    select: SELECT,
  });
  return serialize(account);
}

async function getAkulakuAccountById(id) {
  const account = await prisma.akulakuAccount.findUnique({ where: { id: BigInt(id) }, select: SELECT });
  if (!account) throw createError(404, 'Akun Akulaku tidak ditemukan');
  return serialize(account);
}

async function updateAkulakuAccount(id, data) {
  const payload = { ...data };
  if (payload.password !== undefined) {
    payload.passwordEnc = encryptSecret(payload.password);
    delete payload.password;
  }
  try {
    const account = await prisma.akulakuAccount.update({
      where: { id: BigInt(id) },
      data: payload,
      select: SELECT,
    });
    return serialize(account);
  } catch (err) {
    if (err.code === 'P2025') throw createError(404, 'Akun Akulaku tidak ditemukan');
    throw err;
  }
}

async function deleteAkulakuAccount(id) {
  try {
    await prisma.akulakuAccount.delete({ where: { id: BigInt(id) } });
    return true;
  } catch (err) {
    if (err.code === 'P2025') throw createError(404, 'Akun Akulaku tidak ditemukan');
    throw err;
  }
}

module.exports = {
  listAkulakuAccounts,
  createAkulakuAccount,
  getAkulakuAccountById,
  updateAkulakuAccount,
  deleteAkulakuAccount,
};

