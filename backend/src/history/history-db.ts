import { HttpStatus } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { AppError, ErrorCode } from '../common/app-error';
import { dateOrNull, isoToDate, monthEnd } from '../common/iso-date';
import { Prisma } from '../generated/prisma/client';
import { EndDateChange, HistoryErrorCode, HistoryRecord, HistoryRuleError } from './history-rules';

/**
 * Oxirgi CLOSED davr oyining oxirgi kuni ("2026-03-31"); yopilgan davr bo'lmasa — null.
 * Shu kungacha bo'lgan kunlarga ta'sir qiladigan tarix o'zgarishi taqiqlanadi.
 */
export async function lastClosedDay(db: Prisma.TransactionClient): Promise<string | null> {
  const period = await db.payrollPeriod.findFirst({
    where: { status: 'CLOSED' },
    orderBy: [{ year: 'desc' }, { month: 'desc' }],
  });
  return period ? monthEnd(period.year, period.month) : null;
}

/** Bir xodimning tarixini o'zgartirishdan oldin uni qulflaydi — bir vaqtdagi ikki so'rov ketma-ket bajariladi. */
export async function lockEmployee(db: Prisma.TransactionClient, id: bigint): Promise<void> {
  await db.$queryRaw`SELECT id FROM employees WHERE id = ${id} FOR UPDATE`;
}

/** DB yozuvi (Date ustunlari bilan) → tarix qoidalari uchun yozuv. */
export function toHistoryRecord(
  row: { id: bigint; startDate: Date; endDate: Date | null },
  valueKey: string,
): HistoryRecord {
  return { id: row.id, startDate: row.startDate.toISOString().slice(0, 10), endDate: dateOrNull(row.endDate), valueKey };
}

const STATUS_BY_CODE: Record<HistoryErrorCode, HttpStatus> = {
  START_NOT_MONTH_START: HttpStatus.BAD_REQUEST,
  INVALID_DATE_RANGE: HttpStatus.BAD_REQUEST,
  HISTORY_ORDER: HttpStatus.CONFLICT,
  PERIOD_CLOSED: HttpStatus.CONFLICT,
  NOT_LAST_RECORD: HttpStatus.CONFLICT,
  NO_CHANGE: HttpStatus.CONFLICT,
};

/** Tarix qoidasini bajaradi; buzilsa — mos HTTP xatosi (kod o'sha-o'sha). */
export function runRule<T>(fn: () => T): T {
  try {
    return fn();
  } catch (error) {
    if (error instanceof HistoryRuleError) {
      throw new AppError(STATUS_BY_CODE[error.code], error.code satisfies ErrorCode, error.message);
    }
    throw error;
  }
}

/**
 * Tarixiy yozuvlarning tugash sanasini o'zgartiradi (oldingisini yopish, qayta ochish,
 * ishdan ketishda yopish) va har birini auditga yozadi.
 */
export async function applyEndDateChanges<Row extends { id: bigint }>(
  tx: Prisma.TransactionClient,
  audit: AuditService,
  actorId: bigint,
  changes: readonly EndDateChange[],
  target: {
    table: string;
    rows: readonly Row[];
    update: (id: bigint, endDate: Date | null) => Promise<Row>;
    snapshot: (row: Row) => object;
  },
): Promise<void> {
  for (const change of changes) {
    const before = target.rows.find((row) => row.id === change.id);
    if (!before) throw new Error(`Tarixiy yozuv topilmadi (id=${change.id})`);
    const after = await target.update(change.id, change.endDate === null ? null : isoToDate(change.endDate));
    await audit.log(tx, {
      userId: actorId,
      action: 'HISTORY_UPDATE',
      entityType: target.table,
      entityId: change.id,
      oldData: target.snapshot(before),
      newData: target.snapshot(after),
    });
  }
}

/** Xodim biznes kodi bo'yicha; topilmasa — 404 EMPLOYEE_NOT_FOUND. `lock` — tarixni o'zgartirishdan oldin. */
export async function requireEmployee(
  tx: Prisma.TransactionClient,
  code: string,
  options: { lock?: boolean } = {},
): Promise<{ id: bigint; employeeCode: string; isActive: boolean }> {
  const employee = await tx.employee.findUnique({
    where: { employeeCode: code },
    select: { id: true, employeeCode: true, isActive: true },
  });
  if (!employee) throw new AppError(HttpStatus.NOT_FOUND, 'EMPLOYEE_NOT_FOUND', `Xodim topilmadi: ${code}`);
  if (options.lock) await lockEmployee(tx, employee.id);
  return employee;
}

/** Bog'langan yozuv (bo'lim, lavozim, rahbar) yangi yozuvda ishlatilishi uchun faol bo'lishi kerak. */
export function requireActive(entity: { isActive: boolean }, label: string): void {
  if (!entity.isActive) {
    throw new AppError(HttpStatus.CONFLICT, 'REFERENCE_INACTIVE', `${label} nofaol — yangi yozuvda ishlatib bo'lmaydi`);
  }
}

export function noChange(): AppError {
  return new AppError(HttpStatus.CONFLICT, 'NO_CHANGE', "Joriy qiymat bilan bir xil — yangi yozuv yaratilmadi");
}
