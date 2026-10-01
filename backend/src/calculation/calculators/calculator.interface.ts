import type { Decimal } from '../decimal';
import type { CalculationType, RuleConfiguration, StepTierInput } from '../calculation.types';

/**
 * Engine tomonidan tekshirilgan va Decimal'ga o'girilgan kirish.
 * Calculator'ga yetib kelganda `requiresPlan` bo'lsa plan > 0 ekanligi,
 * achievementPercent hisoblangani kafolatlanadi.
 */
export interface NormalizedRuleInput {
  plan: Decimal | null;
  fact: Decimal | null;
  baseAmount: Decimal | null;
  achievementPercent: Decimal | null;
  configuration: RuleConfiguration;
  steps: readonly StepTierInput[];
  manualAmount: Decimal | null;
}

export interface CalculatorOutput {
  payoutPercent: Decimal | null;
  amount: Decimal;
}

/**
 * Strategiya: har bir calculation type — bitta calculator.
 * Parametrlar (pog'onalar, foiz, stavka) har doim DB'dan keladi,
 * calculator ichida biznes raqamlari yozilmaydi.
 */
export interface KpiCalculator {
  readonly type: CalculationType;
  /** true → plan majburiy, plan > 0, achievement = fact / plan. */
  readonly requiresPlan: boolean;
  calculate(input: NormalizedRuleInput): CalculatorOutput;
}
