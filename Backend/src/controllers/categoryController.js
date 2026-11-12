// Backend/src/controllers/categoryController.js
const createError = require('http-errors');
const {
  resolveListingCategory,
  resolveCategoryByKeyword,
  suggestCategoryPaths,
} = require('../services/categoryService');
const prisma = require('../lib/prisma');

function handleError(err, next) {
  if (err.name === 'ZodError') {
    return next(createError(400, err.errors.map((e) => e.message).join(', ')));
  }
  return next(err);
}

/** GET /api/categories?search=ransel&limit=20 — cari jalur kategori Akulaku. */
async function listCategoriesHandler(req, res, next) {
  try {
    const search = String(req.query.search || '').trim();
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
    const where = search ? { path: { contains: search, mode: 'insensitive' } } : {};
    const [categories, total] = await Promise.all([
      prisma.akulakuCategory.findMany({
        where,
        select: { id: true, path: true, level: true, rootName: true },
        orderBy: { path: 'asc' },
        take: limit,
      }),
      prisma.akulakuCategory.count({ where }),
    ]);
    res.json({
      categories: categories.map((c) => ({ ...c, id: c.id.toString() })),
      total,
    });
  } catch (err) { handleError(err, next); }
}

/** GET /api/categories/resolve?productName=...&categoryPath=... — preview kategori otomatis. */
async function resolveCategoryHandler(req, res, next) {
  try {
    const productName = String(req.query.productName || '').trim();
    const categoryPath = String(req.query.categoryPath || '').trim();
    if (!productName && !categoryPath) {
      return next(createError(400, 'productName atau categoryPath wajib diisi'));
    }
    const resolved = await resolveListingCategory({ productName, categoryPath: categoryPath || null });
    res.json({ resolved, suggestions: resolved ? [] : await suggestCategoryPaths(productName, 5) });
  } catch (err) { handleError(err, next); }
}

/** GET /api/categories/rules — daftar aturan kata kunci. */
async function listRulesHandler(req, res, next) {
  try {
    const rules = await prisma.categoryRule.findMany({ orderBy: [{ priority: 'desc' }, { keyword: 'asc' }] });
    res.json({ rules: rules.map((r) => ({ ...r, id: r.id.toString() })) });
  } catch (err) { handleError(err, next); }
}

/** POST /api/categories/rules — tambah/perbarui aturan kata kunci. */
async function upsertRuleHandler(req, res, next) {
  try {
    const keyword = String(req.body?.keyword || '').trim();
    const path = String(req.body?.path || '').trim();
    const priority = Number(req.body?.priority ?? 0);
    if (!keyword) return next(createError(400, 'keyword wajib diisi'));
    if (!path) return next(createError(400, 'path wajib diisi'));

    const { isKnownCategoryPath } = require('../services/categoryService');
    if (!(await isKnownCategoryPath(path))) {
      const suggestions = await suggestCategoryPaths(path, 5);
      return next(createError(400, `Jalur kategori tidak dikenal: "${path}". Saran: ${suggestions.map((s) => s.path).join(' | ') || '-'}`));
    }

    const existing = await prisma.categoryRule.findFirst({ where: { keyword, path } });
    const rule = existing
      ? await prisma.categoryRule.update({ where: { id: existing.id }, data: { priority, active: true } })
      : await prisma.categoryRule.create({ data: { keyword, path, priority, active: true } });
    const { clearCategoryCache } = require('../services/categoryService');
    clearCategoryCache();
    res.status(existing ? 200 : 201).json({ ...rule, id: rule.id.toString() });
  } catch (err) { handleError(err, next); }
}

/** DELETE /api/categories/rules/:id — hapus aturan. */
async function deleteRuleHandler(req, res, next) {
  try {
    await prisma.categoryRule.delete({ where: { id: BigInt(req.params.id) } });
    const { clearCategoryCache } = require('../services/categoryService');
    clearCategoryCache();
    res.status(204).send();
  } catch (err) {
    if (err.code === 'P2025') return next(createError(404, 'Aturan tidak ditemukan'));
    handleError(err, next);
  }
}

module.exports = {
  listCategoriesHandler,
  resolveCategoryHandler,
  listRulesHandler,
  upsertRuleHandler,
  deleteRuleHandler,
};
