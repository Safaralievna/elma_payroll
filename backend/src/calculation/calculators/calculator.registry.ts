import { CalculationError } from '../calculation.errors';
import type { CalculationType, RuleConfiguration } from '../calculation.types';
import type { KpiCalculator } from './calculator.interface';
import { fixedCalculator } from './fixed.calculator';
import { linearCalculator } from './linear.calculator';
import { manualCalculator } from './manual.calculator';
import { perUnitCalculator } from './per-unit.calculator';
import { resultPercentageCalculator } from './result-percentage.calculator';
import { stepCalculator } from './step.calculator';

/**
 * Calculation type → calculator.
 *
 * Yangi turni qo'shish (dasturchi):
 *   1. calculators/ ichida yangi `KpiCalculator` yozing;
 *   2. CALCULATION_TYPES ro'yxatiga nomini qo'shing;
 *   3. shu yerga ro'yxatdan o'tkazing va testini yozing.
 * `Record<CalculationType, ...>` tufayli TypeScript biror turni unutishga yo'l qo'ymaydi.
 */
const REGISTRY: Record<CalculationType, KpiCalculator> = {
  STEP: stepCalculator,
  LINEAR: linearCalculator,
  RESULT_PERCENTAGE: resultPercentageCalculator,
  PER_UNIT: perUnitCalculator,
  FIXED: fixedCalculator,
  MANUAL: manualCalculator,
};

export function isCalculationType(value: string): value is CalculationType {
  return Object.prototype.hasOwnProperty.call(REGISTRY, value);
}

export function getCalculator(type: string): KpiCalculator {
  if (!isCalculationType(type)) {
    throw new CalculationError('UNKNOWN_CALCULATION_TYPE', `Noma'lum hisoblash turi: ${type}`, { type });
  }
  return REGISTRY[type];
}

/**
 * Plan kerakmi? Plan kiritish formasi va import validatsiyasi ham shundan foydalanadi.
 * FIXED uchun javob konfiguratsiyaga bog'liq (`min_achievement` bo'lsa — kerak).
 */
export function requiresPlan(type: string, configuration?: RuleConfiguration | null): boolean {
  return getCalculator(type).requiresPlan(configuration ?? {});
}
