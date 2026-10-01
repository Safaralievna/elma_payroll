import { Decimal, ZERO } from '../decimal';
import type { CalculatorOutput, KpiCalculator, NormalizedRuleInput } from './calculator.interface';
import { requireConfigDecimal, requireNonNegative } from './config-readers';

/**
 * Birlik uchun: summa = fakt (dona) × stavka.
 * configuration: { "rate_per_unit": 100 }.
 * Plan kerak emas. Manfiy fakt → 0 (DECISIONS 2.3).
 */
export const perUnitCalculator: KpiCalculator = {
  type: 'PER_UNIT',
  requiresPlan: () => false,
  requiresBaseAmount: false,

  calculate(input: NormalizedRuleInput): CalculatorOutput {
    const fact = input.fact as Decimal;
    const rate = requireNonNegative(requireConfigDecimal(input.configuration, 'rate_per_unit'), 'rate_per_unit');
    return {
      payoutPercent: null,
      amount: Decimal.max(fact.times(rate), ZERO),
    };
  },
};
