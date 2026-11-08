const { z } = require('zod');
const { clampLimit, clampPage } = require('../utils/pagination');

const saleItemSchema = z.object({
  productId: z.union([z.string(), z.number()]).transform((v) => BigInt(v)),
  qty: z.number().int().positive(),
  unitPrice: z.string().regex(/^\d+(\.\d+)?$/),
  discount: z.string().optional(),
  total: z.string().regex(/^\d+(\.\d+)?$/),
});

const importSaleOrderSchema = z.object({
  shopName: z.string().optional(),
  externalId: z.string().optional(),
  currency: z.string().default('IDR'),
  status: z.string().default('PENDING'),
  totalAmt: z.string().regex(/^\d+(\.\d+)?$/),
  soldAt: z.string().datetime(),
  items: z.array(saleItemSchema).min(1),
});

const listSalesQuerySchema = z.object({
  page: z.string().optional().transform((v) => clampPage(v)),
  limit: z.string().optional().transform((v) => clampLimit(v)),
  shopId: z.string().optional(),
  status: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

const recapSalesQuerySchema = z.object({
  period: z.enum(['daily', 'monthly']).default('daily'),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  shopId: z.string().optional(),
});

module.exports = {
  importSaleOrderSchema,
  listSalesQuerySchema,
  recapSalesQuerySchema,
};

