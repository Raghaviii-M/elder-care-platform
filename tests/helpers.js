const request = require('supertest');

async function createCircleWithAgents(app, name = 'Test Family') {
  const { body } = await request(app)
    .post('/api/circles')
    .send({ name, emails: ['care@example.com'] });
  const agents = { circleId: body.circleId };
  for (const role of ['elder', 'caretaker', 'family']) {
    const agent = request.agent(app);
    const res = await agent
      .post('/api/auth/login')
      .send({ circleId: body.circleId, passcode: body.passcodes[role] });
    if (res.status !== 200) throw new Error(`login failed for ${role}`);
    agents[role] = agent;
  }
  return agents;
}

module.exports = { createCircleWithAgents };