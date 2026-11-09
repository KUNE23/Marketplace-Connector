// Backend/src/routes/akulakuAccounts.js
const express = require('express');
const router = express.Router();
const { authenticate, authorizeRoles } = require('../middleware/auth');
const {
  listAkulakuAccountsHandler,
  createAkulakuAccountHandler,
  getAkulakuAccountHandler,
  updateAkulakuAccountHandler,
  deleteAkulakuAccountHandler,
} = require('../controllers/akulakuAccountController');

router.use(authenticate);

// Baca daftar akun boleh ADMIN & EMPLOYEE (dipakai untuk dropdown iklan/pesanan).
// Kelola (tambah/ubah/hapus) khusus ADMIN.
router.get('/', authorizeRoles('ADMIN', 'EMPLOYEE'), listAkulakuAccountsHandler);
router.get('/:id', authorizeRoles('ADMIN', 'EMPLOYEE'), getAkulakuAccountHandler);
router.post('/', authorizeRoles('ADMIN'), createAkulakuAccountHandler);
router.patch('/:id', authorizeRoles('ADMIN'), updateAkulakuAccountHandler);
router.delete('/:id', authorizeRoles('ADMIN'), deleteAkulakuAccountHandler);

module.exports = router;
