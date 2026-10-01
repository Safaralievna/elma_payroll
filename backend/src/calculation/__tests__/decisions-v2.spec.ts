/**
 * 1.1-bosqich: docs/DECISIONS.md (2026-10-01) bo'yicha yadro o'zgarishlari.
 */
import {
  CalculationError,
  aggregate,
  calculateDepositBalance,
  calculateFact,
  calculateKpi,
  calculateKpiRule,
  calculateKpiRuleFacts,
  calculatePayroll,
  requiresPlan,
  separatePriorPeriodReturns,
  validateDepositWithdrawal,
  type SalesLineForCalculation,
  type TeamLink,
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

describe('1. Yaxlitlash — har bir qoida qatori', () => {
  it('qoida summasi butun so\'mgacha half-up, KPI = yaxlitlangan qatorlar yig\'indisi', () => {
    // 3 ta qoida, har biri x.5 → har biri yuqoriga: 1 + 1 + 1 = 3 (aniq yig'indi 1.5 → 2 bo'lardi)
    const rule = { calculationType: 'RESULT_PERCENTAGE', fact: 50, configuration: { percent: 1 } };
    const r = calculateKpi([rule, rule, rule]);
    expect(r.rules.map((x) => x.amount.toString())).toEqual(['0.5', '0.5', '0.5']);
    expect(r.rules.map((x) => x.roundedAmount.toNumber())).toEqual([1, 1, 1]);
    expect(r.amount.toNumber()).toBe(3);
  });
});

describe('2. Priority — bitta KPI ichida qator faqat bitta qoidaga tushadi', () => {
  const lines: SalesLineForCalculation[] = [
    { employeeId: 'E1', productId: '407', priceTypeId: 'ULGURJI', amount: 5_000_000 },
    { employeeId: 'E1', productId: '101', priceTypeId: 'ULGURJI', amount: 20_000_000 },
    { employeeId: 'E1', productId: '112', priceTypeId: 'CHAKANA', amount: 30_000_000 },
    { employeeId: 'E2', productId: '101', priceTypeId: 'ULGURJI', amount: 999 },
  ];
  const base = { scope: 'OWN', employeeId: 'E1', aggregation: 'SUM', sourceField: 'amount' };

  it('407 ulgurji qatori priority kichik bo\'lgan "faqat 407" qoidasiga tushadi', () => {
    const facts = calculateKpiRuleFacts(lines, {
      ...base,
      rules: [
        { ruleId: 'ulgurji', priority: 2, filters: [{ fieldName: 'price_type_id', operator: '=', values: 'ULGURJI' }] },
        { ruleId: 'chakana', priority: 3, filters: [{ fieldName: 'price_type_id', operator: '=', values: 'CHAKANA' }] },
        { ruleId: '407', priority: 1, filters: [{ fieldName: 'product_id', operator: 'IN', values: ['407'] }] },
      ],
    });
    expect(facts.map((f) => [f.ruleId, f.fact.toNumber()])).toEqual([
      ['ulgurji', 20_000_000],
      ['chakana', 30_000_000],
      ['407', 5_000_000],
    ]);
  });

  it('priority teskari bo\'lsa, 407 qatori ulgurji qoidasiga tushadi', () => {
    const facts = calculateKpiRuleFacts(lines, {
      ...base,
      rules: [
        { ruleId: 'ulgurji', priority: 1, filters: [{ fieldName: 'price_type_id', operator: '=', values: 'ULGURJI' }] },
        { ruleId: '407', priority: 2, filters: [{ fieldName: 'product_id', operator: 'IN', values: ['407'] }] },
      ],
    });
    expect(facts.map((f) => f.fact.toNumber())).toEqual([25_000_000, 0]);
  });

  it('har xil KPI\'larda bir qator mustaqil hisoblanadi', () => {
    const all = { ...base, filters: [] };
    expect(calculateFact(lines, all).toNumber()).toBe(55_000_000);
    expect(
      calculateFact(lines, { ...all, filters: [{ fieldName: 'product_id', operator: '=', values: '407' }] }).toNumber(),
    ).toBe(5_000_000);
  });

  it('bir xil priority yoki takroriy qoida — xato', () => {
    expectCalcError(
      () =>
        calculateKpiRuleFacts(lines, {
          ...base,
          rules: [
            { ruleId: 'a', priority: 1, filters: [] },
            { ruleId: 'b', priority: 1, filters: [] },
          ],
        }),
      'INVALID_CONFIGURATION',
    );
    expectCalcError(
      () =>
        calculateKpiRuleFacts(lines, {
          ...base,
          rules: [
            { ruleId: 'a', priority: 1, filters: [] },
            { ruleId: 'a', priority: 2, filters: [] },
          ],
        }),
      'INVALID_CONFIGURATION',
    );
  });
});

describe('3. FIXED — min_achievement', () => {
  const cfg = { min_achievement: 100, amount: 500_000 };

  it('bajarilish ≥ min_achievement → amount', () => {
    expect(calculateKpiRule({ calculationType: 'FIXED', plan: 100, fact: 100, configuration: cfg }).amount.toNumber()).toBe(
      500_000,
    );
    expect(calculateKpiRule({ calculationType: 'FIXED', plan: 100, fact: 130, configuration: cfg }).amount.toNumber()).toBe(
      500_000,
    );
  });
  it('bajarilish < min_achievement → 0', () => {
    const r = calculateKpiRule({ calculationType: 'FIXED', plan: 100, fact: 99.99, configuration: cfg });
    expect(r.amount.toNumber()).toBe(0);
    expect(r.achievementPercent!.toNumber()).toBe(99.99);
  });
  it('min_achievement bo\'lsa plan majburiy va > 0, fakt majburiy', () => {
    expectCalcError(() => calculateKpiRule({ calculationType: 'FIXED', fact: 100, configuration: cfg }), 'PLAN_REQUIRED');
    expectCalcError(
      () => calculateKpiRule({ calculationType: 'FIXED', plan: 0, fact: 100, configuration: cfg }),
      'PLAN_NOT_POSITIVE',
    );
    expectCalcError(() => calculateKpiRule({ calculationType: 'FIXED', plan: 100, configuration: cfg }), 'FACT_REQUIRED');
  });
  it('min_achievement yo\'q → shartsiz, plan kerak emas', () => {
    expect(calculateKpiRule({ calculationType: 'FIXED', configuration: { amount: 500_000 } }).amount.toNumber()).toBe(500_000);
  });
  it('requiresPlan konfiguratsiyaga bog\'liq', () => {
    expect(requiresPlan('FIXED')).toBe(false);
    expect(requiresPlan('FIXED', { amount: 1 })).toBe(false);
    expect(requiresPlan('FIXED', cfg)).toBe(true);
    expect(requiresPlan('STEP', {})).toBe(true);
  });
});

describe('4. Qaytarishlar', () => {
  it('manfiy amount/quantity qabul qilinadi va SUM dan ayiriladi', () => {
    const lines: SalesLineForCalculation[] = [
      { employeeId: 'E1', amount: 1000, quantity: 10 },
      { employeeId: 'E1', amount: -300, quantity: -3 },
    ];
    expect(aggregate(lines, 'SUM', 'amount').toNumber()).toBe(700);
    expect(aggregate(lines, 'SUM', 'quantity').toNumber()).toBe(7);
  });

  it('AKB = sof xaridi > 0 bo\'lgan mijozlar soni (COUNT_DISTINCT_POSITIVE)', () => {
    const lines: SalesLineForCalculation[] = [
      { employeeId: 'E1', clientId: 'A', amount: 1000 },
      { employeeId: 'E1', clientId: 'A', amount: -1000 }, // A: 0 → sanalmaydi
      { employeeId: 'E1', clientId: 'B', amount: 500 },
      { employeeId: 'E1', clientId: 'B', amount: -100 }, // B: 400 → sanaladi
      { employeeId: 'E1', clientId: 'C', amount: -200 }, // C: faqat qaytarish → sanalmaydi
      { employeeId: 'E1', clientId: 'D', amount: 1 }, // D: 1 → sanaladi
      { employeeId: 'E1', clientId: null, amount: 9999 }, // mijozsiz → sanalmaydi
    ];
    expect(aggregate(lines, 'COUNT_DISTINCT_POSITIVE', 'client_id').toNumber()).toBe(2);
    expect(aggregate(lines, 'COUNT_DISTINCT', 'client_id').toNumber()).toBe(4);
  });

  it('asl sotuv sanasi o\'tgan oyda bo\'lgan qaytarish joriy faktdan chiqariladi', () => {
    const lines: SalesLineForCalculation[] = [
      { employeeId: 'E1', amount: 1000, saleDate: '2026-03-05' },
      { employeeId: 'E1', amount: -200, saleDate: '2026-03-10', originalSaleDate: '2026-03-02' },
      { employeeId: 'E1', amount: -300, saleDate: '2026-03-10', originalSaleDate: '2026-02-28' },
      { employeeId: 'E1', amount: -50, saleDate: '2026-03-11', originalSaleDate: '2025-12-31' },
    ];
    const { current, priorPeriodReturns } = separatePriorPeriodReturns(lines, { year: 2026, month: 3 });
    expect(priorPeriodReturns.map((l) => l.amount)).toEqual([-300, -50]);
    expect(
      calculateFact(current, { scope: 'OWN', employeeId: 'E1', filters: [], aggregation: 'SUM', sourceField: 'amount' }).toNumber(),
    ).toBe(800);
  });

  it('noto\'g\'ri sana — xato', () => {
    expectCalcError(
      () => separatePriorPeriodReturns([{ employeeId: 'E1', amount: -1, originalSaleDate: '28.02.2026' }], { year: 2026, month: 3 }),
      'INVALID_DATE',
    );
  });
});

describe('5. TEAM — savdo kunidagi team_links', () => {
  const links: TeamLink[] = [
    // E1 mart 15 gacha SUP1 da, keyin SUP2 da
    { leaderId: 'SUP1', memberId: 'E1', linkType: 'SUPERVISOR', startDate: '2026-01-01', endDate: '2026-03-15' },
    { leaderId: 'SUP2', memberId: 'E1', linkType: 'SUPERVISOR', startDate: '2026-03-16', endDate: null },
    // E1 bir vaqtda OP1 operatoriga ham bo'ysunadi
    { leaderId: 'OP1', memberId: 'E1', linkType: 'OPERATOR', startDate: '2026-01-01', endDate: null },
  ];
  const lines: SalesLineForCalculation[] = [
    { employeeId: 'E1', amount: 100, saleDate: '2026-03-15' },
    { employeeId: 'E1', amount: 200, saleDate: '2026-03-16' },
    { employeeId: 'SUP1', amount: 5000, saleDate: '2026-03-10' }, // rahbarning o'z savdosi
  ];
  const teamFact = (employeeId: string, teamLinkType: string) =>
    calculateFact(lines, {
      scope: 'TEAM',
      employeeId,
      teamLinks: links,
      teamLinkType,
      filters: [],
      aggregation: 'SUM',
      sourceField: 'amount',
    }).toNumber();

  it('qator savdo kunidagi rahbarga yoziladi (end_date shu kun ham kiradi)', () => {
    expect(teamFact('SUP1', 'SUPERVISOR')).toBe(100);
    expect(teamFact('SUP2', 'SUPERVISOR')).toBe(200);
  });
  it('havola turi bo\'yicha: operator jamoasi alohida', () => {
    expect(teamFact('OP1', 'OPERATOR')).toBe(300);
    expect(teamFact('OP1', 'SUPERVISOR')).toBe(0);
  });
  it('team_link_type yo\'q yoki sale_date yo\'q — xato', () => {
    expectCalcError(
      () => calculateFact(lines, { scope: 'TEAM', employeeId: 'OP1', teamLinks: links, filters: [], aggregation: 'SUM', sourceField: 'amount' }),
      'INVALID_CONFIGURATION',
    );
    expectCalcError(
      () =>
        calculateFact([{ employeeId: 'E1', amount: 1 }], {
          scope: 'TEAM',
          employeeId: 'OP1',
          teamLinks: links,
          teamLinkType: 'OPERATOR',
          filters: [],
          aggregation: 'SUM',
          sourceField: 'amount',
        }),
      'INVALID_DATE',
    );
  });
});

describe('6. Payroll — qarz va depozit qaytarish', () => {
  const base = { fixedSalary: 0, bonusTotal: 0, penaltyTotal: 0, advanceTotal: 0, recalculationAmount: 0 };

  it('debtCarryover depozitdan keyin ayiriladi, depozit bazasiga ta\'sir qilmaydi', () => {
    const r = calculatePayroll({ ...base, kpiTotal: 1_000_000, depositPercent: 10, debtCarryover: 200_000 });
    expect(r.depositAmount.toNumber()).toBe(100_000);
    expect(r.netAmount.toNumber()).toBe(700_000);
    expect(r.payableAmount.toNumber()).toBe(700_000);
    expect(r.newDebtAmount.toNumber()).toBe(0);
  });
  it('depositReturn net ga qo\'shiladi, gross ga kirmaydi', () => {
    const r = calculatePayroll({ ...base, kpiTotal: 1_000_000, depositPercent: 10, depositReturn: 300_000 });
    expect(r.grossAmount.toNumber()).toBe(1_000_000);
    expect(r.depositAmount.toNumber()).toBe(100_000);
    expect(r.netAmount.toNumber()).toBe(1_200_000);
  });
  it('net manfiy → payable 0, qoldiq yangi qarz', () => {
    const r = calculatePayroll({ ...base, kpiTotal: 500_000, advanceTotal: 800_000, depositPercent: null });
    expect(r.netAmount.toNumber()).toBe(-300_000);
    expect(r.payableAmount.toNumber()).toBe(0);
    expect(r.newDebtAmount.toNumber()).toBe(300_000);
    expect(r.warnings).toEqual(['NEGATIVE_NET_AMOUNT']);
  });
  it('to\'liq formula', () => {
    // gross 3 500 000; depozit (3 500 000 − 100 000) × 10% = 340 000
    // net = 3 500 000 − 100 000 − 340 000 − 500 000 − 50 000 + 20 000 + 70 000 = 2 600 000
    const r = calculatePayroll({
      fixedSalary: 2_000_000,
      kpiTotal: 1_000_000,
      bonusTotal: 500_000,
      penaltyTotal: 100_000,
      advanceTotal: 500_000,
      recalculationAmount: 20_000,
      depositPercent: 10,
      debtCarryover: 50_000,
      depositReturn: 70_000,
    });
    expect(r.depositAmount.toNumber()).toBe(340_000);
    expect(r.netAmount.toNumber()).toBe(2_600_000);
    expect(r.payableAmount.toNumber()).toBe(2_600_000);
  });
  it('manfiy qarz yoki qaytarish — xato', () => {
    expect(() => calculatePayroll({ ...base, kpiTotal: 1, depositPercent: null, debtCarryover: -1 })).toThrow(RangeError);
    expect(() => calculatePayroll({ ...base, kpiTotal: 1, depositPercent: null, depositReturn: -1 })).toThrow(RangeError);
  });
});

describe('7. Depozit balansi', () => {
  it('balans = Σ yig\'ilish − Σ yechish', () => {
    expect(calculateDepositBalance([100_000, 200_000], [50_000]).toNumber()).toBe(250_000);
  });
  it('balansgacha yechish mumkin, qolgan balans qaytadi', () => {
    expect(validateDepositWithdrawal(250_000, 250_000).toNumber()).toBe(0);
    expect(validateDepositWithdrawal(250_000, 100_000).toNumber()).toBe(150_000);
  });
  it('balansdan ko\'p yoki ≤ 0 — xato', () => {
    expectCalcError(() => validateDepositWithdrawal(250_000, 250_001), 'INSUFFICIENT_DEPOSIT_BALANCE');
    expectCalcError(() => validateDepositWithdrawal(250_000, 0), 'INVALID_WITHDRAWAL_AMOUNT');
    expectCalcError(() => validateDepositWithdrawal(250_000, -5), 'INVALID_WITHDRAWAL_AMOUNT');
  });
});

describe('8. Manfiy fakt — xato emas, to\'lov ≥ 0, NEGATIVE_FACT ogohlantirishi', () => {
  const steps = [{ minPercent: 70, coefficient: 2 }];

  it('RESULT_PERCENTAGE: manfiy fakt → 0', () => {
    const r = calculateKpiRule({ calculationType: 'RESULT_PERCENTAGE', fact: -1_000_000, configuration: { percent: 5 } });
    expect(r.amount.toNumber()).toBe(0);
    expect(r.roundedAmount.toNumber()).toBe(0);
    expect(r.warnings).toEqual(['NEGATIVE_FACT']);
  });
  it('PER_UNIT: manfiy fakt → 0', () => {
    const r = calculateKpiRule({ calculationType: 'PER_UNIT', fact: -10, configuration: { rate_per_unit: 100 } });
    expect(r.amount.toNumber()).toBe(0);
    expect(r.warnings).toEqual(['NEGATIVE_FACT']);
  });
  it('LINEAR: manfiy fakt → to\'lov foizi va summa 0', () => {
    const r = calculateKpiRule({ calculationType: 'LINEAR', plan: 1000, fact: -500, baseAmount: 200 });
    expect(r.achievementPercent!.toNumber()).toBe(-50);
    expect(r.payoutPercent!.toNumber()).toBe(0);
    expect(r.amount.toNumber()).toBe(0);
    expect(r.warnings).toEqual(['NEGATIVE_FACT']);
  });
  it('STEP: manfiy fakt → 0', () => {
    const r = calculateKpiRule({ calculationType: 'STEP', plan: 1000, fact: -500, baseAmount: 200, steps });
    expect(r.amount.toNumber()).toBe(0);
    expect(r.warnings).toEqual(['NEGATIVE_FACT']);
  });
  it('FIXED (min_achievement bilan): manfiy fakt → 0, ogohlantirish', () => {
    const r = calculateKpiRule({
      calculationType: 'FIXED',
      plan: 100,
      fact: -1,
      configuration: { min_achievement: 100, amount: 500_000 },
    });
    expect(r.amount.toNumber()).toBe(0);
    expect(r.warnings).toEqual(['NEGATIVE_FACT']);
  });
  it('musbat va nol fakt — ogohlantirish yo\'q', () => {
    expect(calculateKpiRule({ calculationType: 'PER_UNIT', fact: 0, configuration: { rate_per_unit: 1 } }).warnings).toEqual([]);
    expect(calculateKpiRule({ calculationType: 'PER_UNIT', fact: 5, configuration: { rate_per_unit: 1 } }).warnings).toEqual([]);
  });
  it('KPI: manfiy faktli qoida 0, boshqa qoidalar odatdagidek qo\'shiladi', () => {
    const r = calculateKpi([
      { calculationType: 'RESULT_PERCENTAGE', fact: -300_000, configuration: { percent: 10 } },
      { calculationType: 'RESULT_PERCENTAGE', fact: 1_000_000, configuration: { percent: 5 } },
    ]);
    expect(r.rules.map((x) => x.roundedAmount.toNumber())).toEqual([0, 50_000]);
    expect(r.amount.toNumber()).toBe(50_000);
    expect(r.rules.map((x) => x.warnings)).toEqual([['NEGATIVE_FACT'], []]);
  });
});
