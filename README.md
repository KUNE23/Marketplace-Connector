
---

Marketplace‑Connector

Ringkasan
Marketplace‑Connector adalah aplikasi internal yang mengotomatisasi penyalinan data produk dari Shopee ke Akulaku. Daripada mengekspor, mengedit, dan mengunggah ulang secara manual, aplikasi ini secara berkala mengambil daftar produk terbaru, mengubah formatnya sesuai kebutuhan Akulaku, lalu mengirimkannya melalui API Merchant Akulaku. Semua proses tercatat di database PostgreSQL untuk audit dan penelusuran.

Fitur Utama
- Sinkronisasi terjadwal – dijalankan otomatis tiap 5 menit menggunakan cron sistem.
- Pemrosesan idempotent – batasan SKU unik dan log ID yang telah diproses mencegah duplikasi unggahan.
- Jejak audit lengkap – respons mentah Shopee disimpan, dan setiap panggilan ke Akulaku dicatat dengan status, kode respons, serta isi respons.
- Dashboard internal – antarmuka Vue 3 menampilkan daftar produk, status sinkronisasi, rincian error, serta tombol untuk sinkronisasi manual atau retry.
- Mapping bidang yang dapat dikonfigurasi – disimpan di database dan dapat diubah via UI.
- Keamanan token – kunci API disimpan di variabel lingkungan (.env) dan tidak pernah dituliskan ke log.
- Arsitektur dapat diperluas – marketplace lain dapat ditambahkan dengan menambah adaptor layanan baru.

Teknologi yang Digunakan
**Frontend**

• Teknologi: Vue 3 (Vite) – UI untuk menampilkan produk, status sinkronisasi, dan kontrol manual

**Backend**
• Teknologi: Express JS (Node.js) – REST API yang mengatur pengambilan, transformasi, pengiriman, dan pencatatan

**Database**
• Teknologi: PostgreSQL – menyimpan tabel produk, payload mentah Shopee, log sinkronisasi, dan konfigurasi mapping

**Scheduler**
• Teknologi: cron sistem – memanggil endpoint sinkronisasi setiap 5 menit

**Layanan Eksternal**
• Teknologi: API Shopee (atau scraper Playwright/Puppeteer) dan API Merchant Akulaku

**Konfigurasi**
• Teknologi: Variabel lingkungan (.env) untuk token API, URL database, ID toko, dsb.

Deploy (VPS)

Database (Supabase pooler):

- `DATABASE_URL` runtime memakai **transaction pooler port 6543** dengan `?pgbouncer=true&connection_limit=1`. Pooler membatasi 15 klien per sesi; tanpa batas ini muncul `EMAXCONNSESSION` dan login gagal.
- `DIRECT_URL` tetap port 5432 (session mode) untuk migrasi Prisma (`prisma migrate`).
- Jangan jalankan lebih dari satu proses backend tanpa perlu. Setiap proses Node membuka pool Prisma sendiri.

Browser automation (Playwright) — dipakai login Akulaku, posting produk, dan sync order:

```bash
npm ci                          # postinstall otomatis mengunduh Chromium
npx playwright install --with-deps chromium   # sekali per OS/image (lib sistem)
```

- `playwright` ada di `dependencies` (bukan dev) agar tidak hilang saat `npm ci --omit=dev`.
- Tanpa Chromium, aksi Akulaku akan gagal dengan pesan yang jelas ("Browser Chromium Playwright belum terpasang").
- Login Akulaku memerlukan OTP. Alur: `POST /api/akulaku-accounts/:id/login` → state `otp_required` (browser ditahan hidup) → `POST /api/akulaku-accounts/:id/login/otp`. Browser flow disimpan in-memory dengan TTL (`AKULAKU_LOGIN_TTL_MS`, default 10 menit).
- Alternatif sekali jalan lewat CLI headed: `npm run akulaku:login -- <accountId>`.

Kategori Akulaku otomatis:

- Daftar kategori asli diambil dari API internal Seller Center:
  `node scripts/scrapeCategories.js` → menulis `data/categories.json` (1.400+ jalur leaf).
- Impor ke DB + seed aturan kata kunci:
  `node prisma/category.seeders.js`
