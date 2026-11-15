const express = require('express');
const { requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { validIdParam } = require('../middleware/ids');
const { medSchema } = require('../schemas');

const KIND = 'medications';
const ALL = ['elder', 'caretaker', 'family'];

module.exports = function medicationRoutes(repo) {
  const router = express.Router();
  router.param('id', validIdParam);

  router.get('/', requireRole(...ALL), async (req, res, next) => {
    try {
      const meds = await repo.listItems(req.user.circleId, KIND);
      res.json(meds.sort((a, b) => a.name.localeCompare(b.name)));
    } catch (err) {
      next(err);
    }
  });

  router.post('/', requireRole('caretaker'), validate(medSchema), async (req, res, next) => {
    try {
      res.status(201).json(await repo.addItem(req.user.circleId, KIND, req.body));
    } catch (err) {
      next(err);
    }
  });

  router.put(
    '/:id',
    requireRole('caretaker'),
    validate(medSchema.partial()),
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
