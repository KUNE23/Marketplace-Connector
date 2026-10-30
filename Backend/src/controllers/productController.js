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

module.exports = {
  createProductHandler,
  getProductHandler,
  listProductsHandler,
  updateProductHandler,
  deleteProductHandler,
};
