// Backend/src/routes/auth.js
const express = require('express');
const router = express.Router();
const { loginHandler, refreshHandler, logoutHandler, meHandler } = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');

router.post('/login', loginHandler);
router.post('/refresh', refreshHandler);
router.post('/logout', authenticate, logoutHandler);
router.get('/me', authenticate, meHandler);

module.exports = router;
