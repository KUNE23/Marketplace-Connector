// Backend/src/routes/backups.js
const express = require('express');
const router = express.Router();
const { authenticate, authorizeSuperAdmin } = require('../middleware/auth');
const {
  listHandler,
  createHandler,
  metaHandler,
  downloadHandler,
  deleteHandler,
  restoreHandler,
  runCycleHandler,
  cleanupLogsHandler,
} = require('../controllers/backupController');

router.use(authenticate);
// Eksklusif SUPERADMIN — backup/restore menyentuh seluruh data.
router.use(authorizeSuperAdmin());

// Rute statis sebelum dinamis.
router.get('/', listHandler);
router.post('/', createHandler);
router.post('/run-cycle', runCycleHandler);
router.post('/cleanup-logs', cleanupLogsHandler);
router.get('/:fileName/meta', metaHandler);
router.get('/:fileName/download', downloadHandler);
router.post('/:fileName/restore', restoreHandler);
router.delete('/:fileName', deleteHandler);

module.exports = router;
