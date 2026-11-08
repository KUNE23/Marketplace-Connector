// Backend/src/routes/dashboard.js
const express = require('express');
const router = express.Router();
const { authenticate, authorizeRoles } = require('../middleware/auth');
const { summaryHandler, recapHandler, recentOrdersHandler } = require('../controllers/dashboardController');

router.use(authenticate);
router.use(authorizeRoles('ADMIN'));

router.get('/summary', summaryHandler);
router.get('/recap', recapHandler);
router.get('/recent-orders', recentOrdersHandler);

module.exports = router;
