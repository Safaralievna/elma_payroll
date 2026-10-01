import { CalculationError } from '../calculation.errors';
import type { CalculatorOutput, KpiCalculator, NormalizedRuleInput } from './calculator.interface';

/**
 * Qo'lda kiritish: summa foydalanuvchi tomonidan kiritiladi
 * (masalan, "qarzdorlarni yopish" hozircha qo'lda).
 */
export const manualCalculator: KpiCalculator = {
  type: 'MANUAL',
  requiresPlan: () => false,
  requiresBaseAmount: false,

  calculate(input: NormalizedRuleInput): CalculatorOutput {
    if (input.manualAmount === null) {
      throw new CalculationError('MANUAL_AMOUNT_REQUIRED', 'MANUAL KPI uchun summa kiritilmagan');
    }
    return { payoutPercent: null, amount: input.manualAmount };
  },
};
