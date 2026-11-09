// Backend/scripts/akulakuLogin.js
/**
 * Login interaktif ke Akulaku Seller Center dan simpan sesi (storage state)
 * terenkripsi ke DB, supaya otomasi berikutnya tidak perlu OTP lagi.
 *
 * Pemakaian:
 *   node scripts/akulakuLogin.js            -> tampilkan daftar akun + id
 *   node scripts/akulakuLogin.js <accountId> -> buka browser, login, tunggu OTP
 *
 * Browser tampil (headed) supaya Anda bisa menyelesaikan OTP manual.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const prisma = require('../src/lib/prisma');
const { loginInteractively } = require('../src/services/akulakuBrowser');

async function listAccounts() {
  const accounts = await prisma.akulakuAccount.findMany({
    select: { id: true, label: true, username: true, status: true },
    orderBy: { id: 'asc' },
  });
  console.log('\nDaftar akun Akulaku:');
  if (!accounts.length) {
    console.log('  (belum ada akun — tambahkan lewat halaman Akun Akulaku di UI)');
  } else {
    for (const a of accounts) {
      console.log(`  id=${a.id.toString().padEnd(4)} [${a.status}] ${a.label} — ${a.username}`);
    }
  }
  console.log('\nJalankan: node scripts/akulakuLogin.js <accountId>\n');
}

(async () => {
  const accountId = process.argv[2];
  try {
    if (!accountId) {
      await listAccounts();
      return;
    }

    const account = await prisma.akulakuAccount.findUnique({ where: { id: BigInt(accountId) } });
    if (!account) {
      console.error(`Akun dengan id=${accountId} tidak ditemukan.`);
      await listAccounts();
      process.exitCode = 1;
      return;
    }

    console.log(`\nLogin untuk akun: ${account.label} (${account.username})`);
    const result = await loginInteractively(accountId);
    console.log('\n[akulaku] Login berhasil, sesi tersimpan. Detail:');
    console.log(JSON.stringify(result, null, 2));
    console.log('[akulaku] Sesi sekarang bisa dipakai otomasi (headless).\n');
  } catch (err) {
    console.error('\n[akulaku] Gagal login:', err.message || err);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();
