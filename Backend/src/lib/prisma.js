// Backend/src/lib/prisma.js
// Singleton Prisma Client.
// PENTING: jangan panggil `new PrismaClient()` di file lain - pakai instance ini,
// supaya tidak menghabiskan koneksi pooler (EMAXCONNSESSION).
const { PrismaClient } = require('@prisma/client');

const globalForPrisma = globalThis;

const prisma =
  globalForPrisma.__enzyyPrisma ||
  new PrismaClient({
    log: process.env.PRISMA_LOG === 'true' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.__enzyyPrisma = prisma;
}

module.exports = prisma;

