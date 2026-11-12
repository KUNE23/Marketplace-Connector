// Backend/src/services/akulakuChatService.js
/**
 * Chat buyer Akulaku (LiveChat) via otomasi browser.
 *
 * Kenapa browser, bukan REST:
 *   LiveChat Akulaku memakai Tencent IM SDK. Endpoint REST-nya (livechat.akulaku.com)
 *   menolak panggilan manual (butuh signature Tencent), sehingga interaksi dilakukan
 *   melalui UI LiveChat yang sudah terautentikasi.
 *
 * Alur akses:
 *   1) Buka Seller Center akun -> klik menu "LiveChat" -> terbuka tab LiveChat
 *      dengan token jump-page khusus akun tersebut.
 *   2) Di tab LiveChat: baca daftar percakapan & isi pesan dari DOM.
 *   3) Kirim pesan dengan mengisi textarea + klik tombol kirim / tekan Enter.
 *
 * Catatan: setiap operasi membuka browser (~10-15 detik). Hasil baca disimpan ke DB
 * agar UI bisa menampilkan tanpa membuka browser tiap kali.
 */
const createError = require('http-errors');
const { openLoggedInContext, CONFIG } = require('./akulakuBrowser');
const { assertAccountAccess } = require('../utils/scope');
const prisma = require('../lib/prisma');

const CHAT = {
  host: 'livechat.akulaku.com',
  sidebarLinkText: 'LiveChat',
  conversationItem: '.index_list_item__194FY',
  messageWrap: '[class*="index_message_item_wrap"]',
  messageContent: '[class*="index_message_content"]',
  senderInfo: '[class*="index_message_send_info"]',
  textarea: 'textarea',
  rightMarker: 'index_position_right',
};

