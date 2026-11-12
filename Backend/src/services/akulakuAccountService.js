// Backend/src/services/akulakuAccountService.js
const createError = require('http-errors');
const { encryptSecret } = require('../utils/crypto');
const { accountScope, assertAccountAccess, isAdmin } = require('../utils/scope');

const prisma = require('../lib/prisma');

const SELECT = {
  id: true,
  label: true,
  username: true,
  status: true,
  note: true,
  ownerId: true,
  owner: { select: { id: true, name: true, email: true, role: true } },
  createdAt: true,
  updatedAt: true,
  session: { select: { status: true, updatedAt: true } },
  _count: { select: { listings: true } },
};

function serialize(account) {
  return {
    id: account.id.toString(),
    label: account.label,
    username: account.username,
    status: account.status,
    note: account.note,
    ownerId: account.ownerId ? account.ownerId.toString() : null,
    ownerName: account.owner?.name ?? null,
    ownerEmail: account.owner?.email ?? null,
    listingCount: account._count?.listings ?? 0,
    sessionStatus: account.session?.status ?? 'missing',
    sessionUpdatedAt: account.session?.updatedAt ?? null,
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
  };
}

/** Info sesi Akulaku satu akun. */
async function getAkulakuSessionInfo(id) {
  const session = await prisma.akulakuSession.findUnique({
    where: { accountId: BigInt(id) },
    select: { status: true, updatedAt: true },
  });
  return {
    accountId: String(id),
    status: session?.status ?? 'missing',
    updatedAt: session?.updatedAt ?? null,
  };
}

/**
 * Daftar akun Akulaku. Admin melihat semua; pegawai hanya miliknya.
 * `user` wajib diisi agar isolasi data konsisten.
 */
async function listAkulakuAccounts({ page = 1, limit = 20, search, status, user } = {}) {
  const skip = (page - 1) * limit;
  const where = accountScope(user);
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

/**
 * Buat akun Akulaku. Pemilik = user yang membuat (admin bisa menetapkan owner lain).
 */
async function createAkulakuAccount({ label, username, password, status, note, ownerId }, user) {
  // Admin boleh menentukan pemilik; pegawai selalu menjadi pemilik akunnya sendiri.
  const resolvedOwner = isAdmin(user) && ownerId ? BigInt(ownerId) : BigInt(user.id);
  const account = await prisma.akulakuAccount.create({
    data: {
      label,
      username,
      passwordEnc: encryptSecret(password),
      status: status ?? 'active',
      note,
      ownerId: resolvedOwner,
    },
    select: SELECT,
  });
  return serialize(account);
}

async function getAkulakuAccountById(id, user) {
  await assertAccountAccess(prisma, user, id);
  const account = await prisma.akulakuAccount.findUnique({ where: { id: BigInt(id) }, select: SELECT });
  if (!account) throw createError(404, 'Akun Akulaku tidak ditemukan');
  return serialize(account);
}

async function updateAkulakuAccount(id, data, user) {
  await assertAccountAccess(prisma, user, id);
  const payload = { ...data };
  if (payload.password !== undefined) {
    payload.passwordEnc = encryptSecret(payload.password);
    delete payload.password;
  }
  // Hanya admin yang boleh memindahkan kepemilikan akun.
  if (payload.ownerId !== undefined) {
    if (!isAdmin(user)) delete payload.ownerId;
    else payload.ownerId = payload.ownerId === null ? null : BigInt(payload.ownerId);
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

async function deleteAkulakuAccount(id, user) {
  await assertAccountAccess(prisma, user, id);
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
  getAkulakuSessionInfo,
  serialize,
  SELECT,
};
