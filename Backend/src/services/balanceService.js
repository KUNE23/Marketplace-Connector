// Backend/src/services/balanceService.js
/**
 * Saldo akun Akulaku.
 *
 * Ada dua bagian:
 *   1) Baca/tulis data saldo yang TERSIMPAN (dipakai API & UI).
 *   2) `syncBalanceFromAkulaku()` — mengambil saldo terbaru dari Seller Center.
 *
 * Catatan penting tentang bagian (2):
 *   Endpoint saldo Akulaku belum dipetakan (butuh sesi login aktif untuk
 *   menelusuri menu "Manajemen Keuangan"). Saat ini fungsi itu memakai
 *   `AKULAKU_BALANCE_API` bila disediakan lewat env, dan mengembalikan
 *   `not_configured` bila belum. Data saldo tetap bisa diisi lewat
 *   `setManualBalance()` (input manual SUPERADMIN) sampai pemetaan selesai.
 */
const createError = require('http-errors');
const prisma = require('../lib/prisma');
const { isAdmin } = require('../utils/scope');

const BALANCE_API = process.env.AKULAKU_BALANCE_API || '';

function toNum(v) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function serialize(balance) {
  if (!balance) return null;
  const available = toNum(balance.available);
  const pending = toNum(balance.pending);
  return {
    accountId: balance.accountId.toString(),
    accountLabel: balance.account?.label ?? null,
    available,
    pending,
    total: toNum(balance.total),
    currency: balance.currency ?? 'IDR',
    note: balance.note ?? null,
    lastSyncedAt: balance.lastSyncedAt,
    syncError: balance.syncError ?? null,
    updatedAt: balance.updatedAt,
  };
}

/** Daftar saldo semua akun yang boleh diakses user. */
async function listBalances({ user } = {}) {
  const where = isAdmin(user) ? {} : { ownerId: BigInt(user.id) };
  const accounts = await prisma.akulakuAccount.findMany({
    where,
    select: {
      id: true,
      label: true,
      status: true,
      owner: { select: { name: true, email: true } },
      balance: true,
    },
    orderBy: { id: 'asc' },
  });

  const rows = accounts.map((a) => {
    const b = a.balance
      ? serialize({ ...a.balance, account: { label: a.label } })
      : {
          accountId: a.id.toString(),
          accountLabel: a.label,
          available: 0,
          pending: 0,
          total: 0,
          currency: 'IDR',
          note: null,
          lastSyncedAt: null,
          syncError: null,
          updatedAt: null,
        };
    return {
      ...b,
      accountStatus: a.status,
      ownerName: a.owner?.name ?? null,
      ownerEmail: a.owner?.email ?? null,
      neverSynced: !a.balance?.lastSyncedAt,
    };
  });

  const totals = rows.reduce(
    (t, r) => ({
      available: t.available + r.available,
      pending: t.pending + r.pending,
      total: t.total + r.total,
    }),
    { available: 0, pending: 0, total: 0 },
  );

  return {
    balances: rows,
    totals,
    accountsWithoutBalance: rows.filter((r) => r.neverSynced).length,
  };
}

/** Ringkasan saldo untuk dashboard. */
async function getBalanceSummary({ user } = {}) {
  const list = await listBalances({ user });
  const active = list.balances.filter((b) => b.accountStatus === 'active');
  return {
    available: active.reduce((s, b) => s + b.available, 0),
    pending: active.reduce((s, b) => s + b.pending, 0),
    total: active.reduce((s, b) => s + b.total, 0),
    accountCount: active.length,
    lastSyncedAt:
      active
        .map((b) => b.lastSyncedAt)
        .filter(Boolean)
        .sort()
        .pop() ?? null,
  };
}

/** Riwayat snapshot satu akun (untuk grafik). */
async function getBalanceHistory(accountId, { limit = 60 } = {}) {
  const rows = await prisma.balanceSnapshot.findMany({
    where: { accountId: BigInt(accountId) },
    orderBy: { capturedAt: 'desc' },
    take: Math.min(Math.max(Number(limit) || 60, 1), 365),
  });
  return rows.reverse().map((r) => ({
    capturedAt: r.capturedAt,
    available: toNum(r.available),
    pending: toNum(r.pending),
    total: toNum(r.total),
  }));
}

/**
 * Simpan saldo (dipakai sync maupun input manual).
 * Otomatis membuat snapshot bila nilainya berubah.
 */
