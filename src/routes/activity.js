const express = require('express');
const rateLimit = require('express-rate-limit');
const { z } = require('zod');
const { requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { validIdParam } = require('../middleware/ids');
const { logActivity, recentActivity } = require('../services/activity');

const ALL = ['elder', 'caretaker', 'family'];
const noteSchema = z.object({ text: z.string().trim().min(1).max(300) });
const checkinSchema = z.object({
  mood: z.enum(['great', 'okay', 'unwell']),
  note: z.string().trim().max(200).optional(),
});
const respondSchema = z.object({ response: z.enum(['ok', 'concern']) });
const MOOD_TEXT = { great: 'feeling great', okay: 'feeling okay', unwell: 'not feeling well' };

module.exports = function activityRoutes({ repo, email }) {
  const router = express.Router();
  router.param('id', validIdParam);

  const sosLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Help was already requested a moment ago' },
  });

  // Emails must never break the request: report whether they went out instead.
  async function notify(send) {
    try {
      const result = await send();
      return !(result && result.skipped);
    } catch (err) {
      console.error('notification failed:', err.message);
      return false;
    }
  }

  router.get('/', requireRole(...ALL), async (req, res, next) => {
    try {
      res.json(await recentActivity(repo, req.user.circleId));
    } catch (err) {
      next(err);
    }
  });

  router.post('/note', requireRole(...ALL), validate(noteSchema), async (req, res, next) => {
    try {
      res.status(201).json(await logActivity(repo, req.user, 'note', req.body.text));
    } catch (err) {
      next(err);
    }
  });

  router.post('/checkin', requireRole('elder'), validate(checkinSchema), async (req, res, next) => {
    try {
      const { mood, note } = req.body;
      await logActivity(
        repo,
        req.user,
        'checkin',
        `Elder is ${MOOD_TEXT[mood]}${note ? `: ${note}` : ''}`,
        { mood },
      );
      let notified = false;
      if (mood === 'unwell') {
        const circle = await repo.getCircle(req.user.circleId);
        notified = await notify(() => email.sendWellbeingAlert(circle, { note }));
      }
      res.status(201).json({ ok: true, notified });
    } catch (err) {
      next(err);
    }
  });

  router.post('/sos', requireRole('elder'), sosLimiter, async (req, res, next) => {
    try {
      await logActivity(repo, req.user, 'sos', 'SOS: the elder asked for help');
      const circle = await repo.getCircle(req.user.circleId);
      const notified = await notify(() => email.sendSos(circle));
      res.status(201).json({ ok: true, notified });
    } catch (err) {
      next(err);
    }
  });

  // The elder confirms or challenges a change made by someone else
  router.post(
    '/:id/respond',
    requireRole('elder'),
    validate(respondSchema),
    async (req, res, next) => {
      try {
        const { circleId } = req.user;
        const item = await repo.getItem(circleId, 'activity', req.params.id);
        if (!item || !item.needsAck) return res.status(404).json({ error: 'Not found' });
        const updated = await repo.updateItem(circleId, 'activity', item.id, {
          ack: req.body.response,
        });
        if (req.body.response === 'concern') {
          await logActivity(
            repo,
            req.user,
            'concern',
            `Elder says this is not right: "${item.text}"`,
          );
          const circle = await repo.getCircle(circleId);
          await notify(() => email.sendConcern(circle, item));
        }
        res.json(updated);
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
};
