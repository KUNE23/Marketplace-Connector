// Backend/src/validators/authValidator.js
const { z } = require('zod');

// Login payload validation
const loginSchema = z.object({
  email: z.string().email({ message: 'Invalid email format' }),
  password: z.string().min(6, { message: 'Password must be at least 6 characters' }),
});

module.exports = { loginSchema };
