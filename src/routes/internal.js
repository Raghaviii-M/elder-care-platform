const crypto = require('crypto');
const express = require('express');
const config = require('../config');
const { runReminders } = require('../services/reminderService');

module.exports = function internalRoutes({ repo, email }) {
  const router = express.Router();

  router.post('/reminders', async (req, res, next) => {
    const given = Buffer.from(String(req.get('x-cron-secret') || ''));
    const wanted = Buffer.from(config.cronSecret);
    // constant-time comparison so the secret can't be guessed by timing
    if (given.length !== wanted.length || !crypto.timingSafeEqual(given, wanted)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    try {
      res.json(await runReminders({ repo, email }));
    } catch (err) {
      next(err);
    }
  });

  return router;
};
