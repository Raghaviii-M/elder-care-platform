const express = require('express');
const { requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { doseSchema } = require('../schemas');
const { istParts, todaySlots, computeAdherence } = require('../services/scheduleUtils');

const ALL = ['elder', 'caretaker', 'family'];

module.exports = function doseRoutes(repo) {
  const router = express.Router();

  router.get('/today', requireRole(...ALL), async (req, res, next) => {
    try {
      const { circleId } = req.user;
      const { date, time: now } = istParts();
      const [meds, doses] = await Promise.all([
        repo.listItems(circleId, 'medications'),
        repo.listItems(circleId, 'doses', { sinceDate: date }),
      ]);
        res.json({ date, now, slots: todaySlots(meds, doses, date) });
    } catch (err) {
      next(err);
    }
  });

  router.get('/adherence', requireRole(...ALL), async (req, res, next) => {
    try {
      const { circleId } = req.user;
      const days = Math.min(Math.max(parseInt(req.query.days, 10) || 7, 1), 30);
      const sinceDate = istParts(new Date(Date.now() - days * 24 * 60 * 60 * 1000)).date;
      const [meds, doses] = await Promise.all([
        repo.listItems(circleId, 'medications'),
        repo.listItems(circleId, 'doses', { sinceDate }),
      ]);
      res.json({ days, medications: computeAdherence(meds, doses, days) });
    } catch (err) {
      next(err);
    }
  });

  router.post('/', requireRole('elder', 'caretaker'), validate(doseSchema), async (req, res, next) => {
    try {
      const { circleId, role } = req.user;
      const { medicationId, time } = req.body;
      const med = await repo.getItem(circleId, 'medications', medicationId);
      if (!med) return res.status(404).json({ error: 'Medication not found' });
      if (!med.times.includes(time)) {
        return res.status(400).json({ error: 'Time is not in this medication schedule' });
      }
      const today = istParts().date;
      const date = req.body.date || today;
      if (date > today) return res.status(400).json({ error: 'Cannot log a future dose' });

      const id = `${medicationId}_${date}_${time.replace(':', '')}`;
      const dose = await repo.setItem(circleId, 'doses', id, {
        medicationId,
        date,
        time,
        takenAt: new Date().toISOString(),
        takenBy: role,
      });
      res.status(201).json(dose);
    } catch (err) {
      next(err);
    }
  });

  return router;
};