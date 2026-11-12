// Backend/src/services/violationService.js
/**
 * Sinkronisasi & pembacaan catatan pelanggaran toko Akulaku.
 *
 * Sumber (API internal Seller Center, cookie-based, dari konteks login):
 *   GET /bapi/vendor/index/violation/getIntegralDetail       -> skor toko + periode
 *   GET /bapi/vendor/index/violation/getLastPenaltyRecords   -> riwayat hukuman
 *   GET /bapi/vendor/shop/violation/violationTypeList        -> katalog jenis pelanggaran + skor/denda
 *   GET /bapi/vendor/shop/violation/violationPeriodTotal     -> total periode
 *
 * Catatan: `violationTypeList` berisi KATALOG jenis pelanggaran. Nilai
 * `negativeScore` / `negativeMoney` terisi hanya bila toko benar-benar melanggar
 * jenis tersebut pada periode berjalan.
 */
const createError = require('http-errors');
const { openLoggedInContext, CONFIG } = require('./akulakuBrowser');
const { isAdmin, assertAccountAccess } = require('../utils/scope');
const prisma = require('../lib/prisma');

const API = {
  integral: process.env.AKULAKU_VIOLATION_INTEGRAL_API || '/bapi/vendor/index/violation/getIntegralDetail',
  penalties: process.env.AKULAKU_VIOLATION_PENALTIES_API || '/bapi/vendor/index/violation/getLastPenaltyRecords',
  types: process.env.AKULAKU_VIOLATION_TYPES_API || '/bapi/vendor/shop/violation/violationTypeList',
  periodTotal: process.env.AKULAKU_VIOLATION_PERIOD_API || '/bapi/vendor/shop/violation/violationPeriodTotal',
};

const CATEGORY_LABEL = {
  73: 'Pesanan',
  74: 'Produk',
  75: 'Layanan',
  76: 'Keuangan',
};

/**
 * Ambil data pelanggaran dengan MENGINTERSEP respons asli halaman.
 * Cara ini paling andal karena UI memanggil API dengan parameter & header yang benar
 * (memanggil manual bisa ditolak / mengembalikan data kosong).
 */
async function captureViolationData(page, { timeoutMs = 25000 } = {}) {
  const captured = { integral: null, penalties: null, types: null, periodTotal: null };

  const onResponse = async (res) => {
    const u = res.url();
    try {
      if (u.includes('/violation/getIntegralDetail') && !captured.integral) {
        captured.integral = await res.json();
      } else if (u.includes('/violation/getLastPenaltyRecords') && !captured.penalties) {
        captured.penalties = await res.json();
      } else if (u.includes('/violation/violationTypeList') && !captured.types) {
        captured.types = await res.json();
      } else if (u.includes('/violation/violationPeriodTotal') && !captured.periodTotal) {
        captured.periodTotal = await res.json();
      }
    } catch {
      /* bukan JSON */
    }
  };

  page.on('response', onResponse);

  try {
    await page.goto(`${CONFIG.baseUrl}/management/sellerRulesCenter/sellerViolation`, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
    await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});

    // Tunggu sampai data penting tertangkap (maks timeoutMs).
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (captured.integral && captured.types) break;
      await page.waitForTimeout(700);
    }

    // Pemicu tambahan bila belum lengkap: klik tab "Cek Detail"/"Riwayat Pelanggaran".
    if (!captured.types) {
      await page
        .evaluate(() => {
          const el = [...document.querySelectorAll('*')].find(
            (e) => /cek detail|riwayat pelanggaran/i.test((e.innerText || '').trim()) && (e.innerText || '').length < 40,
          );
          if (el) el.click();
        })
        .catch(() => {});
      await page.waitForTimeout(4000);
    }
  } finally {
    page.off('response', onResponse);
  }

  return captured;
}

function tsToDate(v) {
  if (!v) return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return new Date(n);
}

