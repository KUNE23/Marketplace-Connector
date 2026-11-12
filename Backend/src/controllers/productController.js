// Backend/src/controllers/productController.js
const {
  createProductSchema,
  updateProductSchema,
  productIdParamSchema,
  listProductsQuerySchema,
} = require('../validators/productValidator');
const {
  createProduct,
  getProductById,
  listProducts,
  updateProduct,
  deleteProduct,
} = require('../services/productService');
const createError = require('http-errors');

function handleError(err, next) {
  if (err.name === 'ZodError') {
    return next(createError(400, err.errors.map((e) => e.message).join(', ')));
  }
  return next(err);
}

async function createProductHandler(req, res, next) {
  try {
    const parsed = createProductSchema.parse(req.body);
    const product = await createProduct(parsed);
    res.status(201).json(product);
  } catch (err) {
    handleError(err, next);
  }
}

async function getProductHandler(req, res, next) {
  try {
    const { id } = productIdParamSchema.parse(req.params);
    const product = await getProductById(id);
    res.json(product);
  } catch (err) {
    handleError(err, next);
  }
}

async function listProductsHandler(req, res, next) {
  try {
    const parsed = listProductsQuerySchema.parse(req.query);
    const result = await listProducts({
      page: parsed.page,
      limit: parsed.limit,
      search: parsed.search,
      hasListing: parsed.hasListing,
    });
    res.json(result);
  } catch (err) {
    handleError(err, next);
  }
}

async function updateProductHandler(req, res, next) {
  try {
    const { id } = productIdParamSchema.parse(req.params);
    const parsed = updateProductSchema.parse(req.body);
    const product = await updateProduct(id, parsed);
    res.json(product);
  } catch (err) {
    handleError(err, next);
  }
}

async function deleteProductHandler(req, res, next) {
  try {
    const { id } = productIdParamSchema.parse(req.params);
    await deleteProduct(id);
    res.status(204).send();
  } catch (err) {
    handleError(err, next);
  }
}

const { importNextBatch, getScrapeStats, resetImport } = require('../services/shopeeImportService');
const shopeeImportRunner = require('../services/shopeeImportRunner');

async function scrapeStatsHandler(req, res, next) {
  try {
    const stats = await getScrapeStats();
    res.json(stats);
  } catch (err) {
    handleError(err, next);
  }
}

async function importBatchHandler(req, res, next) {
  try {
    const batchSize = req.body?.batchSize ? Number(req.body.batchSize) : 50;
    const summary = await importNextBatch({ batchSize });
    res.json(summary);
  } catch (err) {
    handleError(err, next);
  }
}

async function resetImportHandler(req, res, next) {
  try {
    const state = await resetImport();
    res.json(state);
  } catch (err) {
    handleError(err, next);
  }
}

/** GET /api/products/scrape/runner — status import background. */
async function importRunnerStatusHandler(req, res, next) {
  try {
    res.json(await shopeeImportRunner.getStatus());
  } catch (err) {
    handleError(err, next);
  }
}

/** POST /api/products/scrape/start — mulai import di background. Body: { reset?: boolean } */
async function importRunnerStartHandler(req, res, next) {
  try {
    const result = await shopeeImportRunner.start({ reset: Boolean(req.body?.reset) });
    req.audit?.('shopee_import.start', { resource: 'product', detail: result });
    res.status(result.started ? 202 : 200).json(result);
  } catch (err) {
    handleError(err, next);
  }
}

/** POST /api/products/scrape/stop — hentikan import background. */
async function importRunnerStopHandler(req, res, next) {
  try {
    const result = shopeeImportRunner.stop();
    req.audit?.('shopee_import.stop', { resource: 'product' });
    res.json(result);
  } catch (err) {
    handleError(err, next);
  }
}

module.exports = {
  createProductHandler,
  getProductHandler,
  listProductsHandler,
  updateProductHandler,
  deleteProductHandler,
  scrapeStatsHandler,
  importBatchHandler,
  resetImportHandler,
  importRunnerStatusHandler,
  importRunnerStartHandler,
  importRunnerStopHandler,
};

