// Backend/prisma/category.seeders.js
/**
 * Impor daftar kategori Akulaku (hasil scripts/scrapeCategories.js) ke tabel
 * AkulakuCategory, lalu isi CategoryRule dengan aturan kata kunci umum.
 *
 * Pemakaian:
 *   node prisma/category.seeders.js            # impor kategori + aturan
 *   node prisma/category.seeders.js --rules    # hanya aturan
 *
 * Jalur di rules WAJIB ada di daftar kategori (divalidasi); yang tidak cocok
 * dilaporkan dan dilewati supaya tidak menyuntik kategori palsu.
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const prisma = require('../src/lib/prisma');

const CATEGORIES_FILE = path.join(__dirname, '..', 'data', 'categories.json');

/**
 * Aturan kata kunci -> jalur kategori Akulaku (ASLI, hasil scrape).
 * `keyword` dicocokkan case-insensitive ke nama produk; `priority` lebih besar menang.
 * Urutan lebih spesifik diberi priority lebih tinggi.
 */
const RULES = [
  // --- Tas & penyimpanan ---
  { keyword: 'ransel', path: 'Tas dan penyimpanan/Tas Pria/Tas ransel', priority: 100 },
  { keyword: 'backpack', path: 'Tas dan penyimpanan/Tas Pria/Tas ransel', priority: 100 },
  { keyword: 'tas selempang', path: 'Tas dan penyimpanan/Tas Pria/Tas Selempang', priority: 95 },
  { keyword: 'sling bag', path: 'Tas dan penyimpanan/Tas Pria/Tas Selempang', priority: 95 },
  { keyword: 'tas messenger', path: 'Tas dan penyimpanan/Tas Pria/Tas Messenger', priority: 95 },
  { keyword: 'tas pinggang', path: 'Tas dan penyimpanan/Tas Pria/Tas Pinggang', priority: 95 },
  { keyword: 'waist bag', path: 'Tas dan penyimpanan/Tas Pria/Tas Pinggang', priority: 95 },
  { keyword: 'dompet', path: 'Tas dan penyimpanan/Tas Pria/Dompet Pria/Dompet Lipat', priority: 90 },
  { keyword: 'koper', path: 'Tas dan penyimpanan/Bagasi fungsional/Tas Travel/Koper', priority: 90 },
  { keyword: 'tas travel', path: 'Tas dan penyimpanan/Bagasi fungsional/Tas Travel/Tas Bagasi', priority: 88 },
  { keyword: 'tas laptop', path: 'Komputer & Aksesoris/Aksesoris Komputer/Tas Komputer', priority: 92 },

  // --- HP & aksesoris ---
  { keyword: 'casing', path: 'HP & HP Aksesoris/Aksesoris HP/Casing & Cover', priority: 90 },
  { keyword: 'softcase', path: 'HP & HP Aksesoris/Aksesoris HP/Casing & Cover', priority: 90 },
  { keyword: 'hardcase', path: 'HP & HP Aksesoris/Aksesoris HP/Casing & Cover', priority: 90 },
  { keyword: 'tempered glass', path: 'HP & HP Aksesoris/Aksesoris HP/Tempered Glass', priority: 92 },
  { keyword: 'anti gores', path: 'HP & HP Aksesoris/Aksesoris HP/Tempered Glass', priority: 90 },
  { keyword: 'powerbank', path: 'HP & HP Aksesoris/Aksesoris HP/PowerBank', priority: 95 },
  { keyword: 'power bank', path: 'HP & HP Aksesoris/Aksesoris HP/PowerBank', priority: 95 },
  { keyword: 'charger hp', path: 'HP & HP Aksesoris/Aksesoris HP/Charger HP', priority: 93 },
  { keyword: 'kabel data', path: 'HP & HP Aksesoris/Aksesoris HP/Kabel Data/USB', priority: 92 },
  { keyword: 'kabel usb', path: 'HP & HP Aksesoris/Aksesoris HP/Kabel Data/USB', priority: 92 },
  { keyword: 'baterai hp', path: 'HP & HP Aksesoris/Aksesoris HP/Baterai HP', priority: 90 },

  // --- Gadget & Digital ---
  { keyword: 'headset', path: 'Gadget & Digital/Peralatan Hiburan Video & Audio/Headphone & Headset', priority: 88 },
  { keyword: 'headphone', path: 'Gadget & Digital/Peralatan Hiburan Video & Audio/Headphone & Headset', priority: 88 },
  { keyword: 'earphone', path: 'Gadget & Digital/Peralatan Hiburan Video & Audio/Headphone & Headset', priority: 88 },
  { keyword: 'tws', path: 'Gadget & Digital/Peralatan Hiburan Video & Audio/Headphone & Headset', priority: 90 },
  { keyword: 'speaker', path: 'Gadget & Digital/Peralatan Hiburan Video & Audio/Speaker', priority: 85 },
  { keyword: 'microphone', path: 'Gadget & Digital/Peralatan Hiburan Video & Audio/Microphone', priority: 85 },
  { keyword: 'gamepad', path: 'Gadget & Digital/Gaming/Gamepad', priority: 90 },
  { keyword: 'joystick', path: 'Gadget & Digital/Gaming/Gamepad', priority: 88 },
  { keyword: 'webcam', path: 'Gadget & Digital/Kamera/Kamera Video/Webcam', priority: 90 },
  { keyword: 'tripod', path: 'Gadget & Digital/Kamera/Kamera Video/Stabilizer', priority: 82 },
  { keyword: 'ring light', path: 'Gadget & Digital/Kamera/Kamera Video/Ring Light', priority: 90 },

  // --- Komputer & aksesoris ---
  { keyword: 'keyboard', path: 'Komputer & Aksesoris/Perangkat Eksternal/Keyboard', priority: 90 },
  { keyword: 'mouse', path: 'Komputer & Aksesoris/Perangkat Eksternal/Mouse', priority: 90 },
  { keyword: 'mouse pad', path: 'Komputer & Aksesoris/Perangkat Eksternal/Mouse Pad', priority: 92 },
  { keyword: 'monitor', path: 'Komputer & Aksesoris/Aksesoris Komputer/Monitor', priority: 88 },
  { keyword: 'ssd', path: 'Komputer & Aksesoris/Aksesoris Komputer/SSD Solid State Hard Disk', priority: 90 },
  { keyword: 'flashdisk', path: 'Komputer & Aksesoris/Aksesoris Komputer/Storage', priority: 88 },
  { keyword: 'flash disk', path: 'Komputer & Aksesoris/Aksesoris Komputer/Storage', priority: 88 },
  { keyword: 'hard disk', path: 'Komputer & Aksesoris/Aksesoris Komputer/Hard Disk', priority: 88 },
  { keyword: 'laptop', path: 'Komputer & Aksesoris/PC/Laptop', priority: 85 },

  // --- Fashion pria ---
  { keyword: 'kaos polo', path: 'Fashion Pria/Pakaian Pria/Atasan/Kaos Polo', priority: 92 },
  { keyword: 'polo shirt', path: 'Fashion Pria/Pakaian Pria/Atasan/Kaos Polo', priority: 92 },
  { keyword: 'kemeja', path: 'Fashion Pria/Pakaian Pria/Atasan/Kemeja', priority: 90 },
  { keyword: 'hoodie', path: 'Fashion Pria/Pakaian Pria/Atasan/Hoodie', priority: 92 },
  { keyword: 'sweater', path: 'Fashion Pria/Pakaian Pria/Atasan/Sweater', priority: 90 },
  { keyword: 'jaket', path: 'Fashion Pria/Pakaian Pria/Atasan/Jaket', priority: 88 },
  { keyword: 'kaos', path: 'Fashion Pria/Pakaian Pria/Atasan/Kaos', priority: 70 },
  { keyword: 'jeans', path: 'Fashion Pria/Pakaian Pria/Celana/Jeans', priority: 90 },
  { keyword: 'celana pendek', path: 'Fashion Pria/Pakaian Pria/Celana/Celana Pendek', priority: 92 },
  { keyword: 'celana olahraga', path: 'Fashion Pria/Pakaian Pria/Celana/Celana Olahraga', priority: 92 },
  { keyword: 'celana', path: 'Fashion Pria/Pakaian Pria/Celana/Celana Kasual', priority: 65 },

  // --- Fashion wanita ---
  { keyword: 'hijab', path: 'Pakaian Muslim', priority: 80 },
  { keyword: 'kerudung', path: 'Pakaian Muslim', priority: 80 },
  { keyword: 'gamis', path: 'Pakaian Muslim', priority: 80 },

  // --- Olahraga & travel ---
  { keyword: 'sepeda', path: 'Olahraga & Travel', priority: 70 },
  { keyword: 'matras', path: 'Olahraga & Travel', priority: 78 },
  { keyword: 'dumbbell', path: 'Olahraga & Travel', priority: 80 },

  // --- Rumah tangga ---
  { keyword: 'lampu', path: 'Elektronik Rumah', priority: 60 },
  { keyword: 'kipas', path: 'Elektronik Rumah', priority: 65 },

  // --- Kecantikan: mata & bulu mata ---
  { keyword: 'mascara', path: 'Kecantikan & Kesehatan/Kosmetik/Bulu Mata/Mascara', priority: 100 },
  { keyword: 'maskara', path: 'Kecantikan & Kesehatan/Kosmetik/Bulu Mata/Mascara', priority: 100 },
  { keyword: 'bulu mata palsu', path: 'Kecantikan & Kesehatan/Kosmetik/Bulu Mata/Bulu Mata Palsu', priority: 98 },
  { keyword: 'pelentik bulu mata', path: 'Kecantikan & Kesehatan/Kosmetik/Alat Kecantikan/Pelentik Bulu Mata', priority: 98 },
  { keyword: 'eyeliner', path: 'Kecantikan & Kesehatan/Kosmetik/Kosmetik Mata/Eyeliner', priority: 100 },
  { keyword: 'eyeshadow', path: 'Kecantikan & Kesehatan/Kosmetik/Kosmetik Mata/Eyeshadow', priority: 100 },
  { keyword: 'skot mata', path: 'Kecantikan & Kesehatan/Kosmetik/Kosmetik Mata/Skot Mata', priority: 98 },
  { keyword: 'eyebrow gel', path: 'Kecantikan & Kesehatan/Kosmetik/Kosmetik Mata/Eyebrow Gel', priority: 96 },
  { keyword: 'pensil alis', path: 'Kecantikan & Kesehatan/Kosmetik/Pensil Alis/Pensil Alis', priority: 98 },
  { keyword: 'eyebrow powder', path: 'Kecantikan & Kesehatan/Kosmetik/Pensil Alis/Eyebrow Powder', priority: 96 },

  // --- Kecantikan: wajah ---
  { keyword: 'bb cream', path: 'Kecantikan & Kesehatan/Kosmetik/Foundation/BB Cream', priority: 98 },
  { keyword: 'cushion', path: 'Kecantikan & Kesehatan/Kosmetik/Foundation/Air Cushion', priority: 94 },
  { keyword: 'concealer', path: 'Kecantikan & Kesehatan/Kosmetik/Foundation/Concealer', priority: 98 },
  { keyword: 'foundation', path: 'Kecantikan & Kesehatan/Kosmetik/Foundation/Alas Bedak Cair', priority: 92 },
  { keyword: 'bedak tabur', path: 'Kecantikan & Kesehatan/Kosmetik/Contouring/Loose Powder', priority: 94 },
  { keyword: 'loose powder', path: 'Kecantikan & Kesehatan/Kosmetik/Contouring/Loose Powder', priority: 94 },
  { keyword: 'contour', path: 'Kecantikan & Kesehatan/Kosmetik/Contouring/Contour Powder', priority: 92 },
  { keyword: 'highlighter', path: 'Kecantikan & Kesehatan/Kosmetik/Contouring/Highlighter', priority: 96 },
  { keyword: 'blush on', path: 'Kecantikan & Kesehatan/Kosmetik/Blush', priority: 96 },
  { keyword: 'blush', path: 'Kecantikan & Kesehatan/Kosmetik/Blush', priority: 88 },
  { keyword: 'primer', path: 'Kecantikan & Kesehatan/Kosmetik/Primer/Primer', priority: 90 },

  // --- Kecantikan: bibir ---
  { keyword: 'lipstik', path: 'Kecantikan & Kesehatan/Kosmetik/Kosmetik Bibir/Pewarna Bibir', priority: 100 },
  { keyword: 'lipstick', path: 'Kecantikan & Kesehatan/Kosmetik/Kosmetik Bibir/Pewarna Bibir', priority: 100 },
  { keyword: 'lip cream', path: 'Kecantikan & Kesehatan/Kosmetik/Kosmetik Bibir/Pewarna Bibir', priority: 98 },
  { keyword: 'lip tint', path: 'Kecantikan & Kesehatan/Kosmetik/Kosmetik Bibir/Pewarna Bibir', priority: 98 },
  { keyword: 'lip gloss', path: 'Kecantikan & Kesehatan/Kosmetik/Kosmetik Bibir/Pewarna Bibir', priority: 98 },
  { keyword: 'lip matte', path: 'Kecantikan & Kesehatan/Kosmetik/Kosmetik Bibir/Pewarna Bibir', priority: 96 },
  { keyword: 'lip balm', path: 'Kecantikan & Kesehatan/Kosmetik/Kosmetik Bibir/Pelembab Bibir', priority: 98 },
  { keyword: 'scrub bibir', path: 'Kecantikan & Kesehatan/Perawatan Diri/Perawatan Bibir/Scrub Bibir', priority: 96 },

  // --- Kecantikan: pembersih & alat ---
  { keyword: 'micellar', path: 'Kecantikan & Kesehatan/Kosmetik/Pembersih Make Up/Pembersih Make Up', priority: 98 },
  { keyword: 'make up remover', path: 'Kecantikan & Kesehatan/Kosmetik/Pembersih Make Up/Pembersih Make Up', priority: 98 },
  { keyword: 'pembersih makeup', path: 'Kecantikan & Kesehatan/Kosmetik/Pembersih Make Up/Pembersih Make Up', priority: 98 },
  { keyword: 'beauty blender', path: 'Kecantikan & Kesehatan/Kosmetik/Alat Kecantikan/Beauty Blender', priority: 98 },
  { keyword: 'kuas makeup', path: 'Kecantikan & Kesehatan/Kosmetik/Alat Kecantikan/Kuas Make Up', priority: 96 },
  { keyword: 'brush makeup', path: 'Kecantikan & Kesehatan/Kosmetik/Alat Kecantikan/Kuas Make Up', priority: 96 },
  { keyword: 'tas kosmetik', path: 'Kecantikan & Kesehatan/Kosmetik/Alat Kecantikan/Tas Kosmetik', priority: 96 },
  { keyword: 'kapas kecantikan', path: 'Kecantikan & Kesehatan/Kosmetik/Pembersih Make Up/Kapas', priority: 80 },

  // --- Perawatan kulit ---
  { keyword: 'sunscreen', path: 'Kecantikan & Kesehatan/Perawatan Diri/Tabir surya/Krim Tabir Surya', priority: 100 },
  { keyword: 'sunblock', path: 'Kecantikan & Kesehatan/Perawatan Diri/Tabir surya/Krim Tabir Surya', priority: 100 },
  { keyword: 'tabir surya', path: 'Kecantikan & Kesehatan/Perawatan Diri/Tabir surya/Krim Tabir Surya', priority: 100 },
  { keyword: 'spf', path: 'Kecantikan & Kesehatan/Perawatan Diri/Tabir surya/Krim Tabir Surya', priority: 80 },
  { keyword: 'toner', path: 'Kecantikan & Kesehatan/Perawatan Diri/Perawatan Wajah/Penyegar Wajah', priority: 96 },
  { keyword: 'penyegar wajah', path: 'Kecantikan & Kesehatan/Perawatan Diri/Perawatan Wajah/Penyegar Wajah', priority: 96 },
  { keyword: 'serum wajah', path: 'Kecantikan & Kesehatan/Perawatan Diri/Perawatan Wajah/Essence', priority: 92 },
  { keyword: 'essence', path: 'Kecantikan & Kesehatan/Perawatan Diri/Perawatan Wajah/Essence', priority: 90 },
  { keyword: 'moisturizer', path: 'Kecantikan & Kesehatan/Perawatan Diri/Perawatan Wajah/Krim Wajah', priority: 96 },
  { keyword: 'pelembab wajah', path: 'Kecantikan & Kesehatan/Perawatan Diri/Perawatan Wajah/Krim Wajah', priority: 96 },
  { keyword: 'krim wajah', path: 'Kecantikan & Kesehatan/Perawatan Diri/Perawatan Wajah/Krim Wajah', priority: 94 },
  { keyword: 'sheet mask', path: 'Kecantikan & Kesehatan/Perawatan Diri/Perawatan Wajah/Mask Sheet', priority: 96 },
  { keyword: 'mask sheet', path: 'Kecantikan & Kesehatan/Perawatan Diri/Perawatan Wajah/Mask Sheet', priority: 96 },
  { keyword: 'masker wajah', path: 'Kecantikan & Kesehatan/Perawatan Diri/Perawatan Wajah/Mask Sheet', priority: 88 },
  { keyword: 'facial wash', path: 'Kecantikan & Kesehatan/Perawatan Diri/Perawatan Wajah/pembersih wajah', priority: 96 },
  { keyword: 'pembersih wajah', path: 'Kecantikan & Kesehatan/Perawatan Diri/Perawatan Wajah/pembersih wajah', priority: 96 },
  { keyword: 'cleanser', path: 'Kecantikan & Kesehatan/Perawatan Diri/Perawatan Wajah/pembersih wajah', priority: 92 },
  { keyword: 'krim mata', path: 'Kecantikan & Kesehatan/Perawatan Diri/Perawatan Mata/Krim Mata', priority: 96 },
  { keyword: 'masker mata', path: 'Kecantikan & Kesehatan/Perawatan Diri/Perawatan Mata/Masker Mata', priority: 96 },

  // --- Perawatan diri ---
  { keyword: 'sampo', path: 'Kecantikan & Kesehatan/Perawatan Diri/Perawatan Rambut/Shampoo', priority: 94 },
  { keyword: 'shampoo', path: 'Kecantikan & Kesehatan/Perawatan Diri/Perawatan Rambut/Shampoo', priority: 94 },
  { keyword: 'conditioner', path: 'Kecantikan & Kesehatan/Perawatan Diri/Perawatan Rambut/Conditioner Rambut', priority: 94 },
  { keyword: 'masker rambut', path: 'Kecantikan & Kesehatan/Perawatan Diri/Perawatan Rambut/masker rambut', priority: 94 },
  { keyword: 'sabun mandi', path: 'Kecantikan & Kesehatan/Perawatan Diri/Perawatan Badan/Sabun Mandi', priority: 94 },
  { keyword: 'body wash', path: 'Kecantikan & Kesehatan/Perawatan Diri/Perawatan Badan/Sabun Mandi', priority: 94 },
  { keyword: 'body lotion', path: 'Kecantikan & Kesehatan/Perawatan Diri/Perawatan Badan/Body Lotion', priority: 96 },
  { keyword: 'scrub badan', path: 'Kecantikan & Kesehatan/Perawatan Diri/Perawatan Badan/Scrub Badan', priority: 94 },
  { keyword: 'deodorant', path: 'Kecantikan & Kesehatan/Perawatan Diri/Perawatan Badan/Deodoran', priority: 96 },
  { keyword: 'deodoran', path: 'Kecantikan & Kesehatan/Perawatan Diri/Perawatan Badan/Deodoran', priority: 96 },
  { keyword: 'parfum wanita', path: 'Kecantikan & Kesehatan/Parfum/Parfum Wanita', priority: 96 },
  { keyword: 'parfum pria', path: 'Kecantikan & Kesehatan/Parfum/Parfum Pria', priority: 96 },
  { keyword: 'parfum', path: 'Kecantikan & Kesehatan/Parfum/Parfum Unisex', priority: 80 },
  { keyword: 'pasta gigi', path: 'Kecantikan & Kesehatan/Perawatan Diri/Perawatan Gigi/Pasta Gigi', priority: 96 },
  { keyword: 'sikat gigi', path: 'Kecantikan & Kesehatan/Perawatan Diri/Perawatan Gigi/Sikat Gigi', priority: 96 },

  // --- Ibu & bayi ---
  { keyword: 'popok bayi', path: 'Ibu & Bayi/Semua Popok Bayi', priority: 98 },
  { keyword: 'diaper', path: 'Ibu & Bayi/Semua Popok Bayi', priority: 96 },
  { keyword: 'botol dot', path: 'Ibu & Bayi/Peralatan Makan/Botol Dot Bayi', priority: 98 },
  { keyword: 'dot bayi', path: 'Ibu & Bayi/Peralatan Makan/Botol Dot Bayi', priority: 96 },

  // --- Otomotif & olahraga ---
  { keyword: 'helm motor', path: 'Otomotif/Helm Motor', priority: 98 },
  { keyword: 'helm', path: 'Otomotif/Helm Motor', priority: 70 },
  { keyword: 'resistance band', path: 'Olahraga & Travel/Yoga & Pilates/Resistance Band', priority: 98 },
];

