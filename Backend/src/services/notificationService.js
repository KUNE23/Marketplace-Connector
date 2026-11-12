// /Backend/src/services/notificationService.js
const createError = require('http-errors');
const prisma = require('../lib/prisma');

/**
 * Kategori notifikasi (dikelompokkan dari `type`).
 * Dipakai halaman Notifikasi untuk filter "Pesanan / Pelanggaran / Sistem".
 */
const NOTIFICATION_CATEGORIES = {
  order: { label: 'Pesanan', match: ['order', 'akulaku_order', 'sale'] },
  violation: { label: 'Pelanggaran', match: ['violation', 'pelanggaran'] },
  chat: { label: 'Chat', match: ['chat', 'message'] },
  system: { label: 'Sistem', match: ['system', 'auth', 'user', 'job'] },
};

/** Petakan satu tipe notifikasi ke kategori (fallback: system). */
function categoryOf(type) {
  const t = String(type || '').toLowerCase();
  for (const [key, def] of Object.entries(NOTIFICATION_CATEGORIES)) {
    if (def.match.some((m) => t.includes(m))) return key;
  }
  return 'system';
}

/**
 * Daftar notifikasi dengan pencarian & filter kategori.
 * `userId` null = notifikasi global (userId null) + milik user tersebut.
 */
async function listNotifications({ userId, page = 1, limit = 20, unreadOnly = false, search, category } = {}) {
  const skip = (page - 1) * limit;
  const where = {};
  if (userId) where.userId = BigInt(userId);
  if (unreadOnly) where.readAt = null;

  if (search) {
    where.OR = [
      { title: { contains: search, mode: 'insensitive' } },
      { body: { contains: search, mode: 'insensitive' } },
    ];
  }

  // Filter kategori: cocokkan berdasarkan substring tipe.
  const types = await prisma.notification.findMany({
    where: userId ? { userId: BigInt(userId) } : {},
    select: { type: true },
    distinct: ['type'],
  });
  const allTypes = types.map((t) => t.type);

  let filteredTypes = null;
  if (category && category !== 'all') {
    const def = NOTIFICATION_CATEGORIES[category];
    if (def) filteredTypes = allTypes.filter((t) => def.match.some((m) => String(t).toLowerCase().includes(m)));
    else filteredTypes = [];
  }
  if (filteredTypes) where.type = { in: filteredTypes.length ? filteredTypes : ['__none__'] };

  const [notifs, total, unread] = await Promise.all([
    prisma.notification.findMany({ skip, take: limit, where, orderBy: { createdAt: 'desc' } }),
    prisma.notification.count({ where }),
    prisma.notification.count({
      where: { ...(userId ? { userId: BigInt(userId) } : {}), readAt: null },
    }),
  ]);

  return {
    notifications: notifs.map((n) => ({
      id: n.id.toString(),
      userId: n.userId ? n.userId.toString() : null,
      type: n.type,
      category: categoryOf(n.type),
      title: n.title,
      body: n.body,
      readAt: n.readAt,
      createdAt: n.createdAt,
    })),
    total,
    unread,
    page,
    limit,
    categories: Object.entries(NOTIFICATION_CATEGORIES).map(([key, v]) => ({
      key,
      label: v.label,
      count: allTypes.filter((t) => v.match.some((m) => String(t).toLowerCase().includes(m))).length,
    })),
  };
}

async function createNotification({ userId, type, title, body }) {
  if (!userId) throw createError(400, 'userId required');
  const notif = await prisma.notification.create({
    data: {
      userId: BigInt(userId),
      type,
      title,
      body,
      readAt: null,
    },
  });
  return {
    id: notif.id.toString(),
    userId: notif.userId ? notif.userId.toString() : null,
    type: notif.type,
    title: notif.title,
    body: notif.body,
    readAt: notif.readAt,
    createdAt: notif.createdAt,
  };
}

async function markNotificationAsRead(id, userId) {
  const notif = await prisma.notification.findUnique({ where: { id: BigInt(id) } });
  if (!notif) throw createError(404, 'Notification not found');
  if (notif.userId && BigInt(userId) !== notif.userId) throw createError(403, 'Access denied');
  const updated = await prisma.notification.update({
    where: { id: BigInt(id) },
    data: { readAt: new Date() },
  });
  return {
    id: updated.id.toString(),
    userId: updated.userId ? updated.userId.toString() : null,
    type: updated.type,
    title: updated.title,
    body: updated.body,
    readAt: updated.readAt,
    createdAt: updated.createdAt,
  };
}

async function deleteNotification(id, userId) {
  const notif = await prisma.notification.findUnique({ where: { id: BigInt(id) } });
  if (!notif) throw createError(404, 'Notification not found');
  if (notif.userId && BigInt(userId) !== notif.userId) throw createError(403, 'Access denied');
  await prisma.notification.delete({ where: { id: BigInt(id) } });
  return true;
}

// Tandai semua notifikasi user sebagai dibaca.
async function markAllRead(userId) {
  const res = await prisma.notification.updateMany({
    where: { ...(userId ? { userId: BigInt(userId) } : {}), readAt: null },
    data: { readAt: new Date() },
  });
  return { updated: res.count };
}
module.exports = {

  listNotifications,

  markAllRead,

  categoryOf,

  NOTIFICATION_CATEGORIES,
  createNotification,
  markNotificationAsRead,
  deleteNotification,
};

