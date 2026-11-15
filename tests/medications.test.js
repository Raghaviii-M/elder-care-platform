const request = require('supertest');
const { createApp } = require('../src/app');
const { MemoryRepo } = require('../src/repositories/memoryRepo');
const { createCircleWithAgents } = require('./helpers');

const validMed = {
  name: 'Metformin',
  dosage: '500mg',
  times: ['08:00', '20:00'],
  instructions: 'After meals',
  startDate: '2026-01-01',
};

let app, a, b;
beforeAll(async () => {
  app = createApp({ repo: new MemoryRepo() });
  a = await createCircleWithAgents(app, 'Circle A');
  b = await createCircleWithAgents(app, 'Circle B');
});

describe('medications API', () => {
  it('requires authentication', async () => {
    expect((await request(app).get('/api/medications')).status).toBe(401);
  });

  it('caretaker creates, every role can read', async () => {
    const res = await a.caretaker.post('/api/medications').send(validMed);
    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    for (const role of ['elder', 'caretaker', 'family']) {
      const list = await a[role].get('/api/medications');
      expect(list.status).toBe(200);
      expect(list.body.some((m) => m.id === res.body.id)).toBe(true);
    }
  });

  it('elder and family cannot create', async () => {
    expect((await a.elder.post('/api/medications').send(validMed)).status).toBe(403);
    expect((await a.family.post('/api/medications').send(validMed)).status).toBe(403);
  });

  it('validates input', async () => {
    const bad = [
      { ...validMed, times: ['8am'] },
      { ...validMed, times: [] },
      { ...validMed, name: '' },
      { ...validMed, startDate: 'tomorrow' },
    ];
    for (const body of bad) {
      expect((await a.caretaker.post('/api/medications').send(body)).status).toBe(400);
    }
  });

  it('strips unknown fields and sorts/dedupes times', async () => {
    const res = await a.caretaker
      .post('/api/medications')
      .send({ ...validMed, circleId: 'evil', admin: true, times: ['20:00', '08:00', '08:00'] });
    expect(res.status).toBe(201);
    expect(res.body.circleId).toBeUndefined();
    expect(res.body.admin).toBeUndefined();
    expect(res.body.times).toEqual(['08:00', '20:00']);
  });

  it('updates, and rejects empty or forbidden updates', async () => {
    const { body: med } = await a.caretaker.post('/api/medications').send(validMed);
    const url = `/api/medications/${med.id}`;
    const ok = await a.caretaker.put(url).send({ dosage: '1000mg' });
    expect(ok.status).toBe(200);
    expect(ok.body.dosage).toBe('1000mg');
    expect((await a.caretaker.put(url).send({})).status).toBe(400);
    expect((await a.elder.put(url).send({ dosage: '1g' })).status).toBe(403);
    expect((await a.caretaker.put('/api/medications/unknown').send({ dosage: '1g' })).status).toBe(404);
    expect((await a.caretaker.put('/api/medications/bad.id').send({ dosage: '1g' })).status).toBe(404);
  });

  it('deletes', async () => {
    const { body: med } = await a.caretaker.post('/api/medications').send(validMed);
    expect((await a.caretaker.delete(`/api/medications/${med.id}`)).status).toBe(204);
    expect((await a.caretaker.delete(`/api/medications/${med.id}`)).status).toBe(404);
    expect((await a.family.delete(`/api/medications/${med.id}`)).status).toBe(403);
  });

  describe('IDOR: circles are isolated', () => {
    it("circle B cannot see, edit or delete circle A's medication", async () => {
      const { body: med } = await a.caretaker.post('/api/medications').send(validMed);
      const url = `/api/medications/${med.id}`;

      const list = await b.caretaker.get('/api/medications');
      expect(list.body.some((m) => m.id === med.id)).toBe(false);
      expect((await b.caretaker.put(url).send({ dosage: 'HACKED' })).status).toBe(404);
      expect((await b.caretaker.delete(url)).status).toBe(404);

      const still = (await a.caretaker.get('/api/medications')).body.find((m) => m.id === med.id);
      expect(still.dosage).toBe('500mg');
    });
  });
});