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
 * DIQQAT: Operator uchun qaysi tur (STEP yoki LINEAR) default ekani ochiq savol —
 * bu calculator faqat mexanizm, qaysi KPI qaysi turda ekanini konfiguratsiya belgilaydi.
 */
export const linearCalculator: KpiCalculator = {
  type: 'LINEAR',
  requiresPlan: true,

  calculate(input: NormalizedRuleInput): CalculatorOutput {
    const achievement = input.achievementPercent as Decimal;
    const base = input.baseAmount as Decimal;
    const minPercent = optionalConfigDecimal(input.configuration, 'min_percent');
    const maxPercent = optionalConfigDecimal(input.configuration, 'max_percent');
    if (minPercent) requireNonNegative(minPercent, 'min_percent');
    if (maxPercent) requireNonNegative(maxPercent, 'max_percent');

    let payoutPercent: Decimal = achievement;
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
