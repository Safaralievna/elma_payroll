import { Decimal, HUNDRED } from '../decimal';
import type { CalculatorOutput, KpiCalculator, NormalizedRuleInput } from './calculator.interface';
import { requireConfigDecimal, requireNonNegative } from './config-readers';

/**
 * Natijadan foiz: summa = fakt × percent / 100.
 * configuration: { "percent": 5 }  → 5%.
 * Plan kerak emas (Ekspeditor: ulgurji 5%, chakana 10%, 407 → 2%).
 */
export const resultPercentageCalculator: KpiCalculator = {
  type: 'RESULT_PERCENTAGE',
  requiresPlan: false,

  calculate(input: NormalizedRuleInput): CalculatorOutput {
    const fact = input.fact as Decimal;
    const percent = requireNonNegative(requireConfigDecimal(input.configuration, 'percent'), 'percent');
    return {
      payoutPercent: null,
      amount: fact.times(percent).div(HUNDRED),
    };
  },
};
