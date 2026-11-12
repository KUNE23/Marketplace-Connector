// Backend/src/services/akulakuLoginFlow.js
/**
 * Alur login Akulaku lewat aplikasi (bisa dari VPS, tanpa layar):
 *   1) startLogin(accountId)  -> buka browser headless, isi kredensial, submit.
 *      - Kalau Akulaku langsung masuk (tanpa OTP) -> sesi disimpan, state 'success'.
 *      - Kalau muncul verifikasi OTP -> state 'otp_required' (browser ditahan hidup).
 *   2) submitOtp(accountId, code, channel) -> ketik kode OTP ke browser, submit.
 *   3) cancelLogin(accountId) -> tutup browser & buang state.
 *
 * Selektor & teks dikonfigurasi lewat env supaya mudah diperbaiki tanpa ubah kode.
 */
const createError = require('http-errors');
const {
  CONFIG,
  getAccountCredentials,
  saveSessionState,
  loadPlaywright,
  assertBrowserInstalled,
} = require('./akulakuBrowser');

const LOGIN = {
  otpInput:
    process.env.AKULAKU_OTP_INPUT_SELECTOR ||
    'input[maxlength="1"], input#code, input[name="code"], input[name="otp"], input[inputmode="numeric"]',
  otpSubmit: process.env.AKULAKU_OTP_SUBMIT_SELECTOR || '',
  otpText: process.env.AKULAKU_OTP_TEXT || 'verifikasi keamanan',
  whatsappText: process.env.AKULAKU_OTP_WHATSAPP_TEXT || 'whatsapp',
  smsText: process.env.AKULAKU_OTP_SMS_TEXT || 'sms',
};

const TTL_MS = Number(process.env.AKULAKU_LOGIN_TTL_MS || 10 * 60 * 1000);

/** accountId(string) -> { browser, context, page, createdAt, timer } */
const flows = new Map();

async function closeFlow(accountId) {
  const flow = flows.get(accountId);
  if (!flow) return;
  flows.delete(accountId);
  if (flow.timer) clearTimeout(flow.timer);
  try {
    await flow.browser.close();
  } catch {
    /* abaikan */
  }
}

/** Apakah browser masih hidup? Playwright tidak sediakan flag, cek lewat page. */
function isFlowAlive(flow) {
  try {
    return Boolean(flow?.browser?.isConnected?.());
  } catch {
    return false;
  }
}

/** Pesan error seragam saat browser server mati / ditutup di tengah alur OTP. */
function browserGoneError() {
  return createError(
    409,
    'Browser login Akulaku sudah tertutup. Klik "Login Akulaku" lagi untuk memulai ulang proses OTP.',
  );
}

async function closeAllFlows() {
  for (const id of [...flows.keys()]) await closeFlow(id);
}

/** Baca kondisi halaman: sudah masuk? butuh OTP? */
async function detectState(page) {
  // page.url() ikut melempar bila page/context sudah ditutup.
  const url = (() => {
    try {
      return page.url();
    } catch {
      return '';
    }
  })();
  const onLogin = url.includes(CONFIG.loginPath);
  const hasPasswordField = (await page.locator(CONFIG.passwordSelector).count().catch(() => 0)) > 0;
  const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 3000)).catch(() => '');
  const lower = bodyText.toLowerCase();
  const otpInputs = await page.locator(LOGIN.otpInput).count().catch(() => 0);

  const channels = [];
  if (lower.includes(LOGIN.whatsappText)) channels.push('whatsapp');
  if (lower.includes(LOGIN.smsText)) channels.push('sms');

  // Nomor HP yang ditampilkan (mis. 08*********03)
  const phoneMatch = bodyText.match(/0[0-9*]{6,}/);

  if (!onLogin && !hasPasswordField) {
    return { state: 'success' };
  }
  if (otpInputs > 0 || lower.includes(LOGIN.otpText) || channels.length > 0) {
    return { state: 'otp_required', channels, phoneHint: phoneMatch ? phoneMatch[0] : null };
  }
  return { state: 'pending', message: 'Halaman login belum selesai. Coba lanjutkan / ulangi.' };
}

/**
 * Mulai proses login. Mengembalikan { state, channels?, phoneHint?, message? }.
 */
