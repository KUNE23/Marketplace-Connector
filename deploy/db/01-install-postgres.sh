#!/usr/bin/env bash
# deploy/db/01-install-postgres.sh
#
# Memasang PostgreSQL di VPS dan menyiapkan database untuk Enzyy.
# Dioptimalkan untuk VPS 2 vCPU / 8 GB RAM / NVMe.
#
# Pemakaian (di VPS):
#   sudo DB_PASSWORD='password-kuat-anda' bash 01-install-postgres.sh
#
# Env:
#   DB_NAME      default enzyy
#   DB_USER      default enzyy
#   DB_PASSWORD  WAJIB diisi
#   PG_VERSION   default 16

set -euo pipefail

DB_NAME="${DB_NAME:-enzyy}"
DB_USER="${DB_USER:-enzyy}"
DB_PASSWORD="${DB_PASSWORD:-}"
PG_VERSION="${PG_VERSION:-16}"

if [ -z "$DB_PASSWORD" ]; then
  echo "ERROR: DB_PASSWORD wajib diisi." >&2
  echo "Contoh: sudo DB_PASSWORD='rahasia123' bash 01-install-postgres.sh" >&2
  exit 1
fi

if [ "$(id -u)" -ne 0 ]; then
  echo "ERROR: jalankan dengan sudo." >&2
  exit 1
fi

echo "=== 1) Install PostgreSQL $PG_VERSION ==="
apt-get update -qq
apt-get install -y -qq postgresql postgresql-contrib curl ca-certificates >/dev/null
systemctl enable --now postgresql

PG_CONF_DIR="/etc/postgresql/$PG_VERSION/main"
if [ ! -d "$PG_CONF_DIR" ]; then
  # Debian kadang memakai path berbeda; cari yang ada
  PG_CONF_DIR=$(dirname "$(find /etc/postgresql -name postgresql.conf | head -n1)")
fi
echo "Konfigurasi: $PG_CONF_DIR"

echo "=== 2) Tuning untuk 8 GB RAM / NVMe ==="
mkdir -p "$PG_CONF_DIR/conf.d"
cat > "$PG_CONF_DIR/conf.d/99-enzyy.conf" <<'EOF'
# --- Tuning Enzyy (VPS 2 vCPU / 8 GB RAM / NVMe) ---
listen_addresses = 'localhost'          # JANGAN dibuka ke internet
max_connections = 100

# Memori
shared_buffers = 2GB
effective_cache_size = 6GB
maintenance_work_mem = 512MB
work_mem = 16MB
wal_buffers = 16MB

# Storage (NVMe)
random_page_cost = 1.1
effective_io_concurrency = 200
checkpoint_completion_target = 0.9

# WAL
wal_compression = on
max_wal_size = 4GB
min_wal_size = 1GB

# Logging lambat (membantu diagnosa)
log_min_duration_statement = 1000
log_checkpoints = on
log_autovacuum_min_duration = 0

# Timezone
timezone = 'Asia/Jakarta'
EOF

# Pastikan include conf.d aktif
if ! grep -q "include_dir = 'conf.d'" "$PG_CONF_DIR/postgresql.conf"; then
  echo "include_dir = 'conf.d'" >> "$PG_CONF_DIR/postgresql.conf"
fi

echo "=== 3) Buat user & database ==="
sudo -u postgres psql -v ON_ERROR_STOP=1 <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${DB_USER}') THEN
    CREATE ROLE ${DB_USER} LOGIN PASSWORD '${DB_PASSWORD}';
  ELSE
    ALTER ROLE ${DB_USER} WITH LOGIN PASSWORD '${DB_PASSWORD}';
  END IF;
END
\$\$;
SQL

if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" | grep -q 1; then
  sudo -u postgres createdb -O "${DB_USER}" "${DB_NAME}"
  echo "Database ${DB_NAME} dibuat."
else
  echo "Database ${DB_NAME} sudah ada."
fi

sudo -u postgres psql -d "${DB_NAME}" -v ON_ERROR_STOP=1 <<SQL
GRANT ALL ON SCHEMA public TO ${DB_USER};
ALTER SCHEMA public OWNER TO ${DB_USER};
SQL

echo "=== 4) Restart PostgreSQL ==="
systemctl restart postgresql
sleep 3

echo "=== 5) Uji koneksi ==="
PGPASSWORD="$DB_PASSWORD" psql -h 127.0.0.1 -U "$DB_USER" -d "$DB_NAME" -tAc "SELECT version();" | head -n1

echo ""
echo "============================================"
echo " PostgreSQL siap."
echo "============================================"
echo " DATABASE_URL=postgresql://${DB_USER}:${DB_PASSWORD}@127.0.0.1:5432/${DB_NAME}?schema=public&connection_limit=10"
echo " DIRECT_URL=postgresql://${DB_USER}:${DB_PASSWORD}@127.0.0.1:5432/${DB_NAME}?schema=public"
echo "============================================"
echo "Simpan DATABASE_URL di atas untuk langkah berikutnya."
