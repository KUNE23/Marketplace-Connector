const {
  createNotificationSchema,
  listNotificationsQuerySchema,
  notificationIdParamSchema,
} = require('../validators/notificationValidator');
const {
  listNotifications,
  createNotification,
  markNotificationAsRead,
  deleteNotification,
} = require('../services/notificationService');
const createError = require('http-errors');

function handleError(err, next) {
  if (err.name === 'ZodError') {
    return next(createError(400, err.errors.map((e) => e.message).join(', ')));
  }
  return next(err);
}

async function listNotificationsHandler(req, res, next) {
  try {
    const parsed = listNotificationsQuerySchema.parse(req.query);
    const userId = req.user ? req.user.id : null;
    const notifs = await listNotifications({
      userId,
      page: parsed.page,
      limit: parsed.limit,
      unreadOnly: parsed.unreadOnly,
    });
    res.json({ notifications: notifs });
  } catch (err) {
    handleError(err, next);
  }
}

async function createNotificationHandler(req, res, next) {
  try {
    const parsed = createNotificationSchema.parse(req.body);
    if (req.user && req.user.role !== 'ADMIN' && BigInt(req.user.id) !== parsed.userId) {
      return next(createError(403, 'Users may only create notification for themselves unless admin'));
    }
    const notif = await createNotification(parsed);
    res.status(201).json(notif);
  } catch (err) {
    handleError(err, next);
  }
}

async function markReadHandler(req, res, next) {
  try {
    const parsed = notificationIdParamSchema.parse(req.params);
    const userId = req.user ? req.user.id : null;
    const notif = await markNotificationAsRead(parsed.id, userId);
    res.json(notif);
  } catch (err) {
    handleError(err, next);
  }
}

async function deleteNotificationHandler(req, res, next) {
  try {
    const parsed = notificationIdParamSchema.parse(req.params);
    const userId = req.user ? req.user.id : null;
    await deleteNotification(parsed.id, userId);
    res.status(204).send();
  } catch (err) {
    handleError(err, next);
  }
}

module.exports = {
  listNotificationsHandler,
  createNotificationHandler,
  markReadHandler,
  deleteNotificationHandler,
};
