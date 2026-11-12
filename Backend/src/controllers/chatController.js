// Backend/src/controllers/chatController.js
const createError = require('http-errors');
const {
  syncChatForAccount,
  sendChatMessage,
} = require('../services/akulakuChatService');
const { accountRelationScope, isAdmin } = require('../utils/scope');
const prisma = require('../lib/prisma');

function handleError(err, next) {
  if (err.name === 'ZodError') {
    return next(createError(400, err.errors.map((e) => e.message).join(', ')));
  }
  return next(err);
}

function serializeConversation(c, messageCount = 0) {
  return {
    id: c.id.toString(),
    accountId: c.accountId.toString(),
    accountLabel: c.account?.label ?? null,
    convKey: c.convKey,
    buyerLabel: c.buyerLabel,
    lastPreview: c.lastPreview,
    lastMessageAt: c.lastMessageAt,
    unread: c.unread,
    messageCount,
  };
}

function serializeMessage(m) {
  return {
    id: m.id.toString(),
    from: m.from,
    sender: m.sender,
    text: m.text,
    createdAt: m.createdAt,
  };
}

/** GET /api/chat — daftar percakapan (terisolasi per akun). */
async function listConversationsHandler(req, res, next) {
  try {
    const where = { ...accountRelationScope(req.user) };
    if (req.query.accountId) where.accountId = BigInt(req.query.accountId);

    const conversations = await prisma.chatConversation.findMany({
      where,
      include: {
        account: { select: { label: true } },
        _count: { select: { messages: true } },
      },
      orderBy: [{ lastMessageAt: 'desc' }, { id: 'desc' }],
      take: Math.min(Number(req.query.limit) || 50, 200),
    });

    res.json({
      conversations: conversations.map((c) => serializeConversation(c, c._count.messages)),
    });
  } catch (err) { handleError(err, next); }
}

/** GET /api/chat/:id/messages — isi percakapan. */
async function conversationMessagesHandler(req, res, next) {
  try {
    const conv = await prisma.chatConversation.findUnique({
      where: { id: BigInt(req.params.id) },
      include: { account: { select: { id: true, ownerId: true, label: true } } },
    });
    if (!conv) return next(createError(404, 'Percakapan tidak ditemukan'));

    // Isolasi: pegawai hanya boleh melihat percakapan akun miliknya.
    if (!isAdmin(req.user) && String(conv.account.ownerId ?? '') !== String(req.user.id)) {
      return next(createError(403, 'Anda tidak punya akses ke percakapan ini'));
    }

    const messages = await prisma.chatMessage.findMany({
      where: { conversationId: conv.id },
      orderBy: { id: 'asc' },
      take: Math.min(Number(req.query.limit) || 200, 500),
    });

    res.json({
      conversation: serializeConversation(conv, messages.length),
      messages: messages.map(serializeMessage),
    });
  } catch (err) { handleError(err, next); }
}

/** POST /api/chat/sync — tarik percakapan dari Akulaku (satu akun / semua). */
async function syncHandler(req, res, next) {
  try {
    const accountId = req.body?.accountId;
    const maxConversations = Math.min(Number(req.body?.maxConversations) || 5, 20);

    if (accountId) {
      const result = await syncChatForAccount(accountId, { user: req.user, maxConversations });
      return res.json(result);
    }

    // Semua akun yang boleh diakses user.
    const accounts = await prisma.akulakuAccount.findMany({
      where: { ...accountRelationScope(req.user), status: 'active' },
      select: { id: true, label: true },
    });
    const results = [];
    for (const acc of accounts) {
      try {
        const r = await syncChatForAccount(acc.id, { user: req.user, maxConversations });
        results.push({ ...r, label: acc.label, ok: true });
      } catch (err) {
        results.push({ accountId: acc.id.toString(), label: acc.label, ok: false, error: String(err.message || err).slice(0, 300) });
      }
    }
    res.json({
      synced: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      results,
    });
  } catch (err) { handleError(err, next); }
}

/** POST /api/chat/:id/send — kirim pesan ke buyer. */
async function sendHandler(req, res, next) {
  try {
    const text = String(req.body?.text || '').trim();
    if (!text) return next(createError(400, 'text wajib diisi'));
    if (text.length > 2000) return next(createError(400, 'Pesan maksimal 2000 karakter'));

    const conv = await prisma.chatConversation.findUnique({
      where: { id: BigInt(req.params.id) },
      include: { account: { select: { id: true, ownerId: true } } },
    });
    if (!conv) return next(createError(404, 'Percakapan tidak ditemukan'));
    if (!isAdmin(req.user) && String(conv.account.ownerId ?? '') !== String(req.user.id)) {
      return next(createError(403, 'Anda tidak punya akses ke percakapan ini'));
    }

    const result = await sendChatMessage(conv.accountId, conv.convKey, text, { user: req.user });
    if (!result.sent) {
      return next(createError(502, 'Pesan tidak terkonfirmasi terkirim di Akulaku. Coba lagi.'));
    }
    res.json({ ok: true, ...result });
  } catch (err) { handleError(err, next); }
}

module.exports = {
  listConversationsHandler,
  conversationMessagesHandler,
  syncHandler,
  sendHandler,
};
