const jwt = require('jsonwebtoken');
const config = require('../config');

exports.requireRole =
  (...roles) =>
  (req, res, next) => {
    let payload;
    try {
      payload = jwt.verify(req.cookies.token, config.jwtSecret);
    } catch {
      return res.status(401).json({ error: 'Unauthenticated' });
    }
    if (!roles.includes(payload.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    req.user = { circleId: payload.circleId, role: payload.role };
    next();
  };