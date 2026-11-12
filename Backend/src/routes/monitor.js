// Backend/src/routes/monitor.js
const express = require('express');
const router = express.Router();
const { authenticate, authorizeSuperAdmin } = require('../middleware/auth');
const { overviewHandler, requestStatsHandler, auditHandler } = require('../controllers/monitorController');

router.use(authenticate);
// Eksklusif SUPERADMIN — ADMIN pun tidak boleh membuka.
router.use(authorizeSuperAdmin());

router.get('/', overviewHandler);
router.get('/requests', requestStatsHandler);
router.get('/audit', auditHandler);

module.exports = router;