async function startLogin(accountId) {
  const key = String(accountId);
  await closeFlow(key); // mulai bersih kalau ada proses sebelumnya

  assertBrowserInstalled();
  const { chromium } = loadPlaywright();
  const { account, username, password } = await getAccountCredentials(accountId);

  const browser = await chromium.launch({ headless: CONFIG.headless });
  const context = await browser.newContext(); // fresh: memaksa alur login
  const page = await context.newPage();

  const flow = { browser, context, page, createdAt: Date.now(), timer: null };
  flow.timer = setTimeout(() => closeFlow(key).catch(() => {}), TTL_MS);
  flows.set(key, flow);

  try {
    await page.goto(`${CONFIG.baseUrl}${CONFIG.loginPath}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector(CONFIG.passwordSelector, { state: 'visible', timeout: 30000 });
    await page.fill(CONFIG.usernameSelector, username);
    await page.fill(CONFIG.passwordSelector, password);
    await page.click(CONFIG.submitSelector);
    await page.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(2500);

    const detected = await detectState(page);

    if (detected.state === 'success') {
      const state = await context.storageState();
      if (!state.cookies?.length) {
        throw createError(500, 'Login berhasil tapi tidak ada cookie sesi yang tersimpan');
      }
      await saveSessionState(accountId, state, 'valid');
      await closeFlow(key);
      return { state: 'success', message: `Login ${account.label} berhasil, sesi tersimpan.` };
    }

    // state 'otp_required' / 'pending': PERTAHANKAN browser hidup supaya user
    // bisa mengirim OTP ke halaman yang sama. Jangan tandai sesi expired di sini.
    return detected;
  } catch (err) {
    await closeFlow(key);
    throw normalizeBrowserError(err);
  }
}

/**
 * Ubah error Playwright yang tidak informatif ("Target page, context or browser
 * has been closed") jadi pesan yang bisa ditindaklanjuti di UI.
 */
function normalizeBrowserError(err) {
  const msg = String(err?.message || '');
  if (/has been closed|Target closed|browser has been closed/i.test(msg)) {
    return browserGoneError();
  }
  return err;
}

/** Ketik kode OTP ke halaman, lalu submit. */
async function submitOtp(accountId, code, channel) {
  const key = String(accountId);
  const flow = flows.get(key);
  if (!flow) throw createError(400, 'Tidak ada proses login yang berjalan. Klik Login Akulaku dulu.');
  // Browser bisa mati (TTL habis / crash) di antara startLogin dan submitOtp.
  // Tanpa cek ini, operasi pertama akan melempar "Target page ... closed".
  if (!isFlowAlive(flow)) {
    await closeFlow(key);
    throw browserGoneError();
  }

  const { context, page } = flow;
  try {
    // Opsional: pilih kanal pengiriman ulang (whatsapp/sms) kalau tombolnya ada.
    if (channel === 'whatsapp' || channel === 'sms') {
      const label = channel === 'whatsapp' ? /whatsapp/i : /sms/i;
      const btn = page.locator('button, a').filter({ hasText: label }).first();
      if (await btn.count().catch(() => 0)) {
        await btn.click().catch(() => {});
        await page.waitForTimeout(2000);
      }
    }

    const inputs = page.locator(LOGIN.otpInput);
    const count = await inputs.count().catch(() => 0);
    if (count === 0) {
      return { state: 'pending', message: 'Kolom OTP tidak ditemukan di halaman Akulaku.' };
    }

    if (count > 1) {
      // Beberapa kotak digit
      const digits = String(code).replace(/\D/g, '').split('');
      for (let i = 0; i < digits.length && i < count; i++) {
        await inputs.nth(i).fill(digits[i]).catch(() => {});
      }
    } else {
      await inputs.first().fill(String(code)).catch(() => {});
    }

    if (LOGIN.otpSubmit) {
      await page.click(LOGIN.otpSubmit).catch(() => {});
    } else {
      await page.keyboard.press('Enter').catch(() => {});
    }

    await page.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(2500);

    const detected = await detectState(page);
    if (detected.state === 'success') {
      const state = await context.storageState();
      await saveSessionState(accountId, state, 'valid');
      await closeFlow(key);
      return { state: 'success', message: 'Verifikasi berhasil. Sesi tersimpan.' };
    }
    if (detected.state === 'otp_required') {
      // Kode salah/expired: browser TETAP hidup, sesi valid tidak disentuh.
      return { state: 'otp_required', channels: detected.channels, phoneHint: detected.phoneHint, message: 'Kode belum diterima. Periksa lagi / minta kode baru.' };
    }
    return detected;
  } catch (err) {
    await closeFlow(key);
    throw normalizeBrowserError(err);
  }
}

async function cancelLogin(accountId) {
  await closeFlow(String(accountId));
  return true;
}

module.exports = { startLogin, submitOtp, cancelLogin, closeAllFlows, LOGIN, isFlowAlive };
