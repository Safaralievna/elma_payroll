import {
  AGGREGATIONS,
  CALCULATION_TYPES,
  Decimal,
  FILTER_OPERATORS,
  isSalesLineField,
  requiresPlan,
  TEAM_LINK_TYPES,
  toDecimal,
} from '../calculation';

/**
 * KPI konstruktor konfiguratsiyasini tekshirish — toza funksiya (bazaga bog'liq emas).
 *
 * Maqsad: hisoblash yadrosi (8-bosqich) qabul qilmaydigan yoki noaniq natija
 * beradigan konfiguratsiya bazaga tushmasin. Hamma xatolar bitta ro'yxatda
 * qaytadi (`path` — so'rovdagi maydon yo'li), servis ularni 400 INVALID_CONFIGURATION
 * qilib beradi. Qoidalar: DECISIONS 2.1, 2.2, 2.5.
 *
 * Filtrdagi ID'lar bazada borligi — servisda tekshiriladi.
 */

/** DECISIONS 2.5: ERP (Smartup API) MVP'da yo'q. */
export const FACT_SOURCES = ['EXCEL', 'MANUAL'] as const;
export const SCOPES = ['OWN', 'TEAM'] as const;

/** Son maydonlar: faqat taqqoslash (>, >=, <, <=); qolganlari ID — faqat =, !=, IN, NOT_IN. */
const NUMERIC_FIELDS = ['amount', 'quantity'];
const COMPARISON_OPERATORS = ['>', '>=', '<', '<='];
const LIST_OPERATORS = ['IN', 'NOT_IN'];
const ID_VALUE = /^\d{1,18}$/;

/** configuration kalitlari: true — majburiy, false — ixtiyoriy. Qiymatlar — son, ≥ 0. */
const CONFIG_KEYS: Record<string, Record<string, boolean>> = {
  STEP: {},
  LINEAR: { min_percent: false, max_percent: false },
  RESULT_PERCENTAGE: { percent: true },
  PER_UNIT: { rate_per_unit: true },
  FIXED: { amount: true, min_achievement: false },
  MANUAL: {},
};

export interface KpiShape {
  calculationType: string;
  aggregation: string | null;
  sourceField: string | null;
  scope: string;
  teamLinkType: string | null;
  factSource: string;
}

export interface StepShape {
  minPercent: string;
  maxPercent: string | null;
  coefficient: string;
  maxRewardPercent: string | null;
}

export interface FilterShape {
  fieldName: string;
  operator: string;
  values: string[];
}

export interface RuleShape {
  /** Xato yo'lining boshi: "rules.0", "rules.15" yoki "" (so'rov tanasining o'zi qoida bo'lsa). */
  path: string;
  priority: number;
  isActive: boolean;
  configuration: Record<string, unknown>;
  steps: StepShape[];
  filters: FilterShape[];
}

export interface ConfigIssue {
  path: string;
  message: string;
}

export function validateKpiConfig(kpi: KpiShape, rules: readonly RuleShape[]): ConfigIssue[] {
  const issues: ConfigIssue[] = [];
  const add = (path: string, message: string) => issues.push({ path, message });

  checkDefinition(kpi, add);
  const typeKnown = (CALCULATION_TYPES as readonly string[]).includes(kpi.calculationType);

  for (const rule of rules) {
    const at = (field: string) => (rule.path ? `${rule.path}.${field}` : field);
    if (typeKnown) {
      checkConfiguration(kpi.calculationType, rule.configuration, at, add);
      checkSteps(kpi.calculationType, rule.steps, at, add);
    }
    checkFilters(rule.filters, at, add);
    if (kpi.factSource === 'MANUAL' && rule.filters.length > 0) {
      add(at('filters'), "Fakt qo'lda kiritiladigan KPI'da filtr bo'lmaydi — savdo qatorlari ishlatilmaydi");
    }
  }

  checkPriorities(rules, add);
  if (typeKnown) checkActiveRules(kpi.calculationType, rules, add);
  return issues;
}

/** configuration qiymatlari → Decimal satri ("5", "500000.5"). validateKpiConfig'dan keyin chaqiriladi. */
export function normalizeConfiguration(configuration: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(configuration).map(([key, value]) => [key, toDecimal(value as string | number).toString()]),
  );
}

// ---------------------------------------------------------------------------

type Add = (path: string, message: string) => void;
type At = (field: string) => string;

