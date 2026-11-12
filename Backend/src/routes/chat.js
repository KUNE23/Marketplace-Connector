// Backend/src/routes/chat.js
const express = require('express');
const router = express.Router();
const { authenticate, authorizeRoles } = require('../middleware/auth');
const {
  listConversationsHandler,
  conversationMessagesHandler,
  syncHandler,
  sendHandler,
} = require('../controllers/chatController');

router.use(authenticate);
router.use(authorizeRoles('ADMIN', 'EMPLOYEE'));

// Rute statis sebelum dinamis.
router.post('/sync', syncHandler);
router.get('/', listConversationsHandler);
router.get('/:id/messages', conversationMessagesHandler);
router.post('/:id/send', sendHandler);

module.exports = router;
