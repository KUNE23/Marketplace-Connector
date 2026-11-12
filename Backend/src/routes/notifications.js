const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const {
  listNotificationsHandler,
  createNotificationHandler,
  markReadHandler,
  markAllReadHandler,
  deleteNotificationHandler,
} = require('../controllers/notificationController');

router.use(authenticate);

router.get('/', listNotificationsHandler);
router.post('/', createNotificationHandler);
// Rute statis sebelum dinamis.
router.patch('/read-all', markAllReadHandler);
router.patch('/:id/read', markReadHandler);
router.delete('/:id', deleteNotificationHandler);

module.exports = router;
