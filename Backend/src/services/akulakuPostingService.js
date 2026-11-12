// Backend/src/services/akulakuPostingService.js
/**
 * Posting satu Listing ke Akulaku Seller Center via otomasi browser.
 *
 * Selektor & URL diverifikasi terhadap UI asli Akulaku Seller Centre (Nov 2026):
 *   Halaman tambah produk: /product/create
 *   Judul               : #name
 *   Kategori (cascader) : #categoryListValue  (item: .ant-cascader-menu-item)
 *   Merek               : #brandId
 *   Spesifikasi khas kategori: #baseProp-<nama>-<id>-<id>
 *   Harga / Jumlah / SKU: #skus_0_originalPrice / #skus_0_stock / #skus_0_goodsInfos
 *   Berat & dimensi     : #weight / #length / #width / #height
 *   Gambar              : input[type="file"]
 *   Submit              : tombol "Submit Produk"
 *
 * CATATAN PENTING:
 *  - Kategori WAJIB dipilih sebelum field spesifikasi & penjualan muncul, dan
 *    spesifikasi berbeda per kategori. Karena model `Listing` belum menyimpan
 *    kategori, jalur kategori diambil dari env AKULAKU_POST_CATEGORY_PATH
 *    (dipisah " / " atau "/"), contoh: "Gadget & Digital/Aksesoris Digital/Kartu Memori Digital".
 *  - Spesifikasi khas kategori bisa diisi lewat env AKULAKU_POST_SPECS (JSON:
 *    { "brandId": "Samsung", "baseProp-Kapasitas Penyimpanan-60122-30178": "128GB" }).
 *  - Model `Product` TIDAK menyimpan berat/dimensi. Nilai diambil dari env
 *    AKULAKU_POST_DEFAULT_WEIGHT / _LENGTH / _WIDTH / _HEIGHT (default 1000 g & 10 cm)
 *    karena Akulaku mewajibkan semua field ini.
 */
const createError = require('http-errors');
const fs = require('fs');
const os = require('os');
const path = require('path');
const axios = require('axios');
const { openLoggedInContext, CONFIG } = require('./akulakuBrowser');

const prisma = require('../lib/prisma');

const POST = {
  url: process.env.AKULAKU_POST_URL || '/product/create',
  name: process.env.AKULAKU_POST_NAME_SELECTOR || '#name',
  category: process.env.AKULAKU_POST_CATEGORY_SELECTOR || '#categoryListValue',
  brand: process.env.AKULAKU_POST_BRAND_SELECTOR || '#brandId',
  price: process.env.AKULAKU_POST_PRICE_SELECTOR || '#skus_0_originalPrice',
  stock: process.env.AKULAKU_POST_STOCK_SELECTOR || '#skus_0_stock',
  sku: process.env.AKULAKU_POST_SKU_SELECTOR || '#skus_0_goodsInfos',
  weight: process.env.AKULAKU_POST_WEIGHT_SELECTOR || '#weight',
  length: process.env.AKULAKU_POST_LENGTH_SELECTOR || '#length',
  width: process.env.AKULAKU_POST_WIDTH_SELECTOR || '#width',
  height: process.env.AKULAKU_POST_HEIGHT_SELECTOR || '#height',
  imageInput: process.env.AKULAKU_POST_IMAGE_INPUT_SELECTOR || 'input[type="file"]',
  submitText: process.env.AKULAKU_POST_SUBMIT_TEXT || 'Submit Produk',
  draftText: process.env.AKULAKU_POST_DRAFT_TEXT || 'Simpan Sebagai Draft',
  success: process.env.AKULAKU_POST_SUCCESS_SELECTOR || '',
};

