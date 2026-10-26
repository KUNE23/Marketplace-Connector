Berikut README dalam Bahasa Indonesia.

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

Panduan Cepat (Pengembangan)

1. Clone repository  
      git clone https://github.com/your-org/Marketplace-Connector.git
   cd Marketplace-Connector
   

2. Setup backend  
      cd backend
   npm install
   cp .env.example .env   # isi token Shopee, token Akulaku, dan URL database
   

3. Buat skema database  
      psql $DATABASE_URL -f sql/schema.sql
   

4. Setup frontend  
      cd ../frontend
   npm install
   npm run dev   # server dev di http://localhost:5173
   

5. Jalankan backend  
      cd ../backend
   npm run dev   # server Express di http://localhost:3000
   

6. Jadwalkan sinkronisasi otomatis  
   Buat skrip run_sync.sh:
      #!/usr/bin/env bash
   curl -s -X POST http://127.0.0.1:3000/api/sync > /dev/null
   
   Tambahkan ke cron (setiap 5 menit):
      */5 * * * * /home/$(whoami)/scripts/run_sync.sh >> /home/$(whoami)/logs/sync.log 2>&1
   

Cara Menggunakan

- Buka dashboard Vue (dilayani oleh Express) untuk melihat daftar produk dan status sinkronisasi.
- Klik Sync Now untuk memicu sinkronisasi secara langsung.
- Pada baris yang gagal, gunakan tombol Retry untuk mengirim ulang ke Akulaku.
- Semua log dapat diakses melalui endpoint /api/logs atau langsung di tabel sync_log pada database.

Memperluas Sistem

Arsitektur dibuat modular:

- Tambahkan marketplace baru dengan membuat modul layanan (mis. services/tokopedia.js) yang mengimplementasikan fetchItems dan pushProduct.
- Update tabel field_map untuk menentukan cara memetakan field sumber ke field target.
- Ubah jadwal pada entri cron bila diperlukan.

Kontribusi

Pull request, laporan bug, dan saran penambahan adaptor marketplace dipersilakan. Ikuti pedoman di CONTRIBUTING.md.

Lisensi

Proyek ini dilisensikan di bawah lisensi MIT.
