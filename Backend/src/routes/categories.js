// Backend/src/routes/categories.js
const express = require('express');
const router = express.Router();
const { authenticate, authorizeRoles } = require('../middleware/auth');
const {
  listCategoriesHandler,
  resolveCategoryHandler,
  listRulesHandler,
  upsertRuleHandler,
  deleteRuleHandler,
} = require('../controllers/categoryController');

router.use(authenticate);
router.use(authorizeRoles('ADMIN', 'EMPLOYEE'));

// Rute statis sebelum dinamis.
router.get('/resolve', resolveCategoryHandler);
router.get('/rules', listRulesHandler);
router.post('/rules', authorizeRoles('ADMIN'), upsertRuleHandler);
router.delete('/rules/:id', authorizeRoles('ADMIN'), deleteRuleHandler);
router.get('/', listCategoriesHandler);

module.exports = router;
