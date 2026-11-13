# Migrasi Database: Supabase ke VPS

Panduan memindahkan database dari **Supabase** (Seoul, ~470 ms/query) ke **PostgreSQL di VPS** (~1-5 ms/query).

VPS target: **2 vCPU / 8 GB RAM / 100 GB NVMe** — lebih dari cukup.

---

## Kenapa pindah

| | Supabase (Sekarang) | VPS |
|---|---|---|
| Query tunggal | ~470 ms | **1–5 ms** |
| Dashboard (11 query) | 1.397 ms | **~20 ms** |
| Batas koneksi | 15 (pooler) | 100 (lokal) |
| Biaya egress | ada | tidak ada |
| Risiko | dikelola Supabase | **ditanggung sendiri** |

---

## ⚠️ Baca dulu

Setelah DB di VPS, **backup jadi tanggung jawab Anda**:

- Backup otomatis Enzyy menyimpan di `Backend/backups/` — **di VPS yang sama**.
- Kalau VPS rusak/hilang, backup ikut hilang.
- **Wajib** jalankan `backup-offsite.sh` (lihat langkah 8).
- **Jangan hapus database Supabase** sampai migrasi terbukti benar (minimal 1 minggu).

---

## Langkah migrasi

### 1. Buat backup terbaru dari Supabase (di komputer lokal)

Jalankan di folder `Backend`:

```powershell
node -e "require('dotenv').config();const{createBackup}=require('./src/services/backupService');createBackup({reason:'migrasi-vps'}).then(r=>{console.log('FILE:',r.fileName);console.log('BARIS:',r.totalRows);console.log('UKURAN:',r.sizeMb,'MB')}).then(()=>process.exit(0))"
```

Atau lewat UI: login SUPERADMIN → **Monitor Sistem** → **Backup Sekarang** → **Unduh**.

Catat nama file, contoh: `backup-2026-11-13T10-17-46-540Z-migrasi-vps.json.gz`

### 2. Upload file backup ke VPS

```powershell
scp "Backend\backups\backup-XXXX.json.gz" user@IP-VPS:/tmp/
```

### 3. Clone repo di VPS (kalau belum)

```bash
sudo mkdir -p /opt/enzyy && sudo chown $USER:$USER /opt/enzyy
git clone https://github.com/KUNE23/Marketplace-Connector.git /opt/enzyy
cd /opt/enzyy/Backend
npm ci
```

### 4. Install PostgreSQL

```bash
sudo DB_PASSWORD='PASSWORD_KUAT_ANDA' bash /opt/enzyy/deploy/db/01-install-postgres.sh
```

Script akan menampilkan `DATABASE_URL`. Contoh hasil:

```
postgresql://enzyy:PASSWORD@127.0.0.1:5432/enzyy?schema=public&connection_limit=10
```

### 5. Siapkan .env untuk VPS

```bash
cd /opt/enzyy/Backend
cp env.example .env
nano .env
```

Isi **wajib**:

```bash
NODE_ENV=production
PORT=3000
CORS_ORIGIN=https://domain-anda.com

# Database LOKAL (bukan Supabase lagi)
DATABASE_URL=postgresql://enzyy:PASSWORD@127.0.0.1:5432/enzyy?schema=public&connection_limit=10
DIRECT_URL=postgresql://enzyy:PASSWORD@127.0.0.1:5432/enzyy?schema=public

# JWT & enkripsi (HARUS SAMA dengan yang lama!)
JWT_ACCESS_SECRET=<sama seperti di lokal>
AKULAKU_ENC_KEY=<sama seperti di lokal>

TRUST_PROXY=1
```

> **PENTING `AKULAKU_ENC_KEY`**: kalau berbeda dari yang lama, semua password akun
> Akulaku yang tersimpan tidak bisa didekripsi. Salin **persis** dari `.env` lokal.

### 6. Terapkan skema + restore data

```bash
cd /opt/enzyy/Backend
bash ../deploy/db/02-migrate-and-restore.sh /tmp/backup-XXXX.json.gz
```

Proses ini:
1. Cek koneksi database
2. `prisma migrate deploy` (membuat 17 tabel/migrasi)
3. Restore data dari backup
4. Reset sequence (agar insert berikutnya tidak bentrok)

### 7. Verifikasi

```bash
bash ../deploy/db/03-verify.sh
```

Yang harus terlihat:

```
=== 1) JUMLAH BARIS PER TABEL ===
  User                          5
  Product                    2200
  ...
=== 2) CEK SEQUENCE ===
  User                 max=17       next=18       OK
=== 3) UJI INSERT ===
  insert User OK
```

### 8. Siapkan backup keluar server

```bash
# Kirim backup ke komputer/backup server lain (via SSH)
OFFSITE_HOST='user@192.168.1.10' OFFSITE_PATH='/backup/enzyy' \
  bash /opt/enzyy/deploy/db/backup-offsite.sh --latest
```

Atau pakai rclone (Google Drive / S3):

```bash
rclone copy /opt/enzyy/Backend/backups remote:enzyy-backup --include '*.json.gz'
```

Jadwalkan harian (crontab):

```bash
crontab -e
# tambahkan:
30 2 * * * OFFSITE_HOST='user@host' OFFSITE_PATH='/backup/enzyy' bash /opt/enzyy/deploy/db/backup-offsite.sh --latest >> /var/log/enzyy-offsite.log 2>&1
```

### 9. Jalankan aplikasi

```bash
cd /opt/enzyy/Backend
npx playwright install --with-deps chromium
pm2 start ecosystem.config.js --env production
pm2 save
```

### 10. Verifikasi akhir

```bash
curl -s http://127.0.0.1:3000/api/health
pm2 logs enzyy-api --lines 30
```

Login ke UI → cek data muncul → cek dashboard cepat.

---

## Setelah migrasi berhasil

1. **Jangan hapus Supabase** selama 1 minggu (cadangan)
2. Bandingkan jumlah baris Supabase vs VPS (langkah 7)
3. Pastikan backup offsite berjalan tiap hari
4. Monitor disk: `df -h` (100 GB, data sekarang ~40 MB → sangat lega)

---

## Kalau ada masalah

| Gejala | Penyebab | Solusi |
|---|---|---|
| `ECONNREFUSED 127.0.0.1:5432` | Postgres mati | `sudo systemctl start postgresql` |
| `password authentication failed` | Password salah di `DATABASE_URL` | Cek `DB_PASSWORD` di langkah 4 |
| `duplicate key value` setelah restore | Sequence tidak direset | Jalankan `node -e "require('./src/services/backupService').resetSequences().then(console.log)"` |
| `relation does not exist` | Migrasi belum jalan | `npx prisma migrate deploy` |
| Data Akulaku tidak bisa dibaca | `AKULAKU_ENC_KEY` beda | Salin key dari `.env` lama |

---

## Rollback ke Supabase

Kalau ada masalah besar:

```bash
cd /opt/enzyy/Backend
nano .env    # kembalikan DATABASE_URL & DIRECT_URL ke Supabase
pm2 restart enzyy-api enzyy-worker
```

Data di Supabase **tidak tersentuh** oleh proses migrasi (kita hanya membaca).
