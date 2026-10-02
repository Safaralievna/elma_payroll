import { addDays, dateToIso, isIsoDate, isMonthStart, isoToDate, monthEnd } from '../iso-date';

describe('iso-date — "YYYY-MM-DD" satrlari bilan ishlash', () => {
  it('isIsoDate: faqat haqiqiy sanalar', () => {
    expect(isIsoDate('2026-03-01')).toBe(true);
    expect(isIsoDate('2024-02-29')).toBe(true); // kabisa yili
    expect(isIsoDate('2026-02-29')).toBe(false);
    expect(isIsoDate('2026-13-01')).toBe(false);
    expect(isIsoDate('2026-4-01')).toBe(false);
    expect(isIsoDate('01.03.2026')).toBe(false);
  });

  it('addDays: oy va yil chegarasidan o\'tadi', () => {
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2024-03-01', -1)).toBe('2024-02-29');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('isMonthStart va monthEnd', () => {
    expect(isMonthStart('2026-05-01')).toBe(true);
    expect(isMonthStart('2026-05-02')).toBe(false);
    expect(monthEnd(2026, 2)).toBe('2026-02-28');
    expect(monthEnd(2024, 2)).toBe('2024-02-29');
    expect(monthEnd(2026, 12)).toBe('2026-12-31');
  });

  it('Date (DB date ustuni, UTC yarim tun) ↔ satr', () => {
    expect(dateToIso(new Date('2026-05-01T00:00:00.000Z'))).toBe('2026-05-01');
    expect(isoToDate('2026-05-01').toISOString()).toBe('2026-05-01T00:00:00.000Z');
  });
});
