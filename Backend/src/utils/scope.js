// Backend/src/utils/scope.js
/**
 * Helper isolasi data berbasis kepemilikan.
 *
 * Peran:
 *   SUPERADMIN -> akses penuh + halaman Monitor (log & performa). Tidak terlihat
 *                 oleh ADMIN di daftar user.
 *   ADMIN      -> melihat/mengelola SEMUA data bisnis (akun, pesanan, listing).
 *   EMPLOYEE   -> hanya data miliknya (ownerId == user.id).
 *
 * Pemakaian:
 *   const where = accountScope(req.user);
 *   prisma.akulakuAccount.findMany({ where });
 */

// Peran yang boleh melihat SEMUA data bisnis.
const ADMIN_ROLES = ['ADMIN', 'SUPERADMIN'];
// Peran tertinggi (satu-satunya yang boleh membuka Monitor & mengelola SUPERADMIN).
const SUPERADMIN_ROLES = ['SUPERADMIN'];

function isAdmin(user) {
  return Boolean(user && ADMIN_ROLES.includes(user.role));
}

function isSuperAdmin(user) {
  return Boolean(user && SUPERADMIN_ROLES.includes(user.role));
}

/** Filter Prisma untuk AkulakuAccount sesuai hak akses user. */
function accountScope(user, extra = {}) {
  if (isAdmin(user)) return { ...extra };
  return { ...extra, ownerId: BigInt(user.id) };
}

/** Filter Prisma untuk model yang punya relasi `account`. */
function accountRelationScope(user, extra = {}) {
  if (isAdmin(user)) return { ...extra };
  return { ...extra, account: { ownerId: BigInt(user.id) } };
}

/**
 * Pastikan user boleh mengakses akun tertentu. Melempar 403 bila bukan pemilik
 * dan bukan admin. Mengembalikan data akun (dengan ownerId) bila boleh.
 */
async function assertAccountAccess(prisma, user, accountId) {
  const createError = require('http-errors');
  const account = await prisma.akulakuAccount.findUnique({
    where: { id: BigInt(accountId) },
    select: { id: true, ownerId: true, label: true, status: true },
  });
  if (!account) throw createError(404, 'Akun Akulaku tidak ditemukan');
  // Tanpa `user` (dipanggil dari job/worker internal) = tanpa pembatasan.
  if (!user) return account;
  if (!isAdmin(user) && String(account.ownerId ?? '') !== String(user.id)) {
    throw createError(403, 'Anda tidak punya akses ke akun ini');
  }
  return account;
}

/** Daftar id akun yang boleh diakses user (untuk filter IN clause). */
async function accessibleAccountIds(prisma, user) {
  const accounts = await prisma.akulakuAccount.findMany({
    where: accountScope(user),
    select: { id: true },
  });
  return accounts.map((a) => a.id);
}

module.exports = {
  isAdmin,
  isSuperAdmin,
  accountScope,
  accountRelationScope,
  assertAccountAccess,
  accessibleAccountIds,
  ADMIN_ROLES,
  SUPERADMIN_ROLES,
};
