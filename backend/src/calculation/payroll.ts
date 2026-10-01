import { Decimal, HUNDRED, ZERO, roundMoney, toDecimal, toDecimalOrNull, type DecimalInput } from './decimal';

export interface PayrollCalculationInput {
  fixedSalary: DecimalInput;
  kpiTotal: DecimalInput;
  bonusTotal: DecimalInput;
  penaltyTotal: DecimalInput;
  advanceTotal: DecimalInput;
  recalculationAmount: DecimalInput;
  /** positions.deposit_percent — null → lavozimda depozit yo'q. */
  depositPercent: DecimalInput | null;
}

export type PayrollWarning = 'DEPOSIT_BASE_NOT_POSITIVE' | 'NEGATIVE_NET_AMOUNT';

export interface PayrollCalculationResult {
  grossAmount: Decimal;
  depositBase: Decimal | null;
  depositAmount: Decimal;
  netAmount: Decimal;
  /** Jim o'tkazilmasligi kerak bo'lgan holatlar — review bosqichida ko'rsatiladi. */
  warnings: PayrollWarning[];
}

function nonNegative(value: DecimalInput, name: string): Decimal {
  const d = toDecimal(value);
  if (d.isNegative()) {
    throw new RangeError(`${name} manfiy bo'lmasligi kerak: ${d.toString()}`);
  }
  return d;
}

/**
 * Yakuniy ish haqi (team lead tasdiqlagan formula — O'ZGARTIRILMAYDI):
 *
 *   gross   = fixed + kpi + bonus                      (qayta hisob KIRMAYDI)
 *   deposit = (gross − penalty) × deposit_percent / 100 (avans ayirilmaydi)
 *   net     = gross − penalty − deposit − advance + recalculation
 *
 * Tekshiruv: KPI 6 740 000, jarima 300 000, avans 1 000 000, depozit 10%
 *   → depozit 644 000, net 4 796 000.
 *
 * Ochiq savollar (o'zboshimchalik bilan hal qilinmagan, faqat ogohlantirish beriladi):
 *   - jarima ish haqidan katta bo'lsa (depozit bazasi ≤ 0) — depozit olinmaydi
 *     va DEPOSIT_BASE_NOT_POSITIVE ogohlantirishi qaytadi;
 *   - net manfiy chiqsa — summa o'zgartirilmaydi, NEGATIVE_NET_AMOUNT qaytadi.
 */
export function calculatePayroll(input: PayrollCalculationInput): PayrollCalculationResult {
  const fixed = nonNegative(input.fixedSalary, 'fixedSalary');
  const kpi = nonNegative(input.kpiTotal, 'kpiTotal');
  const bonus = nonNegative(input.bonusTotal, 'bonusTotal');
  const penalty = nonNegative(input.penaltyTotal, 'penaltyTotal');
  const advance = nonNegative(input.advanceTotal, 'advanceTotal');
  const recalculation = toDecimal(input.recalculationAmount); // manfiy ham bo'lishi mumkin
  const depositPercent = toDecimalOrNull(input.depositPercent);
  if (depositPercent !== null && depositPercent.isNegative()) {
    throw new RangeError(`depositPercent manfiy bo'lmasligi kerak: ${depositPercent.toString()}`);
  }

  const warnings: PayrollWarning[] = [];
  const grossAmount = roundMoney(fixed.plus(kpi).plus(bonus));

  let depositBase: Decimal | null = null;
  let depositAmount = ZERO;
  if (depositPercent !== null) {
    depositBase = grossAmount.minus(penalty);
    if (depositBase.gt(0)) {
      depositAmount = roundMoney(depositBase.times(depositPercent).div(HUNDRED));
    } else {
      warnings.push('DEPOSIT_BASE_NOT_POSITIVE');
    }
  }

  const netAmount = roundMoney(
    grossAmount.minus(penalty).minus(depositAmount).minus(advance).plus(recalculation),
  );
  if (netAmount.isNegative()) {
    warnings.push('NEGATIVE_NET_AMOUNT');
  }

  return { grossAmount, depositBase, depositAmount, netAmount, warnings };
}
