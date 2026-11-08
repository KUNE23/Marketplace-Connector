// Backend/src/routes/products.js
const express = require('express');
const router = express.Router();
const { authenticate, authorizeRoles } = require('../middleware/auth');
const {
  createProductHandler,
  getProductHandler,
  listProductsHandler,
  updateProductHandler,
  deleteProductHandler,
  scrapeStatsHandler,
  importBatchHandler,
  resetImportHandler,
} = require('../controllers/productController');

// All product routes require authentication
router.use(authenticate);

router.post('/', authorizeRoles('ADMIN'), createProductHandler);
// Read produk boleh ADMIN & EMPLOYEE
router.get('/', authorizeRoles('ADMIN', 'EMPLOYEE'), listProductsHandler);
router.get('/scrape/stats', authorizeRoles('ADMIN'), scrapeStatsHandler);
router.post('/scrape/import-batch', authorizeRoles('ADMIN'), importBatchHandler);
router.post('/scrape/reset', authorizeRoles('ADMIN'), resetImportHandler);
router.get('/:id', authorizeRoles('ADMIN', 'EMPLOYEE'), getProductHandler);
router.patch('/:id', authorizeRoles('ADMIN'), updateProductHandler);
router.delete('/:id', authorizeRoles('ADMIN'), deleteProductHandler);

module.exports = router;