async function saveBalance(accountId, { available, pending = 0, currency = 'IDR', note, rawPayload } = {}) {
  const avail = toNum(available);
  const pend = toNum(pending);
  const total = avail + pend;
  const id = BigInt(accountId);

  const account = await prisma.akulakuAccount.findUnique({ where: { id }, select: { id: true } });
  if (!account) throw createError(404, 'Akun Akulaku tidak ditemukan');

  const before = await prisma.akulakuBalance.findUnique({ where: { accountId: id } });

  const saved = await prisma.akulakuBalance.upsert({
    where: { accountId: id },
    create: {
      accountId: id,
      available: avail,
      pending: pend,
      total,
      currency,
      note: note ?? null,
      rawPayload: rawPayload ?? undefined,
      lastSyncedAt: new Date(),
      syncError: null,
    },
    update: {
      available: avail,
      pending: pend,
      total,
      currency,
      note: note ?? null,
      rawPayload: rawPayload ?? undefined,
      lastSyncedAt: new Date(),
      syncError: null,
    },
  });

  // Snapshot hanya bila nilainya berubah (hindari riwayat kembar).
  const changed =
    !before || toNum(before.available) !== avail || toNum(before.pending) !== pend;
  if (changed) {
    await prisma.balanceSnapshot.create({
      data: { accountId: id, available: avail, pending: pend, total },
    });
  }

  return serialize(saved);
}

/** Catat kegagalan sync (agar UI bisa menampilkan sebabnya). */
async function recordSyncError(accountId, message) {
  const id = BigInt(accountId);
  const msg = String(message || 'gagal sinkron').slice(0, 500);
  try {
    await prisma.akulakuBalance.upsert({
      where: { accountId: id },
      create: { accountId: id, syncError: msg, lastSyncedAt: new Date() },
      update: { syncError: msg, lastSyncedAt: new Date() },
    });
  } catch {
    /* abaikan */
  }
  return { accountId: String(accountId), syncError: msg };
}

/**
 * Ambil saldo terbaru dari Akulaku.
 *
 * BELUM TERPETAKAN: endpoint saldo Seller Center memerlukan sesi login aktif
 * untuk ditelusuri. Bila `AKULAKU_BALANCE_API` diset, fungsi ini mencoba
 * memanggilnya dari konteks browser yang sudah login.
 */
async function syncBalanceFromAkulaku(accountId, { user } = {}) {
  const { assertAccountAccess } = require('../utils/scope');
  if (user) await assertAccountAccess(prisma, user, accountId);

  if (!BALANCE_API) {
    return {
      accountId: String(accountId),
      status: 'not_configured',
      message:
        'Endpoint saldo Akulaku belum dipetakan. Isi AKULAKU_BALANCE_API setelah menelusuri ' +
        'menu "Manajemen Keuangan" di Seller Center, atau isi saldo manual.',
    };
  }

  const { openLoggedInContext, CONFIG } = require('./akulakuBrowser');
  let browser;
  try {
    const ctx = await openLoggedInContext(accountId);
    browser = ctx.browser;
    const { page } = ctx;

    await page.goto(CONFIG.baseUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});

    const json = await page.evaluate(async (api) => {
      const r = await fetch(api, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      return r.json();
    }, BALANCE_API);

    const d = json?.data ?? json;
    const available = toNum(d?.availableBalance ?? d?.balance ?? d?.available ?? d?.amount);
    const pending = toNum(d?.pendingBalance ?? d?.pending ?? d?.holdAmount);

    const saved = await saveBalance(accountId, {
      available,
      pending,
      rawPayload: json,
    });
    return { accountId: String(accountId), status: 'ok', ...saved };
  } catch (err) {
    await recordSyncError(accountId, err.message || err);
    throw err;
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

/** Isi saldo manual (khusus SUPERADMIN/ADMIN) — jalan sementara sebelum sync tersedia. */
async function setManualBalance(accountId, payload, { user } = {}) {
  if (user && !isAdmin(user)) {
    throw createError(403, 'Hanya admin yang dapat mengisi saldo manual');
  }
  return saveBalance(accountId, { ...payload, note: payload?.note ?? 'Input manual' });
}

module.exports = {
  listBalances,
  getBalanceSummary,
  getBalanceHistory,
  saveBalance,
  recordSyncError,
  syncBalanceFromAkulaku,
  setManualBalance,
  BALANCE_API,
};
