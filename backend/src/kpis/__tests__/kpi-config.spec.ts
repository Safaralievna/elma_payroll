import {
  ConfigIssue,
  KpiShape,
  normalizeConfiguration,
  RuleShape,
  StepShape,
  validateKpiConfig,
} from '../kpi-config';

/** Seed'dagi SALES_VOLUME — Excel ("Торговый представитель") pog'onalari. */
const EXCEL_STEPS: StepShape[] = [
  { minPercent: '70', maxPercent: '80', coefficient: '2', maxRewardPercent: '20' },
  { minPercent: '80', maxPercent: '90', coefficient: '3', maxRewardPercent: '30' },
  { minPercent: '90', maxPercent: '100', coefficient: '5', maxRewardPercent: '50' },
  { minPercent: '100', maxPercent: '150', coefficient: '1', maxRewardPercent: '50' },
];

const STEP_KPI: KpiShape = {
  calculationType: 'STEP',
  aggregation: 'SUM',
  sourceField: 'amount',
  scope: 'OWN',
  teamLinkType: null,
  factSource: 'EXCEL',
};

const kpi = (overrides: Partial<KpiShape> = {}): KpiShape => ({ ...STEP_KPI, ...overrides });

function rule(index: number, overrides: Partial<RuleShape> = {}): RuleShape {
  return {
    path: `rules.${index}`,
    priority: index + 1,
    isActive: true,
    configuration: {},
    steps: [],
    filters: [],
    ...overrides,
  };
}

const stepRule = (index = 0, overrides: Partial<RuleShape> = {}) => rule(index, { steps: EXCEL_STEPS, ...overrides });
const percentRule = (index: number, overrides: Partial<RuleShape> = {}) =>
  rule(index, { configuration: { percent: '5' }, ...overrides });
const filter = (fieldName: string, operator: string, values: string[]) => ({ fieldName, operator, values });

const PERCENT_KPI = kpi({ calculationType: 'RESULT_PERCENTAGE' });

const paths = (issues: ConfigIssue[]) => issues.map((issue) => issue.path);

describe('validateKpiConfig — KPI darajasi', () => {
  it("seed'dagi SALES_VOLUME (STEP, SUM amount, OWN, EXCEL, 4 pog'ona) — xatosiz", () => {
    expect(validateKpiConfig(STEP_KPI, [stepRule()])).toEqual([]);
  });

  it("noma'lum hisoblash turi", () => {
    expect(paths(validateKpiConfig(kpi({ calculationType: 'BONUS' }), [rule(0)]))).toContain('calculationType');
  });

  it('TEAM — team_link_type majburiy; OWN — bo\'sh bo\'lishi kerak; faqat SUPERVISOR/OPERATOR', () => {
    expect(paths(validateKpiConfig(kpi({ scope: 'TEAM' }), [stepRule()]))).toEqual(['teamLinkType']);
    expect(paths(validateKpiConfig(kpi({ teamLinkType: 'OPERATOR' }), [stepRule()]))).toEqual(['teamLinkType']);
    expect(paths(validateKpiConfig(kpi({ scope: 'TEAM', teamLinkType: 'BOSS' }), [stepRule()]))).toEqual(['teamLinkType']);
    expect(paths(validateKpiConfig(kpi({ scope: 'ALL' }), [stepRule()]))).toEqual(['scope']);
    expect(validateKpiConfig(kpi({ scope: 'TEAM', teamLinkType: 'SUPERVISOR' }), [stepRule()])).toEqual([]);
  });

  it('fact_source — faqat EXCEL va MANUAL (ERP hozircha yo\'q)', () => {
    expect(paths(validateKpiConfig(kpi({ factSource: 'ERP' }), [stepRule()]))).toEqual(['factSource']);
  });

  it('EXCEL — aggregation va source_field majburiy', () => {
    expect(paths(validateKpiConfig(kpi({ aggregation: null }), [stepRule()]))).toEqual(['aggregation']);
    expect(paths(validateKpiConfig(kpi({ sourceField: null }), [stepRule()]))).toEqual(['sourceField']);
  });

  it("noma'lum aggregation va source_field", () => {
    expect(paths(validateKpiConfig(kpi({ aggregation: 'AVG' }), [stepRule()]))).toEqual(['aggregation']);
    expect(paths(validateKpiConfig(kpi({ sourceField: 'price' }), [stepRule()]))).toEqual(['sourceField']);
  });

  it('SUM — faqat amount/quantity; COUNT turlari — faqat ID maydonlar', () => {
    expect(paths(validateKpiConfig(kpi({ sourceField: 'client_id' }), [stepRule()]))).toEqual(['sourceField']);
    expect(validateKpiConfig(kpi({ sourceField: 'quantity' }), [stepRule()])).toEqual([]);
    expect(
      paths(validateKpiConfig(kpi({ aggregation: 'COUNT_DISTINCT_POSITIVE', sourceField: 'amount' }), [stepRule()])),
    ).toEqual(['sourceField']);
    expect(
      validateKpiConfig(kpi({ aggregation: 'COUNT_DISTINCT_POSITIVE', sourceField: 'client_id' }), [stepRule()]),
    ).toEqual([]);
  });

  it("fact_source = MANUAL — aggregation/source_field bo'sh, filtr yo'q (savdo qatorlari ishlatilmaydi)", () => {
    const manualFact = kpi({ factSource: 'MANUAL', aggregation: null, sourceField: null });
    expect(validateKpiConfig(manualFact, [stepRule()])).toEqual([]);
    expect(paths(validateKpiConfig({ ...manualFact, aggregation: 'SUM' }, [stepRule()]))).toEqual(['aggregation']);
    expect(paths(validateKpiConfig({ ...manualFact, sourceField: 'amount' }, [stepRule()]))).toEqual(['sourceField']);
    expect(
      paths(validateKpiConfig(manualFact, [stepRule(0, { filters: [filter('product_id', '=', ['1'])] })])),
    ).toEqual(['rules.0.filters']);
  });

  it("MANUAL turi: fact_source MANUAL, konfiguratsiya va pog'onasiz", () => {
    const manual = kpi({ calculationType: 'MANUAL', factSource: 'MANUAL', aggregation: null, sourceField: null });
    expect(validateKpiConfig(manual, [rule(0)])).toEqual([]);
    // EXCEL fakt MANUAL turida ishlatilmaydi — aggregation'siz EXCEL esa xato.
    expect(paths(validateKpiConfig({ ...manual, factSource: 'EXCEL' }, [rule(0)]))).toEqual([
      'aggregation',
      'sourceField',
    ]);
    expect(paths(validateKpiConfig(manual, [rule(0, { configuration: { amount: '1' } })]))).toEqual([
      'rules.0.configuration.amount',
    ]);
  });
});