/** Impor daftar kategori dari data/categories.json ke DB. */
async function importCategories() {
  if (!fs.existsSync(CATEGORIES_FILE)) {
    throw new Error(`File kategori tidak ada: ${CATEGORIES_FILE}. Jalankan: node scripts/scrapeCategories.js`);
  }
  const raw = JSON.parse(fs.readFileSync(CATEGORIES_FILE, 'utf8'));
  const detailed = raw.detailed || [];
  if (!detailed.length) throw new Error('data/categories.json tidak punya field `detailed`.');

  const scrapedAt = raw.scrapedAt ? new Date(raw.scrapedAt) : new Date();

  // Hapus dulu lalu insert massal (lebih cepat dari 1400 upsert).
  await prisma.akulakuCategory.deleteMany({});
  const rows = detailed.map((item) => ({
    path: item.path,
    akulakuId: item.id ? String(item.id) : null,
    level: item.level ?? item.path.split('/').length,
    rootName: String(item.path).split('/')[0],
    scrapedAt,
  }));
  const CHUNK = 500;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const res = await prisma.akulakuCategory.createMany({ data: rows.slice(i, i + CHUNK), skipDuplicates: true });
    inserted += res.count;
  }
  console.log(`[kategori] ${inserted} jalur diimpor.`);
  return inserted;
}