// Nilai default wajib Akulaku. PENTING: field #weight di Akulaku memakai
// SATUAN KG (valid 0.01–999.9), bukan gram. Dimensi dalam cm.
const DEFAULTS = {
  weight: Number(process.env.AKULAKU_POST_DEFAULT_WEIGHT || 1), // kg
  length: Number(process.env.AKULAKU_POST_DEFAULT_LENGTH || 10), // cm
  width: Number(process.env.AKULAKU_POST_DEFAULT_WIDTH || 10), // cm
  height: Number(process.env.AKULAKU_POST_DEFAULT_HEIGHT || 10), // cm
  stock: Number(process.env.AKULAKU_POST_DEFAULT_STOCK || 100),
};

/** Ambil jalur kategori: dari argumen (array/string) > env. Mengembalikan array level. */
function resolveCategoryPath(explicit) {
  if (Array.isArray(explicit)) {
    return explicit.map((s) => String(s).trim()).filter(Boolean);
  }
  const raw = explicit || process.env.AKULAKU_POST_CATEGORY_PATH || '';
  return String(raw)
    .split(/\s*\/\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Baca peta spesifikasi khas kategori dari env (JSON). */
function resolveSpecs(explicit) {
  if (explicit && typeof explicit === 'object') return explicit;
  const raw = process.env.AKULAKU_POST_SPECS;
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

/**
 * Unduh gambar dari URL ke file temp, karena Playwright `setInputFiles` hanya
 * menerima path file lokal atau buffer, bukan URL. Mengembalikan array path lokal
 * (gambar yang gagal diunduh dilewati).
 */
async function materializeImages(urls, { max = 8 } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'akulaku-img-'));
  const files = [];
  for (const raw of urls.slice(0, max)) {
    const url = String(raw || '').trim();
    if (!url) continue;
    try {
      if (fs.existsSync(url)) {
        files.push(url); // sudah berupa path lokal
        continue;
      }
      const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 30000 });
      const contentType = String(res.headers['content-type'] || '');
      const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg';
      const file = path.join(dir, `img-${files.length}.${ext}`);
      fs.writeFileSync(file, Buffer.from(res.data));
      files.push(file);
    } catch {
      /* gambar gagal diunduh -> lewati */
    }
  }
  return { files, dir };
}

function cleanupImages(dir) {
  if (!dir) return;
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* abaikan */
  }
}

/**
 * Bangun selector CSS aman untuk id yang mengandung spasi (mis. "baseProp-Negara Asal-60002-70227").
 * `#a b` salah secara CSS karena spasi = descendant combinator.
 */
function idSelector(id) {
  return `[id="${String(id).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"]`;
}

/**
 * Isi satu field ant-select: klik -> (opsional ketik) -> pilih opsi yang cocok.
 * `mode`: 'search' (ketik dulu) | 'direct' (langsung pilih dari daftar).
 */
async function fillAntSelect(page, selector, value, { mode = 'search' } = {}) {
  try {
    if ((await page.locator(selector).count().catch(() => 0)) === 0) return false;

    // Klik untuk membuka dropdown.
    await page.click(selector);
    await page.waitForTimeout(700);

    const isMultiple = await page
      .evaluate((sel) => Boolean(document.querySelector(sel)?.closest('.ant-select-multiple')), selector)
      .catch(() => false);

    // Coba pilih langsung dari opsi yang sudah tampil (dropdown statis).
    let picked = await pickOption(page, value);

    // Kalau belum ketemu, baru ketik untuk memfilter (dropdown dengan search).
    if (!picked && mode === 'search') {
      await page.keyboard.type(String(value), { delay: 30 }).catch(() => {});
      await page.waitForTimeout(1000);
      picked = await pickOption(page, value);
    }

    await page.waitForTimeout(400);

    // Tutup dropdown: multi-select cukup klik di luar (Escape membatalkan pilihan).
    if (isMultiple) {
      await page.mouse.click(5, 5).catch(() => {});
    } else {
      await page.keyboard.press('Escape').catch(() => {});
    }
    await page.waitForTimeout(300);
    return Boolean(picked);
  } catch {
    return false;
  }
}

/**
 * Pilih opsi dropdown berdasarkan teks. Exact match diutamakan, lalu "mengandung".
 * TIDAK fallback ke opsi pertama bila tidak ada yang cocok (mencegah salah isi,
 * mis. "Indonesia" jadi "Lainnya").
 */
