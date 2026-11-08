// Backend/src/routes/jobs.js
const express = require('express');
const router = express.Router();
const { authenticate, authorizeRoles } = require('../middleware/auth');
const {
  listJobsHandler,
  enqueuePostListingHandler,
  enqueueSyncOrdersHandler,
  retryJobHandler,
} = require('../controllers/jobController');

router.use(authenticate);
router.use(authorizeRoles('ADMIN'));

router.get('/', listJobsHandler);
router.post('/post-listing', enqueuePostListingHandler);
router.post('/sync-orders', enqueueSyncOrdersHandler);
router.post('/:id/retry', retryJobHandler);

module.exports = router;
