// Backend/src/routes/balances.js
const express = require('express');
const router = express.Router();
const { authenticate, authorizeRoles } = require('../middleware/auth');
const {
  listHandler,
  summaryHandler,
  historyHandler,
  syncHandler,
  setManualHandler,
} = require('../controllers/balanceController');

router.use(authenticate);
router.use(authorizeRoles('ADMIN', 'EMPLOYEE'));

// Rute statis sebelum dinamis.
router.get('/summary', summaryHandler);
router.get('/', listHandler);
router.get('/:accountId/history', historyHandler);
// Tarik dari Akulaku (pegawai boleh memicu untuk akunnya sendiri).
router.post('/:accountId/sync', syncHandler);
// Isi manual khusus ADMIN (dijaga juga di service).
router.post('/:accountId', authorizeRoles('ADMIN'), setManualHandler);

module.exports = router;
