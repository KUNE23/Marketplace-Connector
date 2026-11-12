// Backend/src/controllers/listingController.js
const createError = require('http-errors');
const {
  createListingSchema,
  bulkCreateListingSchema,
  updateListingSchema,
  listingIdParamSchema,
  listListingsQuerySchema,
} = require('../validators/listingValidator');
const {
  createListing,
  createListingsBulk,
  queueListing,
  queueListingsBulk,
  listListings,
  getListingById,
  updateListing,
  deleteListing,
} = require('../services/listingService');

function handleError(err, next) {
  if (err.name === 'ZodError') {
    return next(createError(400, err.errors.map((e) => e.message).join(', ')));
  }
  return next(err);
}

async function listListingsHandler(req, res, next) {
  try {
    const parsed = listListingsQuerySchema.parse(req.query);
    const result = await listListings({ ...parsed, user: req.user });
    res.json(result);
  } catch (err) { handleError(err, next); }
}

async function createListingHandler(req, res, next) {
  try {
    const parsed = createListingSchema.parse(req.body);
    const listing = await createListing(parsed, req.user);
    res.status(201).json(listing);
  } catch (err) { handleError(err, next); }
}

async function bulkCreateListingHandler(req, res, next) {
  try {
    const parsed = bulkCreateListingSchema.parse(req.body);
    const result = await createListingsBulk(parsed, req.user);
    res.status(201).json(result);
  } catch (err) { handleError(err, next); }
}

async function getListingHandler(req, res, next) {
  try {
    const { id } = listingIdParamSchema.parse(req.params);
    const listing = await getListingById(id, req.user);
    res.json(listing);
  } catch (err) { handleError(err, next); }
}

async function updateListingHandler(req, res, next) {
  try {
    const { id } = listingIdParamSchema.parse(req.params);
    const parsed = updateListingSchema.parse(req.body);
    const listing = await updateListing(id, parsed, req.user);
    res.json(listing);
  } catch (err) { handleError(err, next); }
}

async function deleteListingHandler(req, res, next) {
  try {
    const { id } = listingIdParamSchema.parse(req.params);
    await deleteListing(id, req.user);
    res.status(204).send();
  } catch (err) { handleError(err, next); }
}

/** POST /api/listings/:id/queue — masukkan listing ke antrian posting Akulaku. */
async function queueListingHandler(req, res, next) {
  try {
    const { id } = listingIdParamSchema.parse(req.params);
    const result = await queueListing(id, { user: req.user });
    res.status(202).json(result);
  } catch (err) { handleError(err, next); }
}

/** POST /api/listings/queue-bulk — masukkan banyak listing ke antrian posting. */
async function queueListingsBulkHandler(req, res, next) {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
    if (!ids.length) return next(createError(400, 'ids wajib diisi (array id listing)'));
    const result = await queueListingsBulk(ids, { user: req.user });
    res.status(202).json(result);
  } catch (err) { handleError(err, next); }
}

module.exports = {
  listListingsHandler,
  createListingHandler,
  bulkCreateListingHandler,
  getListingHandler,
  updateListingHandler,
  deleteListingHandler,
  queueListingHandler,
  queueListingsBulkHandler,
};
