// Backend/src/controllers/markupTierController.js
const { z } = require('zod');
const createError = require('http-errors');
const {
  listMarkupTiers,
  replaceMarkupTiers,
  ensureDefaultTiers,
} = require('../services/markupTierService');

const tierSchema = z.object({
  label: z.string().min(1).max(100),
  minPrice: z.union([z.string(), z.number()]).transform((v) => String(v)),
  maxPrice: z.union([z.string(), z.number()]).nullable().optional().transform((v) => (v === undefined || v === null || v === '' ? null : String(v))),
  markupType: z.enum(['percent', 'fixed']).optional(),
  markupValue: z.union([z.string(), z.number()]).transform((v) => String(v)),
  active: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

const replaceSchema = z.object({ tiers: z.array(tierSchema).max(20) });

function handleError(err, next) {
  if (err.name === 'ZodError') {
    return next(createError(400, err.errors.map((e) => e.message).join(', ')));
  }
  return next(err);
}

async function listMarkupTiersHandler(req, res, next) {
  try {
    await ensureDefaultTiers();
    res.json(await listMarkupTiers());
  } catch (err) { handleError(err, next); }
}

async function replaceMarkupTiersHandler(req, res, next) {
  try {
    const parsed = replaceSchema.parse(req.body);
    res.json(await replaceMarkupTiers(parsed.tiers));
  } catch (err) { handleError(err, next); }
}

module.exports = { listMarkupTiersHandler, replaceMarkupTiersHandler };
