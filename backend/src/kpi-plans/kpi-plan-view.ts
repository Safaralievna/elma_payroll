import { Decimal } from '../calculation/decimal';
import { Prisma } from '../generated/prisma/client';
import { PlanValues } from './plan-rules';

export const PLAN_INCLUDE = {
  period: { select: { year: true, month: true } },
  employee: { select: { employeeCode: true, lastName: true, firstName: true } },
  kpi: { select: { code: true, name: true, calculationType: true } },
} satisfies Prisma.KpiPlanInclude;

export type PlanRow = Prisma.KpiPlanGetPayload<{ include: typeof PLAN_INCLUDE }>;

export interface KpiPlanView {
  id: string;
  year: number;
  month: number;
  employeeCode: string;
  employeeName: string | null;
  kpiId: string;
  kpiCode: string;
  kpiName: string;
  calculationType: string;
  /** decimal(18,4) — "150000000.0000". */
  planValue: string | null;
  /** decimal(18,2) — "1500000.00". */
  baseAmount: string | null;
  manualAmount: string | null;
  /** MANUAL — qo'lda kiritilgan yoki qo'lda tahrirlangan; IMPORT — Excel'dan (importBatchId). */
  source: 'MANUAL' | 'IMPORT';
  importBatchId: string | null;
  createdAt: string;
  updatedAt: string;
}

export function toPlanView(row: PlanRow): KpiPlanView {
  const name = [row.employee.lastName, row.employee.firstName].filter(Boolean).join(' ');
  return {
    id: row.id.toString(),
    year: row.period.year,
    month: row.period.month,
    employeeCode: row.employee.employeeCode,
    employeeName: name === '' ? null : name,
    kpiId: row.kpiId.toString(),
    kpiCode: row.kpi.code,
    kpiName: row.kpi.name,
    calculationType: row.kpi.calculationType,
    planValue: row.planValue?.toFixed(4) ?? null,
    baseAmount: row.baseAmount?.toFixed(2) ?? null,
    manualAmount: row.manualAmount?.toFixed(2) ?? null,
    source: row.importBatchId === null ? 'MANUAL' : 'IMPORT',
    importBatchId: row.importBatchId?.toString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** DB qatori (Prisma Decimal) → plan qoidalari uchun decimal.js qiymatlari. */
export function planValuesOf(row: {
  planValue: Prisma.Decimal | null;
  baseAmount: Prisma.Decimal | null;
  manualAmount: Prisma.Decimal | null;
}): PlanValues {
  const toDecimal = (value: Prisma.Decimal | null) => (value === null ? null : new Decimal(value.toString()));
  return { planValue: toDecimal(row.planValue), baseAmount: toDecimal(row.baseAmount), manualAmount: toDecimal(row.manualAmount) };
}

/** Plan qiymatlari → Prisma'ga yozish uchun (decimal.js → eksponentasiz satr, Prisma Decimal ustuniga aniq tushadi). */
export function planData(values: PlanValues): { planValue: string | null; baseAmount: string | null; manualAmount: string | null } {
  return {
    planValue: values.planValue?.toFixed() ?? null,
    baseAmount: values.baseAmount?.toFixed() ?? null,
    manualAmount: values.manualAmount?.toFixed() ?? null,
  };
}
