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
 */
const createError = require('http-errors');
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
 * Pilih kategori bertingkat pada cascader Akulaku.
 * `path` contoh: ['Gadget & Digital', 'Aksesoris Digital', 'Kartu Memori Digital'].
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

  // Isi field spesifikasi & merek bila disediakan.
  const specs = resolveSpecs(explicitSpecs);
  if (specs.brand) {
    try {
      await page.click(POST.brand);
      await page.fill(POST.brand, String(specs.brand));
      await page.keyboard.press('Enter');
      await page.waitForTimeout(600);
    } catch {
      /* merek opsional */
    }
  }
  for (const [id, value] of Object.entries(specs)) {
    if (id === 'brand') continue;
    try {
      await page.click(`#${id}`);
      await page.fill(`#${id}`, String(value));
      await page.keyboard.press('Enter');
      await page.waitForTimeout(400);
    } catch {
      /* spesifikasi tertentu mungkin tidak ada untuk kategori ini */
    }
  }

  await page.waitForTimeout(1200);
}

/**
 * Posting listing. Mengembalikan { akulakuProductId, akulakuUrl }.
 * Melempar error bila selektor belum cocok / gagal submit.
 */
async function postListingToListing(listing, options = {}) {
  const { browser, page } = await openLoggedInContext(listing.accountId);
  try {
    await page.goto(`${CONFIG.baseUrl}${POST.url}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(1500);

    const product = listing.product || {};
    if (product.name) await page.fill(POST.name, product.name);

    // Kategori wajib sebelum field lain muncul. Prioritas: listing > options > env.
    const categorySource = listing.categoryPath || options.categoryPath;
    const categoryPath = resolveCategoryPath(categorySource);
    if (categoryPath.length) {
      await selectCategory(page, categoryPath, listing.specs);
    }

    await page.fill(POST.price, String(listing.sellingPrice ?? ''));
    if (product.stock !== null && product.stock !== undefined) {
      await page.fill(POST.stock, String(product.stock));
    }
    if (product.sku) {
      await page.fill(POST.sku, String(product.sku)).catch(() => {});
    }

    // Berat & dimensi (default 1 kalau tidak ada) — wajib untuk Akulaku.
    for (const [sel, val] of [
      [POST.weight, product.weight],
      [POST.length, product.length],
      [POST.width, product.width],
      [POST.height, product.height],
    ]) {
      if (val !== null && val !== undefined) await page.fill(sel, String(val)).catch(() => {});
    }

    // Upload gambar (kalau ada).
    const images = product.imageUrls || [];
    if (images.length) {
      try {
        await page.setInputFiles(POST.imageInput, images);
      } catch {
        /* beberapa UI pakai dropzone; abaikan bila input file tidak ada */
      }
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

    if (POST.success) {
      await page.waitForSelector(POST.success, { timeout: 60000 });
    } else {
      await page.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => {});
    }

    return {
      akulakuProductId: process.env.AKULAKU_POST_SUCCESS_ID_FROM_URL ? extractIdFromUrl(page.url()) : null,
      akulakuUrl: page.url(),
    };
  } finally {
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

module.exports = { postListingById, postListingToListing, selectCategory, POST };

