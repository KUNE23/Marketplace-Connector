// Backend/src/validators/akulakuAccountValidator.js
const { z } = require('zod');
const { clampLimit, clampPage } = require('../utils/pagination');

const createAkulakuAccountSchema = z.object({
  label: z.string().min(1).max(100),
  username: z.string().min(1).max(150),
  password: z.string().min(1),
  status: z.enum(['active', 'inactive']).optional(),
  note: z.string().nullable().optional(),
});

const updateAkulakuAccountSchema = z.object({
  label: z.string().min(1).max(100).optional(),
  username: z.string().min(1).max(150).optional(),
  password: z.string().min(1).optional(),
  status: z.enum(['active', 'inactive']).optional(),
  note: z.string().nullable().optional(),
});

const akulakuAccountIdParamSchema = z.object({ id: z.string() });

const listAkulakuAccountsQuerySchema = z.object({
  page: z.string().optional().transform((v) => clampPage(v)),
  limit: z.string().optional().transform((v) => clampLimit(v)),
  search: z.string().optional(),
  status: z.enum(['active', 'inactive']).optional(),
});

module.exports = {
  createAkulakuAccountSchema,
  updateAkulakuAccountSchema,
  akulakuAccountIdParamSchema,
  listAkulakuAccountsQuerySchema,
};

