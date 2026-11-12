// Backend/src/controllers/recapController.js
const createError = require('http-errors');
const { getRecap, VALID_BUCKETS, VALID_PRESETS } = require('../services/recapService');

/** GET /api/recap?preset=30d&bucket=daily&from=&to=&accountId= */
async function recapHandler(req, res, next) {
  try {
    const preset = String(req.query.preset || '30d');
    const bucket = String(req.query.bucket || 'daily');
    if (!VALID_PRESETS.includes(preset)) {
      return next(createError(400, `preset tidak valid. Pilihan: ${VALID_PRESETS.join(', ')}`));
    }
    if (!VALID_BUCKETS.includes(bucket)) {
      return next(createError(400, `bucket tidak valid. Pilihan: ${VALID_BUCKETS.join(', ')}`));
    }

    // accountId tunggal (opsional) -> batasi ke akun itu (dengan cek akses).
    let accountIds = null;
    if (req.query.accountId) {
      const { assertAccountAccess } = require('../utils/scope');
      const prisma = require('../lib/prisma');
      await assertAccountAccess(prisma, req.user, req.query.accountId);
      accountIds = [BigInt(req.query.accountId)];
    }

    const result = await getRecap({
      preset,
      bucket,
      from: req.query.from,
      to: req.query.to,
      accountIds,
      user: req.user,
    });
    res.json(result);
  } catch (err) { next(err); }
}

module.exports = { recapHandler };
