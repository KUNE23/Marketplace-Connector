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
router.use(authorizeRoles('ADMIN', 'EMPLOYEE'));

// Read & update status boleh pegawai; create order hanya ADMIN (dari worker).
router.get('/', listOrdersHandler);
router.get('/:id', getOrderHandler);
router.post('/', authorizeRoles('ADMIN'), createOrderHandler);
router.patch('/:id/status', authorizeRoles('ADMIN', 'EMPLOYEE'), updateOrderStatusHandler);

module.exports = router;