function checkDefinition(kpi: KpiShape, add: Add): void {
  if (!(CALCULATION_TYPES as readonly string[]).includes(kpi.calculationType)) {
    add('calculationType', `Noma'lum hisoblash turi: ${kpi.calculationType}`);
  }

  if (!(SCOPES as readonly string[]).includes(kpi.scope)) {
    add('scope', `scope faqat ${SCOPES.join(' / ')} bo'ladi`);
  } else if (kpi.scope === 'TEAM') {
    if (kpi.teamLinkType === null || !(TEAM_LINK_TYPES as readonly string[]).includes(kpi.teamLinkType)) {
      add('teamLinkType', `TEAM KPI'da havola turi majburiy: ${TEAM_LINK_TYPES.join(' / ')}`);
    }
  } else if (kpi.teamLinkType !== null) {
    add('teamLinkType', "Havola turi faqat TEAM KPI'da bo'ladi");
  }

  if (!(FACT_SOURCES as readonly string[]).includes(kpi.factSource)) {
    add('factSource', `Fakt manbasi faqat ${FACT_SOURCES.join(' / ')} bo'ladi`);
    return;
  }

  const usesSales = kpi.factSource === 'EXCEL' && kpi.calculationType !== 'MANUAL';
  if (kpi.factSource === 'EXCEL' && !usesSales) {
    // MANUAL turida fakt ishlatilmaydi — savdo qatorlaridan fakt kerak emas.
    add('aggregation', "MANUAL turidagi KPI'da fakt manbasi MANUAL bo'ladi");
    add('sourceField', "MANUAL turidagi KPI'da fakt manbasi MANUAL bo'ladi");
    return;
  }
  if (!usesSales) {
    if (kpi.aggregation !== null) add('aggregation', "Fakt savdo qatorlaridan olinmasa, aggregation bo'sh bo'ladi");
    if (kpi.sourceField !== null) add('sourceField', "Fakt savdo qatorlaridan olinmasa, source_field bo'sh bo'ladi");
    return;
  }

  if (kpi.aggregation === null) {
    add('aggregation', "Fakt Excel savdosidan olinadi — aggregation majburiy");
  } else if (!(AGGREGATIONS as readonly string[]).includes(kpi.aggregation)) {
    add('aggregation', `Noma'lum aggregation: ${kpi.aggregation}`);
  }
  if (kpi.sourceField === null) {
    add('sourceField', "Fakt Excel savdosidan olinadi — source_field majburiy");
  } else if (!isSalesLineField(kpi.sourceField)) {
    add('sourceField', `Noma'lum source_field: ${kpi.sourceField}`);
  } else if (kpi.aggregation !== null && (AGGREGATIONS as readonly string[]).includes(kpi.aggregation)) {
    const numeric = NUMERIC_FIELDS.includes(kpi.sourceField);
    if (kpi.aggregation === 'SUM' && !numeric) {
      add('sourceField', `SUM faqat ${NUMERIC_FIELDS.join(' / ')} uchun`);
    }
    if (kpi.aggregation !== 'SUM' && numeric) {
      add('sourceField', `${kpi.aggregation} faqat ID maydonlar uchun (masalan, client_id)`);
    }
  }
}

function checkConfiguration(type: string, configuration: Record<string, unknown>, at: At, add: Add): void {
  const allowed = CONFIG_KEYS[type];
  const values = new Map<string, Decimal>();

  for (const [key, raw] of Object.entries(configuration)) {
    if (!(key in allowed)) {
      add(at(`configuration.${key}`), `${type} turida "${key}" parametri yo'q`);
      continue;
    }
    const value = readNumber(raw);
    if (value === null) add(at(`configuration.${key}`), `"${key}" son bo'lishi kerak`);
    else if (value.isNegative()) add(at(`configuration.${key}`), `"${key}" manfiy bo'lmasligi kerak`);
    else values.set(key, value);
  }
  for (const [key, required] of Object.entries(allowed)) {
    if (required && configuration[key] === undefined) {
      add(at(`configuration.${key}`), `${type} turida "${key}" majburiy`);
    }
  }

  const min = values.get('min_percent');
  const max = values.get('max_percent');
  if (min && max && max.lte(min)) {
    add(at('configuration.max_percent'), "max_percent min_percent'dan katta bo'lishi kerak");
  }
}

function checkSteps(type: string, steps: readonly StepShape[], at: At, add: Add): void {
  if (type !== 'STEP') {
    if (steps.length > 0) add(at('steps'), "Pog'onalar faqat STEP turida bo'ladi");
    return;
  }
  if (steps.length === 0) {
    add(at('steps'), "STEP qoidasida kamida bitta pog'ona bo'lishi kerak");
    return;
  }

  const seenMin = new Set<string>();
  steps.forEach((step, index) => {
    const path = (field: string) => at(`steps.${index}.${field}`);
    const min = readNumber(step.minPercent);
    const max = step.maxPercent === null ? null : readNumber(step.maxPercent);
    const coefficient = readNumber(step.coefficient);
    const cap = step.maxRewardPercent === null ? null : readNumber(step.maxRewardPercent);

    if (min === null) add(path('minPercent'), "minPercent son bo'lishi kerak");
    else if (seenMin.has(min.toString())) add(path('minPercent'), `minPercent = ${min} takrorlangan`);
    else seenMin.add(min.toString());

    if (step.maxPercent !== null && max === null) add(path('maxPercent'), "maxPercent son bo'lishi kerak");
    else if (min !== null && max !== null && max.lte(min)) add(path('maxPercent'), "maxPercent minPercent'dan katta bo'lishi kerak");

    if (coefficient === null) add(path('coefficient'), "coefficient son bo'lishi kerak");
    else if (coefficient.isNegative()) add(path('coefficient'), "coefficient manfiy bo'lmasligi kerak");

    if (step.maxRewardPercent !== null && cap === null) add(path('maxRewardPercent'), "maxRewardPercent son bo'lishi kerak");
    else if (cap !== null && cap.isNegative()) add(path('maxRewardPercent'), "maxRewardPercent manfiy bo'lmasligi kerak");
  });
}

