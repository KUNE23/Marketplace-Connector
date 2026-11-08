const { z } = require('zod');
const { clampLimit, clampPage } = require('../utils/pagination');

const createNotificationSchema = z.object({
  userId: z.union([z.string(), z.number()]).transform((v) => BigInt(v)),
  type: z.string().min(1),
  title: z.string().min(1),
  body: z.string().optional(),
});

const listNotificationsQuerySchema = z.object({
  page: z.string().optional().transform((v) => clampPage(v)),
  limit: z.string().optional().transform((v) => clampLimit(v)),
  unreadOnly: z.string().optional().transform((v) => v === 'true'),
});

const notificationIdParamSchema = z.object({
  id: z.string().transform((v) => v),
});

module.exports = {
  createNotificationSchema,
  listNotificationsQuerySchema,
  notificationIdParamSchema,
};