- Tabel: `AkulakuCategory` (jalur valid) dan `CategoryRule` (kata kunci → jalur, `priority` lebih besar menang).
- Saat posting, kategori ditentukan dari nama produk (kata kunci); user **tidak** mengisi kategori manual di UI.
- Endpoint: `GET /api/categories`, `GET /api/categories/resolve?productName=...`, `GET|POST /api/categories/rules`, `DELETE /api/categories/rules/:id`.
- Aturan di-cache 60 detik; POST/DELETE rules otomatis membersihkan cache.

Posting produk:

- Mulai dari UI tombol **"Posting ke Akulaku"** → `POST /api/listings/:id/queue` → job `post_listing` → worker di proses terpisah.
- Worker WAJIB dijalankan dari folder `Backend` (agar `playwright` ter-resolve): `node src/worker.js` atau lewat PM2.
- `status: posted` HANYA dihasilkan dari posting nyata (worker memverifikasi produk muncul di daftar Akulaku + menangkap `Produk ID`). Update status manual ke `posted` ditolak.

Isian wajib posting (env `AKULAKU_POST_DEFAULT_*`): merek, bahan, negara asal, berat (**kg**, 0.01–999.9), dimensi (cm), stok. Model `Product` tidak menyimpan field ini.

Lisensi

Proyek ini dilisensikan di bawah lisensi MIT.


Fitur peran (SUPERADMIN / ADMIN / EMPLOYEE)

- **SUPERADMIN** — akses penuh + halaman **Monitor Sistem** (`/monitor`): metrik CPU/RAM/uptime, kecepatan API, endpoint tersibuk/terlambat, audit aktivitas, serta **Backup & Restore** database. Akun SUPERADMIN **tersembunyi** dari daftar user ADMIN dan tidak dapat diubah/dihapus oleh ADMIN.
- **ADMIN** — melihat & mengelola seluruh data bisnis (akun Akulaku, listing, pesanan, iklan, pegawai). Tidak bisa membuka Monitor.
- **EMPLOYEE** — hanya melihat data miliknya sendiri: akun Akulaku yang ia buat, listing/pesanan/omzet dari akun itu, dan iklan (hanya baca). Tidak bisa mengelola iklan.

Membuat akun SUPERADMIN (sekali, di server):

```bash
cd Backend
node -e "require('dotenv').config();const b=require('bcrypt');const c=require('crypto');const p=require('./src/lib/prisma');
const pw=c.randomBytes(9).toString('base64url')+'Aa1!';
p.user.create({data:{email:'superadmin@enzyy.com',passwordHash:b.hashSync(pw,10),role:'SUPERADMIN',active:true,name:'Super Admin'}})
 .then(()=>{console.log('email: superadmin@enzyy.com');console.log('password:',pw);})
 .finally(()=>p.\$disconnect());"
```

Backup & Restore

- **Otomatis**: server membuat backup tiap `AUTO_BACKUP_INTERVAL_HOURS` (default 24 jam) saat start, menyimpan `BACKUP_RETENTION_KEEP` file terakhir (default 14), dan menghapus `AuditLog`/`RequestMetric` lebih tua dari `LOG_RETENTION_DAYS` (default 30).
- **Manual**: halaman Monitor → "Backup Sekarang".
- **Restore**: dari halaman Monitor, wajib mengetik nama file untuk konfirmasi. Sistem otomatis membuat backup pengaman (`pre-restore`) sebelum menimpa.
- Format file: `backup-<ISO>-<alasan>.json.gz` di `Backend/backups/` (masuk `.gitignore` — berisi data sensitif).
- Catatan: `pg_dump` tidak dipakai karena DB berjalan di Supabase (managed) — backup dilakukan lewat Prisma.

Import produk Shopee (background)

- Halaman **Products** → "Mulai Import" menjalankan import di **server** (bukan browser), jadi bisa ditinggal / tab ditutup.
- Progres tersimpan di tabel `ImportState` (cursor rowid) → otomatis lanjut setelah server restart (`SHOPEE_IMPORT_AUTORESUME=true`).
- Endpoint: `GET /api/products/scrape/runner` (status), `POST /api/products/scrape/start`, `POST /api/products/scrape/stop`.
- Sumber data: file SQLite `shopee.db` (`SHOPEE_DB_PATH`). Scraping-nya sendiri dijalankan terpisah (lihat repo scraper).
