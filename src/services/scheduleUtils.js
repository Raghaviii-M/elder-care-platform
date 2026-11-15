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

module.exports = { TZ, istParts, isActiveOn, todaySlots, computeAdherence };