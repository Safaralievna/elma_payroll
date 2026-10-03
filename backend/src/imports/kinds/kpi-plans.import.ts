import { AuditEntry } from '../../audit/audit.service';
import { loadEffectiveKpis } from '../../kpis/effective-kpis-db';
import { snapshot } from '../../kpis/kpi-view';
import { PLAN_INCLUDE, planData, planValuesOf, toPlanView } from '../../kpi-plans/kpi-plan-view';
import { loadPlanKpis } from '../../kpi-plans/plan-db';
import { planKey } from '../../kpi-plans/plan-rules';
import { ApplyContext, ImportKind, Tx } from '../import-kind';
import { KPI_PLAN_COLUMNS, KpiPlanImportContext, planKpiPlanRows } from '../plans/kpi-plans.plan';
import { rowCodes } from './employees.import';

/**
 * PLANS: oylik plan Excel'dan (DECISIONS 2.1, 4). Davrga bog'langan — davr OPEN bo'lishi kerak
 * (servis ensureOpenPeriod'ni rejalashtirishdan oldin chaqiradi; CLOSED → 409 PERIOD_CLOSED,
 * batch yaratilmaydi). Qo'shadi yoki yangilaydi; faylda yo'q planlarga tegmaydi.
 * Har bir yozilgan plan — import_batch_id = shu batch, auditda PLAN_CREATE / PLAN_UPDATE.
 */
export const KPI_PLANS_IMPORT: ImportKind = {
  importType: 'PLANS',
  columns: KPI_PLAN_COLUMNS,
  periodic: true,

  async plan(tx, rows, { period }) {
    if (!period) throw new Error('PLANS importi davrsiz chaqirildi');
    const employees = await tx.employee.findMany({
      where: { employeeCode: { in: rowCodes(rows, 'xodim_kodi') } },
      select: { id: true, employeeCode: true },
    });
    const kpis = await loadPlanKpis(tx, { codes: rowCodes(rows, 'kpi_kodi') }, { lock: true });
    const effective = await loadEffectiveKpis(
      tx,
      employees.map((employee) => employee.id),
      period.year,
      period.month,
    );
    const existing = await tx.kpiPlan.findMany({ where: { periodId: period.id, employeeId: { in: employees.map((employee) => employee.id) } } });

    const ctx: KpiPlanImportContext = {
      employees: new Map(employees.map((employee) => [employee.employeeCode, { id: employee.id }])),
      kpis: new Map(kpis.map((kpi) => [kpi.code, kpi])),
      assigned: new Set([...effective].flatMap(([employeeId, result]) => result.kpis.map((kpi) => planKey(employeeId, kpi.kpiId)))),
      existing: new Map(existing.map((plan) => [planKey(plan.employeeId, plan.kpiId), { id: plan.id, values: planValuesOf(plan) }])),
    };
    const { outcomes, changes } = planKpiPlanRows(rows, ctx);

    return {
      outcomes,
      async apply(db: Tx, { actorId, batchId }: ApplyContext, audit: AuditEntry[]) {
        for (const change of changes) {
          const data = { ...planData(change.values), importBatchId: batchId };
          if (change.existingId === null) {
            const created = await db.kpiPlan.create({
              data: { periodId: period.id, employeeId: change.employeeId, kpiId: change.kpiId, ...data },
              include: PLAN_INCLUDE,
            });
            audit.push({ userId: actorId, action: 'PLAN_CREATE', entityType: 'kpi_plans', entityId: created.id, newData: snapshot(toPlanView(created)) });
          } else {
            const before = await db.kpiPlan.findUniqueOrThrow({ where: { id: change.existingId }, include: PLAN_INCLUDE });
            const after = await db.kpiPlan.update({ where: { id: change.existingId }, data, include: PLAN_INCLUDE });
            audit.push({
              userId: actorId,
              action: 'PLAN_UPDATE',
              entityType: 'kpi_plans',
              entityId: after.id,
              oldData: snapshot(toPlanView(before)),
              newData: snapshot(toPlanView(after)),
            });
          }
        }
      },
    };
  },
};