async function pickOption(page, value) {
  return page.evaluate((val) => {
    const options = [...document.querySelectorAll('.ant-select-item-option')];
    if (!options.length) return null;
    const v = String(val).toLowerCase().trim();
    const texts = options.map((o) => (o.innerText || '').trim());
    let idx = texts.findIndex((t) => t.toLowerCase() === v);
    if (idx === -1) idx = texts.findIndex((t) => t.toLowerCase().includes(v) || v.includes(t.toLowerCase()));
    if (idx === -1) return null; // jangan fallback buta
    options[idx].click();
    return texts[idx];
  }, value);
}

/**
 * Nilai default atribut per keyId Akulaku (spuPublishInitBaseProp).
 * Dipilih agar valid untuk mayoritas kategori; bisa dioverride lewat listing.specs
 * dengan bentuk { "<keyId>": "<nilai>" } atau { "<keyId>": ["<nilai1>", ...] }.
 */
const ATTR_DEFAULTS = {
  60002: 'Indonesia', // Negara Asal
  60012: 'Tidak Garansi', // Masa Garansi
  60052: 'Lainnya', // Bahan (wajib) - aman untuk semua kategori
  60094: 'Kasual', // Acara
  60054: 'Polos', // Motif
  60095: 'Matte', // Tampilan Kulit (hanya relevan utk produk kulit)
  60065: 'Kulit Sapi', // Jenis Kulit
  60096: 'Lainnya', // Fitur
  60097: 'Halus', // Tekstur Kulit
  60098: 'Lainnya', // Ukuran Tas
  60099: 'Resleting', // Penutup Tas
  60013: 'Tidak Garansi', // Jenis Garansi
};

/** Atribut yang HANYA relevan untuk produk kulit; kalau bahan bukan kulit, jangan diisi. */
const LEATHER_ONLY_KEYS = new Set([60065, 60095, 60097]);

/**
 * Isi SELURUH atribut Spesifikasi Produk (baseProp-*) untuk menaikkan skor
 * kelengkapan -> Tingkat Kualitas Produk menjadi "Baik" (skor > 70).
 *
 * Mengembalikan { filled: {keyName: value}, count, total }.
 */
async function fillAllAttributes(page, specs = {}) {
  // Baca daftar atribut yang benar-benar ada di halaman (id: baseProp-<nama>-<keyId>-<spuId>).
  const fields = await page.evaluate(() => {
    return [...document.querySelectorAll('[id^="baseProp-"]')].map((el) => {
      const m = el.id.match(/^baseProp-(.+)-(\d+)-(\d+)$/);
      return { id: el.id, name: m ? m[1] : el.id, keyId: m ? m[2] : null };
    });
  });

  const filled = {};
  let count = 0;

  // Bahan (wajib) harus diisi DULU: menentukan apakah atribut khusus kulit relevan.
  const materialValue = specs.material || specs[60052] || process.env.AKULAKU_POST_DEFAULT_MATERIAL || 'Lainnya';
  const materialField = fields.find((f) => f.keyId === '60052');
  if (materialField) {
    const sel = idSelector(materialField.id);
    if (await fillAntSelect(page, sel, materialValue)) {
      // Verifikasi pilihan benar-benar tersimpan (chip terisi).
      const confirmed = await page
        .evaluate((s) => {
          const wrap = document.querySelector(s)?.closest('.ant-form-item');
          const chips = wrap ? [...wrap.querySelectorAll('.ant-select-selection-item')].map((c) => (c.innerText || '').trim()) : [];
          return chips.some((c) => c && !c.startsWith('+'));
        }, sel)
        .catch(() => false);
      if (confirmed) {
        filled[materialField.name] = materialValue;
        count += 1;
      } else {
        // Coba ulang sekali, tetap harus cocok teks (bukan opsi pertama buta).
        await page.click(sel).catch(() => {});
        await page.waitForTimeout(800);
        const retried = await pickOption(page, materialValue);
        if (retried) {
          await page.mouse.click(5, 5).catch(() => {});
          filled[materialField.name] = materialValue;
          count += 1;
        }
      }
    }
  }
  const isLeather = String(materialValue).toLowerCase().includes('kulit');

  for (const field of fields) {
    const keyId = field.keyId ? Number(field.keyId) : null;
    if (keyId === 60052) continue; // sudah diisi di atas

    // Produk non-kulit: lewati atribut khusus kulit.
    if (keyId && LEATHER_ONLY_KEYS.has(keyId) && !isLeather) continue;

    // Nilai: dari listing.specs (keyId atau nama), else default.
    const value =
      (keyId && specs[String(keyId)]) ||
      specs[field.name] ||
      (keyId ? ATTR_DEFAULTS[keyId] : undefined);
    if (!value) continue;

    const ok = await fillAntSelect(page, idSelector(field.id), value);
    if (ok) {
      filled[field.name] = value;
      count += 1;
    }
  }

  return { filled, count, total: fields.length };
}

