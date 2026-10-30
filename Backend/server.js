// Backend/server.js
require("dotenv").config();
const express = require('express');
const cors = require('cors');
const config = require('./src/config');
const statusRouter = require('./src/routes/status');
const authRouter = require('./src/routes/auth');
const userRouter = require('./src/routes/users');
const errorHandler = require('./src/middleware/errorHandler');

const app = express();
const PORT = config.port;

// CORS – configurable via .env (CORS_ORIGIN). Default: *
app.use(cors({ origin: config.corsOrigin }));
app.use(express.json());

// Public routes
app.use('/api', statusRouter);
app.use('/api/auth', authRouter);
// Mount user routes under /api/users
app.use('/api/users', userRouter);

// Central error handling (should be after all routes)
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Backend server listening on port ${PORT}`);
});