function checkFilters(filters: readonly FilterShape[], at: At, add: Add): void {
  filters.forEach((filter, index) => {
    const path = (field: string) => at(`filters.${index}.${field}`);
    if (!isSalesLineField(filter.fieldName)) {
      add(path('fieldName'), `Noma'lum filtr maydoni: ${filter.fieldName}`);
      return;
    }
    if (!(FILTER_OPERATORS as readonly string[]).includes(filter.operator)) {
      add(path('operator'), `Noma'lum operator: ${filter.operator}`);
      return;
    }

    const numeric = NUMERIC_FIELDS.includes(filter.fieldName);
    if (numeric !== COMPARISON_OPERATORS.includes(filter.operator)) {
      add(
        path('operator'),
        numeric
          ? `${filter.fieldName} uchun faqat ${COMPARISON_OPERATORS.join(' ')} operatorlari`
          : `${filter.fieldName} uchun faqat =, !=, IN, NOT_IN operatorlari`,
      );
      return;
    }

    const values = filter.values;
    if (LIST_OPERATORS.includes(filter.operator)) {
      if (values.length === 0) return add(path('values'), `${filter.operator} kamida bitta qiymat talab qiladi`);
      if (new Set(values).size !== values.length) return add(path('values'), 'Qiymatlar takrorlanmasligi kerak');
    } else if (values.length !== 1) {
      return add(path('values'), `"${filter.operator}" bitta qiymat talab qiladi`);
    }

    if (numeric) {
      if (values.some((value) => readNumber(value) === null)) add(path('values'), "Qiymat son bo'lishi kerak");
    } else if (values.some((value) => !ID_VALUE.test(value))) {
      add(path('values'), "Qiymatlar — ID (musbat butun son), kod emas");
    }
  });
}

/** DECISIONS 2.2: priority butun, ≥ 1, KPI ichida takrorlanmaydi (nofaol qoidalar ham). */
function checkPriorities(rules: readonly RuleShape[], add: Add): void {
  const seen = new Set<number>();
  for (const rule of rules) {
    const path = rule.path ? `${rule.path}.priority` : 'priority';
    if (!Number.isInteger(rule.priority) || rule.priority < 1) {
      add(path, "priority musbat butun son bo'lishi kerak");
    } else if (seen.has(rule.priority)) {
      add(path, `priority = ${rule.priority} shu KPI'da band`);
    } else {
      seen.add(rule.priority);
    }
  }
}

/**
 * DECISIONS 2.2:
 * - kamida bitta faol qoida;
 * - plan ishlatadigan turlar va MANUAL — faqat bitta faol qoida (plan va baza KPI uchun bitta);
 * - oldida filtrsiz faol qoida turgan faol qoida hech qachon ishlamaydi.
 */
function checkActiveRules(type: string, rules: readonly RuleShape[], add: Add): void {
  const active = rules.filter((rule) => rule.isActive);
  if (active.length === 0) {
    add('rules', "KPI'da kamida bitta faol qoida bo'lishi kerak");
    return;
  }

  const singleRule = type === 'MANUAL' || active.some((rule) => planNeeded(type, rule.configuration));
  if (singleRule) {
    if (active.length > 1) {
      add('rules', `${type} KPI'da faqat bitta faol qoida bo'ladi: plan va baza summa KPI uchun bitta`);
    }
    return;
  }

  const ordered = [...active].sort((a, b) => a.priority - b.priority);
  const catchAll = ordered.find((rule) => rule.filters.length === 0);
  if (!catchAll) return;
  for (const rule of ordered) {
    if (rule.priority > catchAll.priority) {
      add(
        rule.path ? `${rule.path}.priority` : 'priority',
        `priority = ${catchAll.priority} dagi filtrsiz qoida hamma qatorni oladi — bu qoida hech qachon ishlamaydi`,
      );
    }
  }
}

function planNeeded(type: string, configuration: Record<string, unknown>): boolean {
  // Konfiguratsiyadagi xato alohida ko'rsatiladi; bu yerda faqat "plan kerakmi".
  try {
    return requiresPlan(type, configuration);
  } catch {
    return configuration.min_achievement !== undefined;
  }
}

/** Oddiy o'nlik son ("5", "-1", "0.005"); decimal.js qabul qiladigan "0x10", "1e5" — yo'q. */
const DECIMAL_TEXT = /^-?\d{1,18}(\.\d{1,10})?$/;

function readNumber(raw: unknown): Decimal | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? toDecimal(raw) : null;
  return typeof raw === 'string' && DECIMAL_TEXT.test(raw) ? toDecimal(raw) : null;
}