/**
 * Isi spesifikasi produk: Merek (brandId), Kondisi, lalu seluruh atribut baseProp.
 */
async function fillRequiredSpecs(page, specs = {}) {
  const result = {};

  // 1) Merek (wajib). Cari merek yang mendekati nama produk, fallback default.
  const brand = specs.brand || specs[10000] || process.env.AKULAKU_POST_DEFAULT_BRAND || '';
  if (brand) {
    result.brand = await fillAntSelect(page, '#brandId', brand);
  } else {
    // Tanpa merek eksplisit: pilih opsi pertama yang tersedia agar tidak kosong.
    result.brand = await fillAntSelect(page, '#brandId', '', { mode: 'direct' });
  }

  // 2) Kondisi: default "Baru".
  result.condition = await setCondition(page, specs.condition || 'Baru');

  // 3) Seluruh atribut Spesifikasi Produk.
  const { filled, count, total } = await fillAllAttributes(page, specs);
  return { brand: result.brand, condition: result.condition, attributes: { filled, count, total } };
}

/** Pilih Kondisi produk (Baru/Bekas) via radio. */
async function setCondition(page, value) {
  try {
    const ok = await page.evaluate((val) => {
      const radios = [...document.querySelectorAll('input[name="secondHandGoodsLabel"], input[type="radio"]')];
      for (const r of radios) {
        const wrap = r.closest('label') || r.parentElement?.parentElement;
        const text = (wrap?.innerText || '').trim().toLowerCase();
        if (text === String(val).toLowerCase() || text.includes(String(val).toLowerCase())) {
          r.click();
          return true;
        }
      }
      return false;
    }, value);
    await page.waitForTimeout(300);
    return ok;
  } catch {
    return false;
  }
}

/**
 * Bangun deskripsi produk yang KAYA untuk menaikkan skor "Tingkat Kualitas Produk".
 * Akulaku menilai kualitas dari kelengkapan konten; deskripsi panjang (beberapa
 * paragraf, keunggulan, cara pakai, garansi) menaikkan skor secara signifikan.
 *
 * Pakai deskripsi asli bila sudah panjang; selain itu susun dari data produk.
 */
