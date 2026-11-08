const {
  importSaleOrderSchema,
  listSalesQuerySchema,
  recapSalesQuerySchema,
} = require('../validators/saleValidator');
const {
  listSales,
  recapSales,
  upsertSaleOrder,
} = require('../services/saleService');
const createError = require('http-errors');

function handleError(err, next) {
  if (err.name === 'ZodError') {
    return next(createError(400, err.errors.map((e) => e.message).join(', ')));
  }
  return next(err);
}

async function listSalesHandler(req, res, next) {
  try {
    const parsed = listSalesQuerySchema.parse(req.query);
    const result = await listSales(parsed);
    res.json(result);
  } catch (err) {
    handleError(err, next);
  }
}

async function recapSalesHandler(req, res, next) {
  try {
    const parsed = recapSalesQuerySchema.parse(req.query);
    const result = await recapSales(parsed);
    res.json({ recap: result });
  } catch (err) {
    handleError(err, next);
  }
}

async function importSaleOrderHandler(req, res, next) {
  try {
    const parsed = importSaleOrderSchema.parse(req.body);
    const order = await upsertSaleOrder(parsed);
    res.status(201).json(order);
  } catch (err) {
    handleError(err, next);
  }
}

module.exports = {
  listSalesHandler,
  recapSalesHandler,
  importSaleOrderHandler,
};
