// Backend/src/validators/userValidator.js
const { z } = require('zod');

// For creating a new user
const createUserSchema = z.object({
  email: z.string().email({ message: 'Invalid email' }),
  password: z.string().min(6, { message: 'Password must be at least 6 characters' }),
  role: z.enum(['ADMIN', 'EMPLOYEE'], { errorMap: () => ({ message: 'Role must be ADMIN or EMPLOYEE' }) }),
  active: z.boolean().optional(),
});

// For updating a user – all fields optional but if password present it must meet criteria
const updateUserSchema = z.object({
  email: z.string().email({ message: 'Invalid email' }).optional(),
  password: z.string().min(6, { message: 'Password must be at least 6 characters' }).optional(),
  role: z.enum(['ADMIN', 'EMPLOYEE']).optional(),
  active: z.boolean().optional(),
});

// For listing users – pagination + optional search filter
const listUsersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  // optional simple search on email
  search: z.string().optional(),
});

module.exports = { createUserSchema, updateUserSchema, listUsersQuerySchema };
