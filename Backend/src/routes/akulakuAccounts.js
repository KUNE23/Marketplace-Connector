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
  loginStartHandler,
  loginOtpHandler,
  loginCancelHandler,
  sessionInfoHandler,
} = require('../controllers/akulakuAccountController');

router.use(authenticate);

// Baca daftar akun boleh ADMIN & EMPLOYEE (dipakai untuk dropdown iklan/pesanan).
// Kelola (tambah/ubah/hapus) khusus ADMIN.
router.get('/', authorizeRoles('ADMIN', 'EMPLOYEE'), listAkulakuAccountsHandler);

// Login Akulaku lewat aplikasi (ADMIN & EMPLOYEE): mulai, kirim OTP, batalkan.
router.post('/:id/login', authorizeRoles('ADMIN', 'EMPLOYEE'), loginStartHandler);
router.post('/:id/login/otp', authorizeRoles('ADMIN', 'EMPLOYEE'), loginOtpHandler);
router.delete('/:id/login', authorizeRoles('ADMIN', 'EMPLOYEE'), loginCancelHandler);
router.get('/:id/session', authorizeRoles('ADMIN', 'EMPLOYEE'), sessionInfoHandler);

router.get('/:id', authorizeRoles('ADMIN', 'EMPLOYEE'), getAkulakuAccountHandler);
router.post('/', authorizeRoles('ADMIN'), createAkulakuAccountHandler);
router.patch('/:id', authorizeRoles('ADMIN'), updateAkulakuAccountHandler);
router.delete('/:id', authorizeRoles('ADMIN'), deleteAkulakuAccountHandler);

module.exports = router;
