import {
  HistoryRecord,
  HistoryRuleError,
  HistoryRules,
  planAppend,
  planDeleteLast,
  planTermination,
  planUpdateLast,
} from '../history-rules';

const MONTHLY: HistoryRules = { lastClosedDay: null, monthStartOnly: true };
const ANY_DAY: HistoryRules = { lastClosedDay: null, monthStartOnly: false };

function rec(id: number, startDate: string, endDate: string | null, valueKey = 'A'): HistoryRecord {
  return { id: BigInt(id), startDate, endDate, valueKey };
}

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

describe('planAppend — yangi tarixiy yozuv qo\'shish', () => {
  it('birinchi yozuv — hech narsa yopilmaydi', () => {
    expect(planAppend([], { startDate: '2026-03-01', endDate: null, valueKey: 'A' }, MONTHLY)).toEqual({
      kind: 'APPEND',
      closePrevious: null,
    });
  });

  it('oldingi ochiq yozuv yangi sanadan bir kun oldin yopiladi (end_date ham davrga kiradi)', () => {
    const plan = planAppend([rec(1, '2026-01-01', null)], { startDate: '2026-03-01', endDate: null, valueKey: 'B' }, MONTHLY);
    expect(plan).toEqual({ kind: 'APPEND', closePrevious: { id: 1n, endDate: '2026-02-28' } });
  });

  it('oldingi yozuv allaqachon yopilgan (bo\'shliq bor) — unga tegilmaydi', () => {
    const plan = planAppend(
      [rec(1, '2026-01-01', '2026-01-31')],
      { startDate: '2026-04-01', endDate: null, valueKey: 'B' },
      MONTHLY,
    );
    expect(plan).toEqual({ kind: 'APPEND', closePrevious: null });
  });

  it('joriy qiymat bilan bir xil — UNCHANGED (yangi yozuv yaratilmaydi)', () => {
    expect(
      planAppend([rec(1, '2026-01-01', null, 'A')], { startDate: '2026-05-01', endDate: null, valueKey: 'A' }, MONTHLY),
    ).toEqual({ kind: 'UNCHANGED' });
  });

  it('xuddi shu sana va qiymatdagi yozuv bor — UNCHANGED (qayta import)', () => {
    const records = [rec(1, '2026-01-01', '2026-02-28', 'A'), rec(2, '2026-03-01', null, 'B')];
    expect(planAppend(records, { startDate: '2026-01-01', endDate: '2026-02-28', valueKey: 'A' }, MONTHLY)).toEqual({
      kind: 'UNCHANGED',
    });
  });

  it('shu sanadan boshlanadigan boshqa qiymatli yozuv bor — HISTORY_ORDER', () => {
    expectRuleError(
      () => planAppend([rec(1, '2026-03-01', null, 'A')], { startDate: '2026-03-01', endDate: null, valueKey: 'B' }, MONTHLY),
      'HISTORY_ORDER',
    );
  });

  it('oxirgi yozuvdan oldingi sana — HISTORY_ORDER (o\'rtaga qo\'shilmaydi)', () => {
    expectRuleError(
      () => planAppend([rec(1, '2026-03-01', null)], { startDate: '2026-02-01', endDate: null, valueKey: 'B' }, MONTHLY),
      'HISTORY_ORDER',
    );
  });

  it('yopilgan oxirgi yozuv bilan ustma-ust — HISTORY_ORDER', () => {
    expectRuleError(
      () =>
        planAppend([rec(1, '2026-01-01', '2026-05-20')], { startDate: '2026-05-01', endDate: null, valueKey: 'B' }, MONTHLY),
      'HISTORY_ORDER',
    );
  });

  it('maosh/lavozim: oyning 1-kuni emas — START_NOT_MONTH_START', () => {
    expectRuleError(
      () => planAppend([], { startDate: '2026-03-15', endDate: null, valueKey: 'A' }, MONTHLY),
      'START_NOT_MONTH_START',
    );
  });

  it('team_links: istalgan kun — oldingisi bir kun oldin yopiladi', () => {
    const plan = planAppend([rec(1, '2026-01-10', null)], { startDate: '2026-03-15', endDate: null, valueKey: 'B' }, ANY_DAY);
    expect(plan).toEqual({ kind: 'APPEND', closePrevious: { id: 1n, endDate: '2026-03-14' } });
  });

  it('tugash sanasi boshlanishdan oldin — INVALID_DATE_RANGE', () => {
    expectRuleError(
      () => planAppend([], { startDate: '2026-03-15', endDate: '2026-03-14', valueKey: 'A' }, ANY_DAY),
      'INVALID_DATE_RANGE',
    );
  });

  it('yopilgan davrga tushadi — PERIOD_CLOSED (mart yopilgan, 1-mart va undan oldin taqiqlangan)', () => {
    const rules: HistoryRules = { lastClosedDay: '2026-03-31', monthStartOnly: true };
    expectRuleError(
      () => planAppend([rec(1, '2026-01-01', null)], { startDate: '2026-03-01', endDate: null, valueKey: 'B' }, rules),
      'PERIOD_CLOSED',
    );
    expect(
      planAppend([rec(1, '2026-01-01', null)], { startDate: '2026-04-01', endDate: null, valueKey: 'B' }, rules),
    ).toEqual({ kind: 'APPEND', closePrevious: { id: 1n, endDate: '2026-03-31' } });
  });

  it('yopilgan davrdagi o\'zgarmagan yozuvni qayta import qilish xato emas', () => {
    const rules: HistoryRules = { lastClosedDay: '2026-03-31', monthStartOnly: true };
    expect(planAppend([rec(1, '2026-01-01', null, 'A')], { startDate: '2026-01-01', endDate: null, valueKey: 'A' }, rules)).toEqual({
      kind: 'UNCHANGED',
    });
  });
});

