// Backend/server.js
require("dotenv").config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const config = require('./src/config');
const { securityHeaders, corsOptions } = require('./src/middleware/security');
const { apiLimiter, authLimiter } = require('./src/middleware/rateLimit');
const statusRouter = require('./src/routes/status');
const authRouter = require('./src/routes/auth');
const userRouter = require('./src/routes/users');
const errorHandler = require('./src/middleware/errorHandler');
const { requestMetrics, attachAudit } = require('./src/middleware/observability');
const prisma = require('./src/lib/prisma');

const app = express();
const PORT = config.port;

// Di belakang reverse proxy (nginx) agar IP klien terbaca benar oleh rate limiter.
// Set TRUST_PROXY=1 (atau jumlah hop) di VPS.
if (process.env.TRUST_PROXY) {
  const val = process.env.TRUST_PROXY === 'true' ? 1 : Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY;
  app.set('trust proxy', val);
}

app.disable('x-powered-by');
app.use(securityHeaders());
app.use(cors({ ...corsOptions(), credentials: true }));
app.use(cookieParser());
app.use(express.json({ limit: process.env.BODY_LIMIT || '1mb' }));

// Rate limiting: umum untuk /api, ketat untuk autentikasi.
app.use('/api', apiLimiter);
app.use('/api/auth', authLimiter);

// Observability (untuk halaman Monitor SUPERADMIN): metrik request + helper audit.
app.use(requestMetrics);
app.use(attachAudit);

app.use('/api', statusRouter);
app.use('/api/auth', authRouter);
app.use('/api/users', userRouter);
app.use('/api/notifications', require('./src/routes/notifications'));
app.use('/api/sales', require('./src/routes/sales'));
app.use('/api/products', require('./src/routes/products'));
app.use('/api/akulaku-accounts', require('./src/routes/akulakuAccounts'));
app.use('/api/listings', require('./src/routes/listings'));
app.use('/api/categories', require('./src/routes/categories'));
app.use('/api/markup-tiers', require('./src/routes/markupTiers'));
app.use('/api/akulaku-orders', require('./src/routes/akulakuOrders'));
app.use('/api/jobs', require('./src/routes/jobs'));
app.use('/api/ad-spends', require('./src/routes/adSpends'));
app.use('/api/dashboard', require('./src/routes/dashboard'));
app.use('/api/leaderboard', require('./src/routes/leaderboard'));
app.use('/api/violations', require('./src/routes/violations'));
app.use('/api/chat', require('./src/routes/chat'));
app.use('/api/recap', require('./src/routes/recap'));
app.use('/api/monitor', require('./src/routes/monitor'));
app.use('/api/backups', require('./src/routes/backups'));

app.use(errorHandler);

const server = app.listen(PORT, () => {
  console.log(`Backend server listening on port ${PORT}`);
  // Auto-backup berkala + pembersihan log lama (khusus konfigurasi via env).
  require('./src/services/backupScheduler').startScheduler();
  // Lanjutkan import Shopee yang tertunda (mis. server restart di tengah import).
  require('./src/services/shopeeImportRunner').autoResume();
});

// Lepas koneksi Prisma saat shutdown supaya pooler tidak menumpuk koneksi
// (penyebab EMAXCONNSESSION saat restart berulang / nodemon).
async function shutdown(signal) {
  console.log(`${signal} diterima, menutup server...`);
  server.close(async () => {
    try {
      await prisma.$disconnect();
    } catch (err) {
      console.error('Gagal disconnect Prisma:', err.message || err);
    }
    process.exit(0);
  });
  // Jaring pengaman bila koneksi menggantung.
  setTimeout(() => process.exit(1), 10000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
