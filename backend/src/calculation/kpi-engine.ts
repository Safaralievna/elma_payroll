import { CalculationError } from './calculation.errors';
import type { KpiRuleCalculationInput, KpiRuleCalculationResult, KpiRuleWarning } from './calculation.types';
import { getCalculator } from './calculators/calculator.registry';
import { Decimal, HUNDRED, roundMoney, sumDecimals, toDecimalOrNull } from './decimal';

/**
 * Achievement = fact / plan × 100.
 * Faqat plan ishlatiladigan qoidalar (STEP, LINEAR, min_achievement'li FIXED) uchun chaqiriladi.
 * Plan yo'q yoki ≤ 0 bo'lsa — validatsiya xatosi (0 ga bo'linmaydi, jim o'tkazilmaydi).
 */
export function calculateAchievementPercent(plan: Decimal | null, fact: Decimal): Decimal {
  if (plan === null) {
    throw new CalculationError('PLAN_REQUIRED', 'Bu KPI uchun plan kiritilmagan');
  }
  if (plan.lte(0)) {
    throw new CalculationError('PLAN_NOT_POSITIVE', "Plan 0 dan katta bo'lishi kerak", {
      plan: plan.toString(),
    });
  }
  return fact.div(plan).times(HUNDRED);
}

/**
 * Bitta KPI qoidasini hisoblaydi.
 *
 * Tartib (flowchart K1–K10):
 *   1. calculation type bo'yicha calculator tanlanadi;
 *   2. plan kerak bo'lsa: plan > 0 tekshiriladi, achievement hisoblanadi;
 *   3. baza kerak bo'lsa (STEP, LINEAR) — mavjudligi tekshiriladi;
 *   4. calculator summani hisoblaydi; `roundedAmount` — butun so'mgacha (DECISIONS 1).
 */
export function calculateKpiRule(input: KpiRuleCalculationInput): KpiRuleCalculationResult {
  const calculator = getCalculator(input.calculationType);

  const plan = toDecimalOrNull(input.plan);
  const fact = toDecimalOrNull(input.fact);
  const baseAmount = toDecimalOrNull(input.baseAmount);
  const manualAmount = toDecimalOrNull(input.manualAmount);

  const configuration = input.configuration ?? {};
  const planRequired = calculator.requiresPlan(configuration);
  const needsFact = planRequired || (calculator.type !== 'FIXED' && calculator.type !== 'MANUAL');
  if (needsFact && fact === null) {
    throw new CalculationError('FACT_REQUIRED', 'Fakt qiymati yo\'q');
  }
  // Manfiy fakt xato emas (DECISIONS 2.3): to'lov calculator ichida 0 dan kam bo'lmaydi.
  const warnings: KpiRuleWarning[] = fact !== null && fact.isNegative() ? ['NEGATIVE_FACT'] : [];

  let achievementPercent: Decimal | null = null;
  if (planRequired) {
    achievementPercent = calculateAchievementPercent(plan, fact as Decimal);
  }
  if (calculator.requiresBaseAmount && baseAmount === null) {
    throw new CalculationError('BASE_AMOUNT_REQUIRED', 'Baza summa (base_amount) kiritilmagan');
  }

  const output = calculator.calculate({
    plan,
    fact,
    baseAmount,
    achievementPercent,
    configuration,
    steps: input.steps ?? [],
    manualAmount,
  });

  return {
    calculationType: calculator.type,
    achievementPercent,
    payoutPercent: output.payoutPercent,
    amount: output.amount,
    roundedAmount: roundMoney(output.amount),
    warnings,
  };
}

export interface KpiCalculationResult {
  /** Har bir qoida — kpi_result_rules qatori (amount = roundedAmount). */
  rules: KpiRuleCalculationResult[];
  /** kpi_results.kpi_amount — yaxlitlangan qoida qatorlari yig'indisi. */
  amount: Decimal;
}

/**
 * Bitta KPI = bir yoki bir nechta qoida. Qoidalar natijalari QO'SHILADI
 * (test_cases.json, 4-bo'lim: Ekspeditor 5% + 10% + 2%).
 * Har qoida alohida yaxlitlanadi, KPI = yaxlitlangan qatorlar yig'indisi —
 * hisob varag'idagi qatorlar yig'indisi doim jamiga teng (DECISIONS 1).
 */
export function calculateKpi(rules: readonly KpiRuleCalculationInput[]): KpiCalculationResult {
  const results = rules.map(calculateKpiRule);
  return { rules: results, amount: sumDecimals(results.map((r) => r.roundedAmount)) };
}