describe('validateKpiConfig — qoidalar soni (DECISIONS 2.2)', () => {
  it("qoida yo'q yoki hammasi nofaol — xato", () => {
    expect(paths(validateKpiConfig(STEP_KPI, []))).toEqual(['rules']);
    expect(paths(validateKpiConfig(STEP_KPI, [stepRule(0, { isActive: false })]))).toEqual(['rules']);
  });

  it('STEP, LINEAR, MANUAL — faqat bitta faol qoida; nofaol qoida hisobga olinmaydi', () => {
    expect(paths(validateKpiConfig(STEP_KPI, [stepRule(0), stepRule(1)]))).toEqual(['rules']);
    expect(validateKpiConfig(STEP_KPI, [stepRule(0), stepRule(1, { isActive: false })])).toEqual([]);
    expect(paths(validateKpiConfig(kpi({ calculationType: 'LINEAR' }), [rule(0), rule(1)]))).toEqual(['rules']);
    const manual = kpi({ calculationType: 'MANUAL', factSource: 'MANUAL', aggregation: null, sourceField: null });
    expect(paths(validateKpiConfig(manual, [rule(0), rule(1)]))).toContain('rules');
  });

  it("FIXED: shartsiz qoidalar bir nechta bo'lishi mumkin; min_achievement bo'lsa — faqat bitta", () => {
    const fixed = kpi({ calculationType: 'FIXED' });
    const amount = (index: number, extra: object = {}) =>
      rule(index, {
        configuration: { amount: '500000', ...extra },
        filters: [filter('product_group_id', '=', [String(index + 1)])],
      });
    expect(validateKpiConfig(fixed, [amount(0), amount(1)])).toEqual([]);
    expect(paths(validateKpiConfig(fixed, [amount(0, { min_achievement: '100' }), amount(1)]))).toEqual(['rules']);
    expect(validateKpiConfig(fixed, [amount(0, { min_achievement: '100' })])).toEqual([]);
  });

  it('RESULT_PERCENTAGE va PER_UNIT — bir nechta qoida', () => {
    const rules = [
      percentRule(0, { filters: [filter('price_type_id', '=', ['1'])] }),
      percentRule(1, { filters: [filter('price_type_id', '=', ['2'])] }),
      percentRule(2),
    ];
    expect(validateKpiConfig(PERCENT_KPI, rules)).toEqual([]);
  });
});