/** Tentukan tingkat keparahan berdasarkan skor/denda yang tercatat. */
function severityOf(score, money) {
  const s = Number(score ?? 0);
  const m = Number(money ?? 0);
  if (s <= 0 && m <= 0) return 'info';
  if (s >= 10 || m >= 1000000) return 'critical';
  if (s >= 4 || m >= 100000) return 'warning';
  return 'warning';
}

/**
 * Sinkronkan pelanggaran satu akun. Mengembalikan ringkasan hasil.
 * `user` dipakai untuk cek akses (bila diberikan).
 */
async function syncViolationsForAccount(accountId, { user } = {}) {
  if (user) await assertAccountAccess(prisma, user, accountId);

  const { browser, page } = await openLoggedInContext(accountId);
  try {
    // Intersep respons asli halaman pelanggaran (parameter & header yang benar).
    const raw = await captureViolationData(page);
    const integral = raw.integral?.data ?? {};
    const typeList = raw.types?.data ?? {};
    const penalties = raw.penalties?.data ?? [];

    const periodStart = tsToDate(typeList.startTime);
    const periodEnd = tsToDate(typeList.endTime);

    const dtoList = Array.isArray(typeList.violationTypeDTOList) ? typeList.violationTypeDTOList : [];

    // Simpan/hitung pelanggaran yang BENAR-BENAR tercatat (skor/denda > 0).
    let recorded = 0;
    for (const d of dtoList) {
      const score = d.negativeScore != null ? Number(d.negativeScore) : null;
      const money = d.negativeMoney != null ? Number(d.negativeMoney) : null;
      const key = `${d.firstClassificationId}:${d.secondClassificationId}`;

      await prisma.violation.upsert({
        where: { accountId_violationKey: { accountId: BigInt(accountId), violationKey: key } },
        create: {
          accountId: BigInt(accountId),
          violationKey: key,
          name: d.secondLevelName || d.noteDetail || key,
          category: CATEGORY_LABEL[d.firstClassificationId] ?? `Kategori ${d.firstClassificationId}`,
          note: d.noteDetail ?? null,
          score,
          penalty: money != null ? String(money) : null,
          count: d.expression != null ? Number(d.expression) : null,
          severity: severityOf(score, money),
          periodStart,
          periodEnd,
          rawPayload: d,
        },
        update: {
          name: d.secondLevelName || d.noteDetail || key,
          category: CATEGORY_LABEL[d.firstClassificationId] ?? `Kategori ${d.firstClassificationId}`,
          note: d.noteDetail ?? null,
          score,
          penalty: money != null ? String(money) : null,
          count: d.expression != null ? Number(d.expression) : null,
          severity: severityOf(score, money),
          periodStart,
          periodEnd,
          rawPayload: d,
        },
      });
      if (Number(score ?? 0) > 0 || Number(money ?? 0) > 0) recorded += 1;
    }

    // Ringkasan snapshot.
    const totalScore = typeList.totalScore != null ? Number(typeList.totalScore) : null;
    const totalPenalty = typeList.totalMoney != null ? Number(typeList.totalMoney) : null;
    const summary = await prisma.violationSummary.create({
      data: {
        accountId: BigInt(accountId),
        shopScore: integral.shopIntegral != null ? Number(integral.shopIntegral) : null,
        totalScore,
        totalPenalty: totalPenalty != null ? String(totalPenalty) : null,
        violationCount: recorded,
        condition: recorded === 0 ? 'sangat baik' : 'perlu perhatian',
        assessmentCycle: integral.assessmentCycle ?? null,
        rawPayload: { integral, periodTotal: raw.periodTotal?.data ?? null, penalties },
      },
    });

    return {
      accountId: String(accountId),
      syncedAt: summary.capturedAt,
      shopScore: summary.shopScore,
      totalScore: summary.totalScore,
      totalPenalty: summary.totalPenalty,
      violationCount: recorded,
      catalogSize: dtoList.length,
      penaltyRecords: Array.isArray(penalties) ? penalties.length : 0,
      assessmentCycle: summary.assessmentCycle,
      condition: summary.condition,
    };
  } finally {
    await browser.close().catch(() => {});
  }
}

