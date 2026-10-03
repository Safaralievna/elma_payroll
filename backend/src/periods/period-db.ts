import { AuditService } from '../audit/audit.service';
import { Prisma } from '../generated/prisma/client';
import { lastClosedDay, runRule } from '../history/history-db';
import { assertPeriodNotClosed, assertPeriodOpen } from './period-rules';

export interface OpenPeriod {
  id: bigint;
  year: number;
  month: number;
}

/**
 * Oyga ma'lumot (plan, 7-bosqichda savdo) yozishdan oldin chaqiriladi — shu tranzaksiya ichida:
 *
 * 1. Oy oxirgi CLOSED davrgacha bo'lsa — 409 PERIOD_CLOSED (davr yaratilmaydi).
 * 2. Davr yo'q bo'lsa — OPEN holatda yaratiladi, auditga PERIOD_CREATE. Parallel so'rovlar
 *    unique (year, month) bilan himoyalangan: `ON CONFLICT DO NOTHING` — ikkinchisi birinchisi
 *    yaratganini ishlatadi, audit bir marta yoziladi.
 * 3. Davr qatori `FOR SHARE` bilan qulflanadi: tranzaksiya tugaguncha uni yopib (9-bosqich,
 *    `FOR UPDATE`) bo'lmaydi. OPEN bo'lmasa — 409 PERIOD_NOT_OPEN / PERIOD_CLOSED.
 *
 * Tranzaksiya keyin xato bilan bekor bo'lsa, yaratilgan davr ham bekor bo'ladi.
 */
export async function ensureOpenPeriod(
  tx: Prisma.TransactionClient,
  audit: AuditService,
  actorId: bigint,
  year: number,
  month: number,
): Promise<OpenPeriod> {
  const closed = await lastClosedDay(tx);
  runRule(() => assertPeriodNotClosed(year, month, closed));

  const inserted = await tx.$queryRaw<{ id: bigint }[]>`
    INSERT INTO payroll_periods (year, month, status, opened_at, updated_at)
    VALUES (${year}, ${month}, 'OPEN', now(), now())
    ON CONFLICT (year, month) DO NOTHING
    RETURNING id`;
  if (inserted.length > 0) {
    await audit.log(tx, {
      userId: actorId,
      action: 'PERIOD_CREATE',
      entityType: 'payroll_periods',
      entityId: inserted[0]!.id,
      newData: { year, month, status: 'OPEN' },
    });
  }

  const [period] = await tx.$queryRaw<{ id: bigint; status: string }[]>`
    SELECT id, status FROM payroll_periods WHERE year = ${year} AND month = ${month} FOR SHARE`;
  if (!period) throw new Error(`Davr topilmadi: ${year}-${month}`);
  runRule(() => assertPeriodOpen(period.status));
  return { id: period.id, year, month };
}