describe('validateKpiConfig — priority', () => {
  it('KPI ichida takrorlanmaydi, nofaol qoidalar ham hisobga olinadi', () => {
    const issues = validateKpiConfig(PERCENT_KPI, [
      percentRule(0, { priority: 1, filters: [filter('product_id', '=', ['1'])] }),
      percentRule(1, { priority: 1, isActive: false }),
    ]);
    expect(paths(issues)).toEqual(['rules.1.priority']);
  });

  it('musbat butun son', () => {
    expect(paths(validateKpiConfig(PERCENT_KPI, [percentRule(0, { priority: 0 })]))).toEqual(['rules.0.priority']);
    expect(paths(validateKpiConfig(PERCENT_KPI, [percentRule(0, { priority: 1.5 })]))).toEqual(['rules.0.priority']);
  });

  it("oldida filtrsiz faol qoida bo'lsa — keyingi faol qoida hech qachon ishlamaydi (xato)", () => {
    const catchAll = percentRule(0, { priority: 1 });
    const filtered = percentRule(1, { priority: 2, filters: [filter('product_id', 'IN', ['1', '2'])] });
    expect(paths(validateKpiConfig(PERCENT_KPI, [catchAll, filtered]))).toEqual(['rules.1.priority']);
    // Filtrsiz qoida oxirida — "qolgan hamma qatorlar" ma'nosida, to'g'ri.
    expect(validateKpiConfig(PERCENT_KPI, [{ ...catchAll, priority: 3 }, filtered])).toEqual([]);
    // Nofaol filtrsiz qoida hech narsani to'smaydi.
    expect(validateKpiConfig(PERCENT_KPI, [{ ...catchAll, isActive: false }, filtered])).toEqual([]);
  });
});

describe('validateKpiConfig — configuration (hisoblash turi bo\'yicha)', () => {
  it('RESULT_PERCENTAGE: percent majburiy, son, ≥ 0', () => {
    expect(paths(validateKpiConfig(PERCENT_KPI, [rule(0)]))).toEqual(['rules.0.configuration.percent']);
    expect(paths(validateKpiConfig(PERCENT_KPI, [rule(0, { configuration: { percent: '-1' } })]))).toEqual([
      'rules.0.configuration.percent',
    ]);
    expect(paths(validateKpiConfig(PERCENT_KPI, [rule(0, { configuration: { percent: 'besh' } })]))).toEqual([
      'rules.0.configuration.percent',
    ]);
    expect(paths(validateKpiConfig(PERCENT_KPI, [rule(0, { configuration: { percent: true } })]))).toEqual([
      'rules.0.configuration.percent',
    ]);
    expect(validateKpiConfig(PERCENT_KPI, [rule(0, { configuration: { percent: 5 } })])).toEqual([]);
    expect(validateKpiConfig(PERCENT_KPI, [rule(0, { configuration: { percent: '0.5' } })])).toEqual([]);
  });

  it("noma'lum kalit — xato (masalan, \"persent\" deb yozilsa)", () => {
    const issues = validateKpiConfig(PERCENT_KPI, [rule(0, { configuration: { percent: '5', persent: '5' } })]);
    expect(paths(issues)).toEqual(['rules.0.configuration.persent']);
  });

  it('PER_UNIT: rate_per_unit majburiy', () => {
    const perUnit = kpi({ calculationType: 'PER_UNIT', sourceField: 'quantity' });
    expect(paths(validateKpiConfig(perUnit, [rule(0)]))).toEqual(['rules.0.configuration.rate_per_unit']);
    expect(validateKpiConfig(perUnit, [rule(0, { configuration: { rate_per_unit: '100' } })])).toEqual([]);
  });

  it('FIXED: amount majburiy, min_achievement ixtiyoriy ≥ 0', () => {
    const fixed = kpi({ calculationType: 'FIXED' });
    expect(paths(validateKpiConfig(fixed, [rule(0)]))).toEqual(['rules.0.configuration.amount']);
    expect(
      paths(validateKpiConfig(fixed, [rule(0, { configuration: { amount: '1', min_achievement: '-5' } })])),
    ).toEqual(['rules.0.configuration.min_achievement']);
  });

  it('LINEAR: min_percent va max_percent ixtiyoriy; ikkalasi bo\'lsa min < max', () => {
    const linear = kpi({ calculationType: 'LINEAR' });
    expect(validateKpiConfig(linear, [rule(0)])).toEqual([]);
    expect(validateKpiConfig(linear, [rule(0, { configuration: { min_percent: '50', max_percent: '120' } })])).toEqual([]);
    expect(
      paths(validateKpiConfig(linear, [rule(0, { configuration: { min_percent: '120', max_percent: '120' } })])),
    ).toEqual(['rules.0.configuration.max_percent']);
  });

  it("STEP konfiguratsiyasi bo'sh bo'ladi (parametrlar pog'onalarda)", () => {
    expect(paths(validateKpiConfig(STEP_KPI, [stepRule(0, { configuration: { percent: '5' } })]))).toEqual([
      'rules.0.configuration.percent',
    ]);
  });
});

