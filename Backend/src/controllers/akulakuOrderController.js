// Backend/src/controllers/akulakuOrderController.js
const createError = require('http-errors');
const {
  createOrderSchema,
  updateOrderStatusSchema,
  orderIdParamSchema,
  listOrdersQuerySchema,
} = require('../validators/akulakuOrderValidator');
const {
  createAkulakuOrder,
  listAkulakuOrders,
  getAkulakuOrderById,
  updateAkulakuOrderStatus,
} = require('../services/akulakuOrderService');

function handleError(err, next) {
  if (err.name === 'ZodError') {
    return next(createError(400, err.errors.map((e) => e.message).join(', ')));
  }
  return next(err);
}

async function listOrdersHandler(req, res, next) {
  try {
    const parsed = listOrdersQuerySchema.parse(req.query);
    const result = await listAkulakuOrders(parsed);
    res.json(result);
  } catch (err) { handleError(err, next); }
}

async function createOrderHandler(req, res, next) {
  try {
    const parsed = createOrderSchema.parse(req.body);
    const result = await createAkulakuOrder(parsed);
    res.status(result.created ? 201 : 200).json(result.order);
  } catch (err) { handleError(err, next); }
}

async function getOrderHandler(req, res, next) {
  try {
    const { id } = orderIdParamSchema.parse(req.params);
    const order = await getAkulakuOrderById(id);
    res.json(order);
  } catch (err) { handleError(err, next); }
}

async function updateOrderStatusHandler(req, res, next) {
  try {
    const { id } = orderIdParamSchema.parse(req.params);
    const { status } = updateOrderStatusSchema.parse(req.body);
    const order = await updateAkulakuOrderStatus(id, status);
    res.json(order);
  } catch (err) { handleError(err, next); }
}

module.exports = {
  listOrdersHandler,
  createOrderHandler,
  getOrderHandler,
  updateOrderStatusHandler,
};
