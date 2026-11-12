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
