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
} = require('../controllers/productController');

// All product routes require authentication
router.use(authenticate);

// ADMIN‑only create, update, delete, list
router.post('/', authorizeRoles('ADMIN'), createProductHandler);
router.get('/', authorizeRoles('ADMIN'), listProductsHandler);
router.get('/:id', authorizeRoles('ADMIN'), getProductHandler);
router.patch('/:id', authorizeRoles('ADMIN'), updateProductHandler);
router.delete('/:id', authorizeRoles('ADMIN'), deleteProductHandler);

module.exports = router;
