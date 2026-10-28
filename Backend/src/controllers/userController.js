// Backend/src/controllers/userController.js
const { createUserSchema, updateUserSchema, listUsersQuerySchema } = require('../validators/userValidator');
const { createUser, getUserById, listUsers, updateUser, deleteUser } = require('../services/userService');
const createError = require('http-errors');

/**
 * POST /api/users – create a new user (ADMIN only)
 */
async function createUserHandler(req, res, next) {
  try {
    const parsed = createUserSchema.parse(req.body);
    const user = await createUser(parsed);
    res.status(201).json(user);
  } catch (err) {
    if (err.name === 'ZodError') {
      return next(createError(400, err.errors.map(e => e.message).join(', ')));
    }
    next(err);
  }
}

/**
 * GET /api/users/:id – fetch a single user (ADMIN or self)
 */
async function getUserHandler(req, res, next) {
  try {
    const { id } = req.params;
    const user = await getUserById(BigInt(id));
    res.json(user);
  } catch (err) {
    next(err);
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
      search: parsed.search,
    });
    res.json(result);
  } catch (err) {
    if (err.name === 'ZodError') {
      return next(createError(400, err.errors.map(e => e.message).join(', ')));
    }
    next(err);
  }
}

/**
 * PATCH /api/users/:id – update user (ADMIN or self)
 */
async function updateUserHandler(req, res, next) {
  try {
    const { id } = req.params;
    const parsed = updateUserSchema.parse(req.body);
    // If the caller is not ADMIN, prevent role changes
    if (req.user && req.user.role !== 'ADMIN' && parsed.role !== undefined) {
      return next(createError(403, 'Employees cannot change role'));
    }
    const user = await updateUser(BigInt(id), parsed);
    res.json(user);
  } catch (err) {
    if (err.name === 'ZodError') {
      return next(createError(400, err.errors.map(e => e.message).join(', ')));
    }
    next(err);
  }
}

/**
 * DELETE /api/users/:id – delete user (ADMIN only)
 */
async function deleteUserHandler(req, res, next) {
  try {
    const { id } = req.params;
    await deleteUser(BigInt(id));
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

module.exports = { createUserHandler, getUserHandler, listUsersHandler, updateUserHandler, deleteUserHandler };
