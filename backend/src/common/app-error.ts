import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * API xato kodlari. Frontend xabar matniga emas, shu kodga qarab ishlaydi.
 * Yangi kod qo'shilsa — shu ro'yxatga.
 */
export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'BAD_REQUEST'
  | 'UNAUTHORIZED'
  | 'INVALID_CREDENTIALS'
  | 'USER_INACTIVE'
  | 'INVALID_CURRENT_PASSWORD'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'EMPLOYEE_NOT_FOUND'
  | 'CONFLICT'
  | 'USERNAME_TAKEN'
  | 'EMPLOYEE_ALREADY_LINKED'
  | 'LAST_ADMIN'
  | 'TOO_MANY_ATTEMPTS'
  | 'INVALID_CONFIGURATION'
  // 4-bosqich: ma'lumotnomalar, xodimlar, tarix, import
  | 'CODE_TAKEN'
  | 'REFERENCE_NOT_FOUND'
  | 'REFERENCE_INACTIVE'
  | 'START_NOT_MONTH_START'
  | 'HISTORY_ORDER'
  | 'HISTORY_OVERLAP'
  | 'INVALID_DATE_RANGE'
  | 'NOT_LAST_RECORD'
  | 'PERIOD_CLOSED'
  | 'NO_CHANGE'
  | 'INVALID_FILE'
  | 'FILE_ALREADY_IMPORTED'
  | 'IMPORT_HAS_ERRORS'
  | 'PAYLOAD_TOO_LARGE'
  // 5-bosqich: KPI konstruktor
  | 'END_NOT_MONTH_END'
  | 'KPI_IN_USE'
  | 'RULE_IN_USE'
  // 6-bosqich: plan
  | 'PERIOD_NOT_OPEN'
  | 'PLAN_EXISTS'
  | 'INVALID_PLAN'
  | 'PLAN_NOT_APPLICABLE'
  | 'KPI_NOT_ASSIGNED'
  | 'HTTP_ERROR'
  | 'INTERNAL_ERROR';

export interface ErrorBody {
  code: ErrorCode;
  message: string;
  details?: unknown;
}

/**
 * Ilovaning hamma kutilgan xatolari shu klass orqali tashlanadi.
 * Javob doim `{ code, message, details? }` ko'rinishida (AllExceptionsFilter).
 */
export class AppError extends HttpException {
  constructor(
    status: HttpStatus,
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    const body: ErrorBody = details === undefined ? { code, message } : { code, message, details };
    super(body, status);
  }
}
