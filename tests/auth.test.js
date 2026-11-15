const request = require('supertest');
const { createApp } = require('../src/app');
const { MemoryRepo } = require('../src/repositories/memoryRepo');

let app;
beforeEach(() => {
  app = createApp({ repo: new MemoryRepo() }); // fresh app + fresh rate limiter per test
});

async function makeCircle() {
  const res = await request(app)
    .post('/api/circles')
    .send({ name: 'Sharma Family', emails: ['care@example.com'] });
  return res.body;
}

describe('POST /api/circles', () => {
  it('creates a circle and returns passcodes once', async () => {
    const body = await makeCircle();
    expect(body.circleId).toBeDefined();
    expect(Object.keys(body.passcodes)).toEqual(['elder', 'caretaker', 'family']);
  });

  it('rejects invalid input', async () => {
    const res = await request(app)
      .post('/api/circles')
      .send({ name: '', emails: ['nope'] });
    expect(res.status).toBe(400);
  });

  it('does not store passcodes in plain text', async () => {
    const repo = new MemoryRepo();
    const a = createApp({ repo });
    const res = await request(a)
      .post('/api/circles')
      .send({ name: 'X', emails: ['a@b.co'] });
    const stored = await repo.getCircle(res.body.circleId);
    expect(stored.passcodes.elder).not.toBe(res.body.passcodes.elder);
    expect(stored.passcodes.elder).toMatch(/^\$2[aby]\$/);
  });
});

describe('POST /api/auth/login', () => {
  it.each(['elder', 'caretaker', 'family'])('logs in as %s', async (role) => {
    const { circleId, passcodes } = await makeCircle();
    const res = await request(app)
      .post('/api/auth/login')
      .send({ circleId, passcode: passcodes[role] });
    expect(res.status).toBe(200);
    expect(res.body.role).toBe(role);
    expect(res.headers['set-cookie'][0]).toMatch(/HttpOnly/i);
  });

  it('rejects a wrong passcode', async () => {
    const { circleId } = await makeCircle();
    const res = await request(app).post('/api/auth/login').send({ circleId, passcode: 'WRONG123' });
    expect(res.status).toBe(401);
  });

  it('rejects an unknown circle with the same message', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ circleId: 'nope', passcode: 'WRONG123' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid credentials');
  });

  it('rate limits repeated attempts', async () => {
    const { circleId } = await makeCircle();
    let last;
    for (let i = 0; i < 11; i++) {
      last = await request(app).post('/api/auth/login').send({ circleId, passcode: 'WRONG123' });
    }
    expect(last.status).toBe(429);
  });
});

describe('session', () => {
  it('/me requires a cookie', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('/me returns the role after login, and logout clears access', async () => {
    const { circleId, passcodes } = await makeCircle();
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ circleId, passcode: passcodes.caretaker });
    const me = await agent.get('/api/auth/me');
    expect(me.body.role).toBe('caretaker');
    await agent.post('/api/auth/logout');
    expect((await agent.get('/api/auth/me')).status).toBe(401);
  });

  it('healthz and unknown API routes behave', async () => {
    expect((await request(app).get('/healthz')).status).toBe(200);
    expect((await request(app).get('/api/nothing')).status).toBe(404);
  });
});
