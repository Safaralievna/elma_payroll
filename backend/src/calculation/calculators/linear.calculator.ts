import { Decimal, HUNDRED, ZERO } from '../decimal';
import type { CalculatorOutput, KpiCalculator, NormalizedRuleInput } from './calculator.interface';
import { optionalConfigDecimal, requireNonNegative } from './config-readers';

/**
 * Chiziqli hisob (TZ 4.1: "chegara va shift orasida tekis o'sadi").
 *
 * configuration:
 *   min_percent — shu bajarilishdan past bo'lsa to'lov 0 (ixtiyoriy, "chegara")
 *   max_percent — to'lov foizi shundan oshmaydi (ixtiyoriy, "shift")
 *
 * To'lov foizi = bajarilish foizi (chegara va shift orasida); summa = baza × foiz / 100.
 * Masalan, operator: baza 200, bajarilish 98% → 196.
 *
 * Operator uchun standart tur — STEP (DECISIONS 2.1); qaysi KPI qaysi turda
 * ekanini konstruktor (konfiguratsiya) belgilaydi, kod emas.
 */
export const linearCalculator: KpiCalculator = {
  type: 'LINEAR',
  requiresPlan: () => true,
  requiresBaseAmount: true,

  calculate(input: NormalizedRuleInput): CalculatorOutput {
    const achievement = input.achievementPercent as Decimal;
    const base = input.baseAmount as Decimal;
    const minPercent = optionalConfigDecimal(input.configuration, 'min_percent');
    const maxPercent = optionalConfigDecimal(input.configuration, 'max_percent');
    if (minPercent) requireNonNegative(minPercent, 'min_percent');
    if (maxPercent) requireNonNegative(maxPercent, 'max_percent');

    // Manfiy fakt → manfiy bajarilish; to'lov foizi 0 dan kam bo'lmaydi (DECISIONS 2.3).
    let payoutPercent: Decimal = Decimal.max(achievement, ZERO);
    if (minPercent !== null && achievement.lt(minPercent)) {
      payoutPercent = ZERO;
    }
    if (maxPercent !== null) {
      payoutPercent = Decimal.min(payoutPercent, maxPercent);
    }

    return {
      payoutPercent,
      amount: base.times(payoutPercent).div(HUNDRED),
    };
  },
};
