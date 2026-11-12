// Backend/src/routes/violations.js
const express = require('express');
const router = express.Router();
const { authenticate, authorizeRoles } = require('../middleware/auth');
const {
  overviewHandler,
  detailHandler,
  historyHandler,
  syncOneHandler,
  syncAllHandler,
} = require('../controllers/violationController');

router.use(authenticate);
router.use(authorizeRoles('ADMIN', 'EMPLOYEE'));

// Rute statis sebelum dinamis.
router.post('/sync', syncAllHandler);
router.get('/', overviewHandler);
router.post('/:accountId/sync', syncOneHandler);
router.get('/:accountId/history', historyHandler);
router.get('/:accountId', detailHandler);

module.exports = router;
