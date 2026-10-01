import type { CalculatorOutput, KpiCalculator, NormalizedRuleInput } from './calculator.interface';
import { requireConfigDecimal, requireNonNegative } from './config-readers';

/**
 * Belgilangan bonus: configuration dagi summa.
 * configuration: { "amount": 500000 }.
 *
 * TZ: "shart bajarilganda bir xil summa". Shartning aniq ko'rinishi hali
 * belgilanmagan — shuning uchun hozircha shart tekshirilmaydi (OPEN BUSINESS QUESTIONS).
 */
export const fixedCalculator: KpiCalculator = {
  type: 'FIXED',
  requiresPlan: false,

  calculate(input: NormalizedRuleInput): CalculatorOutput {
    const amount = requireNonNegative(requireConfigDecimal(input.configuration, 'amount'), 'amount');
    return { payoutPercent: null, amount };
  },
};
