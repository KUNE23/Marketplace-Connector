// Backend/scripts/scrapeCategories.js
/**
 * Ambil pohon kategori Akulaku dengan MENGINTERSEP respons asli Seller Center
 * (bukan request buatan sendiri, yang ditolak server karena kurang token).
 *
 * Strategi:
 *   1) Buka /product/create dengan sesi login.
 *   2) Dengarkan respons ke /goods/category/tree (dipicu oleh UI).
 *   3) Simpan body JSON ke data/categories.json.
 *
 * Pemakaian: node scripts/scrapeCategories.js
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { openLoggedInContext, CONFIG } = require('../src/services/akulakuBrowser');
const prisma = require('../src/lib/prisma');

const CATEGORY_API_MATCH = process.env.AKULAKU_CATEGORY_API_MATCH || '/goods/category/tree';
const OUT_DIR = path.join(__dirname, '..', 'data');
const OUT_FILE = path.join(OUT_DIR, 'categories.json');

function flatten(node, prefix = []) {
  const out = [];
  const name = node.name || node.nameEn || String(node.id);
  const current = [...prefix, name];
  const children = node.children || [];
  if (!children.length) {
    out.push({ path: current.join('/'), id: String(node.id), level: current.length });
  } else {
    for (const child of children) out.push(...flatten(child, current));
  }
  return out;
}

(async () => {
  const acc = await prisma.akulakuAccount.findFirst({
    where: { status: 'active' },
    select: { id: true, label: true },
  });
  if (!acc) { console.log('Tidak ada akun Akulaku aktif.'); await prisma.$disconnect(); return; }
  console.log(`Akun: ${acc.id} (${acc.label})`);

  let browser;
  try {
    const ctx = await openLoggedInContext(acc.id);
    browser = ctx.browser;
    const { page } = ctx;

    // Tangkap respons tree.
    let treeBody = null;
    const onResponse = async (res) => {
      if (!res.url().includes(CATEGORY_API_MATCH)) return;
      try {
        const json = await res.json();
        if (json && (json.success === true || json.data)) {
          treeBody = json;
          console.log(`Tertangkap: ${res.url()} (success=${json.success})`);
        }
      } catch { /* bukan JSON */ }
    };
    page.on('response', onResponse);

    // Muat halaman create (UI memicu fetch kategori).
    await page.goto(`${CONFIG.baseUrl}/product/create`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(3000);

    // Kalau belum tertangkap, klik field kategori untuk memicu ulang.
    if (!treeBody) {
      console.log('Belum tertangkap, klik field kategori untuk memicu...');
      await page.click('#categoryListValue').catch(() => {});
      await page.waitForTimeout(4000);
    }

    if (!treeBody) {
      console.log('GAGAL: respons kategori tidak tertangkap.');
      return;
    }

    const roots = treeBody.data;
    fs.mkdirSync(OUT_DIR, { recursive: true });
    if (!Array.isArray(roots)) {
      fs.writeFileSync(path.join(OUT_DIR, 'categories_raw.json'), JSON.stringify(treeBody, null, 2));
      console.log('data bukan array; raw disimpan. Kunci data:', Object.keys(roots || {}));
      return;
    }

    const paths = [];
    for (const root of roots) paths.push(...flatten(root));

    const payload = {
      scrapedAt: new Date().toISOString(),
      source: CATEGORY_API_MATCH,
      totalLeaves: paths.length,
      roots: roots.map((r) => r.name),
      paths: paths.map((p) => p.path),
      detailed: paths,
    };
    fs.writeFileSync(OUT_FILE, JSON.stringify(payload, null, 2));

    console.log(`\nSELESAI: ${paths.length} jalur leaf dari ${roots.length} kategori utama.`);
    console.log(`Roots: ${payload.roots.join(', ')}`);
    console.log(`Disimpan ke: ${OUT_FILE}`);
    console.log('\nContoh jalur:');
    console.log(paths.slice(0, 25).map((p) => `  - ${p.path}`).join('\n'));
  } catch (err) {
    console.log('GAGAL:', err.message);
  } finally {
    if (browser) await browser.close().catch(() => {});
    await prisma.$disconnect();
  }
})();
