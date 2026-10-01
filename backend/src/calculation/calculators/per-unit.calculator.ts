import type { Decimal } from '../decimal';
import type { CalculatorOutput, KpiCalculator, NormalizedRuleInput } from './calculator.interface';
import { requireConfigDecimal, requireNonNegative } from './config-readers';

/**
 * Birlik uchun: summa = fakt (dona) × stavka.
 * configuration: { "rate_per_unit": 100 }.
 * Plan kerak emas.
 */
export const perUnitCalculator: KpiCalculator = {
  type: 'PER_UNIT',
  requiresPlan: false,

  calculate(input: NormalizedRuleInput): CalculatorOutput {
    const fact = input.fact as Decimal;
    const rate = requireNonNegative(requireConfigDecimal(input.configuration, 'rate_per_unit'), 'rate_per_unit');
    return {
      payoutPercent: null,
      amount: fact.times(rate),
    };
  },
};
