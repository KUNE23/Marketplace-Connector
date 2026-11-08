// Backend/src/routes/akulakuAccounts.js
const express = require('express');
const router = express.Router();
const { authenticate, authorizeRoles } = require('../middleware/auth');
const {
  listAkulakuAccountsHandler,
  createAkulakuAccountHandler,
  getAkulakuAccountHandler,
  updateAkulakuAccountHandler,
  deleteAkulakuAccountHandler,
} = require('../controllers/akulakuAccountController');

router.use(authenticate);
router.use(authorizeRoles('ADMIN'));

router.get('/', listAkulakuAccountsHandler);
router.get('/:id', getAkulakuAccountHandler);
router.post('/', createAkulakuAccountHandler);
router.patch('/:id', updateAkulakuAccountHandler);
router.delete('/:id', deleteAkulakuAccountHandler);

module.exports = router;
