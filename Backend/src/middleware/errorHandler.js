// Backend/src/middleware/errorHandler.js
module.exports = (err, req, res, next) => {
  // Map known Prisma errors to consistent HTTP responses.
  if (err.code === 'P2002') {
    err.status = 409;
    err.message = 'User with this email already exists';
  } else if (err.code === 'P2025') {
    err.status = 404;
    err.message = 'User not found';
  } else if (typeof err.code === 'string' && err.code.startsWith('P') && !err.status) {
    // Avoid leaking raw database error details to clients.
    err.status = 500;
    err.message = 'Database error';
  }

  // Default to 500 if statusCode not set
  const status = err.status || err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  // In production, avoid leaking stack traces
  const response = {
    status: 'error',
    message,
  };

  // Attach stack only in development
  if (process.env.NODE_ENV !== 'production') {
    response.stack = err.stack;
  }

  res.status(status).json(response);
};
