// Backend/src/services/remoteBrowserService.js
/**
 * "Buka Akulaku langsung" — browser remote yang sudah login, ditampilkan di UI.
 *
 * CARA KERJA
 *   Server menjalankan Chromium (Playwright) memakai storage state akun yang
 *   tersimpan, lalu mengalirkan tampilan halaman ke browser pengguna memakai
 *   Chrome DevTools Protocol (Page.startScreencast). Masukan pengguna
 *   (mouse/keyboard) dikirim balik lewat Input.dispatch*Event.
 *
 * KENAPA BUKAN VNC
 *   Pendekatan CDP tidak memerlukan Xvfb/x11vnc/websockify, tanpa dependensi
 *   sistem tambahan, lebih hemat memori, dan tetap bekerja pada Chrome headless.
 *
 * KENAPA TIDAK MENYUNTIK COOKIE KE BROWSER PENGGUNA
 *   Cookie sesi Akulaku (b-token, acw_tc) bersifat httpOnly dan terikat domain
 *   akulaku.com. Keduanya tidak dapat ditulis dari JavaScript aplikasi ini.
 *
 * BATASAN (dapat dikonfigurasi lewat env)
 *   REMOTE_MAX_SESSIONS   default 2   — jumlah sesi serentak
 *   REMOTE_IDLE_MS        default 15 menit — sesi ditutup bila tidak aktif
 */
const { randomUUID } = require('crypto');
const createError = require('http-errors');

const MAX_SESSIONS = Math.max(1, Number(process.env.REMOTE_MAX_SESSIONS || 2));
const IDLE_MS = Math.max(60000, Number(process.env.REMOTE_IDLE_MS || 15 * 60 * 1000));
const VIEWPORT = {
  width: Number(process.env.REMOTE_VIEWPORT_WIDTH || 1366),
  height: Number(process.env.REMOTE_VIEWPORT_HEIGHT || 768),
};
const QUALITY = Math.min(Math.max(Number(process.env.REMOTE_JPEG_QUALITY || 60), 20), 90);

/** sessionId -> sesi aktif. */
const sessions = new Map();

let sweeper = null;

function touch(session) {
  if (!session) return;
  session.lastActivity = Date.now();
}

/** Daftar sesi aktif (aman untuk ditampilkan di UI). */
function listSessions() {
  return [...sessions.values()].map((s) => ({
    sessionId: s.id,
    accountId: s.accountId,
    accountLabel: s.accountLabel,
    ownerId: s.ownerId,
    startedAt: new Date(s.startedAt).toISOString(),
    idleMs: Date.now() - s.lastActivity,
    viewers: s.viewers.size,
    url: s.currentUrl,
    needsLogin: Boolean(s.needsLogin),
  }));
}

/**
 * Mulai sesi browser remote.
 *
 * Bila sesi Akulaku masih valid -> langsung membuka halaman yang sudah login.
 * Bila sesi sudah kedaluwarsa -> browser tetap dibuka di HALAMAN LOGIN Supaya
 * pengguna dapat masuk manual (termasuk OTP) langsung dari UI. Setelah berhasil,
 * panggil `saveSessionFromRemote()` untuk menyimpan sesinya.
 */
