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
  listAkulakuOrdersForExport,
} = require('../services/akulakuOrderService');
const { toCsv } = require('../utils/csv');

const STATUS_LABEL = {
  new: 'Baru',
  processing: 'Diproses',
  shipped: 'Dikirim',
  delivered: 'Selesai',
  cancelled: 'Dibatalkan',
};

function fmtDateTime(value) {
  if (!value) return '';
  return new Date(value).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' });
}

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

/** Export pesanan Akulaku ke CSV (dibuka sebagai Excel). Satu baris per item. */
async function exportOrdersHandler(req, res, next) {
  try {
    const parsed = listOrdersQuerySchema.parse(req.query);
    const orders = await listAkulakuOrdersForExport(parsed);

    const header = [
      'No. Order', 'Akun', 'Pembeli', 'Status', 'Tanggal Order', 'Total Order',
      'SKU', 'Nama Item', 'Qty', 'Harga Satuan', 'Subtotal Item',
    ];
    const rows = [header];
    for (const o of orders) {
      const status = STATUS_LABEL[o.status] ?? o.status;
      const when = fmtDateTime(o.orderedAt);
      if (o.items.length === 0) {
        rows.push([o.externalId, o.accountLabel ?? '', o.buyerName ?? '', status, when, o.totalAmt, '', '', '', '', '']);
      } else {
        for (const it of o.items) {
          rows.push([
            o.externalId, o.accountLabel ?? '', o.buyerName ?? '', status, when, o.totalAmt,
            it.sku ?? '', it.name ?? '', it.qty, it.unitPrice, it.total,
          ]);
        }
      }
    }

    const csv = toCsv(rows);
    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="pesanan-akulaku-${stamp}.csv"`);
    res.send('\uFEFF' + csv);
  } catch (err) { handleError(err, next); }
}

module.exports = {
  listOrdersHandler,
  createOrderHandler,
  getOrderHandler,
  updateOrderStatusHandler,
  exportOrdersHandler,
};
