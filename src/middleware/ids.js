exports.validIdParam = (req, res, next, id) =>
  /^[A-Za-z0-9_-]{1,64}$/.test(id) ? next() : res.status(404).json({ error: 'Not found' });