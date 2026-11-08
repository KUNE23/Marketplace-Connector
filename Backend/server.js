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

app.use(cors({ origin: config.corsOrigin }));
app.use(express.json());

app.use('/api', statusRouter);
app.use('/api/auth', authRouter);
app.use('/api/users', userRouter);
app.use('/api/notifications', require('./src/routes/notifications'));
app.use('/api/sales', require('./src/routes/sales'));
app.use('/api/products', require('./src/routes/products'));
app.use('/api/akulaku-accounts', require('./src/routes/akulakuAccounts'));
app.use('/api/listings', require('./src/routes/listings'));
app.use('/api/markup-tiers', require('./src/routes/markupTiers'));
app.use('/api/akulaku-orders', require('./src/routes/akulakuOrders'));
app.use('/api/jobs', require('./src/routes/jobs'));
app.use('/api/dashboard', require('./src/routes/dashboard'));

app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Backend server listening on port ${PORT}`);
});
