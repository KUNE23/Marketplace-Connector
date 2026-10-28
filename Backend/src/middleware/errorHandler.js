// Backend/src/middleware/errorHandler.js
module.exports = (err, req, res, next) => {
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
