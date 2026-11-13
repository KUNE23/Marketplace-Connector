#!/usr/bin/env bash
# deploy/db/02-migrate-and-restore.sh
#
# Menyiapkan skema lalu memulihkan data dari file backup .json.gz
# (hasil dari halaman Monitor Enzyy / backupService).
#
# Prasyarat:
#   - PostgreSQL sudah terpasang (01-install-postgres.sh)
#   - File backup sudah di-upload ke VPS
#   - Repo sudah di-clone, `npm ci` sudah dijalankan
#
# Pemakaian (di VPS):
#   cd /opt/enzyy/Backend
#   DATABASE_URL='postgresql://...' DIRECT_URL='postgresql://...' \
#     bash ../deploy/db/02-migrate-and-restore.sh /path/backup-xxx.json.gz

set -euo pipefail

# Skrip ini butuh node_modules dari folder Backend. Pindah otomatis ke sana
# supaya bisa dijalankan dari folder mana pun.
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="${BACKEND_DIR:-$(cd "$SCRIPT_DIR/../../Backend" 2>/dev/null && pwd)}"

if [ -z "$BACKEND_DIR" ] || [ ! -d "$BACKEND_DIR/node_modules" ]; then
  echo "ERROR: folder Backend (dengan node_modules) tidak ditemukan." >&2
  echo "Jalankan 'npm ci' di folder Backend terlebih dahulu." >&2
  exit 1
fi
cd "$BACKEND_DIR"
echo "Folder kerja: $(pwd)"

BACKUP_FILE="${1:-}"
if [ -z "$BACKUP_FILE" ] || [ ! -f "$BACKUP_FILE" ]; then
  echo "ERROR: file backup tidak ditemukan." >&2
  echo "Pemakaian: bash deploy/db/02-migrate-and-restore.sh /path/backup-xxx.json.gz" >&2
  exit 1
fi

# Muat DATABASE_URL dari .env bila belum ada di environment shell.
# (File .env dibaca dotenv oleh Node, bukan oleh bash — jadi harus diambil manual.)
if [ -z "${DATABASE_URL:-}" ] && [ -f .env ]; then
  DATABASE_URL="$(node -e "require('dotenv').config({quiet:true});process.stdout.write(process.env.DATABASE_URL||'')" 2>/dev/null)"
  export DATABASE_URL
fi
if [ -z "${DATABASE_URL:-}" ] && [ -f ../Backend/.env ]; then
  DATABASE_URL="$(cd .. && node -e "require('dotenv').config({path:'Backend/.env',quiet:true});process.stdout.write(process.env.DATABASE_URL||'')" 2>/dev/null)"
  export DATABASE_URL
fi

if [ -z "${DATABASE_URL:-}" ]; then
  echo "ERROR: DATABASE_URL tidak ditemukan." >&2
  echo "Isi di Backend/.env, atau jalankan:" >&2
  echo "  DATABASE_URL='postgresql://...' bash $0 <file-backup>" >&2
  exit 1
fi

# Sembunyikan kredensial saat menampilkan
SAFE_URL=$(printf '%s' "$DATABASE_URL" | sed -E 's#://[^@]+@#://***@#')
echo "Database tujuan: $SAFE_URL"

echo ""
echo "=== 1) Cek koneksi database tujuan ==="
node <<'NODE'
require('dotenv').config({ quiet: true });
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.$queryRaw`SELECT 1`
  .then(() => { console.log('Koneksi OK'); })
  .catch((e) => { console.error('GAGAL konek:', e.message); process.exit(1); })
  .finally(() => p.$disconnect());
NODE

echo ""
echo "=== 2) Terapkan skema (prisma migrate deploy) ==="
npx prisma migrate deploy

echo ""
echo "=== 3) Salin file backup ke folder backups/ ==="
mkdir -p backups
cp "$BACKUP_FILE" "backups/$(basename "$BACKUP_FILE")"
BK_NAME="$(basename "$BACKUP_FILE")"
echo "File: backups/$BK_NAME"

echo ""
echo "=== 4) Restore data dari backup ==="
echo "PERINGATAN: semua data di database tujuan akan DIGANTI."
node - "$BK_NAME" <<'NODE'
require('dotenv').config({ quiet: true });
const bkName = process.argv[2];
const { restoreBackup } = require('./src/services/backupService');

restoreBackup(bkName)
  .then((r) => {
    console.log('Restore selesai.');
    console.log('  dari          :', r.restoredFrom);
    console.log('  safety backup :', r.safetyBackup);
    const ins = Object.entries(r.inserted).filter(([, v]) => v > 0);
    console.log('  tabel terisi  :', ins.map(([k, v]) => k + '=' + v).join(', '));
    const badSeq = Object.entries(r.sequences || {}).filter(
      ([, v]) => v !== 'ok' && !String(v).startsWith('skip'),
    );
    console.log('  sequence gagal:', badSeq.length ? badSeq.map(([k]) => k).join(', ') : 'tidak ada');
    process.exit(0);
  })
  .catch((e) => {
    console.error('GAGAL restore:', e.message);
    process.exit(1);
  });
NODE

echo ""
echo "=== 5) Selesai ==="
echo "Lanjutkan dengan: bash 03-verify.sh"
