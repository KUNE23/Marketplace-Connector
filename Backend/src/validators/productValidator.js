// Backend/src/validators/productValidator.js (updated)
const { z } = require('zod');

const createProductSchema = z.object({
  shopeeItemId: z.bigint().optional(),
  sku: z.string().optional(),
  name: z.string().optional(),
  description: z.string().optional(),
  priceIdr: z.string().optional(), // Decimal stored as string
  stock: z.number().int().optional(),
  category: z.string().optional(),
  imageUrls: z.array(z.string()).optional(),
});

const updateProductSchema = createProductSchema.partial();

const productIdParamSchema = z.object({
  id: z.string().transform((val) => BigInt(val)),
});

// Query params for listing: pagination + optional search + filters
const listProductsQuerySchema = z.object({
  page: z.string().optional().transform((v) => (v ? Number(v) : 1)),
  limit: z.string().optional().transform((v) => (v ? Number(v) : 20)),
  search: z.string().optional(),
  category: z.string().optional(),
  minPrice: z.string().optional(), // treat as string to preserve Decimal precision
  maxPrice: z.string().optional(),
});

module.exports = {
  createProductSchema,
  updateProductSchema,
  productIdParamSchema,
  listProductsQuerySchema,
};
