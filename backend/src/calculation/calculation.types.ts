import type { Decimal, DecimalInput } from './decimal';

/**
 * ERD: kpi_definitions.calculation_type.
 * Yangi tur qo'shish = yangi calculator yozish + registry'ga qo'shish (dasturchi ishi).
 */
export const CALCULATION_TYPES = [
  'STEP',
  'LINEAR',
  'RESULT_PERCENTAGE',
  'PER_UNIT',
  'FIXED',
  'MANUAL',
] as const;
export type CalculationType = (typeof CALCULATION_TYPES)[number];

/** ERD: kpi_rule_steps qatori. Foizlar "70" = 70% ko'rinishida. */
export interface StepTierInput {
  minPercent: DecimalInput;
  maxPercent?: DecimalInput | null;
  /** 1% bajarilish uchun to'lovga necha % qo'shiladi (2 → +2%). */
  coefficient: DecimalInput;
  /** Shu pog'onadan olinadigan maksimal to'lov foizi (20 → 20%). */
  maxRewardPercent?: DecimalInput | null;
}

/** ERD: kpi_rules.configuration (jsonb). Kalitlar snake_case — DB bilan bir xil. */
export type RuleConfiguration = Record<string, unknown>;

/** Bitta KPI qoidasini hisoblash uchun kirish ma'lumotlari. */
export interface KpiRuleCalculationInput {
  calculationType: string;
  /** kpi_plans.plan_value — STEP/LINEAR va min_achievement'li FIXED uchun majburiy. */
  plan?: DecimalInput | null;
  /** kpi_facts.fact_value (yoki shu qoida filtri bo'yicha hisoblangan fakt). */
  fact?: DecimalInput | null;
  /** kpi_plans.base_amount — STEP/LINEAR uchun 100% to'lov summasi. */
  baseAmount?: DecimalInput | null;
  configuration?: RuleConfiguration | null;
  steps?: readonly StepTierInput[];
  /** MANUAL turi uchun qo'lda kiritilgan summa. */
  manualAmount?: DecimalInput | null;
}

/**
 * Jim o'tkazilmasligi kerak, lekin hisobni to'xtatmaydigan holatlar — review ekranida ko'rsatiladi.
 *   NEGATIVE_FACT — fakt manfiy (qaytarishlar sotuvdan ko'p), qoida to'lovi 0 ga tenglashtirildi.
 */
export type KpiRuleWarning = 'NEGATIVE_FACT';

/** Hisoblangan qoida natijasi. */
export interface KpiRuleCalculationResult {
  calculationType: CalculationType;
  /** fact / plan × 100. Plan ishlatilmaydigan turlarda null. */
  achievementPercent: Decimal | null;
  /** Bazadan olinadigan to'lov foizi (STEP/LINEAR). Boshqalarda null. */
  payoutPercent: Decimal | null;
  /** Yaxlitlanmagan aniq summa (Excel bilan tiyingacha solishtirish uchun). */
  amount: Decimal;
  /** Butun so'mgacha yaxlitlangan summa — kpi_result_rules.amount. */
  roundedAmount: Decimal;
  warnings: KpiRuleWarning[];
}