function buildRichDescription(product, listing, categoryPath) {
  const original = String(product.description || '').trim();
  const name = String(product.name || '').trim();

  // Deskripsi asli yang sudah memadai (>= 400 karakter) dipakai apa adanya.
  if (original.length >= 400) return original;

  const kategori = categoryPath ? categoryPath.split('/').pop() : 'produk';
  const harga = Math.round(Number(listing.sellingPrice || 0));
  const hargaStr = harga ? `Rp${harga.toLocaleString('id-ID')}` : '';

  const parts = [];
  if (original) parts.push(original);
  parts.push(name);

  parts.push(
    [
      `${name} hadir sebagai pilihan ${kategori} yang praktis dan berkualitas untuk kebutuhan sehari-hari.`,
      'Dirancang dengan material pilihan sehingga awet, nyaman dipakai, dan tahan lama.',
    ].join(' '),
  );

  parts.push(
    [
      'KEUNGGULAN PRODUK:',
      '- Material berkualitas dan tahan lama',
      '- Desain praktis, cocok untuk pemakaian harian',
      '- Mudah digunakan dan dirawat',
      '- Dikirim dari stok siap kirim',
    ].join('\n'),
  );

  parts.push(
    [
      'SPESIFIKASI:',
      product.sku ? `- SKU: ${product.sku}` : null,
      hargaStr ? `- Harga: ${hargaStr}` : null,
      '- Kondisi: Baru',
      '- Kemasan: aman dan rapi',
    ]
      .filter(Boolean)
      .join('\n'),
  );

  parts.push(
    [
      'CATATAN PENGIRIMAN:',
      'Pesanan diproses maksimal 48 jam kerja. Barang dikemas dengan aman untuk memastikan',
      'sampai tujuan dalam kondisi baik. Bila ada kendala, silakan hubungi kami melalui chat.',
    ].join(' '),
  );

  parts.push('Terima kasih telah berbelanja. Kami menjaga kualitas produk dan pelayanan untuk kepuasan Anda.');

  return parts.join('\n\n');
}

/**
 * Isi Detail produk (spuDesc). Ini BUKAN input biasa: pengguna harus menambah
 * minimal satu "modul" (Gambar atau Kalimat). Kita pakai modul Kalimat:
 *   1) klik tombol "Kalimat" di toolbar editor;
 *   2) isi textarea yang muncul;
 *   3) klik "Ya" untuk mengonfirmasi modul.
 * Mengembalikan true bila modul teks berhasil ditambahkan.
 */
async function fillDescription(page, text) {
  const value = String(text || '').trim().slice(0, 5000);
  if (!value) return false;
  try {
    // Sudah ada modul teks? (mis. dipanggil dua kali) -> langsung isi.
    const existing = page.locator('#spuDesc textarea').first();
    if (await existing.count().catch(() => 0)) {
      await existing.fill(value).catch(() => {});
      await clickSureIfPresent(page);
      return true;
    }

    // Klik "Kalimat".
    const clicked = await page.evaluate(() => {
      const root = document.getElementById('spuDesc');
      if (!root) return false;
      const items = [...root.querySelectorAll('[class*="featureItem"]')];
      const kalimat = items.find((el) => /kalimat/i.test(el.innerText || ''));
      if (kalimat) { kalimat.click(); return true; }
      return false;
    });
    if (!clicked) return false;
    await page.waitForTimeout(1500);

    const ta = page.locator('#spuDesc textarea').first();
    if (!(await ta.count().catch(() => 0))) return false;
    await ta.fill(value);
    await page.waitForTimeout(500);

    await clickSureIfPresent(page);
    await page.waitForTimeout(1500);
    return true;
  } catch {
    return false;
  }
}

/** Klik tombol "Ya" pada edit modul detail (bila ada). */
async function clickSureIfPresent(page) {
  await page
    .evaluate(() => {
      const root = document.getElementById('spuDesc');
      if (!root) return false;
      const btn = [...root.querySelectorAll('button')].find((b) => /^ya$/i.test((b.innerText || '').trim()));
      if (btn) { btn.click(); return true; }
      return false;
    })
    .catch(() => {});
}

/**
 * Pilih kategori bertingkat pada cascader Akulaku.
 * `path` contoh: ['Tas dan penyimpanan', 'Tas Pria', 'Tas ransel'].
 * `explicitSpecs` (opsional) peta spesifikasi khas kategori dari listing.
 */
