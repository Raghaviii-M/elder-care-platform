const request = require('supertest');
const jwt = require('jsonwebtoken');
const config = require('../src/config');
const { createApp } = require('../src/app');
const { MemoryRepo } = require('../src/repositories/memoryRepo');
const { TtlCache } = require('../src/services/ttlCache');
const { createCircleWithAgents } = require('./helpers');

let app, a;
beforeAll(async () => {
  app = createApp({ repo: new MemoryRepo() });
  a = await createCircleWithAgents(app);
});

const withToken = (payload, secret = config.jwtSecret) => `token=${jwt.sign(payload, secret)}`;

describe('HTTP hardening', () => {
  it('sends security headers and hides the framework', async () => {
    const res = await request(app).get('/healthz');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['content-security-policy']).toBeDefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('rejects malformed JSON with 400', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{bad json');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid JSON');
  });

  it('rejects oversized bodies with 413', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ passcode: 'x'.repeat(20000) });
    expect(res.status).toBe(413);
  });

  it('hides internal error details', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const broken = createApp({
      repo: {
        getCircle: async () => {
          throw new Error('db password=hunter2');
        },
      },
    });
    const res = await request(broken)
      .post('/api/auth/login')
      .send({ circleId: 'abc', passcode: 'abcd1234' });
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain('hunter2');
    spy.mockRestore();
  });
});

describe('token tampering', () => {
  it('rejects a token signed with the wrong secret', async () => {
    const cookie = withToken({ circleId: a.circleId, role: 'caretaker' }, 'wrong-secret');
    expect((await request(app).get('/api/medications').set('Cookie', cookie)).status).toBe(401);
  });

  it('rejects an expired token', async () => {
    const exp = Math.floor(Date.now() / 1000) - 60;
    const cookie = withToken({ circleId: a.circleId, role: 'caretaker', exp });
    expect((await request(app).get('/api/medications').set('Cookie', cookie)).status).toBe(401);
  });

  it('rejects a forged role even with a valid signature', async () => {
    const cookie = withToken({ circleId: a.circleId, role: 'admin' });
    expect((await request(app).get('/api/medications').set('Cookie', cookie)).status).toBe(403);
  });
});

describe('dashboard endpoint', () => {
  it('requires authentication', async () => {
    expect((await request(app).get('/api/dashboard')).status).toBe(401);
  });

  it('returns everything in one request', async () => {
    await a.caretaker
      .post('/api/medications')
      .send({ name: 'Zinc', dosage: '10mg', times: ['08:00'], startDate: '2026-01-01' });
    const res = await a.elder.get('/api/dashboard');
    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual([
      'activity',
      'adherence',
      'appointments',
      'medications',
      'today',
    ]);
    expect(res.body.today.slots.length).toBeGreaterThan(0);
    expect(res.body.adherence.daily).toHaveLength(7);
  });
});

describe('TtlCache', () => {
  it('expires entries and caps its size', () => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(1000);
    const cache = new TtlCache(100, 2);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);
    expect(cache.get('a')).toBeUndefined(); // evicted
    expect(cache.get('c')).toBe(3);
    now.mockReturnValue(1200);
    expect(cache.get('c')).toBeUndefined(); // expired
    now.mockRestore();
  });
});

describe('MemoryRepo contract', () => {
  it('stores, filters, updates and removes items per circle', async () => {
    const repo = new MemoryRepo();
    const item = await repo.addItem('c1', 'things', { date: '2026-11-15', v: 1 });
    await repo.setItem('c1', 'things', 'fixed', { date: '2026-11-10' });
    expect(await repo.listItems('c1', 'things')).toHaveLength(2);
    expect(await repo.listItems('c1', 'things', { sinceDate: '2026-11-12' })).toHaveLength(1);
    expect(await repo.listItems('c2', 'things')).toHaveLength(0);
    expect((await repo.updateItem('c1', 'things', item.id, { v: 2 })).v).toBe(2);
    expect(await repo.updateItem('c1', 'things', 'missing', {})).toBeNull();
    expect(await repo.removeItem('c1', 'things', item.id)).toBe(true);
    expect(await repo.removeItem('c1', 'things', item.id)).toBe(false);
  });
});

describe('config', () => {
  it('refuses to start in production without secrets', () => {
    const saved = { NODE_ENV: process.env.NODE_ENV, JWT_SECRET: process.env.JWT_SECRET };
    try {
      process.env.NODE_ENV = 'production';
      delete process.env.JWT_SECRET;
      jest.isolateModules(() => {
        jest.doMock('dotenv', () => ({ config: () => ({}) })); // ignore the local .env file
        expect(() => require('../src/config')).toThrow('JWT_SECRET');
      });
    } finally {
      for (const [k, v] of Object.entries(saved)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
      jest.dontMock('dotenv');
    }
  });
});
