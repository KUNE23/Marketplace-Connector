// Backend/src/controllers/userController.js
const {
  createUserSchema,
  updateUserSchema,
  listUsersQuerySchema,
  userIdParamSchema,
} = require('../validators/userValidator');
const {
  createUser,
  getUserById,
  listUsers,
  updateUser,
  deleteUser,
} = require('../services/userService');
const createError = require('http-errors');

/**
 * Forward Zod validation errors as 400 responses using the existing format.
 */
function handleError(err, next) {
  if (err.name === 'ZodError') {
    return next(createError(400, err.errors.map((e) => e.message).join(', ')));
  }
  return next(err);
}

/**
 * POST /api/users – create a new user (ADMIN only)
 */
async function createUserHandler(req, res, next) {
  try {
    const parsed = createUserSchema.parse(req.body);
    // Force role to EMPLOYEE regardless of client input (only admin can create users)
    const safePayload = { ...parsed, role: 'EMPLOYEE' };
    const user = await createUser(safePayload);
    res.status(201).json(user);
  } catch (err) {
    handleError(err, next);
  }
}

/**
 * GET /api/users/:id – fetch a single user (ADMIN or self)
 */
async function getUserHandler(req, res, next) {
  try {
    const { id } = userIdParamSchema.parse(req.params);
    const user = await getUserById(id);
    res.json(user);
  } catch (err) {
    handleError(err, next);
  }
}

/**
 * GET /api/users – list users with pagination and optional search (ADMIN only)
 */
async function listUsersHandler(req, res, next) {
  try {
    const parsed = listUsersQuerySchema.parse(req.query);
    const result = await listUsers({
      page: parsed.page,
      limit: parsed.limit,
      search: parsed.search || undefined,
    });
    res.json(result);
  } catch (err) {
    handleError(err, next);
  }
}

/**
 * PATCH /api/users/:id – update user (ADMIN or self)
 */
async function updateUserHandler(req, res, next) {
  try {
    const { id } = userIdParamSchema.parse(req.params);
    const parsed = updateUserSchema.parse(req.body);

    // Employees may update their own profile but cannot change privilege fields.
    if (req.user && req.user.role !== 'ADMIN') {
      if (parsed.role !== undefined) {
        return next(createError(403, 'Employees cannot change role'));
      }
      if (parsed.active !== undefined) {
        return next(createError(403, 'Employees cannot change active status'));
      }
    }

    const user = await updateUser(id, parsed);
    res.json(user);
  } catch (err) {
    handleError(err, next);
  }
}

/**
 * DELETE /api/users/:id – delete user (ADMIN only)
 */
async function deleteUserHandler(req, res, next) {
  try {
    const { id } = userIdParamSchema.parse(req.params);
    // Prevent admin from deleting their own account
    if (req.user && req.user.id === id.toString()) {
      return next(createError(403, 'Cannot delete own account'));
    }
    await deleteUser(id);
    res.status(204).send();
  } catch (err) {
    handleError(err, next);
  }
}

/**
 * GET /api/users/me – returns authenticated user's profile.
 */
async function meHandler(req, res, next) {
  try {
    if (!req.user) return next(createError(401, 'Unauthenticated'));
    const userId = BigInt(req.user.id);
    const user = await getUserById(userId);
    res.json(user);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createUserHandler,
  getUserHandler,
  listUsersHandler,
  updateUserHandler,
  deleteUserHandler,
  meHandler,
};