/** Validasi & seed aturan kata kunci. */
async function seedRules() {
  const validPaths = new Set(
    (await prisma.akulakuCategory.findMany({ select: { path: true } })).map((c) => c.path),
  );
  console.log(`[aturan] ${validPaths.size} kategori valid di DB.`);
  await prisma.categoryRule.deleteMany({});

  let ok = 0;
  let skipped = [];
  for (const rule of RULES) {
    // Kategori yang punya prefix cocok (untuk rule seperti 'Pakaian Muslim' yang bukan leaf).
    const exactMatch = validPaths.has(rule.path);
    const prefixMatch = exactMatch || [...validPaths].some((p) => p.startsWith(rule.path + '/'));
    if (!prefixMatch) {
      skipped.push(rule);
      continue;
    }
    await prisma.categoryRule.create({
      data: { keyword: rule.keyword, path: rule.path, priority: rule.priority },
    });
    ok += 1;
  }

  console.log(`[aturan] ${ok} aturan tersimpan.`);
  if (skipped.length) {
    console.log(`[aturan] ${skipped.length} dilewati (jalur tidak ada di kategori Akulaku):`);
    for (const s of skipped) console.log(`   - "${s.keyword}" -> "${s.path}"`);
  }
  return { ok, skipped: skipped.length };
}

(async () => {
  const onlyRules = process.argv.includes('--rules');
  try {
    if (!onlyRules) await importCategories();
    const categoriesCount = await prisma.akulakuCategory.count();
    if (categoriesCount === 0) {
      console.log('Tabel kategori kosong; jalankan tanpa --rules dulu.');
      return;
    }
    await seedRules();
    const rulesCount = await prisma.categoryRule.count();
    console.log(`\nSelesai. AkulakuCategory=${categoriesCount}, CategoryRule=${rulesCount}`);
  } catch (err) {
    console.error('[seed] Error:', err.message);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();