describe("validateKpiConfig — pog'onalar", () => {
  const withSteps = (steps: StepShape[]) => paths(validateKpiConfig(STEP_KPI, [stepRule(0, { steps })]));
  const step = (overrides: Partial<StepShape> = {}): StepShape => ({
    minPercent: '70',
    maxPercent: '80',
    coefficient: '2',
    maxRewardPercent: '20',
    ...overrides,
  });

  it("STEP — kamida bitta pog'ona; boshqa turlarda pog'ona bo'lmaydi", () => {
    expect(withSteps([])).toEqual(['rules.0.steps']);
    expect(paths(validateKpiConfig(PERCENT_KPI, [percentRule(0, { steps: [step()] })]))).toEqual(['rules.0.steps']);
  });

  it('max > min, koeffitsiyent va limit ≥ 0, min takrorlanmaydi', () => {
    expect(withSteps([step({ maxPercent: '70' })])).toEqual(['rules.0.steps.0.maxPercent']);
    expect(withSteps([step({ coefficient: '-1' })])).toEqual(['rules.0.steps.0.coefficient']);
    expect(withSteps([step({ maxRewardPercent: '-1' })])).toEqual(['rules.0.steps.0.maxRewardPercent']);
    expect(withSteps([step(), step({ maxPercent: null })])).toEqual(['rules.0.steps.1.minPercent']);
    expect(withSteps([step({ minPercent: 'x' })])).toEqual(['rules.0.steps.0.minPercent']);
    expect(withSteps([step({ maxPercent: null, maxRewardPercent: null })])).toEqual([]);
  });
});

describe('validateKpiConfig — filtrlar', () => {
  const withFilters = (...filters: ReturnType<typeof filter>[]) =>
    paths(validateKpiConfig(PERCENT_KPI, [percentRule(0, { filters })]));

  it("noma'lum maydon va operator", () => {
    expect(withFilters(filter('region_id', '=', ['1']))).toEqual(['rules.0.filters.0.fieldName']);
    expect(withFilters(filter('product_id', 'LIKE', ['1']))).toEqual(['rules.0.filters.0.operator']);
  });

  it("=, != va taqqoslash — bitta qiymat; IN/NOT_IN — bo'sh emas, takrorlanmaydi", () => {
    expect(withFilters(filter('product_id', '=', ['1', '2']))).toEqual(['rules.0.filters.0.values']);
    expect(withFilters(filter('product_id', 'IN', []))).toEqual(['rules.0.filters.0.values']);
    expect(withFilters(filter('product_id', 'NOT_IN', ['407', '407']))).toEqual(['rules.0.filters.0.values']);
    expect(withFilters(filter('product_id', 'NOT_IN', ['407']), filter('price_type_id', '!=', ['2']))).toEqual([]);
  });

  it('ID maydonlar — faqat ID (raqam), kod emas (DECISIONS 2.2)', () => {
    expect(withFilters(filter('price_type_id', '=', ['ULGURJI']))).toEqual(['rules.0.filters.0.values']);
  });

  it('ID maydonlarda taqqoslash yo\'q; amount/quantity — faqat taqqoslash, qiymati son', () => {
    expect(withFilters(filter('product_id', '>', ['1']))).toEqual(['rules.0.filters.0.operator']);
    expect(withFilters(filter('amount', 'IN', ['100']))).toEqual(['rules.0.filters.0.operator']);
    expect(withFilters(filter('amount', '>', ['yuz']))).toEqual(['rules.0.filters.0.values']);
    expect(withFilters(filter('amount', '>=', ['100000.50']), filter('quantity', '<', ['10']))).toEqual([]);
  });
});

it('hamma xatolar bitta javobda qaytadi', () => {
  const issues = validateKpiConfig(kpi({ scope: 'TEAM', factSource: 'ERP' }), [
    stepRule(0, { steps: [] }),
    stepRule(1, { priority: 1, isActive: false, configuration: { x: '1' } }),
  ]);
  expect(paths(issues).sort()).toEqual(
    ['factSource', 'rules.0.steps', 'rules.1.configuration.x', 'rules.1.priority', 'teamLinkType'].sort(),
  );
  for (const issue of issues) expect(issue.message.length).toBeGreaterThan(0);
});

it("so'rov tanasidagi qoida (path = '') — xato yo'li maydon nomidan boshlanadi", () => {
  const issues = validateKpiConfig(PERCENT_KPI, [{ ...rule(0), path: '' }]);
  expect(paths(issues)).toEqual(['configuration.percent']);
});

describe('normalizeConfiguration', () => {
  it('sonlar satrga aylanadi (float xatoligi bo\'lmasligi uchun)', () => {
    expect(normalizeConfiguration({ percent: 5, amount: '500000.50', min_achievement: '100' })).toEqual({
      percent: '5',
      amount: '500000.5',
      min_achievement: '100',
    });
  });
});
