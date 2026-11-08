// Backend/src/validators/akulakuOrderValidator.js
const { z } = require('zod');
const { clampLimit, clampPage } = require('../utils/pagination');

const orderItemSchema = z.object({
  listingId: z.union([z.string(), z.number()]).optional(),
  sku: z.string().optional(),
  name: z.string().optional(),
  qty: z.number().int().positive(),
  unitPrice: z.union([z.string(), z.number()]).transform((v) => String(v)),
  total: z.union([z.string(), z.number()]).transform((v) => String(v)),
});

const createOrderSchema = z.object({
  externalId: z.string().min(1),
  accountId: z.union([z.string(), z.number()]).transform((v) => BigInt(v)),
  buyerName: z.string().optional(),
  buyerPhone: z.string().optional(),
  shippingAddress: z.string().optional(),
  status: z.enum(['new', 'processing', 'shipped', 'delivered', 'cancelled']).optional(),
  totalAmt: z.union([z.string(), z.number()]).transform((v) => String(v)),
  currency: z.string().optional(),
  orderedAt: z.string().transform((v) => new Date(v)).optional(),
  rawPayload: z.unknown().optional(),
  items: z.array(orderItemSchema).min(1),
});

const updateOrderStatusSchema = z.object({
  status: z.enum(['new', 'processing', 'shipped', 'delivered', 'cancelled']),
});

const orderIdParamSchema = z.object({ id: z.string() });

const listOrdersQuerySchema = z.object({
  page: z.string().optional().transform((v) => clampPage(v)),
  limit: z.string().optional().transform((v) => clampLimit(v)),
  search: z.string().optional(),
  status: z.enum(['new', 'processing', 'shipped', 'delivered', 'cancelled']).optional(),
  accountId: z.string().optional(),
});

module.exports = {
  createOrderSchema,
  updateOrderStatusSchema,
  orderIdParamSchema,
  listOrdersQuerySchema,
};

