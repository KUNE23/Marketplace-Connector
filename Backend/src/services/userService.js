const bcrypt = require('bcrypt');
const { PrismaClient } = require('@prisma/client');
const createError = require('http-errors');

const prisma = new PrismaClient();

const PUBLIC_USER_SELECT = {
  id: true,
  email: true,
  name: true,
  role: true,
  active: true,
};

/**
 * Convert a Prisma user (BigInt id) into a JSON-safe public user.
 * Never includes passwordHash.
 */
function toPublicUser(user) {
  return {
    id: user.id.toString(),
    email: user.email,
    name: user.name,
    role: user.role,
    active: user.active,
  };
}

/**
 * Map Prisma errors to consistent HTTP errors.
 */
function mapPrismaError(err) {
  if (err.code === 'P2002') {
    throw createError(409, 'User with this email already exists');
  }
  if (err.code === 'P2025') {
    throw createError(404, 'User not found');
  }
  throw err;
}

/**
 * Create a new user. Password is hashed before storage.
 * Returns the created user (without passwordHash).
 */
async function createUser({ email, password, role, active = true, name }) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw createError(409, 'User with this email already exists');

  const passwordHash = await bcrypt.hash(password, 10);

  try {
    // Force EMPLOYEE unless role explicitly ADMIN (should never happen due to controller)
    const sanitizedRole = role === 'ADMIN' ? 'ADMIN' : 'EMPLOYEE';
    const user = await prisma.user.create({
      data: { email, passwordHash, role: sanitizedRole, active, name },
      select: PUBLIC_USER_SELECT,
    });
    return toPublicUser(user);
  } catch (err) {
    return mapPrismaError(err);
  }
}

/**
 * Get a user by ID.
 */
async function getUserById(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: PUBLIC_USER_SELECT,
  });
  if (!user) throw createError(404, 'User not found');
  return toPublicUser(user);
}

/**
 * List users with pagination and optional search by email.
 * query: { page?, limit?, search? }
 */
async function listUsers({ page = 1, limit = 20, search }) {
  const skip = (page - 1) * limit;
  let whereClause = {};
  if (search) {
    whereClause = {
      OR: [
        { email: { contains: search, mode: 'insensitive' } },
        { name: { contains: search, mode: 'insensitive' } },
      ],
    };
  }
  const [users, total] = await Promise.all([
    prisma.user.findMany({
      skip,
      take: limit,
      where: whereClause,
      orderBy: { id: 'asc' },
      select: PUBLIC_USER_SELECT,
    }),
    prisma.user.count({ where: whereClause }),
  ]);

  return { users: users.map(toPublicUser), total, page, limit };
}

/**
 * Update user fields. Password, if present, will be re‑hashed.
 */
async function updateUser(userId, data) {
  const updateData = {};

  if (data.email !== undefined) updateData.email = data.email;
  if (data.name !== undefined) updateData.name = data.name;
  if (data.active !== undefined) updateData.active = data.active;
  if (data.role !== undefined) updateData.role = data.role;
  if (data.password !== undefined) {
    updateData.passwordHash = await bcrypt.hash(data.password, 10);
  }

  try {
    const user = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: PUBLIC_USER_SELECT,
    });
    return toPublicUser(user);
  } catch (err) {
    return mapPrismaError(err);
  }
}

/**
 * Hard delete a user.
 */
async function deleteUser(userId) {
  try {
    await prisma.user.delete({ where: { id: userId } });
    return true;
  } catch (err) {
    return mapPrismaError(err);
  }
}

module.exports = {
  createUser,
  getUserById,
  listUsers,
  updateUser,
  deleteUser,
};
