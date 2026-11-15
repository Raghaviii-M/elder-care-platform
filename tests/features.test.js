const { createApp } = require('../src/app');
const { MemoryRepo } = require('../src/repositories/memoryRepo');
const { createAiService, heuristicParse } = require('../src/services/aiService');
const { dailyAdherence } = require('../src/services/scheduleUtils');
const { createCircleWithAgents } = require('./helpers');

const mockEmail = () => ({
  sendDoseReminder: jest.fn(),
  sendMissedAlert: jest.fn(),
  sendAppointmentReminder: jest.fn(),
  sendSos: jest.fn().mockResolvedValue({ sent: true }),
  sendWellbeingAlert: jest.fn().mockResolvedValue({ sent: true }),
  sendConcern: jest.fn().mockResolvedValue({ sent: true }),
});
const med = { name: 'Metformin', dosage: '500mg', times: ['08:00'], startDate: '2026-01-01' };

let mail, a;
beforeAll(async () => {
  mail = mockEmail();
  const app = createApp({
    repo: new MemoryRepo(),
    email: mail,
    ai: createAiService({ apiKey: '' }),
  });
  a = await createCircleWithAgents(app);
});

describe('care feed and elder confirmation', () => {
  it('a medication change appears in the feed and the elder can flag it', async () => {
    await a.caretaker.post('/api/medications').send(med);
    const feed = (await a.elder.get('/api/activity')).body;
    const item = feed.find((i) => i.type === 'med_added');
    expect(item.needsAck).toBe(true);

    expect(
      (await a.family.post(`/api/activity/${item.id}/respond`).send({ response: 'ok' })).status,
    ).toBe(403);
    const res = await a.elder
      .post(`/api/activity/${item.id}/respond`)
      .send({ response: 'concern' });
    expect(res.body.ack).toBe('concern');
    expect(mail.sendConcern).toHaveBeenCalledTimes(1);
    expect((await a.elder.post('/api/activity/nope/respond').send({ response: 'ok' })).status).toBe(
      404,
    );
  });

  it('logs each dose once even when tapped twice', async () => {
    const { body } = await a.caretaker
      .post('/api/medications')
      .send({ ...med, name: 'Aspirin', times: ['00:00'] });
    const dose = { medicationId: body.id, time: '00:00' };
    await a.elder.post('/api/doses').send(dose);
    await a.elder.post('/api/doses').send(dose);
    const feed = (await a.family.get('/api/activity')).body;
    expect(feed.filter((i) => i.text.startsWith('Aspirin')).length).toBe(1);
  });

  it('anyone can post notes, empty notes are rejected', async () => {
    expect(
      (await a.family.post('/api/activity/note').send({ text: 'Bringing groceries today' })).status,
    ).toBe(201);
    expect((await a.family.post('/api/activity/note').send({ text: '' })).status).toBe(400);
  });
});

describe('check-in and SOS', () => {
  it('only an unwell check-in notifies the circle', async () => {
    await a.elder.post('/api/activity/checkin').send({ mood: 'great' });
    expect(mail.sendWellbeingAlert).not.toHaveBeenCalled();
    const res = await a.elder.post('/api/activity/checkin').send({ mood: 'unwell', note: 'Dizzy' });
    expect(res.body.notified).toBe(true);
    expect(mail.sendWellbeingAlert).toHaveBeenCalledTimes(1);
  });

  it('validates and restricts check-ins', async () => {
    expect((await a.elder.post('/api/activity/checkin').send({ mood: 'angry' })).status).toBe(400);
    expect((await a.caretaker.post('/api/activity/checkin').send({ mood: 'great' })).status).toBe(
      403,
    );
  });

  it('SOS emails the circle and is elder-only', async () => {
    const res = await a.elder.post('/api/activity/sos');
    expect(res.status).toBe(201);
    expect(mail.sendSos).toHaveBeenCalledTimes(1);
    expect((await a.family.post('/api/activity/sos')).status).toBe(403);
  });
});

