// Backend/src/routes/leaderboard.js
const express = require('express');
const router = express.Router();
const { authenticate, authorizeRoles } = require('../middleware/auth');
const {
  leaderboardHandler,
  leaderboardDetailHandler,
  leaderboardTrendHandler,
  employeesHandler,
} = require('../controllers/leaderboardController');

router.use(authenticate);
router.use(authorizeRoles('ADMIN', 'EMPLOYEE'));

// Rute statis sebelum dinamis.
router.get('/employees', authorizeRoles('ADMIN'), employeesHandler);
router.get('/:userId/trend', leaderboardTrendHandler);
router.get('/:userId', leaderboardDetailHandler);
router.get('/', leaderboardHandler);

module.exports = router;
