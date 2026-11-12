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

// ADMIN melihat semua akun; EMPLOYEE hanya akun miliknya (difilter di service).
// Pegawai boleh MENAMBAH akun (otomatis jadi miliknya) dan mengelola miliknya.
router.get('/', authorizeRoles('ADMIN', 'EMPLOYEE'), listAkulakuAccountsHandler);

// Login Akulaku lewat aplikasi (ADMIN & EMPLOYEE, hanya untuk akun yang diizinkan).
router.post('/:id/login', authorizeRoles('ADMIN', 'EMPLOYEE'), loginStartHandler);
router.post('/:id/login/otp', authorizeRoles('ADMIN', 'EMPLOYEE'), loginOtpHandler);
router.delete('/:id/login', authorizeRoles('ADMIN', 'EMPLOYEE'), loginCancelHandler);
router.get('/:id/session', authorizeRoles('ADMIN', 'EMPLOYEE'), sessionInfoHandler);

router.get('/:id', authorizeRoles('ADMIN', 'EMPLOYEE'), getAkulakuAccountHandler);
router.post('/', authorizeRoles('ADMIN', 'EMPLOYEE'), createAkulakuAccountHandler);
router.patch('/:id', authorizeRoles('ADMIN', 'EMPLOYEE'), updateAkulakuAccountHandler);
router.delete('/:id', authorizeRoles('ADMIN', 'EMPLOYEE'), deleteAkulakuAccountHandler);

module.exports = router;
