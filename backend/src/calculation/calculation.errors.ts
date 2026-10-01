/**
 * Hisoblash yadrosining xato kodlari.
 *
 * Xatolar JIM yutib yuborilmaydi: plan 0 bo'lsa yoki kerakli qiymat bo'lmasa,
 * hisoblash to'xtaydi va aniq kod bilan xato qaytadi. Keyingi bosqichda API
 * qatlami bu kodlarni foydalanuvchiga tushunarli xabarga aylantiradi.
 */
export type CalculationErrorCode =
  | 'UNKNOWN_CALCULATION_TYPE'
  | 'PLAN_REQUIRED'
  | 'PLAN_NOT_POSITIVE'
  | 'FACT_REQUIRED'
  | 'FACT_NEGATIVE'
  | 'BASE_AMOUNT_REQUIRED'
  | 'MANUAL_AMOUNT_REQUIRED'
  | 'INVALID_CONFIGURATION'
  | 'INVALID_STEPS'
  | 'UNKNOWN_AGGREGATION'
  | 'UNKNOWN_FILTER_OPERATOR'
  | 'INVALID_FILTER_VALUE'
  | 'TEAM_MEMBERS_REQUIRED';

export class CalculationError extends Error {
  constructor(
    public readonly code: CalculationErrorCode,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'CalculationError';
  }
}
