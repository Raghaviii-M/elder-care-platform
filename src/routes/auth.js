const express = require('express');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { z } = require('zod');
const config = require('../config');
const { validate } = require('../middleware/validate');
const { requireRole } = require('../middleware/auth');

const ROLES = ['elder', 'caretaker', 'family'];
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no look-alike chars (0/O, 1/I/L)

const createSchema = z.object({
  name: z.string().trim().min(1).max(80),
  emails: z.array(z.string().email()).min(1).max(10),
});

const loginSchema = z.object({
  circleId: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_-]{1,40}$/),
  passcode: z.string().min(4).max(64),
});

function generatePasscode(length = 8) {
  let out = '';
  for (let i = 0; i < length; i++) out += ALPHABET[crypto.randomInt(ALPHABET.length)];
  return out;
}

module.exports = function authRoutes(repo) {
  const router = express.Router();
  const limiterOpts = { standardHeaders: true, legacyHeaders: false };
  const loginLimiter = rateLimit({
    ...limiterOpts,
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { error: 'Too many attempts, try again later' },
  });
  const createLimiter = rateLimit({ ...limiterOpts, windowMs: 60 * 60 * 1000, max: 20 });

  // Create a Care Circle. Passcodes are returned ONCE and stored only as hashes.
  router.post('/circles', createLimiter, validate(createSchema), async (req, res, next) => {
    try {
      const id = crypto.randomBytes(4).toString('hex');
      const passcodes = {};
      const hashes = {};
      for (const role of ROLES) {
        passcodes[role] = generatePasscode();
        hashes[role] = await bcrypt.hash(passcodes[role], config.bcryptRounds);
      }
      await repo.createCircle({
        id,
        name: req.body.name,
        emails: req.body.emails,
        passcodes: hashes,
        createdAt: new Date().toISOString(),
      });
      res.status(201).json({ circleId: id, passcodes });
    } catch (err) {
      next(err);
    }
  });

  router.post('/auth/login', loginLimiter, validate(loginSchema), async (req, res, next) => {
    try {
      const { circleId, passcode } = req.body;
      const circle = await repo.getCircle(circleId);
      if (circle) {
        for (const role of ROLES) {
          if (await bcrypt.compare(passcode, circle.passcodes[role])) {
            const token = jwt.sign({ circleId, role }, config.jwtSecret, { expiresIn: '8h' });
            res.cookie('token', token, {
              httpOnly: true,
              sameSite: 'strict',
              secure: config.isProd,
              maxAge: 8 * 60 * 60 * 1000,
            });
            return res.json({ role, circleName: circle.name });
          }
        }
      }
      // Same message for unknown circle and wrong passcode: no account enumeration
      return res.status(401).json({ error: 'Invalid credentials' });
    } catch (err) {
      next(err);
    }
  });

  router.post('/auth/logout', (req, res) => {
    res.clearCookie('token');
    res.json({ ok: true });
  });

  router.get('/auth/me', requireRole(...ROLES), async (req, res, next) => {
    try {
      const circle = await repo.getCircle(req.user.circleId);
      res.json({ ...req.user, circleName: circle ? circle.name : '' });
    } catch (err) {
      next(err);
    }
  });

  return router;
};
