// Backend/src/middleware/authenticate.js
/**
 * Middleware that verifies a JWT, extracts the payload, and ensures a matching
 * User record exists in the database. If the user does not exist, it is created
 * automatically (upsert‑like behavior) with minimal required fields.
 *
 * - The JWT must be provided in the `Authorization: Bearer <token>` header.
 * - The secret is taken from `process.env.JWT_SECRET`.
 * - The payload should contain at least an `email` field (or `sub` that can be
 *   interpreted as an email). If `email` is missing, a 401 error is returned.
 * - The middleware looks up the user by email. If not found, it creates a new
 *   user with `role: 'user'` and a default `name` derived from the email.
 * - The resulting user record (including id, email, role, etc.) is attached to
 *   `req.user` for downstream handlers.
 * - All errors are responded with JSON `{ error: "message", code: 401 }`.
 */

const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { ZodError, z } = require('zod');

// Optional payload validation schema (email required, name optional)
const payloadSchema = z.object({
  email: z.string().email({ message: 'Invalid email in token payload' }),
  // allow other fields (sub, name, etc.)
  name: z.string().optional(),
});

async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or malformed Authorization header', code: 401 });
    }

    const token = authHeader.split(' ')[1];
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      return res.status(500).json({ error: 'Server configuration error: JWT secret missing', code: 500 });
    }

    // Verify token – throws on invalid/expired
    const decoded = jwt.verify(token, secret);

    // Validate payload (ensure email exists)
    let payload;
    try {
      payload = payloadSchema.parse(decoded);
    } catch (e) {
      if (e instanceof ZodError) {
        return res.status(401).json({ error: e.errors.map(err => err.message).join(', '), code: 401 });
      }
      throw e;
    }

    // Upsert user – create if not exists
    const user = await prisma.user.upsert({
      where: { email: payload.email },
      update: {}, // no changes if already exists
      create: {
        email: payload.email,
        name: payload.name || payload.email.split('@')[0],
        role: 'user',
        // passwordHash is not required for external token auth; set empty string
        passwordHash: '',
        active: true,
      },
      select: { id: true, email: true, name: true, role: true, active: true },
    });

    // Attach user to request for downstream handlers
    req.user = user;
    next();
  } catch (err) {
    console.error('Authentication error:', err);
    const message = err.name === 'JsonWebTokenError' ? 'Invalid token' : err.message;
    return res.status(401).json({ error: message, code: 401 });
  }
}

module.exports = authenticate;
