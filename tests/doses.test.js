const request = require('supertest');
const { createApp } = require('../src/app');
const { MemoryRepo } = require('../src/repositories/memoryRepo');
const { istParts } = require('../src/services/scheduleUtils');
const { createCircleWithAgents } = require('./helpers');

const today = istParts().date;
let app, a, b, med;

beforeAll(async () => {
  app = createApp({ repo: new MemoryRepo() });
  a = await createCircleWithAgents(app, 'Circle A');
  b = await createCircleWithAgents(app, 'Circle B');
  // 00:00 is always "already due" today, which makes adherence deterministic
  const res = await a.caretaker
    .post('/api/medications')
    .send({ name: 'Aspirin', dosage: '75mg', times: ['00:00'], startDate: today });
  med = res.body;
});

const slotFor = async (agent) => {
  const res = await agent.get('/api/doses/today');
  return res.body.slots.find((s) => s.medicationId === med.id);
};

describe('doses API', () => {
  it('requires authentication', async () => {
    expect((await request(app).get('/api/doses/today')).status).toBe(401);
  });

  it('slot lifecycle: pending, taken (idempotent), adherence', async () => {
    expect((await slotFor(a.elder)).taken).toBe(false);
    let adh = (await a.caretaker.get('/api/doses/adherence?days=7')).body.medications[0];
    expect(adh).toMatchObject({ expected: 1, taken: 0, percent: 0 });

    const body = { medicationId: med.id, time: '00:00' };
    expect((await a.elder.post('/api/doses').send(body)).status).toBe(201);
    expect((await a.elder.post('/api/doses').send(body)).status).toBe(201); // double tap

    expect((await slotFor(a.family)).taken).toBe(true);
    adh = (await a.caretaker.get('/api/doses/adherence?days=7')).body.medications[0];
    expect(adh).toMatchObject({ expected: 1, taken: 1, percent: 100 });
  });

  it('family cannot log doses', async () => {
    const res = await a.family.post('/api/doses').send({ medicationId: med.id, time: '00:00' });
    expect(res.status).toBe(403);
  });

  it('rejects times outside the schedule, unknown meds and future dates', async () => {
    expect(
      (await a.elder.post('/api/doses').send({ medicationId: med.id, time: '09:15' })).status,
    ).toBe(400);
    expect(
      (await a.elder.post('/api/doses').send({ medicationId: 'nope', time: '00:00' })).status,
    ).toBe(404);
    const future = { medicationId: med.id, time: '00:00', date: '2999-01-01' };
    expect((await a.elder.post('/api/doses').send(future)).status).toBe(400);
  });

  it("circle B cannot log doses against circle A's medication", async () => {
    const res = await b.elder.post('/api/doses').send({ medicationId: med.id, time: '00:00' });
    expect(res.status).toBe(404);
    const adh = await b.caretaker.get('/api/doses/adherence');
    expect(adh.body.medications).toEqual([]);
  });

  it('falls back to 7 days for a bad days param', async () => {
    const res = await a.elder.get('/api/doses/adherence?days=abc');
    expect(res.body.days).toBe(7);
  });
});
