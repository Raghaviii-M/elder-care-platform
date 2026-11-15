const { istParts, isActiveOn, computeAdherence } = require('../src/services/scheduleUtils');

describe('scheduleUtils', () => {
  it('converts UTC to IST across midnight', () => {
    expect(istParts(new Date('2026-11-15T20:00:00Z'))).toEqual({ date: '2026-11-16', time: '01:30' });
    expect(istParts(new Date('2026-11-15T18:30:00Z'))).toEqual({ date: '2026-11-16', time: '00:00' });
  });

  it('isActiveOn respects start and end dates', () => {
    const med = { startDate: '2026-11-10', endDate: '2026-11-12' };
    expect(isActiveOn(med, '2026-11-09')).toBe(false);
    expect(isActiveOn(med, '2026-11-10')).toBe(true);
    expect(isActiveOn(med, '2026-11-12')).toBe(true);
    expect(isActiveOn(med, '2026-11-13')).toBe(false);
    expect(isActiveOn({ startDate: '2026-11-10' }, '2030-01-01')).toBe(true);
  });

  it('computeAdherence skips future slots today and days before the start date', () => {
    const now = new Date('2026-11-15T04:30:00Z'); // 10:00 IST
    const med = { id: 'm1', name: 'X', times: ['08:00', '21:00'], startDate: '2026-11-14' };
    const doses = [
      { medicationId: 'm1', date: '2026-11-14', time: '08:00' },
      { medicationId: 'm1', date: '2026-11-15', time: '08:00' },
    ];
    const [r] = computeAdherence([med], doses, 7, now);
    expect(r).toMatchObject({ expected: 3, taken: 2, percent: 67 });
  });

  it('percent is null when nothing is expected', () => {
    const med = { id: 'm2', name: 'Y', times: ['08:00'], startDate: '2999-01-01' };
    expect(computeAdherence([med], [], 7)[0].percent).toBeNull();
  });
});