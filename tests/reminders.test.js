const request = require('supertest');
const { createApp } = require('../src/app');
const config = require('../src/config');
const { MemoryRepo } = require('../src/repositories/memoryRepo');
const { runReminders } = require('../src/services/reminderService');
const { upcomingSlots, missedSlots } = require('../src/services/scheduleUtils');
const { createEmailService } = require('../src/services/emailService');

const med = { id: 'm1', name: 'Metformin', dosage: '500mg', times: ['08:00'], startDate: '2026-01-01' };
const at = (iso) => new Date(iso); // remember: IST = UTC + 5:30, so 08:00 IST = 02:30Z

describe('slot detection', () => {
  it('finds doses due within 10 minutes only', () => {
    expect(upcomingSlots([med], [], at('2026-11-15T02:25:00Z'))).toHaveLength(1); // 07:55
    expect(upcomingSlots([med], [], at('2026-11-15T02:10:00Z'))).toHaveLength(0); // 07:40
    expect(upcomingSlots([med], [], at('2026-11-15T02:31:00Z'))).toHaveLength(0); // already past
  });

  it('ignores doses already taken', () => {
    const doses = [{ medicationId: 'm1', date: '2026-11-15', time: '08:00' }];
    expect(upcomingSlots([med], doses, at('2026-11-15T02:25:00Z'))).toHaveLength(0);
    expect(missedSlots([med], doses, at('2026-11-15T03:10:00Z'))).toHaveLength(0);
  });

  it('handles midnight in both directions', () => {
    const night = { ...med, times: ['00:05'] };
    expect(upcomingSlots([night], [], at('2026-11-15T18:28:00Z'))).toHaveLength(1); // 23:58 IST
    const late = { ...med, times: ['23:50'] };
    expect(missedSlots([late], [], at('2026-11-15T19:00:00Z'))).toHaveLength(1); // 00:30 next day
  });

  it('marks missed only after the 30-minute grace period and before the lookback ends', () => {
    expect(missedSlots([med], [], at('2026-11-15T02:59:00Z'))).toHaveLength(0); // 08:29
    expect(missedSlots([med], [], at('2026-11-15T03:01:00Z'))).toHaveLength(1); // 08:31
    expect(missedSlots([med], [], at('2026-11-15T06:31:00Z'))).toHaveLength(0); // 12:01
  });
});

function mockEmail() {
  return {
    sendDoseReminder: jest.fn().mockResolvedValue({ sent: true }),
    sendMissedAlert: jest.fn().mockResolvedValue({ sent: true }),
    sendAppointmentReminder: jest.fn().mockResolvedValue({ sent: true }),
  };
}

async function setup() {
  const repo = new MemoryRepo();
  await repo.createCircle({ id: 'c1', name: 'Fam', emails: ['a@b.co'], passcodes: {} });
  await repo.setItem('c1', 'medications', 'm1', med);
  return { repo, email: mockEmail() };
}

describe('runReminders', () => {
  it('sends an upcoming-dose email once, even if triggered twice', async () => {
    const { repo, email } = await setup();
    const now = at('2026-11-15T02:25:00Z');
    const first = await runReminders({ repo, email, now });
    const second = await runReminders({ repo, email, now });
    expect(first.due).toBe(1);
    expect(second.due).toBe(0);
    expect(email.sendDoseReminder).toHaveBeenCalledTimes(1);
  });

  it('sends a missed-dose alert once, and not when the dose was taken', async () => {
    const { repo, email } = await setup();
    const now = at('2026-11-15T03:10:00Z'); // 08:40
    await runReminders({ repo, email, now });
    await runReminders({ repo, email, now });
    expect(email.sendMissedAlert).toHaveBeenCalledTimes(1);

    const taken = await setup();
    await taken.repo.setItem('c1', 'doses', 'x', { medicationId: 'm1', date: '2026-11-15', time: '08:00' });
    await runReminders({ ...taken, now });
    expect(taken.email.sendMissedAlert).not.toHaveBeenCalled();
  });

  it('sends appointment reminders within 24 hours, once', async () => {
    const { repo, email } = await setup();
    await repo.addItem('c1', 'appointments', { title: 'Dentist', date: '2026-11-16', time: '09:00' });
    await repo.addItem('c1', 'appointments', { title: 'Far away', date: '2026-12-30', time: '09:00' });
    const now = at('2026-11-15T10:00:00Z');
    await runReminders({ repo, email, now });
    await runReminders({ repo, email, now });
    expect(email.sendAppointmentReminder).toHaveBeenCalledTimes(1);
  });

  it('retries a failed send on the next run', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { repo, email } = await setup();
    email.sendDoseReminder.mockRejectedValueOnce(new Error('boom'));
    const now = at('2026-11-15T02:25:00Z');
    expect((await runReminders({ repo, email, now })).errors).toBe(1);
    expect((await runReminders({ repo, email, now })).due).toBe(1);
    spy.mockRestore();
  });

  it('does not record a reminder when email is not configured', async () => {
    const { repo } = await setup();
    const email = createEmailService({ apiKey: '', from: '' });
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});
    const stats = await runReminders({ repo, email, now: at('2026-11-15T02:25:00Z') });
    expect(stats.due).toBe(0);
    log.mockRestore();
  });
});

describe('emailService', () => {
  const circle = { name: 'Fam', emails: ['a@b.co'] };
  const slot = { med: { ...med, name: '<script>x</script>' }, time: '08:00' };

  it('escapes HTML and calls the API', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ ok: true });
    const svc = createEmailService({ apiKey: 'k', from: 'me@x.co', fetchImpl });
    await svc.sendDoseReminder(circle, slot);
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(body.htmlContent).toContain('&lt;script&gt;');
    expect(body.htmlContent).not.toContain('<script>');
    expect(body.to).toEqual([{ email: 'a@b.co' }]);
  });

  it('throws when the API rejects, and skips when there are no recipients', async () => {
    const bad = createEmailService({ apiKey: 'k', from: 'me@x.co', fetchImpl: async () => ({ ok: false, status: 401 }) });
    await expect(bad.sendMissedAlert(circle, slot)).rejects.toThrow('401');
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});
    const none = createEmailService({ apiKey: 'k', from: 'me@x.co', fetchImpl: jest.fn() });
    expect(await none.sendDoseReminder({ ...circle, emails: [] }, slot)).toEqual({ skipped: true });
    log.mockRestore();
  });

  it('formats an appointment email', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ ok: true });
    const svc = createEmailService({ apiKey: 'k', from: 'me@x.co', fetchImpl });
    await svc.sendAppointmentReminder(circle, { title: 'Eye test', date: '2026-12-01', time: '15:30', doctor: 'Dr. A', location: 'Clinic' });
    expect(fetchImpl.mock.calls[0][1].body).toContain('3:30 PM');
  });
});

describe('POST /api/internal/reminders', () => {
  const app = createApp({ repo: new MemoryRepo(), email: mockEmail() });

  it('rejects a missing or wrong secret', async () => {
    expect((await request(app).post('/api/internal/reminders')).status).toBe(401);
    const wrong = await request(app).post('/api/internal/reminders').set('x-cron-secret', 'nope');
    expect(wrong.status).toBe(401);
  });

  it('runs with the right secret', async () => {
    const res = await request(app).post('/api/internal/reminders').set('x-cron-secret', config.cronSecret);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ errors: 0 });
  });
});