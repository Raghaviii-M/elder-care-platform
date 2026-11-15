const express = require('express');
const { requireRole } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');
const { recentActivity } = require('../services/activity');
const {
  istParts,
  todaySlots,
  computeAdherence,
  dailyAdherence,
  DAY_MS,
} = require('../services/scheduleUtils');

const DAYS = 7;

/** One request returns everything the dashboard needs (4 queries instead of 9). */
module.exports = function dashboardRoutes(repo) {
  const router = express.Router();

  router.get(
    '/',
    requireRole('elder', 'caretaker', 'family'),
    asyncHandler(async (req, res) => {
      const { circleId } = req.user;
      const { date, time } = istParts();
      const since = istParts(new Date(Date.now() - DAYS * DAY_MS)).date;
      const [meds, doses, appointments, activity] = await Promise.all([
        repo.listItems(circleId, 'medications'),
        repo.listItems(circleId, 'doses', { sinceDate: since }),
        repo.listItems(circleId, 'appointments', { sinceDate: date }), // upcoming only
        recentActivity(repo, circleId),
      ]);
      res.json({
        today: { date, now: time, slots: todaySlots(meds, doses, date) },
        adherence: {
          days: DAYS,
          medications: computeAdherence(meds, doses, DAYS),
          daily: dailyAdherence(meds, doses, DAYS),
        },
        medications: meds.sort((a, b) => a.name.localeCompare(b.name)),
        appointments: appointments.sort((a, b) =>
          `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`),
        ),
        activity,
      });
    }),
  );

  return router;
};
