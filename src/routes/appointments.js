const express = require('express');
const { requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { validIdParam } = require('../middleware/ids');
const { appointmentSchema } = require('../schemas');
const { logActivity } = require('../services/activity');

const KIND = 'appointments';

module.exports = function appointmentRoutes(repo) {
  const router = express.Router();
  router.param('id', validIdParam);

  router.get('/', requireRole('elder', 'caretaker', 'family'), async (req, res, next) => {
    try {
      const list = await repo.listItems(req.user.circleId, KIND);
      res.json(list.sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`)));
    } catch (err) {
      next(err);
    }
  });

  router.post(
    '/',
    requireRole('caretaker', 'family'),
    validate(appointmentSchema),
    async (req, res, next) => {
      try {
        const appt = await repo.addItem(req.user.circleId, KIND, req.body);
        await logActivity(
          repo,
          req.user,
          'appt_added',
          `Appointment added: ${appt.title} on ${appt.date} at ${appt.time}`,
          { needsAck: true },
        );
        res.status(201).json(appt);
      } catch (err) {
        next(err);
      }
    },
  );

  router.put(
    '/:id',
    requireRole('caretaker'),
    validate(appointmentSchema.partial()),
    async (req, res, next) => {
      try {
        if (Object.keys(req.body).length === 0) {
          return res.status(400).json({ error: 'Nothing to update' });
        }
        const updated = await repo.updateItem(req.user.circleId, KIND, req.params.id, req.body);
        if (!updated) return res.status(404).json({ error: 'Not found' });
        res.json(updated);
      } catch (err) {
        next(err);
      }
    },
  );

  router.delete('/:id', requireRole('caretaker'), async (req, res, next) => {
    try {
      const removed = await repo.removeItem(req.user.circleId, KIND, req.params.id);
      if (!removed) return res.status(404).json({ error: 'Not found' });
      res.sendStatus(204);
    } catch (err) {
      next(err);
    }
  });

  return router;
};
