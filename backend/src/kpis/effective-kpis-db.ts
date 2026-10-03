import { dateOrNull, dateToIso, isoToDate, monthEnd, monthStart } from '../common/iso-date';
import { Prisma } from '../generated/prisma/client';
import { EffectiveKpis, resolveEmployeeKpis } from './effective-kpis';

type Db = Prisma.TransactionClient;

/**
 * Bir nechta xodimning oydagi amaldagi KPI'lari (`resolveEmployeeKpis`) — bazadan bir martada o'qib.
 * Kalit — xodim id'si (satr). Plan (6-bosqich) va hisoblash (8-bosqich) shuni ishlatadi.
 */
export async function loadEffectiveKpis(db: Db, employeeIds: readonly bigint[], year: number, month: number): Promise<Map<string, EffectiveKpis>> {
  const inMonth = monthOverlap(year, month);
  const ids = [...employeeIds];
  // Ketma-ket: tranzaksiya klientida parallel so'rov bo'lmasin.
  const assignments = await db.employeeAssignment.findMany({ where: { employeeId: { in: ids }, ...inMonth } });
  const overrides = await db.employeeKpiOverride.findMany({ where: { employeeId: { in: ids }, ...inMonth } });
  const positionIds = [...new Set(assignments.map((row) => row.positionId))];
  const positionKpis = await db.positionKpi.findMany({ where: { positionId: { in: positionIds }, ...inMonth } });
  const links = positionKpis.map((row) => ({
    positionId: row.positionId.toString(),
    kpiId: row.kpiId.toString(),
    isActive: row.isActive,
    ...datesOf(row),
  }));

  const result = new Map<string, EffectiveKpis>();
  for (const employeeId of ids) {
    result.set(
      employeeId.toString(),
      resolveEmployeeKpis({
        year,
        month,
        assignments: assignments
          .filter((row) => row.employeeId === employeeId)
          .map((row) => ({ positionId: row.positionId.toString(), ...datesOf(row) })),
        positionKpis: links,
        overrides: overrides
          .filter((row) => row.employeeId === employeeId)
          .map((row) => ({ kpiId: row.kpiId.toString(), action: row.action as 'ADD' | 'REMOVE', isActive: row.isActive, ...datesOf(row) })),
      }),
    );
  }
  return result;
}

/** Oyda KPI'si bo'lishi mumkin bo'lgan xodimlar: shu oyda lavozimi yoki ADD override'i bor. */
export async function employeesWithKpisInMonth(db: Db, year: number, month: number): Promise<bigint[]> {
  const inMonth = monthOverlap(year, month);
  const assignments = await db.employeeAssignment.findMany({ where: inMonth, select: { employeeId: true }, distinct: ['employeeId'] });
  const overrides = await db.employeeKpiOverride.findMany({
    where: { ...inMonth, action: 'ADD' },
    select: { employeeId: true },
    distinct: ['employeeId'],
  });
  return [...new Set([...assignments, ...overrides].map((row) => row.employeeId))];
}

/** [start, end] oraliq oy bilan kesishadi (end_date ham davrga kiradi). */
function monthOverlap(year: number, month: number) {
  return {
    startDate: { lte: isoToDate(monthEnd(year, month)) },
    OR: [{ endDate: null }, { endDate: { gte: isoToDate(monthStart(year, month)) } }],
  };
}

function datesOf(row: { startDate: Date; endDate: Date | null }): { startDate: string; endDate: string | null } {
  return { startDate: dateToIso(row.startDate), endDate: dateOrNull(row.endDate) };
}
