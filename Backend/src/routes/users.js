// Backend/src/routes/users.js
const express = require('express');
const router = express.Router();
const { authenticate, authorizeRoles, authorizeSelfOrRoles } = require('../middleware/auth');
const {
  createUserHandler,
  getUserHandler,
  listUsersHandler,
  updateUserHandler,
  deleteUserHandler,
} = require('../controllers/userController');

// All routes require authentication
router.use(authenticate);

// ADMIN‑only routes
router.post('/', authorizeRoles('ADMIN'), createUserHandler);
router.get('/', authorizeRoles('ADMIN'), listUsersHandler);
router.delete('/:id', authorizeRoles('ADMIN'), deleteUserHandler);

// Self‑access routes (user can view/update own profile)
router.get('/:id', authorizeSelfOrRoles('ADMIN'), getUserHandler);
router.patch('/:id', authorizeSelfOrRoles('ADMIN'), updateUserHandler);

module.exports = router;
