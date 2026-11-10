// Backend/src/services/akulakuBrowser.js
/**
 * Sesi browser Playwright ke Akulaku Seller Center.
 *
 * CATATAN PENTING:
 * Akulaku tidak menyediakan API publik untuk posting produk / ambil order.
 * Semua aksi di sini meniru UI Seller Center. Selektor UI Akulaku bisa berubah
 * kapan saja, jadi semua selektor & URL dikonfigurasi lewat env (lihat bawah)
 * supaya bisa diperbaiki tanpa ubah kode.
 *
 * Kalau `playwright` belum terpasang, modul ini tetap bisa di-require; error
 * baru muncul ketika fungsi dijalankan.
 */
const createError = require('http-errors');
const { decryptSecret } = require('../utils/crypto');

const prisma = require('../lib/prisma');

// Berdasarkan inspeksi UI asli (Nov 2026):
//   merchant.akulaku.com -> redirect ke https://ec-vendor.akulaku.com/ec-vendor
//   Halaman login: /user/login
//   Email: #login_email | Password: #login_pwd | Submit: button[type="submit"]
// CATATAN: setelah submit, Akulaku meminta OTP ke nomor HP terdaftar. Karena itu
// login interaktif cukup SEKALI lewat `npm run akulaku:login` (headed), lalu
// storage state disimpan dan dipakai ulang oleh otomasi (headless).
const CONFIG = {
  baseUrl: process.env.AKULAKU_BASE_URL || 'https://ec-vendor.akulaku.com/ec-vendor',
  loginPath: process.env.AKULAKU_LOGIN_PATH || '/user/login',
  usernameSelector: process.env.AKULAKU_USERNAME_SELECTOR || '#login_email',
  passwordSelector: process.env.AKULAKU_PASSWORD_SELECTOR || '#login_pwd',
  submitSelector: process.env.AKULAKU_LOGIN_SUBMIT_SELECTOR || 'button[type="submit"]',
  loggedInSelector: process.env.AKULAKU_LOGGED_IN_SELECTOR || '',
  headless: process.env.AKULAKU_HEADLESS !== 'false',
};

function loadPlaywright() {
  try {
    return require('playwright');
  } catch {
    throw createError(
      500,
      'Playwright belum terpasang. Jalankan: npm i playwright && npx playwright install --with-deps chromium',
    );
  }
}

async function getAccountCredentials(accountId) {
  const account = await prisma.akulakuAccount.findUnique({ where: { id: BigInt(accountId) } });
  if (!account) throw createError(404, 'Akun Akulaku tidak ditemukan');
  return {
    account,
    username: account.username,
    password: decryptSecret(account.passwordEnc),
  };
}

async function getSessionState(accountId) {
  const session = await prisma.akulakuSession.findUnique({ where: { accountId: BigInt(accountId) } });
  if (!session?.stateEnc) return null;
  try {
    return JSON.parse(decryptSecret(session.stateEnc));
  } catch {
    return null;
  }
}

async function saveSessionState(accountId, state, status = 'valid') {
  const { encryptSecret } = require('../utils/crypto');
  const stateEnc = encryptSecret(JSON.stringify(state));
  await prisma.akulakuSession.upsert({
    where: { accountId: BigInt(accountId) },
    create: { accountId: BigInt(accountId), stateEnc, status },
    update: { stateEnc, status },
  });
}

/**
 * Buka browser + context dengan storage state akun (kalau ada), lalu login bila perlu.
 * Mengembalikan { browser, context, page }.
 */
async function openLoggedInContext(accountId) {
  const { chromium } = loadPlaywright();
  const { username, password } = await getAccountCredentials(accountId);

  const browser = await chromium.launch({ headless: CONFIG.headless });
  const state = await getSessionState(accountId);
  const context = await browser.newContext({ storageState: state || undefined });
  const page = await context.newPage();

  let attemptedLogin = false;
  try {
    // Buka halaman utama dulu. Kalau sesi masih valid, Akulaku tidak
    // mengarahkan ke halaman login (menghindari race ke /user/login).
    await page.goto(CONFIG.baseUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});

    // Deteksi butuh login: URL mengandung path login ATAU field login tampil.
    const onLoginUrl = page.url().includes(CONFIG.loginPath);
    const loginFieldCount = await page.locator(CONFIG.passwordSelector).count().catch(() => 0);
    const needLogin = CONFIG.loggedInSelector
      ? (await page.locator(CONFIG.loggedInSelector).count()) === 0
      : onLoginUrl || loginFieldCount > 0;

    if (needLogin) {
      // Pastikan berada di halaman login sebelum mengisi form.
      if (!onLoginUrl) {
        await page.goto(`${CONFIG.baseUrl}${CONFIG.loginPath}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
      }
      await page.waitForSelector(CONFIG.passwordSelector, { state: 'visible', timeout: 30000 });
      attemptedLogin = true;
      await page.fill(CONFIG.usernameSelector, username);
      await page.fill(CONFIG.passwordSelector, password);
      await page.click(CONFIG.submitSelector);
      await page.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => {});
    }

    await saveSessionState(accountId, await context.storageState(), 'valid');
    return { browser, context, page };
  } catch (err) {
    await browser.close();
    // Hanya tandai sesi expired bila login otomatis yang gagal. Error lain
    // (network sementara, dsb) tidak boleh menghapus sesi valid yang tersimpan.
    if (attemptedLogin) await saveSessionState(accountId, {}, 'expired');
    throw err;
  }
}

/**
 * Login interaktif (headed). Menunggu user menyelesaikan OTP secara manual,
 * lalu menyimpan storage state terenkripsi ke DB.
 *
 * Dipakai lewat `npm run akulaku:login -- <accountId>`.
 * Mengembalikan { accountId, status, url }.
 */
async function loginInteractively(accountId, { timeoutMs = 10 * 60 * 1000 } = {}) {
  const { chromium } = loadPlaywright();
  const { account, username, password } = await getAccountCredentials(accountId);

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto(`${CONFIG.baseUrl}${CONFIG.loginPath}`, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });

    await page.fill(CONFIG.usernameSelector, username);
    await page.fill(CONFIG.passwordSelector, password);
    await page.click(CONFIG.submitSelector);

    console.log('\n[akulaku] Kredensial dikirim. Kalau muncul permintaan OTP,');
    console.log('[akulaku] selesaikan di jendela browser (kode dikirim ke HP terdaftar).');
    console.log('[akulaku] Menunggu login selesai...\n');

    // Tunggu sampai URL keluar dari halaman login (artinya OTP lolos / login sukses).
    await page.waitForFunction(
      (loginPath) => !location.pathname.includes(loginPath),
      CONFIG.loginPath,
      { timeout: timeoutMs },
    );
    await page.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => {});

    const state = await context.storageState();
    if (!state.cookies?.length) {
      throw createError(500, 'Login tampak berhasil tapi tidak ada cookie sesi yang tersimpan');
    }
    await saveSessionState(accountId, state, 'valid');

    return { accountId: BigInt(accountId).toString(), label: account.label, status: 'valid', url: page.url() };
  } catch (err) {
    await saveSessionState(accountId, {}, 'expired');
    throw err;
  } finally {
    await browser.close();
  }
}

module.exports = {
  CONFIG,
  getAccountCredentials,
  getSessionState,
  saveSessionState,
  openLoggedInContext,
  loginInteractively,
  loadPlaywright,
};

