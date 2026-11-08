// Backend/src/controllers/jobController.js
const createError = require('http-errors');
const { enqueueJob, listJobs, retryJob } = require('../services/jobService');

function handleError(err, next) {
  if (err.name === 'ZodError') {
    return next(createError(400, err.errors.map((e) => e.message).join(', ')));
  }
  return next(err);
}

async function listJobsHandler(req, res, next) {
  try {
    const page = req.query.page ? Number(req.query.page) : 1;
    const limit = req.query.limit ? Number(req.query.limit) : 20;
    const result = await listJobs({ page, limit, status: req.query.status, type: req.query.type });
    res.json(result);
  } catch (err) { handleError(err, next); }
}

async function enqueuePostListingHandler(req, res, next) {
  try {
    const listingId = req.body?.listingId;
    if (!listingId) return next(createError(400, 'listingId wajib diisi'));
    const job = await enqueueJob({ type: 'post_listing', payload: { listingId: String(listingId) }, priority: 5 });
    res.status(201).json(job);
  } catch (err) { handleError(err, next); }
}

async function enqueueSyncOrdersHandler(req, res, next) {
  try {
    const job = await enqueueJob({ type: 'sync_orders', payload: {}, priority: 1 });
    res.status(201).json(job);
  } catch (err) { handleError(err, next); }
}

async function retryJobHandler(req, res, next) {
  try {
    const job = await retryJob(req.params.id);
    res.json(job);
  } catch (err) { handleError(err, next); }
}

module.exports = {
  listJobsHandler,
  enqueuePostListingHandler,
  enqueueSyncOrdersHandler,
  retryJobHandler,
};
