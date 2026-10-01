import { CalculationError } from '../calculation.errors';
import type { StepTierInput } from '../calculation.types';
import { Decimal, HUNDRED, ZERO, toDecimal, toDecimalOrNull } from '../decimal';
import type { CalculatorOutput, KpiCalculator, NormalizedRuleInput } from './calculator.interface';

interface NormalizedStep {
  min: Decimal;
  max: Decimal | null;
  coefficient: Decimal;
  cap: Decimal | null;
}

function normalizeSteps(steps: readonly StepTierInput[]): NormalizedStep[] {
  if (steps.length === 0) {
    throw new CalculationError('INVALID_STEPS', "STEP qoidasida kamida bitta pog'ona bo'lishi kerak");
  }
  const normalized = steps
    .map((s) => ({
      min: toDecimal(s.minPercent),
      max: toDecimalOrNull(s.maxPercent),
      coefficient: toDecimal(s.coefficient),
      cap: toDecimalOrNull(s.maxRewardPercent),
    }))
    .sort((a, b) => a.min.comparedTo(b.min));

  for (const s of normalized) {
    if (s.coefficient.isNegative() || (s.cap !== null && s.cap.isNegative())) {
      throw new CalculationError('INVALID_STEPS', "Koeffitsiyent va limit manfiy bo'lmasligi kerak", {
        minPercent: s.min.toString(),
      });
    }
    if (s.max !== null && s.max.lte(s.min)) {
      throw new CalculationError('INVALID_STEPS', "Pog'onaning max qiymati min dan katta bo'lishi kerak", {
        minPercent: s.min.toString(),
        maxPercent: s.max.toString(),
      });
    }
  }
  return normalized;
}

/**
 * Kumulyativ pog'onali hisob (ERD: "STEP calculation is CUMULATIVE").
 *
 * Har bir pog'ona uchun:
 *   hissa = clamp( (min(bajarilish, max) − min) × koeffitsiyent , 0 , limit )
 * To'lov foizi = barcha hissalar yig'indisi; summa = baza × foiz / 100.
 *
 * Bu Excel formulasining umumiy ko'rinishi:
 *   =F*(MIN(MAX(0;(E*100-70)*2%);20%) + MIN(MAX(0;(E*100-80)*3%);30%) + ...)
 * Farqi — chegaralar, koeffitsiyentlar va limitlar kodda emas, kpi_rule_steps jadvalida.
 * Har bir hissa ≥ 0, shuning uchun manfiy fakt ham 0 beradi (DECISIONS 2.3).
 */
export const stepCalculator: KpiCalculator = {
  type: 'STEP',
  requiresPlan: () => true,
  requiresBaseAmount: true,

  calculate(input: NormalizedRuleInput): CalculatorOutput {
    const achievement = input.achievementPercent as Decimal;
    const base = input.baseAmount as Decimal;
    const steps = normalizeSteps(input.steps);

    let payoutPercent = ZERO;
    for (const step of steps) {
      const reached = step.max !== null ? Decimal.min(achievement, step.max) : achievement;
      let contribution = Decimal.max(ZERO, reached.minus(step.min).times(step.coefficient));
      if (step.cap !== null) {
        contribution = Decimal.min(contribution, step.cap);
      }
      payoutPercent = payoutPercent.plus(contribution);
    }

    return {
      payoutPercent,
      amount: base.times(payoutPercent).div(HUNDRED),
    };
  },
};