describe('planUpdateLast — oxirgi yozuvni tuzatish', () => {
  const records = [rec(1, '2026-01-01', '2026-02-28', 'A'), rec(2, '2026-03-01', null, 'B')];

  it('faqat oxirgi yozuv tahrirlanadi — NOT_LAST_RECORD', () => {
    expectRuleError(() => planUpdateLast(records, 1n, { valueChanged: true }, MONTHLY), 'NOT_LAST_RECORD');
  });

  it('qiymatni o\'zgartirish — oldingi yozuvga tegilmaydi', () => {
    expect(planUpdateLast(records, 2n, { valueChanged: true }, MONTHLY)).toEqual({ previousEnd: null });
  });

  it('boshlanish sanasini surish — qo\'shni oldingi yozuvning oxiri ham suriladi', () => {
    expect(planUpdateLast(records, 2n, { startDate: '2026-04-01', valueChanged: false }, MONTHLY)).toEqual({
      previousEnd: { id: 1n, endDate: '2026-03-31' },
    });
    expect(planUpdateLast(records, 2n, { startDate: '2026-02-01', valueChanged: false }, MONTHLY)).toEqual({
      previousEnd: { id: 1n, endDate: '2026-01-31' },
    });
  });

  it('boshlanish oldingi yozuv boshlanishidan oldin yoki teng — HISTORY_ORDER', () => {
    expectRuleError(
      () => planUpdateLast(records, 2n, { startDate: '2026-01-01', valueChanged: false }, MONTHLY),
      'HISTORY_ORDER',
    );
  });

  it('bo\'shliq bilan ajralgan oldingi yozuv bilan ustma-ust tushsa — HISTORY_ORDER', () => {
    const gap = [rec(1, '2026-01-01', '2026-01-31'), rec(2, '2026-04-01', null)];
    expectRuleError(() => planUpdateLast(gap, 2n, { startDate: '2026-01-15', valueChanged: false }, ANY_DAY), 'HISTORY_ORDER');
    expect(planUpdateLast(gap, 2n, { startDate: '2026-03-01', valueChanged: false }, MONTHLY)).toEqual({ previousEnd: null });
  });

  it('tugash sanasini qo\'yish va olib tashlash', () => {
    expect(planUpdateLast(records, 2n, { endDate: '2026-06-30', valueChanged: false }, MONTHLY)).toEqual({ previousEnd: null });
    expectRuleError(
      () => planUpdateLast(records, 2n, { endDate: '2026-02-01', valueChanged: false }, MONTHLY),
      'INVALID_DATE_RANGE',
    );
  });

  it('hech narsa o\'zgarmasa — NO_CHANGE', () => {
    expectRuleError(() => planUpdateLast(records, 2n, { startDate: '2026-03-01', valueChanged: false }, MONTHLY), 'NO_CHANGE');
  });

  it('maosh/lavozim: yangi sana oyning 1-kuni bo\'lishi shart', () => {
    expectRuleError(
      () => planUpdateLast(records, 2n, { startDate: '2026-03-10', valueChanged: false }, MONTHLY),
      'START_NOT_MONTH_START',
    );
  });

  it('yopilgan davrga ta\'sir qiladigan har qanday o\'zgarish — PERIOD_CLOSED', () => {
    const rules: HistoryRules = { lastClosedDay: '2026-03-31', monthStartOnly: true };
    // Qiymat 1-martdan beri amal qiladi — mart yopilgan.
    expectRuleError(() => planUpdateLast(records, 2n, { valueChanged: true }, rules), 'PERIOD_CLOSED');
    // Boshlanishni aprelga surish martni o'zgartiradi (oldingi yozuv martga cho'ziladi).
    expectRuleError(
      () => planUpdateLast(records, 2n, { startDate: '2026-04-01', valueChanged: false }, rules),
      'PERIOD_CLOSED',
    );
    // Faqat kelajakdagi tugash sanasi — ruxsat.
    expect(planUpdateLast(records, 2n, { endDate: '2026-06-30', valueChanged: false }, rules)).toEqual({ previousEnd: null });
    // Tugash sanasini yopilgan oyga qo'yish — taqiqlangan.
    expectRuleError(
      () => planUpdateLast(records, 2n, { endDate: '2026-03-20', valueChanged: false }, rules),
      'PERIOD_CLOSED',
    );
  });
});

