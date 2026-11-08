const express = require('express');
const router = express.Router();
const { authenticate, authorizeRoles, authorizeSelfOrRoles } = require('../middleware/auth');
const {
  createUserHandler,
  getUserHandler,
  listUsersHandler,
  updateUserHandler,
  deleteUserHandler,
  meHandler,
  updateOwnProfileHandler,
  changeOwnPasswordHandler,
} = require('../controllers/userController');

// All routes require authentication
router.use(authenticate);

// Self-profile endpoints (must be before :id routes to avoid conflict)
router.get('/me', meHandler);
router.patch('/me/profile', updateOwnProfileHandler);
router.patch('/me/password', changeOwnPasswordHandler);

// ADMIN-only routes
router.post('/', authorizeRoles('ADMIN'), createUserHandler);
router.get('/', authorizeRoles('ADMIN'), listUsersHandler);
router.delete('/:id', authorizeRoles('ADMIN'), deleteUserHandler);

// Self-access routes (user can view/update own profile via ID)
router.get('/:id', authorizeSelfOrRoles('ADMIN'), getUserHandler);
router.patch('/:id', authorizeSelfOrRoles('ADMIN'), updateUserHandler);

module.exports = router;
