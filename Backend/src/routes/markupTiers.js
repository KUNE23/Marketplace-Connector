// Backend/src/routes/markupTiers.js
const express = require('express');
const router = express.Router();
const { authenticate, authorizeRoles } = require('../middleware/auth');
const { listMarkupTiersHandler, replaceMarkupTiersHandler } = require('../controllers/markupTierController');

router.use(authenticate);
router.use(authorizeRoles('ADMIN'));

router.get('/', listMarkupTiersHandler);
router.put('/', replaceMarkupTiersHandler);

module.exports = router;
