const TZ = 'Asia/Kolkata';
const DAY_MS = 24 * 60 * 60 * 1000;

const formatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** Date and time in IST: { date: 'YYYY-MM-DD', time: 'HH:MM' } */
function istParts(d = new Date()) {
  const p = Object.fromEntries(formatter.formatToParts(d).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}

function isActiveOn(med, date) {
  return med.startDate <= date && (!med.endDate || date <= med.endDate);
}

/** Every scheduled slot for today, with taken status. */
function todaySlots(meds, doses, today) {
  const taken = new Set(doses.map((d) => `${d.medicationId}|${d.date}|${d.time}`));
  const slots = [];
  for (const med of meds) {
    if (!isActiveOn(med, today)) continue;
    for (const time of med.times) {
      slots.push({
        medicationId: med.id,
        name: med.name,
        dosage: med.dosage,
        instructions: med.instructions || '',
        time,
        taken: taken.has(`${med.id}|${today}|${time}`),
      });
    }
  }
  return slots.sort((a, b) => a.time.localeCompare(b.time) || a.name.localeCompare(b.name));
}

/** Per-medication adherence over the last `days` days. Future slots today are not counted. */
function computeAdherence(meds, doses, days, now = new Date()) {
  const { date: today, time: nowTime } = istParts(now);
  const dates = [];
  for (let i = 0; i < days; i++) dates.push(istParts(new Date(now.getTime() - i * DAY_MS)).date);
  const taken = new Set(doses.map((d) => `${d.medicationId}|${d.date}|${d.time}`));

  return meds.map((med) => {
    let expected = 0;
    let took = 0;
    for (const date of dates) {
      if (!isActiveOn(med, date)) continue;
      for (const time of med.times) {
        if (date === today && time > nowTime) continue;
        expected++;
        if (taken.has(`${med.id}|${date}|${time}`)) took++;
      }
    }
    return {
      medicationId: med.id,
      name: med.name,
      expected,
      taken: took,
      percent: expected ? Math.round((took / expected) * 100) : null,
    };
  });
}
const IST_OFFSET = '+05:30'; // India has no daylight saving, so a fixed offset is safe
const slotMs = (date, time) => Date.parse(`${date}T${time}:00${IST_OFFSET}`);
const takenKey = (id, date, time) => `${id}|${date}|${time}`;

function candidateDates(now) {
  return [-1, 0, 1].map((i) => istParts(new Date(now.getTime() + i * DAY_MS)).date);
}

/** Doses starting within the next `windowMin` minutes that are not yet taken. */
function upcomingSlots(meds, doses, now, windowMin = 10) {
  const taken = new Set(doses.map((d) => takenKey(d.medicationId, d.date, d.time)));
  const out = [];
  for (const date of candidateDates(now)) {
    for (const med of meds) {
      if (!isActiveOn(med, date)) continue;
      for (const time of med.times) {
        const diff = slotMs(date, time) - now.getTime();
        if (diff >= 0 && diff <= windowMin * 60000 && !taken.has(takenKey(med.id, date, time))) {
          out.push({ med, date, time });
        }
      }
    }
  }
  return out;
}

/** Per-day totals for the last `days` days (oldest first). Future slots today are not counted. */
function dailyAdherence(meds, doses, days, now = new Date()) {
  const { date: today, time: nowTime } = istParts(now);
  const taken = new Set(doses.map((d) => `${d.medicationId}|${d.date}|${d.time}`));
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = istParts(new Date(now.getTime() - i * DAY_MS)).date;
    let expected = 0;
    let took = 0;
    for (const med of meds) {
      if (!isActiveOn(med, date)) continue;
      for (const time of med.times) {
        if (date === today && time > nowTime) continue;
        expected++;
        if (taken.has(`${med.id}|${date}|${time}`)) took++;
      }
    }
    out.push({ date, expected, taken: took });
  }
  return out;
}
/** Doses missed more than 30 minutes ago, within the 4-hour lookback window. */
function missedSlots(meds, doses, now) {
  const taken = new Set(doses.map((d) => takenKey(d.medicationId, d.date, d.time)));

  const GRACE_MS = 30 * 60 * 1000;
  const LOOKBACK_MS = 4 * 60 * 60 * 1000;
  const out = [];

  for (const date of candidateDates(now)) {
    for (const med of meds) {
      if (!isActiveOn(med, date)) continue;

      for (const time of med.times) {
        const key = takenKey(med.id, date, time);
        const elapsed = now.getTime() - slotMs(date, time);

        if (elapsed > GRACE_MS && elapsed <= LOOKBACK_MS && !taken.has(key)) {
          out.push({ med, date, time });
        }
      }
    }
  }

  return out;
}

module.exports = {
  TZ,
  DAY_MS,
  istParts,
  isActiveOn,
  todaySlots,
  computeAdherence,
  dailyAdherence,
  slotMs,
  upcomingSlots,
  missedSlots,
};
