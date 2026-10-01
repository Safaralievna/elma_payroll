/**
 * Team lead bergan test_cases.json dagi HAMMA testlar.
 * Hisoblash yadrosi shu testlardan o'tmaguncha keyingi bosqichga o'tilmaydi.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  CalculationError,
  aggregate,
  calculateFact,
  calculateKpi,
  calculateKpiRule,
  calculatePayroll,
  planImportActivation,
  roundMoney,
  roundPercent,
  type ExistingImportBatch,
  type RuleFilter,
  type SalesLineForCalculation,
  type StepTierInput,
} from '..';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const cases: any = JSON.parse(
  readFileSync(join(__dirname, '../../../test/fixtures/test_cases.json'), 'utf8'),
);

describe('1. STEP — kumulyativ pog\'onalar', () => {
  const steps: StepTierInput[] = cases['1_step_kumulyativ'].pogonalar.map(
    (p: { min: number; max: number; coefficient: number; max_reward_percent: number }) => ({
      minPercent: p.min,
      maxPercent: p.max,
      coefficient: p.coefficient,
      maxRewardPercent: p.max_reward_percent,
    }),
  );

  for (const t of cases['1_step_kumulyativ'].testlar) {
    it(`plan ${t.plan}, fakt ${t.fact} → ${t.kpi_amount} ${t.note ? `(${t.note})` : ''}`, () => {
      const r = calculateKpiRule({
        calculationType: 'STEP',
        plan: t.plan,
        fact: t.fact,
        baseAmount: t.base,
        steps,
      });
      expect(roundPercent(r.achievementPercent!).toNumber()).toBe(t.achievement);
      expect(roundPercent(r.payoutPercent!).toNumber()).toBe(t.payout_percent);
      expect(roundMoney(r.amount).toNumber()).toBe(t.kpi_amount);
    });
  }
});

describe('2. Depozit va net', () => {
  for (const t of cases['2_depozit'].testlar) {
    it(`KPI ${t.kpi}, fiks ${t.fixed}, bonus ${t.bonus}, jarima ${t.penalty}, avans ${t.advance} → net ${t.net}`, () => {
      const r = calculatePayroll({
        fixedSalary: t.fixed,
        kpiTotal: t.kpi,
        bonusTotal: t.bonus,
        penaltyTotal: t.penalty,
        advanceTotal: t.advance,
        recalculationAmount: 0,
        depositPercent: t.deposit_percent,
      });
      expect(r.depositBase === null ? null : r.depositBase.toNumber()).toBe(t.deposit_base);
      expect(r.depositAmount.toNumber()).toBe(t.deposit);
      expect(r.netAmount.toNumber()).toBe(t.net);
      expect(r.warnings).toEqual([]);
    });
  }
});

describe('3. Aggregation (SUM / COUNT / COUNT_DISTINCT)', () => {
  const lines: SalesLineForCalculation[] = cases['3_aggregation'].sales_lines.map(
    (l: { employee_id: string; client: string; amount: number }) => ({
      employeeId: l.employee_id,
      clientId: l.client,
      amount: l.amount,
    }),
  );

  for (const t of cases['3_aggregation'].testlar) {
    it(`${t.aggregation}(${t.source_field}) = ${t.kutilgan}`, () => {
      expect(aggregate(lines, t.aggregation, t.source_field).toNumber()).toBe(t.kutilgan);
    });
  }
});

describe('4. Filtrlar — Yetkazib berish (qoidalar AND, natijalar qo\'shiladi)', () => {
  const section = cases['4_filtrlar_yetkazib_berish'];
  const lines: SalesLineForCalculation[] = section.sales_lines.map(
    (l: { product: string; price_type: string; amount: number }) => ({
      employeeId: 'EMP100',
      productId: l.product,
      priceTypeId: l.price_type,
      amount: l.amount,
    }),
  );
  const FIELD_MAP: Record<string, string> = { product: 'product_id', price_type: 'price_type_id' };
  const toFilters = (raw: [string, string, unknown][]): RuleFilter[] =>
    raw.map(([field, operator, values]) => ({ fieldName: FIELD_MAP[field], operator, values }));

  const ruleInputs = section.rules.map((rule: { filters: [string, string, unknown][]; percent: number }) => {
    const fact = calculateFact(lines, {
      scope: 'OWN',
      employeeId: 'EMP100',
      filters: toFilters(rule.filters),
      aggregation: 'SUM',
      sourceField: 'amount',
    });
    return { calculationType: 'RESULT_PERCENTAGE', fact, configuration: { percent: rule.percent } };
  });

  section.rules.forEach((rule: { name: string; kutilgan: number }, i: number) => {
    it(`${rule.name} → ${rule.kutilgan}`, () => {
      expect(roundMoney(calculateKpiRule(ruleInputs[i]).amount).toNumber()).toBe(rule.kutilgan);
    });
  });

  it(`KPI jami = ${section.kpi_jami}`, () => {
    expect(calculateKpi(ruleInputs).amount.toNumber()).toBe(section.kpi_jami);
  });
});

describe('5. PER_UNIT', () => {
  for (const t of cases['5_per_unit'].testlar) {
    it(`${t.fact_quantity} dona × ${t.rate_per_unit} = ${t.kutilgan}, plan kerak emas`, () => {
      const r = calculateKpiRule({
        calculationType: 'PER_UNIT',
        fact: t.fact_quantity,
        plan: null,
        configuration: { rate_per_unit: t.rate_per_unit },
      });
      expect(roundMoney(r.amount).toNumber()).toBe(t.kutilgan);
      expect(r.achievementPercent).toBeNull();
    });
  }
});

describe('6. TEAM scope', () => {
  for (const t of cases['6_team_scope'].testlar) {
    it(`${t.operator} jamoasi fakti = ${t.kutilgan_fact}`, () => {
      const members = t.jamoa as { employee_id: string; manager_id: string; amount: number }[];
      const lines: SalesLineForCalculation[] = [
        ...members.map((m) => ({ employeeId: m.employee_id, amount: m.amount })),
        // Operatorning o'z savdosi TEAM faktiga kirmasligi kerak:
        { employeeId: t.operator, amount: 5_000_000 },
      ];
      const teamMemberIds = members.filter((m) => m.manager_id === t.operator).map((m) => m.employee_id);

      const fact = calculateFact(lines, {
        scope: 'TEAM',
        employeeId: t.operator,
        teamMemberIds,
        filters: [],
        aggregation: 'SUM',
        sourceField: 'amount',
      });
      expect(fact.toNumber()).toBe(t.kutilgan_fact);
    });
  }
});

describe('7. Plan tekshiruvi', () => {
  const extras: Record<string, object> = {
    STEP: { baseAmount: 1000, steps: [{ minPercent: 70, coefficient: 2 }] },
    LINEAR: { baseAmount: 1000 },
    PER_UNIT: { configuration: { rate_per_unit: 1 } },
    RESULT_PERCENTAGE: { configuration: { percent: 1 } },
  };

  for (const t of cases['7_plan_tekshiruvi'].testlar) {
    it(`${t.calculation_type}, plan = ${t.plan} → ${t.kutilgan}`, () => {
      const run = () =>
        calculateKpiRule({ calculationType: t.calculation_type, plan: t.plan, fact: 100, ...extras[t.calculation_type] });
      if (String(t.kutilgan).startsWith('Validation error')) {
        expect(run).toThrow(CalculationError);
      } else {
        expect(run).not.toThrow();
      }
    });
  }
});

describe('8. Import turlari va versiyalar', () => {
  it('har bir import_type o\'z ACTIVE versiyasiga ega', () => {
    const batches: ExistingImportBatch[] = [];
    const upload = (importType: string) => {
      const plan = planImportActivation(batches, 'P1', importType);
      for (const b of batches) if (plan.batchIdsToArchive.includes(b.id)) b.status = 'ARCHIVED';
      batches.push({
        id: `${importType}-v${plan.newVersionNumber}`,
        periodId: 'P1',
        importType,
        versionNumber: plan.newVersionNumber,
        status: 'ACTIVE',
      });
    };
    const statusOf = (id: string) => batches.find((b) => b.id === id)?.status;

    upload('SALES');
    expect(statusOf('SALES-v1')).toBe('ACTIVE');

    upload('PLANS');
    expect(statusOf('SALES-v1')).toBe('ACTIVE');
    expect(statusOf('PLANS-v1')).toBe('ACTIVE');

    upload('SALES');
    expect(statusOf('SALES-v1')).toBe('ARCHIVED');
    expect(statusOf('SALES-v2')).toBe('ACTIVE');
    expect(statusOf('PLANS-v1')).toBe('ACTIVE');
    expect(batches).toHaveLength(3); // hech narsa o'chirilmadi
  });
});
