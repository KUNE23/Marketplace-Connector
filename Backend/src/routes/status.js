const express = require('express');
const router = express.Router();
const statusController = require('../controllers/statusController');

router.get('/health', statusController.getHealth);
router.get('/status', statusController.getStatus);

module.exports = router;
