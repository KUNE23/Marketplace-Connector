// Backend/src/routes/akulakuOrders.js
const express = require('express');
const router = express.Router();
const { authenticate, authorizeRoles } = require('../middleware/auth');
const {
  listOrdersHandler,
  createOrderHandler,
  getOrderHandler,
  updateOrderStatusHandler,
} = require('../controllers/akulakuOrderController');

router.use(authenticate);
router.use(authorizeRoles('ADMIN'));

router.get('/', listOrdersHandler);
router.get('/:id', getOrderHandler);
router.post('/', createOrderHandler);
router.patch('/:id/status', updateOrderStatusHandler);

module.exports = router;