describe('planDeleteLast — oxirgi yozuvni o\'chirish', () => {
  it('qo\'shni oldingi yozuv qayta ochiladi (o\'chirilganning tugash sanasini oladi)', () => {
    const records = [rec(1, '2026-01-01', '2026-02-28'), rec(2, '2026-03-01', null)];
    expect(planDeleteLast(records, 2n, MONTHLY)).toEqual({ reopenPrevious: { id: 1n, endDate: null } });

    const terminated = [rec(1, '2026-01-01', '2026-02-28'), rec(2, '2026-03-01', '2026-05-20')];
    expect(planDeleteLast(terminated, 2n, MONTHLY)).toEqual({ reopenPrevious: { id: 1n, endDate: '2026-05-20' } });
  });

  it('bo\'shliq bilan ajralgan oldingi yozuvga tegilmaydi', () => {
    const records = [rec(1, '2026-01-01', '2026-01-31'), rec(2, '2026-03-01', null)];
    expect(planDeleteLast(records, 2n, MONTHLY)).toEqual({ reopenPrevious: null });
  });

  it('oxirgi bo\'lmagan yozuv — NOT_LAST_RECORD; yopilgan davrda — PERIOD_CLOSED', () => {
    const records = [rec(1, '2026-01-01', '2026-02-28'), rec(2, '2026-03-01', null)];
    expectRuleError(() => planDeleteLast(records, 1n, MONTHLY), 'NOT_LAST_RECORD');
    expectRuleError(() => planDeleteLast(records, 2n, { lastClosedDay: '2026-03-31', monthStartOnly: true }), 'PERIOD_CLOSED');
  });
});

describe('planTermination — ishdan ketish sanasida ochiq yozuvlarni yopish', () => {
  it('ochiq va keyinroq tugaydigan yozuvlar ishdan ketish sanasida yopiladi', () => {
    const records = [rec(1, '2026-01-01', '2026-02-28'), rec(2, '2026-03-01', null), rec(3, '2026-02-10', '2026-12-31')];
    expect(planTermination(records, '2026-05-20', MONTHLY)).toEqual([
      { id: 2n, endDate: '2026-05-20' },
      { id: 3n, endDate: '2026-05-20' },
    ]);
  });

  it('ishdan ketgandan keyin boshlanadigan yozuv — HISTORY_ORDER', () => {
    expectRuleError(() => planTermination([rec(1, '2026-06-01', null)], '2026-05-20', MONTHLY), 'HISTORY_ORDER');
  });

  it('yopiladigan narsa yopilgan davrga tushsa — PERIOD_CLOSED; yopiladigan narsa bo\'lmasa — xato emas', () => {
    const rules: HistoryRules = { lastClosedDay: '2026-03-31', monthStartOnly: true };
    expectRuleError(() => planTermination([rec(1, '2026-01-01', null)], '2026-03-20', rules), 'PERIOD_CLOSED');
    expect(planTermination([rec(1, '2026-01-01', null)], '2026-03-31', rules)).toEqual([{ id: 1n, endDate: '2026-03-31' }]);
    expect(planTermination([rec(1, '2026-01-01', '2026-02-28')], '2026-03-20', rules)).toEqual([]);
  });
});
