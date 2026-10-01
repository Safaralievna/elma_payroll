import { CalculationError } from './calculation.errors';
import { Decimal, ZERO, sumDecimals, toDecimal, type DecimalInput } from './decimal';

/** Depozit balansi = Σ deposits.amount − Σ deposit_withdrawals.amount (DECISIONS 3.2). */
export function calculateDepositBalance(
  deposits: readonly DecimalInput[],
  withdrawals: readonly DecimalInput[],
): Decimal {
  return sumDecimals(deposits.map(toDecimal)).minus(sumDecimals(withdrawals.map(toDecimal)));
}

/**
 * Depozitdan yechishni tekshiradi: summa > 0 va balansdan oshmasligi kerak.
 * Yechishdan keyingi balansni qaytaradi.
 */
export function validateDepositWithdrawal(balance: DecimalInput, amount: DecimalInput): Decimal {
  const b = toDecimal(balance);
  const a = toDecimal(amount);
  if (a.lte(ZERO)) {
    throw new CalculationError('INVALID_WITHDRAWAL_AMOUNT', "Yechiladigan summa 0 dan katta bo'lishi kerak", {
      amount: a.toString(),
    });
  }
  if (a.gt(b)) {
    throw new CalculationError('INSUFFICIENT_DEPOSIT_BALANCE', "Depozit balansidan ko'p yechib bo'lmaydi", {
      balance: b.toString(),
      amount: a.toString(),
    });
  }
  return b.minus(a);
}