async function selectCategory(page, path, explicitSpecs) {
  if (!path.length) throw createError(400, 'Jalur kategori Akulaku kosong (isi categoryPath pada listing)');

  await page.click(POST.category);
  await page.waitForTimeout(1200);

  for (let i = 0; i < path.length; i++) {
    const level = path[i];
    const clicked = await page.evaluate((name) => {
      const items = [...document.querySelectorAll('.ant-cascader-menu-item')];
      const el = items.find((it) => (it.innerText || '').trim() === name);
      if (el) {
        el.click();
        return true;
      }
      return false;
    }, level);
    if (!clicked) throw createError(400, `Kategori Akulaku tidak ditemukan di level ${i + 1}: "${level}"`);
    await page.waitForTimeout(1200);
  }

  // Tunggu field spesifikasi khas kategori muncul.
  await page.waitForSelector('#brandId', { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(1500);

  // Isi field wajib (Merek, Negara Asal, Bahan) — wajib untuk submit.
  const specs = resolveSpecs(explicitSpecs);
  const filled = await fillRequiredSpecs(page, specs);
  return filled;
}

/**
 * Kumpulkan pesan error validasi yang tampil di halaman (Ant Design form errors
 * dan toast). Dipakai untuk membedakan sukses dari submit yang ditolak.
 */
async function collectPageErrors(page) {
  return page
    .evaluate(() => {
      const nodes = [
        ...document.querySelectorAll('.ant-form-item-explain-error, .ant-message-error, .ant-notification-notice-message, [class*="error"]'),
      ];
      const texts = nodes
        .map((n) => (n.innerText || '').trim())
        .filter((t) => t && t.length > 1 && t.length < 300);
      return [...new Set(texts)].slice(0, 10);
    })
    .catch(() => []);
}

/**
 * Tentukan apakah submit benar-benar berhasil.
 *
 * Urutan pembuktian:
 *   1) Selektor sukses eksplisit (env AKULAKU_POST_SUCCESS_SELECTOR) bila diset.
 *   2) Redirect keluar dari /product/create.
 *   3) Konfirmasi produk muncul di halaman daftar produk (bukti terkuat).
 *
 * Mengembalikan { ok, reason, errors, akulakuProductId }.
 */
async function verifySubmitted(page, { urlBefore, productName }) {
  if (POST.success) {
    const found = await page
      .waitForSelector(POST.success, { timeout: 60000 })
      .then(() => true)
      .catch(() => false);
    if (found) return { ok: true, reason: 'selector sukses terdeteksi', errors: [], akulakuProductId: null };
    return {
      ok: false,
      reason: `Selektor sukses "${POST.success}" tidak muncul`,
      errors: await collectPageErrors(page),
      akulakuProductId: null,
    };
  }

  const urlAfter = page.url();
  const leftCreatePage = urlAfter !== urlBefore && !urlAfter.includes(POST.url);
  const errors = await collectPageErrors(page);

  if (!leftCreatePage) {
    return {
      ok: false,
      reason: 'Masih di halaman /product/create setelah submit (kemungkinan validasi gagal)',
      errors,
      akulakuProductId: null,
    };
  }

  // Bukti terkuat: produk muncul di daftar. Tunggu sebentar karena daftar
  // kadang butuh waktu render.
  const confirmation = await confirmProductInList(page, productName);
  if (confirmation.found) {
    return {
      ok: true,
      reason: `Produk terkonfirmasi di daftar Akulaku (Produk ID: ${confirmation.productId || '-'})`,
      errors,
      akulakuProductId: confirmation.productId,
    };
  }
  // Redirect terjadi tapi produk belum terlihat (bisa tertunda/draft).
  return {
    ok: true,
    reason: `URL berpindah ke ${urlAfter} (produk belum terlihat di daftar, mungkin masih diproses)`,
    errors,
    akulakuProductId: null,
  };
}

/**
 * Cari produk berdasarkan nama di halaman daftar produk Akulaku, dan ekstrak
 * "Produk ID" bila ketemu. Mengembalikan { found, productId }.
 */
async function confirmProductInList(page, productName, { timeoutMs = 15000 } = {}) {
  const needle = String(productName || '').trim().toLowerCase().slice(0, 60);
  if (!needle) return { found: false, productId: null };

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await page
      .evaluate((needleLower) => {
        const body = document.body.innerText || '';
        const idx = body.toLowerCase().indexOf(needleLower);
        if (idx === -1) return { found: false, productId: null };
        // Cari "Produk ID : <angka>" di sekitar kemunculan nama produk.
        const windowText = body.slice(Math.max(0, idx - 200), idx + 1200);
        const idMatch = windowText.match(/Produk\s*ID\s*[:：]\s*(\d{6,})/i);
        return { found: true, productId: idMatch ? idMatch[1] : null };
      }, needle)
      .catch(() => ({ found: false, productId: null }));

    if (res.found) return res;
    await page.waitForTimeout(2000);
  }
  return { found: false, productId: null };
}

/**
 * Posting listing. Mengembalikan { akulakuProductId, akulakuUrl }.
 * Melempar error bila selektor belum cocok / gagal submit / hasil tidak terverifikasi.
 */
async function postListingToListing(listing, options = {}) {
  const { browser, page } = await openLoggedInContext(listing.accountId);
  let imgDir = null;
  try {
    await page.goto(`${CONFIG.baseUrl}${POST.url}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(1500);
    const urlBefore = page.url();

    const product = listing.product || {};
    if (!product.name) throw createError(400, 'Produk tidak punya nama (wajib untuk Akulaku)');
    await page.fill(POST.name, product.name);

    // Kategori: pakai manual yang valid, kalau tidak ada -> otomatis dari nama produk.
    // Prioritas: listing.categoryPath (valid) > options.categoryPath > otomatis.
    const { resolveListingCategory } = require('./categoryService');
    let resolved = await resolveListingCategory({
      productName: product.name,
      categoryPath: listing.categoryPath || options.categoryPath,
    });
    if (!resolved && options.categoryPath) {
      // options bisa berisi jalur yang belum tervalidasi; cek ulang.
      resolved = await resolveListingCategory({ productName: product.name, categoryPath: options.categoryPath });
    }
    if (!resolved) {
      throw createError(
        400,
        `Kategori Akulaku tidak bisa ditentukan otomatis untuk produk "${product.name}". ` +
          'Tambahkan aturan kata kunci atau isi categoryPath secara manual.',
      );
    }
    const categoryPath = resolveCategoryPath(resolved.path);
    await selectCategory(page, categoryPath, listing.specs);

    // Detail produk (spuDesc) WAJIB + berpengaruh besar pada Tingkat Kualitas.
    // Susun deskripsi kaya dari data produk bila deskripsi asli terlalu pendek.
    const descriptionText = buildRichDescription(product, listing, resolved.path);
    await fillDescription(page, descriptionText);

    // Harga WAJIB bilangan bulat. Harga berdesimal (mis. "81379.8") ditafsirkan
    // Akulaku sebagai 813798 (titik dianggap pemisah ribuan).
    const priceValue = Math.round(Number(listing.sellingPrice ?? 0));
    if (!Number.isFinite(priceValue) || priceValue <= 0) {
      throw createError(400, `Harga jual tidak valid: "${listing.sellingPrice}"`);
    }
    await page.fill(POST.price, String(priceValue));

    // Stok: pakai stok produk, kalau kosong pakai default.
    // Stok: default 100 untuk semua produk. Set AKULAKU_POST_USE_PRODUCT_STOCK=true
    // bila ingin memakai stok produk asli (bila tersedia).
    const useProductStock = process.env.AKULAKU_POST_USE_PRODUCT_STOCK === 'true';
    const stock =
      useProductStock && product.stock !== null && product.stock !== undefined
        ? product.stock
        : DEFAULTS.stock;
    await page.fill(POST.stock, String(stock)).catch(() => {});
    if (product.sku) {
      await page.fill(POST.sku, String(product.sku)).catch(() => {});
    }

    // Berat & dimensi WAJIB. Product tidak menyimpannya -> pakai default/env.
    for (const [sel, val] of [
      [POST.weight, DEFAULTS.weight],
      [POST.length, DEFAULTS.length],
      [POST.width, DEFAULTS.width],
      [POST.height, DEFAULTS.height],
    ]) {
      await page.fill(sel, String(val)).catch(() => {});
    }

    // Upload gambar: unduh URL ke file lokal dulu (setInputFiles tidak terima URL).
    const images = product.imageUrls || [];
    if (images.length) {
      const materialized = await materializeImages(images);
      imgDir = materialized.dir;
      if (materialized.files.length) {
        await page.setInputFiles(POST.imageInput, materialized.files).catch(async () => {
          /* beberapa UI pakai dropzone; coba input pertama yang ada */
          const input = page.locator('input[type="file"]').first();
          if (await input.count().catch(() => 0)) {
            await input.setInputFiles(materialized.files).catch(() => {});
          }
        });
        await page.waitForTimeout(2000);
      } else {
        throw createError(400, 'Tidak ada gambar produk yang berhasil diunduh (Akulaku mewajibkan gambar)');
      }
    } else {
      throw createError(400, 'Produk tidak punya gambar (wajib untuk Akulaku)');
    }

    // Submit: "Submit Produk" (default) atau "Simpan Sebagai Draft" (mode draft).
    const submitText = options.mode === 'draft' ? POST.draftText : POST.submitText;
    const submitted = await page.evaluate((text) => {
      const b = [...document.querySelectorAll('button')].find((x) => (x.innerText || '').trim() === text);
      if (b) {
        b.click();
        return true;
      }
      return false;
    }, submitText);
    if (!submitted) throw createError(500, `Tombol "${submitText}" tidak ditemukan`);

    await page.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(3000);

    // VERIFIKASI: jangan klaim sukses tanpa bukti.
    const verdict = await verifySubmitted(page, { urlBefore, productName: product.name });
    if (!verdict.ok) {
      const detail = verdict.errors.length ? ` - ${verdict.errors.join(' | ')}` : '';
      throw createError(422, `Akulaku menolak submit: ${verdict.reason}${detail}`);
    }

    // ID produk: utamakan dari konfirmasi daftar, fallback dari URL.
    const akulakuProductId = verdict.akulakuProductId || extractIdFromUrl(page.url());
    return {
      akulakuProductId,
      akulakuUrl: page.url(),
      verification: verdict.reason,
      categoryPath: resolved.path,
      categorySource: resolved.source,
    };
  } finally {
    cleanupImages(imgDir);
    await browser.close();
  }
}

function extractIdFromUrl(url) {
  const match = String(url).match(/(\d{4,})/);
  return match ? match[1] : null;
}

/**
 * Jalankan posting untuk satu listing (dipanggil worker).
 */
async function postListingById(listingId) {
  const listing = await prisma.listing.findUnique({
    where: { id: BigInt(listingId) },
    include: { product: true, account: true },
  });
  if (!listing) throw createError(404, 'Listing tidak ditemukan');
  if (!listing.account || listing.account.status !== 'active') {
    throw createError(400, 'Akun Akulaku tidak aktif');
  }

  await prisma.listing.update({ where: { id: listing.id }, data: { status: 'queued' } });

  try {
    const result = await postListingToListing(listing);
    await prisma.listing.update({
      where: { id: listing.id },
      data: {
        status: 'posted',
        postedAt: new Date(),
        akulakuProductId: result.akulakuProductId,
        akulakuUrl: result.akulakuUrl,
        // Simpan kategori yang benar-benar dipakai (termasuk hasil auto-resolve).
        ...(result.categoryPath ? { categoryPath: result.categoryPath } : {}),
        errorMessage: null,
      },
    });
    return result;
  } catch (err) {
    await prisma.listing.update({
      where: { id: listing.id },
      data: {
        status: 'failed',
        errorMessage: String(err.message || err).slice(0, 1000),
        retryCount: { increment: 1 },
      },
    });
    throw err;
  }
}

module.exports = {
  postListingById,
  postListingToListing,
  selectCategory,
  POST,
  DEFAULTS,
  materializeImages,
  buildRichDescription,
};
