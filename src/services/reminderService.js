const { istParts, DAY_MS, slotMs, upcomingSlots, missedSlots } = require('./scheduleUtils');

const BATCH = 5; // circles processed in parallel
const idPart = (prefix, id, date, time) => `${prefix}_${id}_${date}_${time.replace(':', '')}`;

/** Send at most once per key. A failed send is not recorded, so the next run retries it. */
async function once(repo, circleId, key, send) {
  if (await repo.getItem(circleId, 'reminders', key)) return false;
  const result = await send();
  if (result && result.skipped) return false;
  await repo.setItem(circleId, 'reminders', key, { sentAt: new Date().toISOString() });
  return true;
}

async function runReminders({ repo, email, now = new Date() }) {
  const stats = { circles: 0, due: 0, missed: 0, appointments: 0, errors: 0 };
  const today = istParts(now).date;
  const yesterday = istParts(new Date(now.getTime() - DAY_MS)).date;

  const attempt = async (circleId, key, send) => {
    try {
      return await once(repo, circleId, key, send);
    } catch (err) {
      stats.errors++;
      console.error('reminder failed:', key, err.message);
      return false;
    }
  };

  async function processCircle(circle) {
    stats.circles++;
    const meds = await repo.listItems(circle.id, 'medications');
    const [doses, appts] = await Promise.all([
      meds.length ? repo.listItems(circle.id, 'doses', { sinceDate: yesterday }) : [],
      repo.listItems(circle.id, 'appointments', { sinceDate: today }),
    ]);

    for (const s of upcomingSlots(meds, doses, now)) {
      const key = idPart('due', s.med.id, s.date, s.time);
      if (await attempt(circle.id, key, () => email.sendDoseReminder(circle, s))) stats.due++;
    }
    for (const s of missedSlots(meds, doses, now)) {
      const key = idPart('missed', s.med.id, s.date, s.time);
      if (await attempt(circle.id, key, () => email.sendMissedAlert(circle, s))) stats.missed++;
    }
    for (const a of appts) {
      const diff = slotMs(a.date, a.time) - now.getTime();
      if (diff > 0 && diff <= DAY_MS) {
        const key = idPart('appt', a.id, a.date, a.time);
        if (await attempt(circle.id, key, () => email.sendAppointmentReminder(circle, a))) {
          stats.appointments++;
        }
      }
    }
  }

  const circles = await repo.listCircles();
  for (let i = 0; i < circles.length; i += BATCH) {
    await Promise.all(circles.slice(i, i + BATCH).map(processCircle));
  }
  return stats;
}

module.exports = { runReminders };
