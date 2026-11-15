const { createApp } = require('../src/app');
const { MemoryRepo } = require('../src/repositories/memoryRepo');
const { createCircleWithAgents } = require('./helpers');

const appt = { title: 'Cardiologist', doctor: 'Dr. Rao', date: '2026-12-01', time: '10:30' };
let a, b;

beforeAll(async () => {
  const app = createApp({ repo: new MemoryRepo() });
  a = await createCircleWithAgents(app, 'Circle A');
  b = await createCircleWithAgents(app, 'Circle B');
});

describe('appointments API', () => {
  it('caretaker and family can create; elder cannot', async () => {
    expect((await a.caretaker.post('/api/appointments').send(appt)).status).toBe(201);
    expect((await a.family.post('/api/appointments').send(appt)).status).toBe(201);
    expect((await a.elder.post('/api/appointments').send(appt)).status).toBe(403);
  });

  it('all roles can read, sorted by date and time', async () => {
    await a.caretaker.post('/api/appointments').send({ ...appt, date: '2026-11-20' });
    const res = await a.elder.get('/api/appointments');
    expect(res.status).toBe(200);
    const dates = res.body.map((x) => x.date);
    expect(dates).toEqual([...dates].sort());
  });

  it('validates input', async () => {
    expect((await a.caretaker.post('/api/appointments').send({ ...appt, time: '25:99' })).status).toBe(400);
    expect((await a.caretaker.post('/api/appointments').send({ ...appt, title: '' })).status).toBe(400);
  });

  it('only caretaker can update or delete, and empty updates fail', async () => {
    const { body } = await a.caretaker.post('/api/appointments').send(appt);
    const url = `/api/appointments/${body.id}`;
    expect((await a.family.put(url).send({ title: 'x' })).status).toBe(403);
    expect((await a.caretaker.put(url).send({})).status).toBe(400);
    const upd = await a.caretaker.put(url).send({ title: 'Follow-up' });
    expect(upd.body.title).toBe('Follow-up');
    expect((await a.family.delete(url)).status).toBe(403);
    expect((await a.caretaker.delete(url)).status).toBe(204);
    expect((await a.caretaker.delete(url)).status).toBe(404);
    expect((await a.caretaker.put(url).send({ title: 'x' })).status).toBe(404);
  });

  it('circles are isolated', async () => {
    const { body } = await a.caretaker.post('/api/appointments').send(appt);
    const list = await b.family.get('/api/appointments');
    expect(list.body.some((x) => x.id === body.id)).toBe(false);
    expect((await b.caretaker.delete(`/api/appointments/${body.id}`)).status).toBe(404);
  });
});