async function startSession(accountId, { user, allowLoginFallback = true } = {}) {
  if (sessions.size >= MAX_SESSIONS) {
    const active = listSessions();
    throw createError(429, `Maksimal ${MAX_SESSIONS} sesi bersamaan. Tutup sesi lain dulu.`, {
      active,
    });
  }

  const {
    CONFIG,
    loadPlaywright,
    assertBrowserInstalled,
    getSessionState,
    getAccountCredentials,
    saveSessionState,
  } = require('./akulakuBrowser');
  const prisma = require('../lib/prisma');

  const account = await prisma.akulakuAccount.findUnique({
    where: { id: BigInt(accountId) },
    select: { id: true, label: true },
  });
  if (!account) throw createError(404, 'Akun Akulaku tidak ditemukan');

  let browser;
  let context;
  let page;
  let needsLogin = false;
  let loginError = null;
  let session_credentialsFilled = false;

  // PENTING: JANGAN memakai openLoggedInContext() di sini.
  // Fungsi itu mencoba login otomatis lalu memverifikasi ulang, yang memakan
  // sampai ~2 menit sebelum akhirnya gagal. Untuk browser remote kita hanya
  // perlu TAHU apakah sesi masih hidup, lalu langsung tampilkan halaman login
  // bila sudah berakhir.
  assertBrowserInstalled();
  const { chromium } = loadPlaywright();
  const storedState = await getSessionState(accountId).catch(() => null);

  browser = await chromium.launch({ headless: CONFIG.headless });
  context = await browser.newContext({
    locale: 'id-ID',
    timezoneId: 'Asia/Jakarta',
    viewport: VIEWPORT,
    ...(storedState ? { storageState: storedState } : {}),
  });
  page = await context.newPage();

  // Cek cepat: buka halaman utama, lihat apakah dilempar ke login.
  try {
    await page.goto(CONFIG.baseUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  } catch {
    /* tetap lanjut; dianggap perlu login */
  }

  const onLogin =
    page.url().includes(CONFIG.loginPath) ||
    (await page.locator(CONFIG.passwordSelector).count().catch(() => 0)) > 0;

  if (onLogin) {
    needsLogin = true;
    if (storedState) loginError = 'Sesi tersimpan sudah kedaluwarsa.';

    try {
      await page.goto(`${CONFIG.baseUrl}${CONFIG.loginPath}`, {
        waitUntil: 'domcontentloaded',
        timeout: 45000,
      });
    } catch {
      /* abaikan */
    }

    // Isi otomatis kredensial agar pengguna hanya perlu menangani OTP.
    // Tidak disubmit otomatis: biar pengguna yang memilih kapan meminta kode
    // (menghindari permintaan OTP berulang yang membuat Akulaku memblokir).
    try {
      const cred = await getAccountCredentials(accountId);
      await page.waitForSelector(CONFIG.passwordSelector, { state: 'visible', timeout: 20000 });
      await page.fill(CONFIG.usernameSelector, cred.username);
      await page.fill(CONFIG.passwordSelector, cred.password);
      session_credentialsFilled = true;
    } catch {
      session_credentialsFilled = false;
    }
  } else {
    // Sesi masih hidup: simpan pembaruan cookie agar tetap dipakai otomasi.
    await saveSessionState(accountId, await context.storageState(), 'valid').catch(() => {});
  }

  await page.setViewportSize(VIEWPORT).catch(() => {});

  const id = randomUUID();
  const session = {
    id,
    accountId: account.id.toString(),
    accountLabel: account.label,
    ownerId: user?.id ? String(user.id) : null,
    browser,
    context,
    page,
    client: null,
    viewers: new Set(),
    latestFrame: null,
    frameSeq: 0,
    startedAt: Date.now(),
    lastActivity: Date.now(),
    currentUrl: page.url(),
    needsLogin,
    loginError,
    credentialsFilled: session_credentialsFilled,
    CONFIG,
  };

  // CDP untuk screencast + masukan.
  const client = await context.newCDPSession(page);
  session.client = client;

  client.on('Page.screencastFrame', async (evt) => {
    session.latestFrame = evt.data;
    session.frameSeq += 1;
    session.viewport = {
      width: evt.metadata?.deviceWidth || VIEWPORT.width,
      height: evt.metadata?.deviceHeight || VIEWPORT.height,
    };
    // Wajib di-ack, kalau tidak Chrome berhenti mengirim frame.
    await client.send('Page.screencastFrameAck', { sessionId: evt.sessionId }).catch(() => {});
    // Dorong ke semua penonton.
    for (const push of session.viewers) push();
  });

  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) session.currentUrl = page.url();
  });

  await client.send('Page.enable').catch(() => {});
  await client.send('Page.startScreencast', {
    format: 'jpeg',
    quality: QUALITY,
    maxWidth: VIEWPORT.width,
    maxHeight: VIEWPORT.height,
    everyNthFrame: 1,
  });

  sessions.set(id, session);
  ensureSweeper();

  return {
    sessionId: id,
    accountId: session.accountId,
    accountLabel: session.accountLabel,
    viewport: VIEWPORT,
    url: session.currentUrl,
    needsLogin,
    loginError,
    credentialsFilled: session_credentialsFilled,
  };
}

/**
 * Simpan storage state dari sesi remote (dipakai setelah pengguna login manual
 * lewat browser remote, termasuk melewati OTP).
 */
async function saveSessionFromRemote(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) throw createError(404, 'Sesi tidak ditemukan atau sudah berakhir');

  const { saveSessionState, CONFIG } = require('./akulakuBrowser');
  const page = session.page;

  const url = page.url();
  const stillOnLogin =
    url.includes(CONFIG.loginPath) ||
    (await page.locator(CONFIG.passwordSelector).count().catch(() => 0)) > 0;

  if (stillOnLogin) {
    throw createError(
      400,
      'Masih di halaman login. Selesaikan login (termasuk OTP) di jendela Akulaku terlebih dahulu.',
    );
  }

  const state = await session.context.storageState();
  if (!state.cookies?.length) {
    throw createError(400, 'Tidak ada cookie sesi yang bisa disimpan. Login dulu di jendela Akulaku.');
  }

  await saveSessionState(session.accountId, state, 'valid');
  session.needsLogin = false;
  session.loginError = null;
  touch(session);

  return {
    saved: true,
    accountId: session.accountId,
    cookies: state.cookies.length,
    url,
  };
}

