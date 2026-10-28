const bcrypt = require('bcrypt');
const { PrismaClient } = require('@prisma/client');
const createError = require('http-errors');

const prisma = new PrismaClient();

/**
 * Create a new user. Password is hashed before storage.
 * Returns the created user (without passwordHash).
 */
async function createUser({ email, password, role, active = true }) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw createError(409, 'User with this email already exists');

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { email, passwordHash, role, active },
    select: { id: true, email: true, role: true, active: true, name: true },
  });
  return user;
}

/**
 * Get a user by ID.
 */
async function getUserById(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, role: true, active: true, name: true },
  });
  if (!user) throw createError(404, 'User not found');
  return user;
}

/**
 * List users with pagination and optional search by email.
 * query: { page?, limit?, search? }
 */
async function listUsers({ page = 1, limit = 20, search }) {
  const skip = (page - 1) * limit;
  const whereClause = search ? { email: { contains: search, mode: 'insensitive' } } : {};
  const [users, total] = await Promise.all([
    prisma.user.findMany({
      skip,
      take: limit,
      where: whereClause,
      orderBy: { id: 'asc' },
      select: { id: true, email: true, role: true, active: true, name: true },
    }),
    prisma.user.count({ where: whereClause }),
  ]);
  return { users, total, page, limit };
}

/**
 * Update user fields. Password, if present, will be re‑hashed.
 */
async function updateUser(userId, data) {
  const updateData = { ...data };
  if (data.password) {
    updateData.passwordHash = await bcrypt.hash(data.password, 10);
    delete updateData.password;
  }
  // Prevent updating role to undefined (keep existing) if omitted
  if (data.role === undefined) delete updateData.role;
  const user = await prisma.user.update({
    where: { id: userId },
    data: updateData,
    select: { id: true, email: true, role: true, active: true, name: true },
  });
  return user;
}

/**
 * Hard delete a user.
 */
async function deleteUser(userId) {
  await prisma.user.delete({ where: { id: userId } });
  return true;
}

module.exports = { createUser, getUserById, listUsers, updateUser, deleteUser };
