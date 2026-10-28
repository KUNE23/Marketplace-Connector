exports.getHealth = (req, res) => {
  res.json({ status: 'ok', message: 'Service is healthy' });
};

exports.getStatus = (req, res) => {
  res.json({
    status: 'success',
    message: 'Backend connected successfully'
  });
};
