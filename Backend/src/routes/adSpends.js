// Backend/src/routes/adSpends.js
const express = require('express');
const router = express.Router();
const { authenticate, authorizeRoles } = require('../middleware/auth');
const {
  listAdSpendsHandler,
  createAdSpendHandler,
  updateAdSpendHandler,
  deleteAdSpendHandler,
} = require('../controllers/adSpendController');

router.use(authenticate);
router.use(authorizeRoles('ADMIN', 'EMPLOYEE'));

// Pegawai hanya MELIHAT biaya iklan (terbatas akun miliknya).
// Kelola (tambah/ubah/hapus) khusus ADMIN.
router.get('/', listAdSpendsHandler);
router.post('/', authorizeRoles('ADMIN'), createAdSpendHandler);
router.patch('/:id', authorizeRoles('ADMIN'), updateAdSpendHandler);
router.delete('/:id', authorizeRoles('ADMIN'), deleteAdSpendHandler);

module.exports = router;
