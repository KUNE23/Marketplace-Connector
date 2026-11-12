// Backend/src/routes/recap.js
const express = require('express');
const router = express.Router();
const { authenticate, authorizeRoles } = require('../middleware/auth');
const { recapHandler } = require('../controllers/recapController');

router.use(authenticate);
router.use(authorizeRoles('ADMIN', 'EMPLOYEE'));

router.get('/', recapHandler);

module.exports = router;