/** Sinkronkan semua akun yang boleh diakses user. */
async function syncAllViolations({ user } = {}) {
  const where = isAdmin(user) ? {} : { ownerId: BigInt(user.id) };
  const accounts = await prisma.akulakuAccount.findMany({
    where: { ...where, status: 'active' },
    select: { id: true, label: true },
  });

  const results = [];
  for (const acc of accounts) {
    try {
      const r = await syncViolationsForAccount(acc.id);
      results.push({ ...r, label: acc.label, ok: true });
    } catch (err) {
      results.push({ accountId: acc.id.toString(), label: acc.label, ok: false, error: String(err.message || err).slice(0, 300) });
    }
  }
  return { synced: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length, results };
}

/** Ringkasan pelanggaran terkini per akun (untuk halaman Pelanggaran). */
async function listViolationOverview({ user, accountId } = {}) {
  if (accountId && user) await assertAccountAccess(prisma, user, accountId);

  // Tanpa `user` = konteks internal (semua akun). Admin = semua. Pegawai = miliknya.
  const accountWhere = accountId
    ? { id: BigInt(accountId) }
    : !user || isAdmin(user)
      ? {}
      : { ownerId: BigInt(user.id) };

  const accounts = await prisma.akulakuAccount.findMany({
    where: accountWhere,
    select: {
      id: true,
      label: true,
      status: true,
      owner: { select: { name: true, email: true } },
      violationSummaries: { orderBy: { capturedAt: 'desc' }, take: 1 },
      _count: { select: { violations: true } },
    },
    orderBy: { id: 'asc' },
  });

  return accounts.map((a) => {
    const s = a.violationSummaries?.[0] ?? null;
    return {
      accountId: a.id.toString(),
      label: a.label,
      status: a.status,
      ownerName: a.owner?.name ?? null,
      ownerEmail: a.owner?.email ?? null,
      shopScore: s?.shopScore ?? null,
      totalScore: s?.totalScore ?? null,
      totalPenalty: s?.totalPenalty ? s.totalPenalty.toString() : null,
      violationCount: s?.violationCount ?? 0,
      condition: s?.condition ?? null,
      assessmentCycle: s?.assessmentCycle ?? null,
      lastCheckedAt: s?.capturedAt ?? null,
      catalogSize: a._count?.violations ?? 0,
    };
  });
}

/** Riwayat snapshot satu akun (tren). */
async function getViolationHistory(accountId, { user, limit = 30 } = {}) {
  if (user) await assertAccountAccess(prisma, user, accountId);
  const rows = await prisma.violationSummary.findMany({
    where: { accountId: BigInt(accountId) },
    orderBy: { capturedAt: 'desc' },
    take: limit,
  });
  return rows.map((r) => ({
    id: r.id.toString(),
    shopScore: r.shopScore,
    totalScore: r.totalScore,
    totalPenalty: r.totalPenalty ? r.totalPenalty.toString() : null,
    violationCount: r.violationCount,
    condition: r.condition,
    assessmentCycle: r.assessmentCycle,
    capturedAt: r.capturedAt,
  }));
}

/** Detail jenis pelanggaran satu akun (katalog + yang tercatat). */
async function getViolationDetails(accountId, { user } = {}) {
  if (user) await assertAccountAccess(prisma, user, accountId);
  const rows = await prisma.violation.findMany({
    where: { accountId: BigInt(accountId) },
    orderBy: [{ severity: 'desc' }, { name: 'asc' }],
  });
  return rows.map((v) => ({
    id: v.id.toString(),
    key: v.violationKey,
    name: v.name,
    category: v.category,
    note: v.note,
    score: v.score,
    penalty: v.penalty ? v.penalty.toString() : null,
    count: v.count,
    severity: v.severity,
    periodStart: v.periodStart,
    periodEnd: v.periodEnd,
    detectedAt: v.detectedAt,
  }));
}

module.exports = {
  syncViolationsForAccount,
  syncAllViolations,
  listViolationOverview,
  getViolationHistory,
  getViolationDetails,
  API,
};
