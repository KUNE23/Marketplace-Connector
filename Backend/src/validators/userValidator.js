// Backend/src/validators/userValidator.js
const { z } = require('zod');

const roleSchema = z.enum(['ADMIN', 'EMPLOYEE'], {
  errorMap: () => ({ message: 'Role must be ADMIN or EMPLOYEE' }),
});

// For creating a new user
const createUserSchema = z.object({
  email: z.string().trim().email({ message: 'Invalid email' }),
  password: z.string().min(6, { message: 'Password must be at least 6 characters' }),
  name: z.string().trim().min(1, { message: 'Name must not be empty' }).optional(),
  role: roleSchema.optional().default('EMPLOYEE'),
  active: z.boolean().optional(),
});

// For updating a user – all fields optional but if password present it must meet criteria
// Unknown keys are stripped by Zod to prevent mass assignment of sensitive fields.
const updateUserSchema = z
  .object({
    email: z.string().trim().email({ message: 'Invalid email' }).optional(),
    password: z.string().min(6, { message: 'Password must be at least 6 characters' }).optional(),
    name: z.string().trim().min(1, { message: 'Name must not be empty' }).optional(),
    active: z.boolean().optional(),
    // role changes are allowed only for admin and validated in controller
    role: roleSchema.optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });

// For listing users – pagination + optional search filter on name or email
const listUsersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  // optional simple search on email or name
  search: z.string().trim().optional(),
});

// Route parameter validation for /api/users/:id
const userIdParamSchema = z.object({
  id: z
    .string()
    .regex(/^[1-9]\d*$/, { message: 'Invalid user id' })
    .transform((value) => BigInt(value)),
});

module.exports = {
  createUserSchema,
  updateUserSchema,
  listUsersQuerySchema,
  userIdParamSchema,
};