/** Buka tab LiveChat untuk akun tertentu (token per akun via UI Seller Center). */
async function openLiveChatTab(accountId, { user } = {}) {
  if (user) await assertAccountAccess(prisma, user, accountId);

  const { browser, page } = await openLoggedInContext(accountId);
  try {
    await page.goto(CONFIG.baseUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(2500);

    const popupPromise = page.context().waitForEvent('page', { timeout: 25000 }).catch(() => null);
    const clicked = await page.evaluate((text) => {
      const el = [...document.querySelectorAll('a, div, span, button')].find(
        (e) => new RegExp(`^${text}$`, 'i').test((e.innerText || '').trim()),
      );
      if (el) { el.click(); return true; }
      return false;
    }, CHAT.sidebarLinkText);

    if (!clicked) throw createError(500, 'Menu LiveChat tidak ditemukan di Seller Center');

    const chatPage = (await popupPromise) || page;
    await chatPage.waitForLoadState('domcontentloaded').catch(() => {});
    await chatPage.waitForTimeout(11000);

    const url = chatPage.url();
    if (!url.includes(CHAT.host)) {
      throw createError(500, `Gagal membuka LiveChat (URL: ${url}). Pastikan sesi Akulaku valid.`);
    }
    return { browser, page: chatPage, token: (url.match(/token=([^&]+)/) || [])[1] ?? null };
  } catch (err) {
    await browser.close().catch(() => {});
    throw err;
  }
}

/** Baca daftar percakapan dari DOM. */
async function readConversations(page) {
  return page.evaluate((itemSel) => {
    const items = [...document.querySelectorAll(itemSel)];
    return items.map((el, i) => {
      const text = (el.innerText || '').replace(/\s+/g, ' ').trim();
      // Baris pertama biasanya nama/telepon (disamarkan), lalu pesan terakhir.
      const parts = text.split(' ').filter(Boolean);
      const phone = parts[0] ?? null;
      const timeMatch = text.match(/(\d{1,2}:\d{2}|\d{2}\/\d{2}\/\d{4}|\d{4}-\d{2}-\d{2})/);
      const nameEl = el.querySelector('[class*="name"], [class*="nick"]');
      return {
        index: i,
        displayName: nameEl ? (nameEl.innerText || '').trim() : phone,
        preview: text.slice(0, 300),
        lastAt: timeMatch ? timeMatch[0] : null,
      };
    });
  }, CHAT.conversationItem);
}

/** Buka percakapan berdasarkan index. */
async function openConversation(page, index = 0) {
  const ok = await page.evaluate(
    ({ itemSel, idx }) => {
      const items = [...document.querySelectorAll(itemSel)];
      if (!items[idx]) return false;
      items[idx].click();
      return true;
    },
    { itemSel: CHAT.conversationItem, idx: index },
  );
  if (!ok) throw createError(404, `Percakapan ke-${index + 1} tidak ditemukan`);
  await page.waitForTimeout(5000);
  return true;
}

/** Baca pesan dalam percakapan yang sedang terbuka. */
async function readMessages(page) {
  return page.evaluate(
    ({ wrapSel, contentSel, senderSel, rightMarker }) => {
      const wraps = [...document.querySelectorAll(wrapSel)];
      const out = [];
      for (const w of wraps) {
        const cls = (w.className || '').toString();
        const isOurs = cls.includes(rightMarker);
        const contentEl = w.querySelector(contentSel);
        const senderEl = w.querySelector(senderSel);
        const text = contentEl ? (contentEl.innerText || '').trim() : (w.innerText || '').trim();
        const sender = senderEl ? (senderEl.innerText || '').trim() : null;
        if (!text) continue;
        out.push({ from: isOurs ? 'us' : 'buyer', sender, text: text.slice(0, 4000) });
      }
      return out;
    },
    {
      wrapSel: CHAT.messageWrap,
      contentSel: CHAT.messageContent,
      senderSel: CHAT.senderInfo,
      rightMarker: CHAT.rightMarker,
    },
  );
}

/** Kirim pesan ke percakapan yang sedang terbuka. */
async function sendMessage(page, text) {
  const value = String(text || '').trim();
  if (!value) throw createError(400, 'Pesan kosong');

  const ta = page.locator(CHAT.textarea).first();
  if (!(await ta.count().catch(() => 0))) throw createError(500, 'Kolom pesan LiveChat tidak ditemukan');
  if (await ta.isDisabled().catch(() => false)) {
    throw createError(400, 'Kolom pesan nonaktif — buka percakapan terlebih dahulu');
  }

  const before = await readMessages(page);
  const beforeCount = before.length;

  await ta.click().catch(() => {});
  await page.waitForTimeout(300);

  // PENTING: `fill()` tidak memicu state React pada LiveChat, sehingga tombol kirim
  // tetap disabled & penghitung karakter tidak bertambah. Gunakan ketikan nyata.
  await page.keyboard.type(value, { delay: 12 }).catch(() => {});
  await page.waitForTimeout(1200);

  // Verifikasi tombol kirim sudah aktif (penanda React sudah menerima input).
  const sendReady = await page
    .evaluate(() => {
      const btn = document.querySelector('[class*="index_send_content"]');
      return btn ? { disabled: btn.disabled, found: true } : { found: false };
    })
    .catch(() => ({ found: false }));

  let sent = false;

  if (sendReady.found && !sendReady.disabled) {
    await page
      .evaluate(() => {
        const btn = document.querySelector('[class*="index_send_content"]');
        if (btn && !btn.disabled) { btn.click(); return true; }
        return false;
      })
      .catch(() => {});
    sent = true;
  } else {
    // Fallback: Enter (LiveChat mendukung kirim via Enter).
    await page.keyboard.press('Enter').catch(() => {});
  }

  await page.waitForTimeout(4500);

  // Konfirmasi: pesan baru muncul di daftar.
  const after = await readMessages(page);
  const appeared = after.length > beforeCount && after.some((m) => m.from === 'us' && m.text.includes(value.slice(0, 25)));
  return { sent: appeared, sendButtonClicked: sendReady.found && !sendReady.disabled, beforeCount, afterCount: after.length };
}

/**
 * Sinkronkan percakapan + pesan satu akun ke DB.
 * `maxConversations` membatasi jumlah percakapan yang dibuka (tiap buka = beberapa detik).
 */
async function syncChatForAccount(accountId, { user, maxConversations = 5 } = {}) {
  const started = Date.now();
  const { browser, page } = await openLiveChatTab(accountId, { user });
  try {
    const conversations = await readConversations(page);
    const saved = [];

    for (let i = 0; i < Math.min(conversations.length, maxConversations); i++) {
      const conv = conversations[i];
      try {
        await openConversation(page, i);
        const messages = await readMessages(page);
        if (!messages.length) continue;

        const buyerLabel = conv.displayName ?? `Percakapan ${i + 1}`;
        const convKey = `${accountId}:${buyerLabel}:${i}`;

        const stored = await prisma.chatConversation.upsert({
          where: { accountId_convKey: { accountId: BigInt(accountId), convKey } },
          create: {
            accountId: BigInt(accountId),
            convKey,
            buyerLabel,
            lastPreview: messages[messages.length - 1]?.text?.slice(0, 300) ?? conv.preview?.slice(0, 300),
            lastMessageAt: new Date(),
            unread: 0,
          },
          update: {
            buyerLabel,
            lastPreview: messages[messages.length - 1]?.text?.slice(0, 300) ?? conv.preview?.slice(0, 300),
            lastMessageAt: new Date(),
          },
        });

        // Simpan pesan (dedupe berdasarkan urutan + teks).
        for (let m = 0; m < messages.length; m++) {
          const msg = messages[m];
          const msgKey = `${m}:${msg.from}:${msg.text.slice(0, 60)}`;
          await prisma.chatMessage.upsert({
            where: { conversationId_msgKey: { conversationId: stored.id, msgKey } },
            create: {
              conversationId: stored.id,
              msgKey,
              from: msg.from,
              sender: msg.sender,
              text: msg.text,
            },
            update: { text: msg.text, sender: msg.sender },
          });
        }

        saved.push({ convKey, buyerLabel, messages: messages.length });
      } catch (err) {
        saved.push({ index: i, error: String(err.message || err).slice(0, 200) });
      }
    }

    return {
      accountId: String(accountId),
      conversationsFound: conversations.length,
      conversationsSaved: saved.filter((s) => !s.error).length,
      details: saved,
      durationMs: Date.now() - started,
    };
  } finally {
    await browser.close().catch(() => {});
  }
}

/** Kirim pesan ke percakapan tertentu (berdasarkan convKey tersimpan). */
async function sendChatMessage(accountId, convKey, text, { user } = {}) {
  if (user) await assertAccountAccess(prisma, user, accountId);
  const conversation = await prisma.chatConversation.findUnique({
    where: { accountId_convKey: { accountId: BigInt(accountId), convKey } },
  });
  if (!conversation) throw createError(404, 'Percakapan tidak ditemukan');

  const { browser, page } = await openLiveChatTab(accountId, { user });
  try {
    const conversations = await readConversations(page);
    const idx = conversations.findIndex((c) => c.displayName === conversation.buyerLabel);
    if (idx < 0) {
      throw createError(404, `Percakapan "${conversation.buyerLabel}" tidak ditemukan di LiveChat`);
    }
    await openConversation(page, idx);
    const result = await sendMessage(page, text);

    if (result.sent) {
      await prisma.chatMessage.create({
        data: {
          conversationId: conversation.id,
          msgKey: `out:${Date.now()}`,
          from: 'us',
          sender: 'Kami',
          text: String(text).slice(0, 4000),
        },
      });
      await prisma.chatConversation.update({
        where: { id: conversation.id },
        data: { lastPreview: String(text).slice(0, 300), lastMessageAt: new Date() },
      });
    }
    return result;
  } finally {
    await browser.close().catch(() => {});
  }
}

module.exports = {
  openLiveChatTab,
  readConversations,
  openConversation,
  readMessages,
  sendMessage,
  syncChatForAccount,
  sendChatMessage,
  CHAT,
};
