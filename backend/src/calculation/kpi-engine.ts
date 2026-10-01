import { CalculationError } from './calculation.errors';
import type { KpiRuleCalculationInput, KpiRuleCalculationResult } from './calculation.types';
import { getCalculator } from './calculators/calculator.registry';
import { Decimal, HUNDRED, roundMoney, sumDecimals, toDecimalOrNull } from './decimal';

/**
 * Achievement = fact / plan × 100.
 * Faqat plan ishlatiladigan turlar (STEP, LINEAR) uchun chaqiriladi.
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
 *   2. plan kerak bo'lsa: plan > 0 va baza tekshiriladi, achievement hisoblanadi;
 *   3. calculator summani hisoblaydi (yaxlitlanmagan).
 */
export function calculateKpiRule(input: KpiRuleCalculationInput): KpiRuleCalculationResult {
  const calculator = getCalculator(input.calculationType);

  const plan = toDecimalOrNull(input.plan);
  const fact = toDecimalOrNull(input.fact);
  const baseAmount = toDecimalOrNull(input.baseAmount);
  const manualAmount = toDecimalOrNull(input.manualAmount);

  const needsFact = calculator.type !== 'FIXED' && calculator.type !== 'MANUAL';
  if (needsFact && fact === null) {
    throw new CalculationError('FACT_REQUIRED', 'Fakt qiymati yo\'q');
  }
  if (fact !== null && fact.isNegative()) {
    throw new CalculationError('FACT_NEGATIVE', "Fakt manfiy bo'lmasligi kerak", { fact: fact.toString() });
  }

  let achievementPercent: Decimal | null = null;
  if (calculator.requiresPlan) {
    achievementPercent = calculateAchievementPercent(plan, fact as Decimal);
    if (baseAmount === null) {
      throw new CalculationError('BASE_AMOUNT_REQUIRED', 'Baza summa (base_amount) kiritilmagan');
    }
  }

  const output = calculator.calculate({
    plan,
    fact,
    baseAmount,
    achievementPercent,
    configuration: input.configuration ?? {},
    steps: input.steps ?? [],
    manualAmount,
  });

  return {
    calculationType: calculator.type,
    achievementPercent,
    payoutPercent: output.payoutPercent,
    amount: output.amount,
  };
}

export interface KpiCalculationResult {
  rules: KpiRuleCalculationResult[];
  /** Qoidalar yig'indisi, yaxlitlanmagan. */
  amountExact: Decimal;
  /** kpi_results.kpi_amount ga yoziladigan yakuniy summa. */
  amount: Decimal;
}

/**
 * Bitta KPI = bir yoki bir nechta qoida. Qoidalar natijalari QO'SHILADI
 * (test_cases.json, 4-bo'lim: Ekspeditor 5% + 10% + 2%).
 */
export function calculateKpi(rules: readonly KpiRuleCalculationInput[]): KpiCalculationResult {
  const results = rules.map(calculateKpiRule);
  const amountExact = sumDecimals(results.map((r) => r.amount));
  return { rules: results, amountExact, amount: roundMoney(amountExact) };
}
