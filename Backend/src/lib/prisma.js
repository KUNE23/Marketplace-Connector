// Backend/src/lib/prisma.js
// Singleton Prisma Client.
// PENTING: jangan panggil `new PrismaClient()` di file lain - pakai instance ini,
// supaya tidak menghabiskan koneksi pooler (EMAXCONNSESSION).
const { PrismaClient } = require('@prisma/client');

/**
 * Batasi jumlah koneksi Prisma.
 *
 * - Database LOKAL (VPS: 127.0.0.1 / localhost) -> default 10 koneksi.
 *   Tidak ada batas pooler, jadi boleh lebih banyak untuk paralelisme.
 * - Database via POOLER (mis. Supabase) -> default 1 koneksi.
 *   Pooler membatasi total klien (session mode 15), jadi harus hemat.
 *
 * Bisa dioverride lewat PRISMA_CONNECTION_LIMIT atau ?connection_limit= di URL.
 */
function withConnectionLimit(url) {
  if (!url) return url;
  if (/[?&]connection_limit=/i.test(url)) return url;

  const isLocal = /@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(url);
  const limit = process.env.PRISMA_CONNECTION_LIMIT || (isLocal ? '10' : '1');
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
