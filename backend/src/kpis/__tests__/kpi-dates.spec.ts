import { HistoryRuleError } from '../../history/history-rules';
import { DatedRange, planKpiLinkCreate, planKpiLinkDelete, planKpiLinkEnd } from '../kpi-dates';

const NO_CLOSED = null;
const CLOSED_DEC = '2025-12-31';

const range = (id: number, startDate: string, endDate: string | null = null): DatedRange => ({
  id: BigInt(id),
  startDate,
  endDate,
});

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

describe('planKpiLinkCreate — lavozimga biriktirish / override yaratish', () => {
  it('oy boshidan, ochiq yoki oy oxirigacha — to\'g\'ri', () => {
    expect(() => planKpiLinkCreate([], { startDate: '2026-01-01', endDate: null }, NO_CLOSED)).not.toThrow();
    expect(() => planKpiLinkCreate([], { startDate: '2026-01-01', endDate: '2026-02-28' }, NO_CLOSED)).not.toThrow();
  });

  it("boshlanish — oyning 1-kuni, tugash — oyning oxirgi kuni (DECISIONS 2.5)", () => {
    expectRuleError(() => planKpiLinkCreate([], { startDate: '2026-01-15', endDate: null }, NO_CLOSED), 'START_NOT_MONTH_START');
    expectRuleError(
      () => planKpiLinkCreate([], { startDate: '2026-01-01', endDate: '2026-02-27' }, NO_CLOSED),
      'END_NOT_MONTH_END',
    );
    expectRuleError(
      () => planKpiLinkCreate([], { startDate: '2026-03-01', endDate: '2026-01-31' }, NO_CLOSED),
      'INVALID_DATE_RANGE',
    );
  });

  it('yopilgan davrga tushsa — PERIOD_CLOSED', () => {
    expectRuleError(() => planKpiLinkCreate([], { startDate: '2025-12-01', endDate: null }, CLOSED_DEC), 'PERIOD_CLOSED');
    expect(() => planKpiLinkCreate([], { startDate: '2026-01-01', endDate: null }, CLOSED_DEC)).not.toThrow();
  });

  it("shu juftlikdagi boshqa yozuv bilan ustma-ust — HISTORY_OVERLAP", () => {
    const existing = [range(1, '2026-01-01', '2026-03-31')];
    expectRuleError(
      () => planKpiLinkCreate(existing, { startDate: '2026-03-01', endDate: null }, NO_CLOSED),
      'HISTORY_OVERLAP',
    );
    expect(() => planKpiLinkCreate(existing, { startDate: '2026-04-01', endDate: null }, NO_CLOSED)).not.toThrow();
    expectRuleError(
      () => planKpiLinkCreate([range(2, '2026-05-01')], { startDate: '2026-01-01', endDate: null }, NO_CLOSED),
      'HISTORY_OVERLAP',
    );
  });
});

describe('planKpiLinkEnd — tugash sanasini o\'zgartirish', () => {
  const open = range(1, '2026-01-01');

  it('yopish va qayta ochish', () => {
    expect(() => planKpiLinkEnd([open], 1n, '2026-03-31', NO_CLOSED)).not.toThrow();
    expect(() => planKpiLinkEnd([range(1, '2026-01-01', '2026-03-31')], 1n, null, NO_CLOSED)).not.toThrow();
  });

  it("o'zgarish yo'q — NO_CHANGE; oy oxiri emas — END_NOT_MONTH_END; boshidan oldin — INVALID_DATE_RANGE", () => {
    expectRuleError(() => planKpiLinkEnd([open], 1n, null, NO_CLOSED), 'NO_CHANGE');
    expectRuleError(() => planKpiLinkEnd([open], 1n, '2026-03-30', NO_CLOSED), 'END_NOT_MONTH_END');
    expectRuleError(() => planKpiLinkEnd([range(1, '2026-03-01')], 1n, '2026-02-28', NO_CLOSED), 'INVALID_DATE_RANGE');
  });

  it("yopilgan oyni o'zgartirsa — PERIOD_CLOSED (o'zgarish kichik sanadan keyingi kundan boshlanadi)", () => {
    const rules = '2026-02-28';
    expectRuleError(() => planKpiLinkEnd([open], 1n, '2026-01-31', rules), 'PERIOD_CLOSED');
    expect(() => planKpiLinkEnd([open], 1n, '2026-02-28', rules)).not.toThrow();
    expect(() => planKpiLinkEnd([open], 1n, '2026-03-31', rules)).not.toThrow();
    expectRuleError(() => planKpiLinkEnd([range(1, '2026-01-01', '2026-01-31')], 1n, null, rules), 'PERIOD_CLOSED');
    // Eski sana yopilgan oyda — uzaytirish ham yopilgan fevralni o'zgartiradi.
    expectRuleError(() => planKpiLinkEnd([range(1, '2026-01-01', '2026-01-31')], 1n, '2026-03-31', rules), 'PERIOD_CLOSED');
    // Eski va yangi sana ochiq oyda — boshlanishi yopilgan davrda bo'lsa ham o'tadi.
    expect(() => planKpiLinkEnd([range(1, '2025-11-01', '2026-03-31')], 1n, '2026-05-31', rules)).not.toThrow();
  });

  it("uzaytirilsa keyingi yozuv bilan ustma-ust — HISTORY_OVERLAP", () => {
    const rows = [range(1, '2026-01-01', '2026-02-28'), range(2, '2026-03-01')];
    expectRuleError(() => planKpiLinkEnd(rows, 1n, null, NO_CLOSED), 'HISTORY_OVERLAP');
    expectRuleError(() => planKpiLinkEnd(rows, 1n, '2026-03-31', NO_CLOSED), 'HISTORY_OVERLAP');
  });
});

describe("planKpiLinkDelete — o'chirish", () => {
  it('yopilgan davrga tegsa — PERIOD_CLOSED', () => {
    expectRuleError(() => planKpiLinkDelete(range(1, '2025-11-01', null), CLOSED_DEC), 'PERIOD_CLOSED');
    expectRuleError(() => planKpiLinkDelete(range(1, '2025-12-01', '2025-12-31'), CLOSED_DEC), 'PERIOD_CLOSED');
    expectRuleError(() => planKpiLinkDelete(range(1, '2025-11-01', '2026-05-31'), CLOSED_DEC), 'PERIOD_CLOSED');
    expect(() => planKpiLinkDelete(range(1, '2026-01-01', null), CLOSED_DEC)).not.toThrow();
  });
});
