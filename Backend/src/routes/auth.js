// Backend/src/routes/auth.js
const express = require('express');
const router = express.Router();
const { loginHandler, refreshHandler, logoutHandler, meHandler } = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');

router.post('/login', loginHandler);
router.post('/refresh', refreshHandler);
// Logout tidak memerlukan access token valid: cukup refresh token (bisa dipakai
// saat access token sudah expired agar sesi tetap bisa diakhiri).
router.post('/logout', logoutHandler);
router.get('/me', authenticate, meHandler);

module.exports = router;
