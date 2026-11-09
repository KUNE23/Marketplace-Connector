// Backend/src/controllers/adSpendController.js
const { z } = require('zod');
const createError = require('http-errors');
const {
  listAdSpends,
  createAdSpend,
  updateAdSpend,
  deleteAdSpend,
} = require('../services/adSpendService');

const amountSchema = z.union([z.string(), z.number()]).transform((v) => String(v));
// accountId: null/''/'general' = Umum; angka/string = id akun.
const accountIdSchema = z.union([z.string(), z.number()]).nullable().optional();

const createAdSpendSchema = z.object({
  period: z.string().min(1),
  amount: amountSchema,
  note: z.string().nullable().optional(),
  accountId: accountIdSchema,
});

const updateAdSpendSchema = z.object({
  period: z.string().min(1).optional(),
  amount: amountSchema.optional(),
  note: z.string().nullable().optional(),
  accountId: accountIdSchema,
});

const idParamSchema = z.object({ id: z.string() });

function handleError(err, next) {
  if (err.name === 'ZodError') {
    return next(createError(400, err.errors.map((e) => e.message).join(', ')));
  }
  return next(err);
}

async function listAdSpendsHandler(req, res, next) {
  try {
    const { from, to, accountId } = req.query;
    res.json(await listAdSpends({ from, to, accountId }));
  } catch (err) { handleError(err, next); }
}

async function createAdSpendHandler(req, res, next) {
  try {
    const parsed = createAdSpendSchema.parse(req.body);
    res.status(201).json(await createAdSpend(parsed));
  } catch (err) { handleError(err, next); }
}

async function updateAdSpendHandler(req, res, next) {
  try {
    const { id } = idParamSchema.parse(req.params);
    const parsed = updateAdSpendSchema.parse(req.body);
    res.json(await updateAdSpend(id, parsed));
  } catch (err) { handleError(err, next); }
}

async function deleteAdSpendHandler(req, res, next) {
  try {
    const { id } = idParamSchema.parse(req.params);
    await deleteAdSpend(id);
    res.status(204).end();
  } catch (err) { handleError(err, next); }
}

module.exports = {
  listAdSpendsHandler,
  createAdSpendHandler,
  updateAdSpendHandler,
  deleteAdSpendHandler,
};
