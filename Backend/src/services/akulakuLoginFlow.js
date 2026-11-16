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

/**
 * Baca informasi OTP dari teks halaman: kanal, nomor tersamar, pesan Akulaku,
 * dan hitungan mundur bila ada.
 *
 * Penting: pesan Akulaku biasanya menyebut kanal yang BENAR dipakai
 * (mis. "Kode dikirim ke WhatsApp 08****03"). Tanpa membacanya, pengguna tidak
 * tahu harus menunggu SMS atau WhatsApp.
 */
function extractOtpInfo(bodyText) {
  const text = String(bodyText || '');
  const lower = text.toLowerCase();

  const channels = [];
  if (lower.includes(LOGIN.whatsappText)) channels.push('whatsapp');
  if (lower.includes(LOGIN.smsText)) channels.push('sms');

  const phoneMatch = text.match(/0[0-9*]{6,}/);

  const lines = text.split('\n').map((s) => s.trim()).filter(Boolean);
  const pageMessage =
    lines.find((l) => /(kode|otp|verifikasi)/i.test(l) && /(kirim|dikirim|whatsapp|sms|nomor)/i.test(l)) ||
    lines.find((l) => /(kirim|dikirim)/i.test(l)) ||
    null;

  const cd = text.match(/(\d{1,3})\s*(detik|sec\b|s\b)/i);
  const cooldownSeconds = cd ? Number(cd[1]) : null;

  // Pesan galat dari Akulaku (mis. batas pengiriman).
  const errorLine =
    lines.find((l) => /(terlalu banyak|batas|gagal|tidak terkirim|silakan coba lagi nanti)/i.test(l)) || null;

  return {
    channels,
    phoneHint: phoneMatch ? phoneMatch[0] : null,
    pageMessage,
    cooldownSeconds,
    errorLine,
  };
}
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

  const info = extractOtpInfo(bodyText);

  if (!onLogin && !hasPasswordField) {
    return { state: 'success' };
  }
  if (otpInputs > 0 || lower.includes(LOGIN.otpText) || info.channels.length > 0) {
    return { state: 'otp_required', ...info };
  }
  return {
    state: 'pending',
    message: 'Halaman login belum selesai. Coba lanjutkan / ulangi.',
    ...info,
  };
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

    // Catat waktu permintaan OTP (jeda kirim ulang).
    if (detected.state === 'otp_required') flow.lastOtpSentAt = Date.now();

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

/**
 * Klik kontrol "kirim (ulang) OTP" untuk kanal tertentu.
 *
 * Sebelumnya kode mengklik elemen APA PUN yang teksnya mengandung "sms",
 * yang bisa berarti tab, label, atau tautan "ganti nomor". Sekarang:
 *  - hanya elemen button/a dengan teks pendek (<= 40 karakter),
 *  - mengandung kata kanal,
 *  - TIDAK mengandung kata yang menandakan aksi lain (ganti/ubah/nomor lain).
 * Mengembalikan { clicked, text } agar bisa ditampilkan di UI.
 */
async function clickResendChannel(page, channel) {
  const want = channel === 'whatsapp' ? 'whatsapp' : 'sms';
  return page
    .evaluate((wantChannel) => {
      const els = [...document.querySelectorAll('button, a, [role="button"]')];
      const bad = /(ganti|ubah|nomor lain|nomor baru|daftar|bantuan|lupa)/i;
      for (const el of els) {
        const t = (el.innerText || '').trim();
        if (!t || t.length > 40) continue;
        const lower = t.toLowerCase();
        if (!lower.includes(wantChannel)) continue;
        if (bad.test(lower)) continue;
        el.click();
        return { clicked: true, text: t };
      }
      return { clicked: false, text: null };
    }, want)
    .catch(() => ({ clicked: false, text: null }));
}

/** Jeda minimum antar permintaan OTP agar tidak dianggap spam oleh Akulaku. */
const RESEND_COOLDOWN_MS = Number(process.env.AKULAKU_OTP_RESEND_COOLDOWN_MS || 60000);

/**
 * Kirim (ulang) OTP untuk kanal tertentu, dengan jeda.
 * Mengembalikan { state, channels?, phoneHint?, pageMessage?, cooldownSeconds?, clickedText? }.
 */
async function resendOtp(accountId, channel = 'sms') {
  const key = String(accountId);
  const flow = flows.get(key);
  if (!flow) throw createError(400, 'Tidak ada proses login yang berjalan. Klik Login Akulaku dulu.');
  if (!isFlowAlive(flow)) {
    await closeFlow(key);
    throw browserGoneError();
  }

  const now = Date.now();
  const last = flow.lastOtpSentAt || 0;
  const sisa = Math.ceil((RESEND_COOLDOWN_MS - (now - last)) / 1000);
  if (sisa > 0) {
    return {
      state: 'cooldown',
      message: `Tunggu ${sisa} detik sebelum meminta kode lagi (batas pengiriman Akulaku).`,
      cooldownSeconds: sisa,
    };
  }

  const clickedRes = await clickResendChannel(page_(flow), channel);
  flow.lastOtpSentAt = Date.now();
  await page_(flow).waitForTimeout(3000);

  const detected = await detectState(page_(flow));
  return {
    ...detected,
    clickedText: clickedRes.text,
    requestedChannel: channel,
    // Bila tombol kanal tidak ditemukan, Akulaku mungkin hanya mendukung kanal lain.
    note: clickedRes.clicked
      ? `Permintaan kirim ulang via ${channel.toUpperCase()} dikirim.`
      : `Tombol "${channel.toUpperCase()}" tidak ditemukan di halaman. Cek pesan Akulaku di bawah untuk kanal yang benar.`,
  };
}

function page_(flow) {
  return flow.page;
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
    // Catat waktu permintaan OTP (untuk jeda kirim ulang).
    if (!flow.lastOtpSentAt) flow.lastOtpSentAt = Date.now();

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

module.exports = {
  startLogin,
  submitOtp,
  resendOtp,
  cancelLogin,
  closeAllFlows,
  LOGIN,
  isFlowAlive,
  extractOtpInfo,
};
