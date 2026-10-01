import { Decimal, HUNDRED, ZERO, roundMoney, toDecimal, toDecimalOrNull, type DecimalInput } from './decimal';

export interface PayrollCalculationInput {
  fixedSalary: DecimalInput;
  kpiTotal: DecimalInput;
  bonusTotal: DecimalInput;
  penaltyTotal: DecimalInput;
  advanceTotal: DecimalInput;
  recalculationAmount: DecimalInput;
  /** O'tgan davrlardan o'tgan qarz (DEBT_CARRYOVER). Berilmasa — 0. */
  debtCarryover?: DecimalInput;
  /** Depozitdan PAYROLL orqali qaytariladigan summa (DEPOSIT_RETURN). Berilmasa — 0. */
  depositReturn?: DecimalInput;
  /** positions.deposit_percent — null → lavozimda depozit yo'q. */
  depositPercent: DecimalInput | null;
}

export type PayrollWarning = 'DEPOSIT_BASE_NOT_POSITIVE' | 'NEGATIVE_NET_AMOUNT';

export interface PayrollCalculationResult {
  grossAmount: Decimal;
  depositBase: Decimal | null;
  depositAmount: Decimal;
  netAmount: Decimal;
  /** To'lanadigan summa = max(net, 0). */
  payableAmount: Decimal;
  /** net < 0 bo'lsa −net — employee_debts ga yozilib, keyingi davrga o'tadi. Aks holda 0. */
  newDebtAmount: Decimal;
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
 *   gross        = fixed + kpi + bonus                          (qayta hisob KIRMAYDI)
 *   deposit_base = gross − penalty                              (avans, qarz KIRMAYDI)
 *   deposit      = deposit_base > 0 ? round(deposit_base × deposit_percent / 100) : 0
 *   net          = gross − penalty − deposit − advance − debt_carryover
 *                  + recalculation + deposit_return
 *   payable      = max(net, 0)
 *   new_debt     = net < 0 ? −net : 0   → keyingi davrga (DECISIONS 3, 3.1)
 *
 * Tekshiruv: KPI 6 740 000, jarima 300 000, avans 1 000 000, depozit 10%
 *   → depozit 644 000, net 4 796 000.
 *
 * Ogohlantirishlar (review ekranida ko'rsatiladi):
 *   - DEPOSIT_BASE_NOT_POSITIVE — jarima ish haqidan katta, depozit olinmadi;
 *   - NEGATIVE_NET_AMOUNT — net manfiy, to'lov 0, qoldiq qarzga o'tadi.
 */
export function calculatePayroll(input: PayrollCalculationInput): PayrollCalculationResult {
  const fixed = nonNegative(input.fixedSalary, 'fixedSalary');
  const kpi = nonNegative(input.kpiTotal, 'kpiTotal');
  const bonus = nonNegative(input.bonusTotal, 'bonusTotal');
  const penalty = nonNegative(input.penaltyTotal, 'penaltyTotal');
  const advance = nonNegative(input.advanceTotal, 'advanceTotal');
  const recalculation = toDecimal(input.recalculationAmount); // manfiy ham bo'lishi mumkin
  const debtCarryover = nonNegative(input.debtCarryover ?? 0, 'debtCarryover');
  const depositReturn = nonNegative(input.depositReturn ?? 0, 'depositReturn');
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
    grossAmount
      .minus(penalty)
      .minus(depositAmount)
      .minus(advance)
      .minus(debtCarryover)
      .plus(recalculation)
      .plus(depositReturn),
  );
  if (netAmount.isNegative()) {
    warnings.push('NEGATIVE_NET_AMOUNT');
  }
  const payableAmount = Decimal.max(netAmount, ZERO);
  const newDebtAmount = netAmount.isNegative() ? netAmount.negated() : ZERO;

  return { grossAmount, depositBase, depositAmount, netAmount, payableAmount, newDebtAmount, warnings };
}
