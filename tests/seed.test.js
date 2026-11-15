const request = require('supertest');
const { createApp } = require('../src/app');
const { MemoryRepo } = require('../src/repositories/memoryRepo');
const { seedDemo, DEMO } = require('../src/seed');

it('seeds a demo circle that can log in, and is idempotent', async () => {
  const repo = new MemoryRepo();
  expect(await seedDemo(repo)).toBe(true);
  expect(await seedDemo(repo)).toBe(false);
  const res = await request(createApp({ repo }))
    .post('/api/auth/login')
    .send({ circleId: DEMO.id, passcode: DEMO.passcodes.caretaker });
  expect(res.body.role).toBe('caretaker');
  expect(await repo.listItems(DEMO.id, 'medications')).toHaveLength(3);
});
