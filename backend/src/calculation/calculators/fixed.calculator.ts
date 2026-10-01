import { ZERO } from '../decimal';
import type { CalculatorOutput, KpiCalculator, NormalizedRuleInput } from './calculator.interface';
import { optionalConfigDecimal, requireConfigDecimal, requireNonNegative } from './config-readers';

/**
 * Belgilangan bonus (DECISIONS 2.1):
 *   configuration: { "min_achievement": 100, "amount": 500000 }
 *
 *   min_achievement bor → plan kerak; bajarilish ≥ min_achievement bo'lsa `amount`, aks holda 0.
 *   min_achievement yo'q → shartsiz `amount` (plan kerak emas).
 */
export const fixedCalculator: KpiCalculator = {
  type: 'FIXED',
  requiresPlan: (configuration) => optionalConfigDecimal(configuration, 'min_achievement') !== null,
  requiresBaseAmount: false,

  calculate(input: NormalizedRuleInput): CalculatorOutput {
    const amount = requireNonNegative(requireConfigDecimal(input.configuration, 'amount'), 'amount');
    const minAchievement = optionalConfigDecimal(input.configuration, 'min_achievement');
    if (minAchievement === null) {
      return { payoutPercent: null, amount };
    }
    requireNonNegative(minAchievement, 'min_achievement');
    // Engine requiresPlan bo'yicha achievementPercent ni hisoblab bergan.
    const reached = input.achievementPercent!.gte(minAchievement);
    return { payoutPercent: null, amount: reached ? amount : ZERO };
  },
};
