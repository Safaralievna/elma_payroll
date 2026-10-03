import { HistoryRuleError } from '../../history/history-rules';
import { assertPeriodOpen, assertPeriodNotClosed } from '../period-rules';

function expectRuleError(fn: () => unknown, code: string): void {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(HistoryRuleError);
    expect((error as HistoryRuleError).code).toBe(code);
    return;
  }
  throw new Error(`${code} xatosi kutilgan edi`);
}

describe('assertPeriodNotClosed — oy oxirgi yopilgan davrga tegadimi (assertNotClosed orqali)', () => {
  it('yopilgan davr yo\'q — istalgan oy o\'tadi', () => {
    expect(() => assertPeriodNotClosed(2025, 1, null)).not.toThrow();
  });

  it('oxirgi yopilgan oy va undan oldingi oylar — PERIOD_CLOSED', () => {
    expectRuleError(() => assertPeriodNotClosed(2025, 12, '2025-12-31'), 'PERIOD_CLOSED');
    expectRuleError(() => assertPeriodNotClosed(2025, 3, '2025-12-31'), 'PERIOD_CLOSED');
  });

  it('yopilgan oydan keyingi oy — o\'tadi', () => {
    expect(() => assertPeriodNotClosed(2026, 1, '2025-12-31')).not.toThrow();
  });
});

describe('assertPeriodOpen — faqat OPEN davrga yoziladi', () => {
  it('OPEN — o\'tadi', () => {
    expect(() => assertPeriodOpen('OPEN')).not.toThrow();
  });

  it('REVIEW — PERIOD_NOT_OPEN (tuzatish uchun avval OPEN ga qaytariladi)', () => {
    expectRuleError(() => assertPeriodOpen('REVIEW'), 'PERIOD_NOT_OPEN');
  });

  it('CLOSED — PERIOD_CLOSED', () => {
    expectRuleError(() => assertPeriodOpen('CLOSED'), 'PERIOD_CLOSED');
  });
});
