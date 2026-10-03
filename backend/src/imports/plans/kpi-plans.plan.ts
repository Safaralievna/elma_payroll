import { checkPlanFields, PLAN_FIELDS, PLAN_LIMITS, PlanField, planKey, PlanShape, PlanValues, samePlanValues } from '../../kpi-plans/plan-rules';
import { RowReader } from '../excel/row-reader';
import { ColumnSpec, SheetRow } from '../excel/sheet';
import { RowOutcome } from './tracked-history';

/** Plan ustunlari ixtiyoriy: faqat MANUAL summalar fayli `plan`siz bo'lishi mumkin (katakchalar alohida tekshiriladi). */
export const KPI_PLAN_COLUMNS: ColumnSpec[] = [
  { name: 'xodim_kodi', required: true },
  { name: 'kpi_kodi', required: true },
  { name: 'plan', required: false },
  { name: 'baza_summa', required: false },
  { name: 'qolda_summa', required: false },
];

const COLUMN_OF: Record<PlanField, string> = { planValue: 'plan', baseAmount: 'baza_summa', manualAmount: 'qolda_summa' };

export interface KpiPlanImportContext {
  employees: ReadonlyMap<string, { id: bigint }>;
  kpis: ReadonlyMap<string, { id: bigint; isActive: boolean; calculationType: string; shape: PlanShape }>;
  /** planKey(xodim, KPI) — shu oy xodimga biriktirilgan KPI'lar (resolveEmployeeKpis). */
  assigned: ReadonlySet<string>;
  /** Shu davrdagi mavjud planlar: planKey → yozuv. */
  existing: ReadonlyMap<string, { id: bigint; values: PlanValues }>;
}

export interface KpiPlanChange {
  kind: 'CREATE' | 'UPDATE';
  employeeId: bigint;
  kpiId: bigint;
  values: PlanValues;
  existingId: bigint | null;
  before: PlanValues | null;
}

/**
 * PLANS importi qatorlari → natija va o'zgarishlar (toza funksiya).
 * Import faqat qo'shadi yoki yangilaydi: faylda yo'q plan (qo'lda kiritilgani ham) o'zgarmaydi.
 * Bir xil qiymat — UNCHANGED (yozilmaydi).
 */
export function planKpiPlanRows(rows: readonly SheetRow[], ctx: KpiPlanImportContext): { outcomes: RowOutcome[]; changes: KpiPlanChange[] } {
  const rowsByKey = new Map<string, number[]>();
  const parsed = rows.map((row) => {
    const reader = new RowReader(row.values);
    const employeeCode = reader.text('xodim_kodi', { required: true, max: 50 });
    const kpiCode = reader.text('kpi_kodi', { required: true, max: 50 });
    if (employeeCode !== null && kpiCode !== null) {
      const key = `${employeeCode}\u0000${kpiCode}`;
      rowsByKey.set(key, [...(rowsByKey.get(key) ?? []), row.rowNumber]);
    }
    return { row, reader, employeeCode, kpiCode };
  });

  const outcomes: RowOutcome[] = [];
  const changes: KpiPlanChange[] = [];
  for (const { row, reader, employeeCode, kpiCode } of parsed) {
    const change = planRow(reader, employeeCode, kpiCode, ctx);
    const duplicates = employeeCode !== null && kpiCode !== null ? rowsByKey.get(`${employeeCode}\u0000${kpiCode}`)! : [];
    if (duplicates.length > 1) {
      reader.addError('kpi_kodi', `Fayl ichida takrorlangan: ${employeeCode} + ${kpiCode} (${duplicates.join(', ')}-qatorlar)`);
    }

    const ok = reader.errors.length === 0;
    outcomes.push({
      rowNumber: row.rowNumber,
      employeeCode,
      outcome: ok ? (change === null ? 'UNCHANGED' : change.kind === 'CREATE' ? 'CREATED' : 'UPDATED') : null,
      errors: reader.errors,
    });
    if (ok && change) changes.push(change);
  }
  return { outcomes, changes };
}

function planRow(reader: RowReader, employeeCode: string | null, kpiCode: string | null, ctx: KpiPlanImportContext): KpiPlanChange | null {
  const employee = employeeCode === null ? undefined : ctx.employees.get(employeeCode);
  const kpi = kpiCode === null ? undefined : ctx.kpis.get(kpiCode);
  if (employeeCode !== null && !employee) reader.addError('xodim_kodi', `Xodim topilmadi: ${employeeCode}`);
  if (kpiCode !== null && !kpi) reader.addError('kpi_kodi', `KPI topilmadi: ${kpiCode}`);
  else if (kpi && !kpi.isActive) reader.addError('kpi_kodi', `KPI nofaol: ${kpiCode}`);
  else if (kpi && !kpi.shape.applicable) {
    reader.addError('kpi_kodi', `${kpiCode} KPI turi (${kpi.calculationType}) uchun plan kiritilmaydi`);
  } else if (kpi && employee && !ctx.assigned.has(planKey(employee.id, kpi.id))) {
    reader.addError('kpi_kodi', `${kpiCode} KPI shu oyda ${employeeCode} xodimga biriktirilmagan`);
  }
  if (!employee || !kpi || reader.errors.length > 0 || !kpi.shape.applicable) return null;

  const shape = kpi.shape;
  const present = PLAN_FIELDS.filter((field) => reader.has(COLUMN_OF[field]));
  for (const error of checkPlanFields(shape, present)) reader.addError(COLUMN_OF[error.field], error.message);
  const values = {} as PlanValues;
  for (const field of PLAN_FIELDS) values[field] = reader.decimal(COLUMN_OF[field], { required: false }, PLAN_LIMITS[field]);
  if (reader.errors.length > 0) return null;

  const existing = ctx.existing.get(planKey(employee.id, kpi.id));
  if (existing && samePlanValues(existing.values, values)) return null;
  return {
    kind: existing ? 'UPDATE' : 'CREATE',
    employeeId: employee.id,
    kpiId: kpi.id,
    values,
    existingId: existing?.id ?? null,
    before: existing?.values ?? null,
  };
}
