// Backend/src/services/akulakuPostingService.js
/**
 * Posting satu Listing ke Akulaku Seller Center via otomasi browser.
 *
 * Selektor form posting dikonfigurasi lewat env supaya bisa diperbaiki tanpa ubah kode:
 *   AKULAKU_POST_URL                 - path halaman "tambah produk"
 *   AKULAKU_POST_NAME_SELECTOR
 *   AKULAKU_POST_DESC_SELECTOR
 *   AKULAKU_POST_PRICE_SELECTOR
 *   AKULAKU_POST_STOCK_SELECTOR
 *   AKULAKU_POST_IMAGE_INPUT_SELECTOR
 *   AKULAKU_POST_SUBMIT_SELECTOR
 *   AKULAKU_POST_SUCCESS_SELECTOR
 */
const createError = require('http-errors');
const { openLoggedInContext, CONFIG } = require('./akulakuBrowser');

const prisma = require('../lib/prisma');

const POST = {
  url: process.env.AKULAKU_POST_URL || '/product/new',
  name: process.env.AKULAKU_POST_NAME_SELECTOR || 'input[name="title"], input[name="name"]',
  description: process.env.AKULAKU_POST_DESC_SELECTOR || 'textarea[name="description"]',
  price: process.env.AKULAKU_POST_PRICE_SELECTOR || 'input[name="price"]',
  stock: process.env.AKULAKU_POST_STOCK_SELECTOR || 'input[name="stock"]',
  imageInput: process.env.AKULAKU_POST_IMAGE_INPUT_SELECTOR || 'input[type="file"]',
  submit: process.env.AKULAKU_POST_SUBMIT_SELECTOR || 'button[type="submit"]',
  success: process.env.AKULAKU_POST_SUCCESS_SELECTOR || '',
};

/**
 * Posting listing. Mengembalikan { akulakuProductId, akulakuUrl }.
 * Melempar error bila selektor belum cocok / gagal submit.
 */
async function postListingToListing(listing) {
  const { browser, page } = await openLoggedInContext(listing.accountId);
  try {
    await page.goto(`${CONFIG.baseUrl}${POST.url}`, { waitUntil: 'domcontentloaded', timeout: 60000 });

    const product = listing.product || {};
    if (product.name) await page.fill(POST.name, product.name);
    if (product.description) await page.fill(POST.description, product.description);

    await page.fill(POST.price, String(listing.sellingPrice ?? ''));
    if (product.stock !== null && product.stock !== undefined) {
      await page.fill(POST.stock, String(product.stock));
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

    await page.click(POST.submit);
    if (POST.success) {
      await page.waitForSelector(POST.success, { timeout: 60000 });
    } else {
      await page.waitForLoadState('networkidle', { timeout: 60000 });
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

module.exports = { postListingById, POST };

