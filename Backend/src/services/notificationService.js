// /Backend/src/services/notificationService.js
const createError = require('http-errors');
const prisma = require('../lib/prisma');

async function listNotifications({ userId, page = 1, limit = 20, unreadOnly = false }) {
  const skip = (page - 1) * limit;
  const where = {};
  if (userId) where.userId = BigInt(userId);
  if (unreadOnly) where.readAt = null;
  const notifs = await prisma.notification.findMany({
    skip,
    take: limit,
    where,
    orderBy: { createdAt: 'desc' },
  });
  return notifs.map((n) => ({
    id: n.id.toString(),
    userId: n.userId ? n.userId.toString() : null,
    type: n.type,
    title: n.title,
    body: n.body,
    readAt: n.readAt,
    createdAt: n.createdAt,
  }));
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

module.exports = {
  listNotifications,
  createNotification,
  markNotificationAsRead,
  deleteNotification,
};

