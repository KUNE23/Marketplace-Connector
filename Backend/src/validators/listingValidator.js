// Backend/src/validators/listingValidator.js
const { z } = require('zod');
const { clampLimit, clampPage } = require('../utils/pagination');

const createListingSchema = z.object({
  productId: z.union([z.string(), z.number()]).transform((v) => BigInt(v)),
  accountId: z.union([z.string(), z.number()]).transform((v) => BigInt(v)),
  markupType: z.enum(['percent', 'fixed']).optional(),
  markupValue: z.union([z.string(), z.number()]).transform((v) => String(v)).optional(),
});

const bulkCreateListingSchema = z.object({
  productIds: z.array(z.union([z.string(), z.number()])).min(1).max(500),
  accountId: z.union([z.string(), z.number()]).transform((v) => BigInt(v)),
  markupType: z.enum(['percent', 'fixed']).optional(),
  markupValue: z.union([z.string(), z.number()]).transform((v) => String(v)).optional(),
});

const updateListingSchema = z.object({
  markupType: z.enum(['percent', 'fixed']).optional(),
  markupValue: z.union([z.string(), z.number()]).transform((v) => String(v)).optional(),
  status: z.enum(['draft', 'queued', 'posted', 'failed']).optional(),
});

const listingIdParamSchema = z.object({ id: z.string() });

const listListingsQuerySchema = z.object({
  page: z.string().optional().transform((v) => clampPage(v)),
  limit: z.string().optional().transform((v) => clampLimit(v)),
  search: z.string().optional(),
  status: z.enum(['draft', 'queued', 'posted', 'failed']).optional(),
  accountId: z.string().optional(),
});

module.exports = {
  createListingSchema,
  bulkCreateListingSchema,
  updateListingSchema,
  listingIdParamSchema,
  listListingsQuerySchema,
};

