/**
 * Chegara holatlari va xatolar — jim yutib yuborilmasligini tekshiradi.
 */
import {
  CalculationError,
  calculateFact,
  calculateKpiRule,
  calculatePayroll,
  matchesFilter,
  requiresPlan,
  type SalesLineForCalculation,
} from '..';

function expectCalcError(fn: () => unknown, code: string): void {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(CalculationError);
    expect((e as CalculationError).code).toBe(code);
    return;
  }
  throw new Error(`${code} xatosi kutilgan edi`);
}

describe('KPI qoidasi validatsiyasi', () => {
  const step = { minPercent: 70, coefficient: 2 };

  it('noma\'lum hisoblash turi', () => {
    expectCalcError(() => calculateKpiRule({ calculationType: 'MAGIC', fact: 1 }), 'UNKNOWN_CALCULATION_TYPE');
  });
  it('STEP: plan manfiy', () => {
    expectCalcError(
      () => calculateKpiRule({ calculationType: 'STEP', plan: -5, fact: 1, baseAmount: 1, steps: [step] }),
      'PLAN_NOT_POSITIVE',
    );
  });
  it('STEP: baza yo\'q', () => {
    expectCalcError(
      () => calculateKpiRule({ calculationType: 'STEP', plan: 100, fact: 90, steps: [step] }),
      'BASE_AMOUNT_REQUIRED',
    );
  });
  it('STEP: pog\'onalar yo\'q', () => {
    expectCalcError(
      () => calculateKpiRule({ calculationType: 'STEP', plan: 100, fact: 90, baseAmount: 1, steps: [] }),
      'INVALID_STEPS',
    );
  });
  it('fakt yo\'q', () => {
    expectCalcError(
      () => calculateKpiRule({ calculationType: 'PER_UNIT', configuration: { rate_per_unit: 1 } }),
      'FACT_REQUIRED',
    );
  });
  it('RESULT_PERCENTAGE: percent konfiguratsiyada yo\'q', () => {
    expectCalcError(
      () => calculateKpiRule({ calculationType: 'RESULT_PERCENTAGE', fact: 100, configuration: {} }),
      'INVALID_CONFIGURATION',
    );
  });
  it('MANUAL: summa kiritilmagan', () => {
    expectCalcError(() => calculateKpiRule({ calculationType: 'MANUAL' }), 'MANUAL_AMOUNT_REQUIRED');
  });
  it('MANUAL va FIXED faktsiz ishlaydi', () => {
    expect(calculateKpiRule({ calculationType: 'MANUAL', manualAmount: 500_000 }).amount.toNumber()).toBe(500_000);
    expect(
      calculateKpiRule({ calculationType: 'FIXED', configuration: { amount: '250000' } }).amount.toNumber(),
    ).toBe(250_000);
  });
  it('requiresPlan faqat STEP va LINEAR uchun true', () => {
    expect(['STEP', 'LINEAR', 'RESULT_PERCENTAGE', 'PER_UNIT', 'FIXED', 'MANUAL'].map(requiresPlan)).toEqual([
      true,
      true,
      false,
      false,
      false,
      false,
    ]);
  });
});

describe('LINEAR', () => {
  it('operator misoli: baza 200, 98% → 196', () => {
    const r = calculateKpiRule({ calculationType: 'LINEAR', plan: 1000, fact: 980, baseAmount: 200 });
    expect(r.amount.toNumber()).toBe(196);
  });
  it('shift (max_percent) va chegara (min_percent)', () => {
    const cfg = { min_percent: 70, max_percent: 120 };
    expect(
      calculateKpiRule({ calculationType: 'LINEAR', plan: 2000, fact: 3000, baseAmount: 200, configuration: cfg })
        .amount.toNumber(),
    ).toBe(240);
    expect(
      calculateKpiRule({ calculationType: 'LINEAR', plan: 1000, fact: 600, baseAmount: 200, configuration: cfg })
        .amount.toNumber(),
    ).toBe(0);
  });
});

describe('Filtrlar', () => {
  const line: SalesLineForCalculation = { employeeId: 'E1', productId: '407', amount: 100 };

  it('noma\'lum maydon va operator rad etiladi', () => {
    expectCalcError(() => matchesFilter(line, { fieldName: 'password', operator: '=', values: 'x' }), 'INVALID_FILTER_VALUE');
    expectCalcError(() => matchesFilter(line, { fieldName: 'product_id', operator: 'LIKE', values: 'x' }), 'UNKNOWN_FILTER_OPERATOR');
  });
  it('sonli taqqoslash', () => {
    expect(matchesFilter(line, { fieldName: 'amount', operator: '>=', values: 100 })).toBe(true);
    expect(matchesFilter(line, { fieldName: 'amount', operator: '>', values: [100] })).toBe(false);
  });
  it('TEAM scope uchun jamoa ro\'yxati majburiy', () => {
    expectCalcError(
      () => calculateFact([line], { scope: 'TEAM', employeeId: 'E9', filters: [], aggregation: 'SUM', sourceField: 'amount' }),
      'TEAM_MEMBERS_REQUIRED',
    );
  });
});

describe('Payroll chegara holatlari', () => {
  const base = { fixedSalary: 0, bonusTotal: 0, advanceTotal: 0, recalculationAmount: 0 };

  it('qayta hisob gross ga kirmaydi, net ga qo\'shiladi', () => {
    const r = calculatePayroll({ ...base, kpiTotal: 1_000_000, penaltyTotal: 0, recalculationAmount: 50_000, depositPercent: 10 });
    expect(r.grossAmount.toNumber()).toBe(1_000_000);
    expect(r.depositAmount.toNumber()).toBe(100_000);
    expect(r.netAmount.toNumber()).toBe(950_000);
  });
  it('jarima ish haqidan katta — jim o\'tkazilmaydi, ogohlantirish qaytadi', () => {
    const r = calculatePayroll({ ...base, kpiTotal: 100_000, penaltyTotal: 300_000, depositPercent: 10 });
    expect(r.depositAmount.toNumber()).toBe(0);
    expect(r.netAmount.toNumber()).toBe(-200_000);
    expect(r.warnings).toEqual(['DEPOSIT_BASE_NOT_POSITIVE', 'NEGATIVE_NET_AMOUNT']);
  });
});
