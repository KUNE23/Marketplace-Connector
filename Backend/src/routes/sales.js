const express = require('express');
const router = express.Router();
const { authenticate, authorizeRoles } = require('../middleware/auth');
const {
  listSalesHandler,
  recapSalesHandler,
  importSaleOrderHandler,
} = require('../controllers/saleController');

// Sales recap boleh dilihat ADMIN & EMPLOYEE; import manual hanya ADMIN
router.use(authenticate);
router.use(authorizeRoles('ADMIN', 'EMPLOYEE'));

// List sales with filter/pagination
router.get('/orders', listSalesHandler);

// Recap summary
router.get('/recap', recapSalesHandler);

// Import order manually (for testing or webhook)
router.post('/import', authorizeRoles('ADMIN'), importSaleOrderHandler);

module.exports = router;
