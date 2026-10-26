const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS for all origins (you can restrict in production)
app.use(cors());
app.use(express.json());

// Simple health/status endpoint
app.get('/api/status', (req, res) => {
  res.json({
    status: 'success',
    message: 'Backend connected successfully'
  });
});

app.listen(PORT, () => {
  console.log(`Backend server listening on port ${PORT}`);
});
