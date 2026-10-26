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

Lisensi

Proyek ini dilisensikan di bawah lisensi MIT.
