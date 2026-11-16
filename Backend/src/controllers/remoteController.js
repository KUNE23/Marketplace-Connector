// Backend/src/controllers/remoteController.js
const createError = require('http-errors');
const remote = require('../services/remoteBrowserService');
const { assertAccountAccess } = require('../utils/scope');
const prisma = require('../lib/prisma');

function handleError(err, next) {
  if (err.name === 'ZodError') {
    return next(createError(400, err.errors.map((e) => e.message).join(', ')));
  }
  return next(err);
}

/** GET /api/remote/sessions — daftar sesi aktif. */
async function listSessionsHandler(req, res, next) {
  try {
    res.json({
      sessions: remote.listSessions(),
      maxSessions: remote.MAX_SESSIONS,
      idleMs: remote.IDLE_MS,
    });
  } catch (err) { handleError(err, next); }
}

/** POST /api/remote/:accountId/start — mulai sesi browser remote. */
async function startHandler(req, res, next) {
  try {
    const accountId = req.params.accountId;
    await assertAccountAccess(prisma, req.user, accountId);
    const result = await remote.startSession(accountId, { user: req.user });
    req.audit?.('remote.start', {
      resource: 'remote',
      resourceId: result.sessionId,
      detail: { accountId },
    });
    res.status(201).json(result);
  } catch (err) { handleError(err, next); }
}

/**
 * GET /api/remote/:sessionId/stream — aliran gambar (Server-Sent Events).
 *
 * Mengirim:
 *   event: meta   -> { width, height }
 *   event: frame  -> data:<base64 jpeg>
 *   event: url    -> URL halaman terkini
 */
async function streamHandler(req, res, next) {
  try {
    const session = remote.getSession(req.params.sessionId);
    if (!session) return next(createError(404, 'Sesi tidak ditemukan atau sudah berakhir'));
    if (session.ownerId && String(session.ownerId) !== String(req.user?.id)) {
      const { isAdmin } = require('../utils/scope');
      if (!isAdmin(req.user)) return next(createError(403, 'Sesi ini bukan milik Anda'));
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // penting: jangan di-buffer nginx
    });
    res.write('retry: 2000\n\n');

    let lastSentSeq = -1;
    let lastUrl = null;

    const sendMeta = () => {
      const vp = session.viewport || remote.VIEWPORT;
      res.write(`event: meta\ndata: ${JSON.stringify({ width: vp.width, height: vp.height })}\n\n`);
    };

    const push = () => {
      // Metadata bila viewport berubah.
      const vp = session.viewport || remote.VIEWPORT;
      if (session.__lastMeta !== `${vp.width}x${vp.height}`) {
        session.__lastMeta = `${vp.width}x${vp.height}`;
        sendMeta();
      }
      // URL berubah -> beri tahu klien.
      if (session.currentUrl !== lastUrl) {
        lastUrl = session.currentUrl;
        res.write(`event: url\ndata: ${JSON.stringify({ url: lastUrl })}\n\n`);
      }
      // Frame baru saja.
      if (session.frameSeq !== lastSentSeq && session.latestFrame) {
        lastSentSeq = session.frameSeq;
        res.write(`event: frame\ndata: ${session.latestFrame}\n\n`);
      }
    };

    session.viewers.add(push);
    sendMeta();
    push();

    // Denyut agar proxy tidak memutus koneksi saat halaman diam.
    const keepAlive = setInterval(() => {
      res.write(': keep-alive\n\n');
      push();
    }, 15000);
    if (keepAlive.unref) keepAlive.unref();

    req.on('close', () => {
      clearInterval(keepAlive);
      session.viewers.delete(push);
    });
  } catch (err) { handleError(err, next); }
}

/** POST /api/remote/:sessionId/input — kirim mouse/keyboard. */
async function inputHandler(req, res, next) {
  try {
    const result = await remote.sendInput(req.params.sessionId, req.body || {});
    res.json(result);
  } catch (err) { handleError(err, next); }
}

/** POST /api/remote/:sessionId/stop — akhiri sesi. */
async function stopHandler(req, res, next) {
  try {
    const result = await remote.stopSession(req.params.sessionId);
    req.audit?.('remote.stop', { resource: 'remote', resourceId: req.params.sessionId });
    res.json(result);
  } catch (err) { handleError(err, next); }
}

/** POST /api/remote/:sessionId/save-session — simpan sesi setelah login manual. */
async function saveSessionHandler(req, res, next) {
  try {
    const remote = require('../services/remoteBrowserService');
    const result = await remote.saveSessionFromRemote(req.params.sessionId);
    req.audit?.('remote.save_session', {
      resource: 'remote',
      resourceId: req.params.sessionId,
      detail: { accountId: result.accountId },
    });
    res.json(result);
  } catch (err) { handleError(err, next); }
}

module.exports = {
  listSessionsHandler,
  startHandler,
  streamHandler,
  inputHandler,
  stopHandler,
  saveSessionHandler,
};