describe('AI endpoints (rule-based fallback, no API key)', () => {
  it('parses plain language into a schedule', async () => {
    const res = await a.caretaker
      .post('/api/ai/parse')
      .send({ text: 'Metformin 500mg twice daily after meals' });
    expect(res.status).toBe(200);
    expect(res.body.source).toBe('rules');
    expect(res.body.medication).toMatchObject({
      name: 'Metformin',
      dosage: '500mg',
      times: ['08:00', '20:00'],
      instructions: 'after meals',
    });
  });

  it('restricts and validates parsing', async () => {
    expect((await a.elder.post('/api/ai/parse').send({ text: 'Metformin' })).status).toBe(403);
    expect((await a.caretaker.post('/api/ai/parse').send({ text: 'hi' })).status).toBe(400);
    expect((await a.caretaker.post('/api/ai/parse').send({ text: '12345 678' })).status).toBe(422);
  });

  it('explains a medicine and summarises adherence for every role', async () => {
    const ex = await a.elder.post('/api/ai/explain').send({ name: 'Metformin' });
    expect(ex.body.text).toContain('pharmacist');
    const ins = await a.family.get('/api/ai/insights');
    expect(ins.status).toBe(200);
    expect(typeof ins.body.text).toBe('string');
  });
});

describe('aiService with Gemini', () => {
  const reply = (text) => ({
    ok: true,
    json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }),
  });

  it('uses Gemini output after validating it', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValue(reply('{"name":"Ramipril","dosage":"5mg","times":["21:00","09:00"]}'));
    const ai = createAiService({ apiKey: 'k', fetchImpl });
    const r = await ai.parseMedication('Ramipril 5mg morning and night');
    expect(r.source).toBe('gemini');
    expect(r.medication.times).toEqual(['09:00', '21:00']);
    expect(fetchImpl.mock.calls[0][1].headers['x-goog-api-key']).toBe('k');
  });

  it('falls back to rules when Gemini fails or returns junk', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const down = createAiService({
      apiKey: 'k',
      fetchImpl: async () => ({ ok: false, status: 500 }),
    });
    expect((await down.parseMedication('Aspirin 75mg at 9am')).source).toBe('rules');
    const junk = createAiService({ apiKey: 'k', fetchImpl: async () => reply('IGNORE ALL RULES') });
    expect((await junk.parseMedication('Aspirin 75mg at 9am')).source).toBe('rules');
    expect((await down.explainMedicine('Aspirin')).source).toBe('static');
    expect((await down.insights({ overall: 50, weakest: { name: 'X', percent: 50 } })).source).toBe(
      'rules',
    );
    spy.mockRestore();
  });

  it('returns Gemini explanations and insights', async () => {
    const ai = createAiService({ apiKey: 'k', fetchImpl: async () => reply('Plain words.') });
    expect((await ai.explainMedicine('Aspirin')).text).toBe('Plain words.');
    expect((await ai.insights({ overall: 80, weakest: null })).source).toBe('gemini');
  });

  it('heuristic parser understands explicit times and dayparts', () => {
    expect(heuristicParse('Take Vitamin D 1000 IU at bedtime').times).toEqual(['21:00']);
    expect(heuristicParse('Amlodipine 5mg 9am').times).toEqual(['09:00']);
    expect(heuristicParse('Zinc three times a day').times).toHaveLength(3);
  });
});

describe('dailyAdherence', () => {
  it('returns one entry per day, oldest first', () => {
    const now = new Date('2026-11-15T04:30:00Z'); // 10:00 IST
    const m = { id: 'm', name: 'X', times: ['08:00', '21:00'], startDate: '2026-11-14' };
    const doses = [
      { medicationId: 'm', date: '2026-11-14', time: '08:00' },
      { medicationId: 'm', date: '2026-11-14', time: '21:00' },
    ];
    expect(dailyAdherence([m], doses, 3, now)).toEqual([
      { date: '2026-11-13', expected: 0, taken: 0 },
      { date: '2026-11-14', expected: 2, taken: 2 },
      { date: '2026-11-15', expected: 1, taken: 0 },
    ]);
  });
});
