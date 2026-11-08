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
    const result = await listListings(parsed);
    res.json(result);
  } catch (err) { handleError(err, next); }
}

async function createListingHandler(req, res, next) {
  try {
    const parsed = createListingSchema.parse(req.body);
    const listing = await createListing(parsed);
    res.status(201).json(listing);
  } catch (err) { handleError(err, next); }
}

async function bulkCreateListingHandler(req, res, next) {
  try {
    const parsed = bulkCreateListingSchema.parse(req.body);
    const result = await createListingsBulk(parsed);
    res.status(201).json(result);
  } catch (err) { handleError(err, next); }
}

async function getListingHandler(req, res, next) {
  try {
    const { id } = listingIdParamSchema.parse(req.params);
    const listing = await getListingById(id);
    res.json(listing);
  } catch (err) { handleError(err, next); }
}

async function updateListingHandler(req, res, next) {
  try {
    const { id } = listingIdParamSchema.parse(req.params);
    const parsed = updateListingSchema.parse(req.body);
    const listing = await updateListing(id, parsed);
    res.json(listing);
  } catch (err) { handleError(err, next); }
}

async function deleteListingHandler(req, res, next) {
  try {
    const { id } = listingIdParamSchema.parse(req.params);
    await deleteListing(id);
    res.status(204).send();
  } catch (err) { handleError(err, next); }
}

module.exports = {
  listListingsHandler,
  createListingHandler,
  bulkCreateListingHandler,
  getListingHandler,
  updateListingHandler,
  deleteListingHandler,
};
