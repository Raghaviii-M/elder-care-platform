const express = require('express');
const rateLimit = require('express-rate-limit');
const { z } = require('zod');
const { requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { computeAdherence, istParts, DAY_MS } = require('../services/scheduleUtils');

const ALL = ['elder', 'caretaker', 'family'];
const parseSchema = z.object({ text: z.string().trim().min(3).max(300) });
const explainSchema = z.object({ name: z.string().trim().min(1).max(100) });
const { TtlCache } = require('../services/ttlCache');

module.exports = function aiRoutes({ repo, ai }) {
  const router = express.Router();
  const insightCache = new TtlCache(5 * 60 * 1000);
  router.use(
    rateLimit({
      windowMs: 60 * 1000,
      max: 20,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: 'Too many AI requests, please slow down' },
    }),
  );

  router.post('/parse', requireRole('caretaker'), validate(parseSchema), async (req, res) => {
    try {
      res.json(await ai.parseMedication(req.body.text));
    } catch {
      res
        .status(422)
        .json({ error: 'Could not read that. Try: "Metformin 500mg twice daily after meals"' });
    }
  });

  router.post('/explain', requireRole(...ALL), validate(explainSchema), async (req, res, next) => {
    try {
      res.json(await ai.explainMedicine(req.body.name));
    } catch (err) {
      next(err);
    }
  });

  router.get('/insights', requireRole(...ALL), async (req, res, next) => {
    try {
      const { circleId } = req.user;
      const cached = req.query.refresh ? undefined : insightCache.get(circleId);
      if (cached) return res.json(cached);

      const since = istParts(new Date(Date.now() - 7 * DAY_MS)).date;
      const [meds, doses] = await Promise.all([
        repo.listItems(circleId, 'medications'),
        repo.listItems(circleId, 'doses', { sinceDate: since }),
      ]);
      const per = computeAdherence(meds, doses, 7).filter((m) => m.expected > 0);
      const expected = per.reduce((s, m) => s + m.expected, 0);
      const taken = per.reduce((s, m) => s + m.taken, 0);
      const weakest = [...per].sort((a, b) => a.percent - b.percent)[0];
      const result = await ai.insights({
        overall: expected ? Math.round((taken / expected) * 100) : null,
        weakest: weakest ? { name: weakest.name, percent: weakest.percent } : null,
        medications: per.map(({ name, percent }) => ({ name, percent })),
      });
      insightCache.set(circleId, result);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  return router;
};
