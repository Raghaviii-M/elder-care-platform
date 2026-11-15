const express = require('express');
const { requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { validIdParam } = require('../middleware/ids');
const asyncHandler = require('../middleware/asyncHandler');
const { logActivity } = require('../services/activity');

const ALL = ['elder', 'caretaker', 'family'];

/**
 * CRUD router for one kind of circle-scoped item. Every change is written to the
 * care feed and waits for the elder's confirmation.
 * @param {object} repo Repository implementation
 * @param {{kind:string, schema:object, createRoles:string[], sort:Function,
 *   describe:{prefix:string, added:Function, updated:Function, removed:Function}}} options
 */
function createCrudRouter(repo, { kind, schema, createRoles, sort, describe }) {
  const router = express.Router();
  router.param('id', validIdParam);
  const record = (user, suffix, text) =>
    logActivity(repo, user, `${describe.prefix}_${suffix}`, text, { needsAck: true });

  router.get(
    '/',
    requireRole(...ALL),
    asyncHandler(async (req, res) => {
      res.json((await repo.listItems(req.user.circleId, kind)).sort(sort));
    }),
  );

  router.post(
    '/',
    requireRole(...createRoles),
    validate(schema),
    asyncHandler(async (req, res) => {
      const item = await repo.addItem(req.user.circleId, kind, req.body);
      await record(req.user, 'added', describe.added(item));
      res.status(201).json(item);
    }),
  );

  router.put(
    '/:id',
    requireRole('caretaker'),
    validate(schema.partial()),
    asyncHandler(async (req, res) => {
      if (Object.keys(req.body).length === 0) {
        return res.status(400).json({ error: 'Nothing to update' });
      }
      const updated = await repo.updateItem(req.user.circleId, kind, req.params.id, req.body);
      if (!updated) return res.status(404).json({ error: 'Not found' });
      await record(req.user, 'updated', describe.updated(updated));
      res.json(updated);
    }),
  );

  router.delete(
    '/:id',
    requireRole('caretaker'),
    asyncHandler(async (req, res) => {
      const { circleId } = req.user;
      const existing = await repo.getItem(circleId, kind, req.params.id);
      if (!existing) return res.status(404).json({ error: 'Not found' });
      await repo.removeItem(circleId, kind, req.params.id);
      await record(req.user, 'deleted', describe.removed(existing));
      res.sendStatus(204);
    }),
  );

  return router;
}

module.exports = { createCrudRouter };
