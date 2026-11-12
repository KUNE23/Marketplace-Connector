// Backend/src/lib/prisma.js
// Singleton Prisma Client.
// PENTING: jangan panggil `new PrismaClient()` di file lain - pakai instance ini,
// supaya tidak menghabiskan koneksi pooler (EMAXCONNSESSION).
const { PrismaClient } = require('@prisma/client');

/**
 * Supabase pooler hanya memberi 15 klien per sesi. Setiap proses Node (API server,
 * worker) membuka pool sendiri, jadi pool default Prisma (num_cpus*2+1) cepat
 * menghabiskan kuota dan memicu `EMAXCONNSESSION` / `ConnectionReset`.
 *
 * Kalau DATABASE_URL belum menyetel connection_limit, tambahkan otomatis.
 * Prioritaskan port transaction pooler (6543) + pgbouncer=true di .env.
 */
function withConnectionLimit(url) {
  if (!url) return url;
  if (/[?&]connection_limit=/i.test(url)) return url;
  const limit = process.env.PRISMA_CONNECTION_LIMIT || '1';
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}connection_limit=${limit}`;
}

const globalForPrisma = globalThis;

const prisma =
  globalForPrisma.__enzyyPrisma ||
  new PrismaClient({
    datasources: { db: { url: withConnectionLimit(process.env.DATABASE_URL) } },
    log: process.env.PRISMA_LOG === 'true' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.__enzyyPrisma = prisma;
}

module.exports = prisma;
