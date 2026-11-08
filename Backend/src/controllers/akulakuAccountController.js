// Backend/src/controllers/akulakuAccountController.js
const createError = require('http-errors');
const {
  createAkulakuAccountSchema,
  updateAkulakuAccountSchema,
  akulakuAccountIdParamSchema,
  listAkulakuAccountsQuerySchema,
} = require('../validators/akulakuAccountValidator');
const {
  listAkulakuAccounts,
  createAkulakuAccount,
  getAkulakuAccountById,
  updateAkulakuAccount,
  deleteAkulakuAccount,
} = require('../services/akulakuAccountService');

function handleError(err, next) {
  if (err.name === 'ZodError') {
    return next(createError(400, err.errors.map((e) => e.message).join(', ')));
  }
  return next(err);
}

async function listAkulakuAccountsHandler(req, res, next) {
  try {
    const parsed = listAkulakuAccountsQuerySchema.parse(req.query);
    const result = await listAkulakuAccounts(parsed);
    res.json(result);
  } catch (err) { handleError(err, next); }
}

async function createAkulakuAccountHandler(req, res, next) {
  try {
    const parsed = createAkulakuAccountSchema.parse(req.body);
    const account = await createAkulakuAccount(parsed);
    res.status(201).json(account);
  } catch (err) { handleError(err, next); }
}

async function getAkulakuAccountHandler(req, res, next) {
  try {
    const { id } = akulakuAccountIdParamSchema.parse(req.params);
    const account = await getAkulakuAccountById(id);
    res.json(account);
  } catch (err) { handleError(err, next); }
}

async function updateAkulakuAccountHandler(req, res, next) {
  try {
    const { id } = akulakuAccountIdParamSchema.parse(req.params);
    const parsed = updateAkulakuAccountSchema.parse(req.body);
    const account = await updateAkulakuAccount(id, parsed);
    res.json(account);
  } catch (err) { handleError(err, next); }
}

async function deleteAkulakuAccountHandler(req, res, next) {
  try {
    const { id } = akulakuAccountIdParamSchema.parse(req.params);
    await deleteAkulakuAccount(id);
    res.status(204).send();
  } catch (err) { handleError(err, next); }
}

module.exports = {
  listAkulakuAccountsHandler,
  createAkulakuAccountHandler,
  getAkulakuAccountHandler,
  updateAkulakuAccountHandler,
  deleteAkulakuAccountHandler,
};
