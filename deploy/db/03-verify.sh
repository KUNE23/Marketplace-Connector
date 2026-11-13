#!/usr/bin/env bash
# deploy/db/03-verify.sh
#
# Verifikasi setelah migrasi: jumlah baris per tabel, sequence, dan uji insert.
#
# Pemakaian (di VPS, folder Backend):
#   DATABASE_URL='postgresql://...' bash ../deploy/db/03-verify.sh

set -euo pipefail

# Muat DATABASE_URL dari .env bila belum ada di environment shell.
if [ -z "${DATABASE_URL:-}" ] && [ -f .env ]; then
  DATABASE_URL="$(node -e "require('dotenv').config({quiet:true});process.stdout.write(process.env.DATABASE_URL||'')" 2>/dev/null)"
  export DATABASE_URL
fi

if [ -z "${DATABASE_URL:-}" ]; then
  echo "ERROR: DATABASE_URL tidak ditemukan." >&2
  echo "Isi di Backend/.env, atau jalankan dengan DATABASE_URL='postgresql://...' bash $0" >&2
  exit 1
fi

node <<'NODE'
require('dotenv').config();
const prisma = require('./src/lib/prisma');

async function main() {
  console.log('=== 1) JUMLAH BARIS PER TABEL ===');
  const tables = [
    'User', 'AkulakuAccount', 'Product', 'Listing', 'AkulakuOrder',
    'AkulakuOrderItem', 'AkulakuOrderExtra', 'SaleOrder', 'AdSpend',
    'MarkupTier', 'AkulakuCategory', 'CategoryRule', 'Violation',
    'ChatConversation', 'ChatMessage', 'Job', 'Notification',
    'RefreshToken', 'AuditLog', 'RequestMetric',
  ];
  const modelOf = (t) => t.charAt(0).toLowerCase() + t.slice(1);

  let total = 0;
  for (const t of tables) {
    try {
      const c = await prisma[modelOf(t)].count();
      total += c;
      console.log(`  ${t.padEnd(22)} ${String(c).padStart(8)}`);
    } catch (e) {
      console.log(`  ${t.padEnd(22)}       ?? (${e.message.slice(0, 40)})`);
    }
  }
  console.log(`  ${'TOTAL'.padEnd(22)} ${String(total).padStart(8)}`);

  console.log('\n=== 2) CEK SEQUENCE ===');
  const seqTables = ['User', 'Product', 'Listing', 'AkulakuOrder', 'Job', 'AuditLog', 'RequestMetric'];
  for (const t of seqTables) {
    try {
      const maxRow = await prisma.$queryRawUnsafe(`SELECT COALESCE(MAX("id"),0) AS m FROM "${t}"`);
      const nextRow = await prisma.$queryRawUnsafe(
        `SELECT nextval(pg_get_serial_sequence('"${t}"','id')) AS n`,
      );
      const max = String(maxRow[0].m);
      const next = String(nextRow[0].n);
      // nextval sudah memajukan sequence; aman selama next > max
      const ok = BigInt(next) > BigInt(max);
      console.log(
        `  ${t.padEnd(20)} max=${max.padEnd(8)} next=${next.padEnd(8)} ${ok ? 'OK' : 'BERMASALAH'}`,
      );
    } catch (e) {
      console.log(`  ${t.padEnd(20)} gagal cek: ${e.message.slice(0, 50)}`);
    }
  }

  console.log('\n=== 3) UJI INSERT (data akan dihapus lagi) ===');
  try {
    const u = await prisma.user.create({
      data: {
        email: `verify-${Date.now()}@example.invalid`,
        passwordHash: 'x',
        role: 'EMPLOYEE',
        name: 'Verify',
      },
      select: { id: true },
    });
    console.log(`  insert User OK (id=${u.id})`);
    await prisma.user.delete({ where: { id: u.id } });
    console.log('  hapus data uji OK');
  } catch (e) {
    console.log('  INSERT GAGAL <<<', e.message.slice(0, 150));
  }

  await prisma.$disconnect();
}

main().catch((e) => { console.error('FATAL:', e.message); process.exit(1); });
NODE
