// Backend/src/routes/monitor.js
const express = require('express');
const router = express.Router();
const { authenticate, authorizeSuperAdmin } = require('../middleware/auth');
const {
  overviewHandler,
  requestStatsHandler,
  auditHandler,
  workerStatusHandler,
  workerLogsHandler,
  pruneWorkerLogsHandler,
  shopeeDbInfoHandler,
  shopeeDbUploadHandler,
} = require('../controllers/monitorController');
const { MAX_MB } = require('../services/shopeeDbService');

router.use(authenticate);
// Eksklusif SUPERADMIN — ADMIN pun tidak boleh membuka.
router.use(authorizeSuperAdmin());

router.get('/', overviewHandler);
router.get('/requests', requestStatsHandler);
router.get('/audit', auditHandler);
// Worker & log
router.get('/worker', workerStatusHandler);
router.get('/worker/logs', workerLogsHandler);
router.post('/worker/prune-logs', pruneWorkerLogsHandler);
// Berkas SQLite hasil scraping Shopee
router.get('/shopee-db', shopeeDbInfoHandler);
router.post(
  '/shopee-db',
  // Biner mentah; express.json global tidak menyentuh tipe ini.
  express.raw({ type: 'application/octet-stream', limit: `${MAX_MB}mb` }),
  shopeeDbUploadHandler,
);

module.exports = router;
