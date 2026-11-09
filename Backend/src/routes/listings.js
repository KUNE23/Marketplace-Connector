// Backend/src/routes/listings.js
const express = require('express');
const router = express.Router();
const { authenticate, authorizeRoles } = require('../middleware/auth');
const {
  listListingsHandler,
  createListingHandler,
  bulkCreateListingHandler,
  getListingHandler,
  updateListingHandler,
  deleteListingHandler,
} = require('../controllers/listingController');

router.use(authenticate);
// Kelola listing boleh ADMIN & EMPLOYEE (request klien).
router.use(authorizeRoles('ADMIN', 'EMPLOYEE'));

router.get('/', listListingsHandler);
router.post('/', createListingHandler);
router.post('/bulk', bulkCreateListingHandler);
router.get('/:id', getListingHandler);
router.patch('/:id', updateListingHandler);
router.delete('/:id', deleteListingHandler);

module.exports = router;
