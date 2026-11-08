const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const {
  listNotificationsHandler,
  createNotificationHandler,
  markReadHandler,
  deleteNotificationHandler,
} = require('../controllers/notificationController');

router.use(authenticate);

router.get('/', listNotificationsHandler);
router.post('/', createNotificationHandler);
router.patch('/:id/read', markReadHandler);
router.delete('/:id', deleteNotificationHandler);

module.exports = router;
