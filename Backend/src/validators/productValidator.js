// Backend/src/validators/productValidator.js
const { z } = require('zod');
const { clampLimit, clampPage } = require('../utils/pagination');

const createProductSchema = z.object({
  shopeeItemId: z.union([z.string(), z.number(), z.bigint()]).optional(),
  sku: z.string().optional(),
  name: z.string().optional(),
  description: z.string().optional(),
  priceIdr: z.union([z.string(), z.number()]).optional(),
  stock: z.number().int().nullable().optional(),
  shopeeUrl: z.string().optional(),
  shopId: z.string().optional(),
  location: z.string().optional(),
  sold: z.number().int().optional(),
  rating: z.union([z.string(), z.number()]).optional(),
  imageUrls: z.array(z.string()).optional(),
});

const updateProductSchema = createProductSchema.partial();

const productIdParamSchema = z.object({ id: z.string() });

const listProductsQuerySchema = z.object({
  page: z.string().optional().transform((v) => clampPage(v)),
  limit: z.string().optional().transform((v) => clampLimit(v)),
  search: z.string().optional(),
  hasListing: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  minPrice: z.string().optional(),
  maxPrice: z.string().optional(),
});

module.exports = {
  createProductSchema,
  updateProductSchema,
  productIdParamSchema,
  listProductsQuerySchema,
};
