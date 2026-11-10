const fs = require('fs');
const p = 'src/controllers/userController.js';
let c = fs.readFileSync(p, 'utf8');

c = c.replace(
  "const { createUserSchema, updateUserSchema, listUsersQuerySchema, userIdParamSchema } = require('../validators/userValidator');",
  "const { createUserSchema, updateUserSchema, listUsersQuerySchema, userIdParamSchema, updateOwnProfileSchema, changeOwnPasswordSchema } = require('../validators/userValidator');",
);
c = c.replace(
  "const { createUser, getUserById, listUsers, updateUser, deleteUser } = require('../services/userService');",
  "const { createUser, getUserById, listUsers, updateUser, updateOwnProfile, changeOwnPassword, deleteUser } = require('../services/userService');",
);

const handlers = `
/**
 * PATCH /api/users/me/profile - update nama sendiri
 */
async function updateOwnProfileHandler(req, res, next) {
  try {
    if (!req.user) return next(createError(401, 'Unauthenticated'));
    const parsed = updateOwnProfileSchema.parse(req.body);
    const user = await updateOwnProfile(BigInt(req.user.id), parsed);
    res.json(user);
  } catch (err) {
    handleError(err, next);
  }
}

/**
 * PATCH /api/users/me/password - ganti password sendiri (validasi password lama)
 */
async function changeOwnPasswordHandler(req, res, next) {
  try {
    if (!req.user) return next(createError(401, 'Unauthenticated'));
    const parsed = changeOwnPasswordSchema.parse(req.body);
    await changeOwnPassword(BigInt(req.user.id), parsed);
    res.json({ message: 'Password updated' });
  } catch (err) {
    handleError(err, next);
  }
}

module.exports = {
  createUserHandler,
  getUserHandler,
  listUsersHandler,
  updateUserHandler,
  deleteUserHandler,
  meHandler,
  updateOwnProfileHandler,
  changeOwnPasswordHandler,
};`;

c = c.replace(/module\.exports = \{[\s\S]*?\};/, handlers.trim());
fs.writeFileSync(p, c);
console.log('controller updated');
