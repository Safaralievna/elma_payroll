/**
 * Muvofiqlik: Excel'dagi KPI'lar konstruktorda qanday tuzilishi (DECISIONS 2.2) —
 * validatsiyadan o'tadi va hisoblash yadrosida Excel natijasini beradi.
 *
 * - Savdo vakili: har bir Excel qatori — alohida STEP KPI (bitta qoida);
 *   "tashkilotlar 1%" — alohida RESULT_PERCENTAGE KPI.
 * - Ekspeditor: 2 ta KPI — "Savdodan %" (RESULT_PERCENTAGE, 3 qoida) va "Logo salfetka" (PER_UNIT).
 */
import {
  calculateKpi,
  calculateKpiRuleFacts,
  roundMoney,
  type KpiRuleCalculationInput,
  type SalesLineForCalculation,
} from '../../calculation';
import { readFileSync } from 'fs';
import { join } from 'path';
import { KpiShape, RuleShape, StepShape, validateKpiConfig } from '../kpi-config';

interface Fixture {
  '4_filtrlar_yetkazib_berish': {
    sales_lines: { product: string; price_type: string; amount: number }[];
    rules: { kutilgan: number }[];
    kpi_jami: number;
  };
  '5_per_unit': { testlar: { fact_quantity: number; rate_per_unit: number; kutilgan: number }[] };
}
const cases = JSON.parse(readFileSync(join(__dirname, '../../../test/fixtures/test_cases.json'), 'utf8')) as Fixture;

const EXCEL_STEPS: StepShape[] = [
  { minPercent: '70', maxPercent: '80', coefficient: '2', maxRewardPercent: '20' },
  { minPercent: '80', maxPercent: '90', coefficient: '3', maxRewardPercent: '30' },
  { minPercent: '90', maxPercent: '100', coefficient: '5', maxRewardPercent: '50' },
  { minPercent: '100', maxPercent: '150', coefficient: '1', maxRewardPercent: '50' },
];

// [plan, fakt, baza] — excel-reference.spec.ts dagi 17 qator.
const SALES_REP_ROWS: [number, number, number][] = [
  [1_450_000, 1_171_000, 2_000_000],
  [400_000, 300_000, 200_000],
  [600_000, 600_000, 200_000],
  [200_000, 21_000, 200_000],
  [140_000, 140_000, 200_000],
  [110_000, 110_000, 200_000],
  [440, 520, 100_000],
  [300, 210, 100_000],
  [950, 960, 100_000],
  [117, 128, 100_000],
  [200, 230, 100_000],
  [40, 30, 100_000],
  [20, 30, 100_000],
  [70, 60, 100_000],
  [50, 51, 200_000],
  [50, 49, 200_000],
  [100_000, 95_000, 300_000],
];

const base = { scope: 'OWN', teamLinkType: null, factSource: 'EXCEL' } as const;
const STEP_KPI: KpiShape = { ...base, calculationType: 'STEP', aggregation: 'SUM', sourceField: 'amount' };
const ORGANIZATIONS_KPI: KpiShape = { ...base, calculationType: 'RESULT_PERCENTAGE', aggregation: 'SUM', sourceField: 'amount' };

function rule(index: number, overrides: Partial<RuleShape>): RuleShape {
  return { path: `rules.${index}`, priority: index + 1, isActive: true, configuration: {}, steps: [], filters: [], ...overrides };
}

/** Konstruktordagi qoida → yadro kirishi (plan/fakt/baza servisdan keladi). */
function ruleInput(kpi: KpiShape, ruleShape: RuleShape, values: Partial<KpiRuleCalculationInput>): KpiRuleCalculationInput {
  return { calculationType: kpi.calculationType, configuration: ruleShape.configuration, steps: ruleShape.steps, ...values };
}

describe("Savdo vakili — har bir Excel qatori alohida KPI", () => {
  const stepRule = rule(0, { steps: EXCEL_STEPS });
  const organizationsRule = rule(0, { configuration: { percent: '1' } });

  it("har bir STEP KPI (bitta qoida) va tashkilotlar KPI'si validatsiyadan o'tadi", () => {
    expect(validateKpiConfig(STEP_KPI, [stepRule])).toEqual([]);
    expect(validateKpiConfig(ORGANIZATIONS_KPI, [organizationsRule])).toEqual([]);
  });

  it('KPI jami = 2 325 297 (excel-reference.spec.ts bilan bir xil)', () => {
    const stepKpis = SALES_REP_ROWS.map(([plan, fact, baseAmount]) =>
      calculateKpi([ruleInput(STEP_KPI, stepRule, { plan, fact, baseAmount })]).amount,
    );
    const organizations = calculateKpi([ruleInput(ORGANIZATIONS_KPI, organizationsRule, { fact: 1_000_000 })]).amount;
    const total = [...stepKpis, organizations].reduce((sum, amount) => sum.plus(amount));
    expect(total.toNumber()).toBe(2_325_297);
  });

  it("ikki qatorni bitta STEP KPI'ga ikki qoida qilib qo'yish — xato (baza ikki marta to'lanardi)", () => {
    const issues = validateKpiConfig(STEP_KPI, [
      rule(0, { steps: EXCEL_STEPS, filters: [{ fieldName: 'product_group_id', operator: '=', values: ['1'] }] }),
      rule(1, { steps: EXCEL_STEPS, filters: [{ fieldName: 'product_group_id', operator: '=', values: ['2'] }] }),
    ]);
    expect(issues.map((issue) => issue.path)).toEqual(['rules']);
  });
});

