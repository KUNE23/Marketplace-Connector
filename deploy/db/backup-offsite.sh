#!/usr/bin/env bash
# deploy/db/backup-offsite.sh
#
# Menyalin file backup dari server ke lokasi LUAR (komputer/backup server lain).
# Wajib dijalankan setelah DB pindah ke VPS: backup di folder yang sama dengan
# database TIDAK cukup (kalau VPS rusak, backup ikut hilang).
#
# Pemakaian:
#   bash backup-offsite.sh                    # kirim semua backup terbaru
#   bash backup-offsite.sh --latest           # hanya file terbaru
#
# Konfigurasi (env atau edit di bawah):
#   OFFSITE_HOST   user@host-tujuan
#   OFFSITE_PATH   /path/tujuan
#   BACKUP_DIR     default <repo>/Backend/backups

set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-$REPO_DIR/Backend/backups}"
OFFSITE_HOST="${OFFSITE_HOST:-}"
OFFSITE_PATH="${OFFSITE_PATH:-}"
ONLY_LATEST=0

if [ "${1:-}" = "--latest" ]; then ONLY_LATEST=1; fi

if [ -z "$OFFSITE_HOST" ] || [ -z "$OFFSITE_PATH" ]; then
  echo "ERROR: OFFSITE_HOST dan OFFSITE_PATH wajib diisi." >&2
  echo "" >&2
  echo "Contoh:" >&2
  echo "  OFFSITE_HOST='user@192.168.1.10' OFFSITE_PATH='/backup/enzyy' \\" >&2
  echo "    bash $0 --latest" >&2
  echo "" >&2
  echo "Atau pakai rclone (Google Drive/S3):" >&2
  echo "  rclone copy \"$BACKUP_DIR\" remote:enzyy-backup --include '*.json.gz'" >&2
  exit 1
fi

if [ ! -d "$BACKUP_DIR" ]; then
  echo "ERROR: folder backup tidak ada: $BACKUP_DIR" >&2
  exit 1
fi

echo "=== Backup lokal ==="
ls -1t "$BACKUP_DIR"/*.json.gz 2>/dev/null | head -n 5 || echo "(kosong)"

ssh "$OFFSITE_HOST" "mkdir -p '$OFFSITE_PATH'"

if [ "$ONLY_LATEST" = "1" ]; then
  LATEST=$(ls -1t "$BACKUP_DIR"/*.json.gz | head -n1)
  echo ""
  echo "=== Kirim file terbaru: $(basename "$LATEST") ==="
  rsync -avz --progress "$LATEST" "$OFFSITE_HOST:$OFFSITE_PATH/"
else
  echo ""
  echo "=== Kirim semua backup ==="
  rsync -avz --progress --include '*.json.gz' --exclude '*' "$BACKUP_DIR/" "$OFFSITE_HOST:$OFFSITE_PATH/"
fi

echo ""
echo "=== Verifikasi di tujuan ==="
ssh "$OFFSITE_HOST" "ls -lh '$OFFSITE_PATH' | tail -n 10"

echo ""
echo "Selesai. Backup di luar server sudah diperbarui."
