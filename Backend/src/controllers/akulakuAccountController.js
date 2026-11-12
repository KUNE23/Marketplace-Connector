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
  getAkulakuSessionInfo,
} = require('../services/akulakuAccountService');
const { startLogin, submitOtp, cancelLogin } = require('../services/akulakuLoginFlow');
const { assertAccountAccess } = require('../utils/scope');
const prisma = require('../lib/prisma');
const { z } = require('zod');

const otpSchema = z.object({
  code: z.string().trim().min(4, { message: 'Kode OTP minimal 4 digit' }).max(8),
  channel: z.enum(['whatsapp', 'sms']).optional(),
});

function handleError(err, next) {
  if (err.name === 'ZodError') {
    return next(createError(400, err.errors.map((e) => e.message).join(', ')));
  }
  return next(err);
}

async function listAkulakuAccountsHandler(req, res, next) {
  try {
    const parsed = listAkulakuAccountsQuerySchema.parse(req.query);
    const result = await listAkulakuAccounts({ ...parsed, user: req.user });
    res.json(result);
  } catch (err) { handleError(err, next); }
}

async function createAkulakuAccountHandler(req, res, next) {
  try {
    const parsed = createAkulakuAccountSchema.parse(req.body);
    const account = await createAkulakuAccount(parsed, req.user);
    res.status(201).json(account);
  } catch (err) { handleError(err, next); }
}

async function getAkulakuAccountHandler(req, res, next) {
  try {
    const { id } = akulakuAccountIdParamSchema.parse(req.params);
    const account = await getAkulakuAccountById(id, req.user);
    res.json(account);
  } catch (err) { handleError(err, next); }
}

async function updateAkulakuAccountHandler(req, res, next) {
  try {
    const { id } = akulakuAccountIdParamSchema.parse(req.params);
    const parsed = updateAkulakuAccountSchema.parse(req.body);
    const account = await updateAkulakuAccount(id, parsed, req.user);
    res.json(account);
  } catch (err) { handleError(err, next); }
}

async function deleteAkulakuAccountHandler(req, res, next) {
  try {
    const { id } = akulakuAccountIdParamSchema.parse(req.params);
    await deleteAkulakuAccount(id, req.user);
    res.status(204).send();
  } catch (err) { handleError(err, next); }
}

/** POST /api/akulaku-accounts/:id/login — mulai login (isi kredensial otomatis). */
async function loginStartHandler(req, res, next) {
  try {
    const { id } = akulakuAccountIdParamSchema.parse(req.params);
    await assertAccountAccess(prisma, req.user, id);
    const result = await startLogin(id);
    res.json(result);
  } catch (err) { handleError(err, next); }
}

/** POST /api/akulaku-accounts/:id/login/otp — kirim kode OTP. */
async function loginOtpHandler(req, res, next) {
  try {
    const { id } = akulakuAccountIdParamSchema.parse(req.params);
    await assertAccountAccess(prisma, req.user, id);
    const parsed = otpSchema.parse(req.body);
    const result = await submitOtp(id, parsed.code, parsed.channel);
    res.json(result);
  } catch (err) { handleError(err, next); }
}

/** DELETE /api/akulaku-accounts/:id/login — batalkan proses login. */
async function loginCancelHandler(req, res, next) {
  try {
    const { id } = akulakuAccountIdParamSchema.parse(req.params);
    await assertAccountAccess(prisma, req.user, id);
    await cancelLogin(id);
    res.status(204).send();
  } catch (err) { handleError(err, next); }
}

/** GET /api/akulaku-accounts/:id/session — status sesi Akulaku akun ini. */
async function sessionInfoHandler(req, res, next) {
  try {
    const { id } = akulakuAccountIdParamSchema.parse(req.params);
    await assertAccountAccess(prisma, req.user, id);
    res.json(await getAkulakuSessionInfo(id));
  } catch (err) { handleError(err, next); }
}

module.exports = {
  listAkulakuAccountsHandler,
  createAkulakuAccountHandler,
  getAkulakuAccountHandler,
  updateAkulakuAccountHandler,
  deleteAkulakuAccountHandler,
  loginStartHandler,
  loginOtpHandler,
  loginCancelHandler,
  sessionInfoHandler,
};