describe('Ekspeditor — 2 ta KPI', () => {
  // Fixture'dagi kodlar → ID'lar (filtr qiymatlari — ID, DECISIONS 2.2).
  const PRICE_TYPE_ID: Record<string, string> = { ULGURJI: '1', CHAKANA: '2' };
  const LOGO_NAPKIN = '501';
  const section = cases['4_filtrlar_yetkazib_berish'];
  const perUnit = cases['5_per_unit'].testlar[0];

  const lines: SalesLineForCalculation[] = [
    ...section.sales_lines.map((line) => ({
      employeeId: 'EXP1',
      productId: line.product,
      priceTypeId: PRICE_TYPE_ID[line.price_type],
      amount: line.amount,
      quantity: 10,
    })),
    { employeeId: 'EXP1', productId: LOGO_NAPKIN, priceTypeId: '1', amount: 0, quantity: perUnit.fact_quantity },
    { employeeId: 'EXP2', productId: LOGO_NAPKIN, priceTypeId: '1', amount: 0, quantity: 999 },
  ];
  // Logo salfetka qatori "Savdodan %" ga ta'sir qilmasin — summasi 0.

  const SALES_PERCENT_KPI: KpiShape = { ...base, calculationType: 'RESULT_PERCENTAGE', aggregation: 'SUM', sourceField: 'amount' };
  const salesPercentRules: RuleShape[] = [
    rule(0, {
      configuration: { percent: '5' },
      filters: [
        { fieldName: 'price_type_id', operator: '=', values: ['1'] },
        { fieldName: 'product_id', operator: 'NOT_IN', values: ['407'] },
      ],
    }),
    rule(1, {
      configuration: { percent: '10' },
      filters: [
        { fieldName: 'price_type_id', operator: '=', values: ['2'] },
        { fieldName: 'product_id', operator: 'NOT_IN', values: ['407'] },
      ],
    }),
    rule(2, { configuration: { percent: '2' }, filters: [{ fieldName: 'product_id', operator: 'IN', values: ['407'] }] }),
  ];

  const LOGO_KPI: KpiShape = { ...base, calculationType: 'PER_UNIT', aggregation: 'SUM', sourceField: 'quantity' };
  const logoRule = rule(0, {
    configuration: { rate_per_unit: String(perUnit.rate_per_unit) },
    filters: [{ fieldName: 'product_id', operator: '=', values: [LOGO_NAPKIN] }],
  });

  function calculate(kpi: KpiShape, rules: RuleShape[]) {
    const facts = calculateKpiRuleFacts(lines, {
      scope: kpi.scope,
      employeeId: 'EXP1',
      aggregation: kpi.aggregation as string,
      sourceField: kpi.sourceField as string,
      rules: rules.map((r, i) => ({ ruleId: String(i), priority: r.priority, filters: r.filters })),
    });
    return calculateKpi(rules.map((r, i) => ruleInput(kpi, r, { fact: facts[i].fact })));
  }

  it("ikkala KPI validatsiyadan o'tadi", () => {
    expect(validateKpiConfig(SALES_PERCENT_KPI, salesPercentRules)).toEqual([]);
    expect(validateKpiConfig(LOGO_KPI, [logoRule])).toEqual([]);
  });

  it(`"Savdodan %": qoidalar ${section.rules.map((r) => r.kutilgan).join(' + ')} = ${section.kpi_jami}`, () => {
    const result = calculate(SALES_PERCENT_KPI, salesPercentRules);
    expect(result.rules.map((r) => roundMoney(r.amount).toNumber())).toEqual(section.rules.map((r) => r.kutilgan));
    expect(result.amount.toNumber()).toBe(section.kpi_jami);
  });

  it(`"Logo salfetka": ${perUnit.fact_quantity} dona × ${perUnit.rate_per_unit} = ${perUnit.kutilgan}`, () => {
    expect(calculate(LOGO_KPI, [logoRule]).amount.toNumber()).toBe(perUnit.kutilgan);
  });
});
