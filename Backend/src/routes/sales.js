const express = require('express');
const router = express.Router();
const { authenticate, authorizeRoles } = require('../middleware/auth');
const {
  listSalesHandler,
  recapSalesHandler,
  importSaleOrderHandler,
} = require('../controllers/saleController');

// All sales routes require admin authentication
router.use(authenticate);
router.use(authorizeRoles('ADMIN'));

// List sales with filter/pagination
router.get('/orders', listSalesHandler);

// Recap summary
router.get('/recap', recapSalesHandler);

// Import order manually (for testing or webhook)
router.post('/import', importSaleOrderHandler);

module.exports = router;
