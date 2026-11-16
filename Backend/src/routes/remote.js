// Backend/src/routes/remote.js
const express = require('express');
const router = express.Router();
const { authenticate, authorizeRoles } = require('../middleware/auth');
const {
  listSessionsHandler,
  startHandler,
  streamHandler,
  inputHandler,
  stopHandler,
  saveSessionHandler,
} = require('../controllers/remoteController');

router.use(authenticate);
// Buka Akulaku langsung: ADMIN & EMPLOYEE (akses akun tetap dibatasi owner).
router.use(authorizeRoles('ADMIN', 'EMPLOYEE'));

// Rute statis sebelum dinamis.
router.get('/sessions', listSessionsHandler);
router.post('/:accountId/start', startHandler);
router.get('/:sessionId/stream', streamHandler);
router.post('/:sessionId/input', inputHandler);
router.post('/:sessionId/stop', stopHandler);
router.post('/:sessionId/save-session', saveSessionHandler);

module.exports = router;
