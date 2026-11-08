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

const CONFIG = {
  baseUrl: process.env.AKULAKU_BASE_URL || 'https://seller.akulaku.com',
  loginPath: process.env.AKULAKU_LOGIN_PATH || '/login',
  usernameSelector: process.env.AKULAKU_USERNAME_SELECTOR || 'input[name="username"], input[type="email"]',
  passwordSelector: process.env.AKULAKU_PASSWORD_SELECTOR || 'input[type="password"]',
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

  try {
    await page.goto(`${CONFIG.baseUrl}${CONFIG.loginPath}`, { waitUntil: 'domcontentloaded', timeout: 60000 });

    const needLogin = CONFIG.loggedInSelector
      ? (await page.locator(CONFIG.loggedInSelector).count()) === 0
      : page.url().includes(CONFIG.loginPath);

    if (needLogin) {
      await page.fill(CONFIG.usernameSelector, username);
      await page.fill(CONFIG.passwordSelector, password);
      await page.click(CONFIG.submitSelector);
      await page.waitForLoadState('networkidle', { timeout: 60000 });
    }

    await saveSessionState(accountId, await context.storageState(), 'valid');
    return { browser, context, page };
  } catch (err) {
    await browser.close();
    await saveSessionState(accountId, {}, 'expired');
    throw err;
  }
}

module.exports = {
  CONFIG,
  getAccountCredentials,
  getSessionState,
  saveSessionState,
  openLoggedInContext,
};

