// Backend/src/routes/adSpends.js
const express = require('express');
const router = express.Router();
const { authenticate, authorizeRoles } = require('../middleware/auth');
const {
  listAdSpendsHandler,
  createAdSpendHandler,
  updateAdSpendHandler,
  deleteAdSpendHandler,
} = require('../controllers/adSpendController');

router.use(authenticate);
router.use(authorizeRoles('ADMIN', 'EMPLOYEE'));

router.get('/', listAdSpendsHandler);
router.post('/', createAdSpendHandler);
router.patch('/:id', updateAdSpendHandler);
router.delete('/:id', deleteAdSpendHandler);

module.exports = router;
