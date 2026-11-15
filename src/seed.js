const bcrypt = require('bcryptjs');
const config = require('./config');
const { istParts, DAY_MS } = require('./services/scheduleUtils');

const DEMO = {
  id: 'demo',
  passcodes: { elder: 'ELDER-2026', caretaker: 'CARER-2026', family: 'FAMILY-2026' },
};

const dayStr = (offset) => istParts(new Date(Date.now() + offset * DAY_MS)).date;

async function seedDemo(repo) {
  if (await repo.getCircle(DEMO.id)) return false;

  const passcodes = {};
  for (const [role, code] of Object.entries(DEMO.passcodes)) {
    passcodes[role] = await bcrypt.hash(code, config.bcryptRounds);
  }
  await repo.createCircle({
    id: DEMO.id,
    name: 'Sharma Family (Demo)',
    emails: process.env.DEMO_EMAIL ? [process.env.DEMO_EMAIL] : [],
    passcodes,
    createdAt: new Date().toISOString(),
  });

  const meds = [
    { name: 'Metformin', dosage: '500mg', times: ['08:00', '20:00'], instructions: 'After meals' },
    { name: 'Amlodipine', dosage: '5mg', times: ['09:00'], instructions: 'For blood pressure' },
    {
      name: 'Vitamin D3',
      dosage: '1000 IU',
      times: ['21:00'],
      instructions: 'With a glass of water',
    },
  ];
  let n = 0;
  for (const m of meds) {
    const med = await repo.addItem(DEMO.id, 'medications', { ...m, startDate: dayStr(-7) });
    for (let d = 1; d <= 6; d++) {
      for (const time of m.times) {
        if (++n % 5 === 0) continue; // a few gaps make the adherence chart realistic
        const date = dayStr(-d);
        const id = `${med.id}_${date}_${time.replace(':', '')}`;
        await repo.setItem(DEMO.id, 'doses', id, {
          medicationId: med.id,
          date,
          time,
          takenAt: new Date().toISOString(),
          takenBy: 'elder',
        });
      }
    }
  }
  await repo.addItem(DEMO.id, 'appointments', {
    title: 'Cardiology check-up',
    doctor: 'Dr. Rao',
    location: 'Apollo Clinic, Chennai',
    date: dayStr(3),
    time: '10:30',
  });
  return true;
}

module.exports = { seedDemo, DEMO };