/** Hentikan sesi dan tutup browsernya. */
async function stopSession(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) return { stopped: false };
  sessions.delete(sessionId);
  session.viewers.clear();
  try {
    await session.client?.send('Page.stopScreencast').catch(() => {});
  } catch {
    /* abaikan */
  }
  try {
    await session.browser.close();
  } catch {
    /* abaikan */
  }
  return { stopped: true, sessionId };
}

/** Hentikan semua sesi (dipakai saat shutdown). */
async function stopAll() {
  const ids = [...sessions.keys()];
  for (const id of ids) await stopSession(id);
  return { stopped: ids.length };
}

function getSession(sessionId) {
  return sessions.get(sessionId) || null;
}

/**
 * Terapkan masukan dari klien.
 * `event`: { type, x, y, button, clickCount, deltaY, key, code, text, modifiers }
 *
 * Koordinat sudah dalam satuan piksel halaman (klien yang menyesuaikan skala),
 * lalu dijepit ke area viewport untuk keamanan.
 */
async function sendInput(sessionId, event) {
  const session = sessions.get(sessionId);
  if (!session) throw createError(404, 'Sesi tidak ditemukan atau sudah berakhir');
  touch(session);

  const viewport = session.viewport || VIEWPORT;
  const clamp = (n, max) => Math.min(Math.max(Number(n) || 0, 0), Math.max(1, max) - 1);
  const client = session.client;

  switch (event.type) {
    case 'mouse': {
      const x = clamp(event.x, viewport.width);
      const y = clamp(event.y, viewport.height);
      const button = ['left', 'right', 'middle'].includes(event.button) ? event.button : 'left';
      const base = { x, y, button, clickCount: Number(event.clickCount) || 1, modifiers: 0 };
      if (event.action === 'down') await client.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...base });
      else if (event.action === 'up') await client.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...base });
      else await client.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', modifiers: 0 });
      break;
    }
    case 'wheel': {
      const x = clamp(event.x, viewport.width);
      const y = clamp(event.y, viewport.height);
      await client.send('Input.dispatchMouseEvent', {
        type: 'mouseWheel',
        x,
        y,
        deltaX: Number(event.deltaX) || 0,
        deltaY: Number(event.deltaY) || 0,
      });
      break;
    }
    case 'key': {
      const key = String(event.key || '');
      const isDown = event.action !== 'up';
      await client.send('Input.dispatchKeyEvent', {
        type: isDown ? (event.text ? 'keyDown' : 'rawKeyDown') : 'keyUp',
        key,
        code: String(event.code || ''),
        windowsVirtualKeyCode: Number(event.keyCode) || 0,
        nativeVirtualKeyCode: Number(event.keyCode) || 0,
        text: isDown ? String(event.text || '') : undefined,
      });
      break;
    }
    case 'text': {
      // Mengetik teks utuh (lebih andal untuk kolom input).
      await client.send('Input.insertText', { text: String(event.text || '') });
      break;
    }
    case 'navigate': {
      const url = String(event.url || '');
      if (!/^https?:\/\//i.test(url)) throw createError(400, 'URL tidak valid');
      touch(session);
      await session.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
      break;
    }
    case 'reload': {
      await session.page.reload({ waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
      break;
    }
    case 'back': {
      await session.page.goBack({ timeout: 30000 }).catch(() => {});
      break;
    }
    case 'click-selector': {
      // Dipakai untuk pintasan "buka menu" dari UI (opsional).
      const sel = String(event.selector || '');
      if (!sel) throw createError(400, 'selector wajib diisi');
      await session.page.locator(sel).first().click({ timeout: 15000 }).catch(() => {});
      break;
    }
    default:
      throw createError(400, `Tipe masukan tidak dikenal: ${event.type}`);
  }

  return { ok: true };
}

/** Tutup sesi yang menganggur terlalu lama. */
function ensureSweeper() {
  if (sweeper) return;
  sweeper = setInterval(() => {
    const now = Date.now();
    for (const [id, s] of sessions) {
      if (now - s.lastActivity > IDLE_MS) {
        console.log(`[remote] sesi ${id} ditutup (menganggur > ${Math.round(IDLE_MS / 60000)} menit)`);
        stopSession(id).catch(() => {});
      }
    }
    if (!sessions.size && sweeper) {
      clearInterval(sweeper);
      sweeper = null;
    }
  }, 30000);
  if (sweeper.unref) sweeper.unref();
}

module.exports = {
  startSession,
  saveSessionFromRemote,
  stopSession,
  stopAll,
  getSession,
  listSessions,
  sendInput,
  MAX_SESSIONS,
  IDLE_MS,
  VIEWPORT,
};
