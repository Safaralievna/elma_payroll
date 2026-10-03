import { HttpStatus, Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../auth/auth.types';
import { AppError } from '../common/app-error';
import { Page } from '../common/schemas';
import { Prisma } from '../generated/prisma/client';
import { noChange, requireActive, requireEmployee } from '../history/history-db';
import { loadEffectiveKpis, employeesWithKpisInMonth } from '../kpis/effective-kpis-db';
import { snapshot } from '../kpis/kpi-view';
import { ensureOpenPeriod } from '../periods/period-db';
import { PrismaService } from '../prisma/prisma.service';
import { KpiPlanView, PLAN_INCLUDE, planData, planValuesOf, toPlanView } from './kpi-plan-view';
import { CreatePlanInput, PeriodQuery, PlanListQuery, UpdatePlanInput } from './kpi-plans.schemas';
import { loadPlanKpis, PlanKpi } from './plan-db';
import {
  ApplicablePlanShape,
  findMissingPlans,
  PlanField,
  planKey,
  PlanValues,
  samePlanValues,
  validatePlanValues,
} from './plan-rules';

type Tx = Prisma.TransactionClient;

export interface MissingPlanView {
  employeeCode: string;
  employeeName: string | null;
  kpiId: string;
  kpiCode: string;
  kpiName: string;
  calculationType: string;
  /** Plan yozuvi bor-u, majburiy maydoni bo'sh bo'lsa — uning id'si. */
  planId: string | null;
  missing: PlanField[];
}

export interface MissingPlansView {
  year: number;
  month: number;
  items: MissingPlanView[];
}

/**
 * Oylik plan: qo'lda kiritish (DECISIONS 2.1, 6-bosqich). Excel importi — imports/kinds/kpi-plans.import.ts.
 *
 * Har bir yozish bitta tranzaksiyada: davr (ensureOpenPeriod — CLOSED → PERIOD_CLOSED,
 * REVIEW → PERIOD_NOT_OPEN, yo'q → OPEN yaratiladi), xodim qulflanadi, KPI `FOR SHARE`,
 * so'ng tekshiruvlar va audit (PLAN_CREATE / PLAN_UPDATE / PLAN_DELETE).
 */
@Injectable()
export class KpiPlansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: PlanListQuery): Promise<Page<KpiPlanView>> {
    const where: Prisma.KpiPlanWhereInput = {
      period: { year: query.year, month: query.month },
      employee: query.employeeCode ? { employeeCode: query.employeeCode } : undefined,
      kpiId: query.kpiId,
      importBatchId: query.source === 'MANUAL' ? null : query.source === 'IMPORT' ? { not: null } : undefined,
    };
    const [total, rows] = await Promise.all([
      this.prisma.kpiPlan.count({ where }),
      this.prisma.kpiPlan.findMany({
        where,
        include: PLAN_INCLUDE,
        orderBy: [{ employee: { employeeCode: 'asc' } }, { kpi: { code: 'asc' } }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return { items: rows.map(toPlanView), total, page: query.page, pageSize: query.pageSize };
  }

  async listForEmployee(code: string, query: PeriodQuery): Promise<KpiPlanView[]> {
    const employee = await requireEmployee(this.prisma, code);
    const rows = await this.prisma.kpiPlan.findMany({
      where: { employeeId: employee.id, period: { year: query.year, month: query.month } },
      include: PLAN_INCLUDE,
      orderBy: { kpi: { code: 'asc' } },
    });
    return rows.map(toPlanView);
  }

  /** Plan talab qiladigan, lekin kiritilmagan (yoki chala) planlar. Davr yaratmaydi. */
  async missing(query: PeriodQuery): Promise<MissingPlansView> {
    const employeeIds = await employeesWithKpisInMonth(this.prisma, query.year, query.month);
    const effective = await loadEffectiveKpis(this.prisma, employeeIds, query.year, query.month);
    const kpiIds = [...new Set([...effective.values()].flatMap((result) => result.kpis.map((kpi) => BigInt(kpi.kpiId))))];
    const [kpis, employees, plans] = await Promise.all([
      loadPlanKpis(this.prisma, { ids: kpiIds }),
      this.prisma.employee.findMany({
        where: { id: { in: employeeIds } },
        select: { id: true, employeeCode: true, lastName: true, firstName: true },
      }),
      this.prisma.kpiPlan.findMany({ where: { employeeId: { in: employeeIds }, period: { year: query.year, month: query.month } } }),
    ]);
    const kpiById = new Map(kpis.map((kpi) => [kpi.id.toString(), kpi]));
    const employeeById = new Map(employees.map((employee) => [employee.id.toString(), employee]));
    const planByKey = new Map(plans.map((plan) => [planKey(plan.employeeId, plan.kpiId), plan]));

    const missing = findMissingPlans(
      [...effective].flatMap(([employeeId, result]) =>
        result.kpis.map(({ kpiId }) => ({ employeeId, kpiId, shape: kpiById.get(kpiId)!.shape })),
      ),
      new Map([...planByKey].map(([key, plan]) => [key, planValuesOf(plan)])),
    );
    const items = missing.map(({ employeeId, kpiId, missing: fields }) => {
      const employee = employeeById.get(employeeId)!;
      const kpi = kpiById.get(kpiId)!;
      const name = [employee.lastName, employee.firstName].filter(Boolean).join(' ');
      return {
        employeeCode: employee.employeeCode,
        employeeName: name === '' ? null : name,
        kpiId,
        kpiCode: kpi.code,
        kpiName: kpi.name,
        calculationType: kpi.calculationType,
        planId: planByKey.get(planKey(employeeId, kpiId))?.id.toString() ?? null,
        missing: fields,
      };
    });
    items.sort((a, b) => compare(a.employeeCode, b.employeeCode) || compare(a.kpiCode, b.kpiCode));
    return { year: query.year, month: query.month, items };
  }

  async create(actor: AuthUser, code: string, input: CreatePlanInput): Promise<KpiPlanView> {
    return this.prisma.$transaction(async (tx) => {
      const period = await ensureOpenPeriod(tx, this.audit, actor.id, input.year, input.month);
      const employee = await requireEmployee(tx, code, { lock: true });
      const values = valuesOf(input);
      await checkPlan(tx, employee, input.kpiId, period, values);

      const existing = await tx.kpiPlan.findUnique({
        where: { periodId_employeeId_kpiId: { periodId: period.id, employeeId: employee.id, kpiId: input.kpiId } },
      });
      if (existing) {
        throw new AppError(HttpStatus.CONFLICT, 'PLAN_EXISTS', `Bu oy uchun plan allaqachon bor (id=${existing.id}) — uni tahrirlang`, {
          planId: existing.id.toString(),
        });
      }

      const row = await tx.kpiPlan.create({
        data: { periodId: period.id, employeeId: employee.id, kpiId: input.kpiId, ...planData(values) },
        include: PLAN_INCLUDE,
      });
      const view = toPlanView(row);
      await this.audit.log(tx, { userId: actor.id, action: 'PLAN_CREATE', entityType: 'kpi_plans', entityId: row.id, newData: snapshot(view) });
      return view;
    });
  }

  /** Qo'lda tahrirlangan plan — manbasi MANUAL bo'ladi (import_batch_id = NULL). */
  async update(actor: AuthUser, code: string, id: bigint, input: UpdatePlanInput): Promise<KpiPlanView> {
    return this.prisma.$transaction(async (tx) => {
      const target = await requirePlan(tx, code, id);
      const period = await ensureOpenPeriod(tx, this.audit, actor.id, target.period.year, target.period.month);
      const employee = await requireEmployee(tx, code, { lock: true });
      const before = planValuesOf(target);
      const values: PlanValues = {
        planValue: input.planValue === undefined ? before.planValue : input.planValue,
        baseAmount: input.baseAmount === undefined ? before.baseAmount : input.baseAmount,
        manualAmount: input.manualAmount === undefined ? before.manualAmount : input.manualAmount,
      };
      await checkPlan(tx, employee, target.kpiId, period, values);
      if (samePlanValues(before, values)) throw noChange();

      const row = await tx.kpiPlan.update({
        where: { id },
        data: { ...planData(values), importBatchId: null },
        include: PLAN_INCLUDE,
      });
      const view = toPlanView(row);
      await this.audit.log(tx, {
        userId: actor.id,
        action: 'PLAN_UPDATE',
        entityType: 'kpi_plans',
        entityId: id,
        oldData: snapshot(toPlanView(target)),
        newData: snapshot(view),
      });
      return view;
    });
  }

  async delete(actor: AuthUser, code: string, id: bigint): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const target = await requirePlan(tx, code, id);
      await ensureOpenPeriod(tx, this.audit, actor.id, target.period.year, target.period.month);
      await requireEmployee(tx, code, { lock: true });
      await tx.kpiPlan.delete({ where: { id } });
      await this.audit.log(tx, {
        userId: actor.id,
        action: 'PLAN_DELETE',
        entityType: 'kpi_plans',
        entityId: id,
        oldData: snapshot(toPlanView(target)),
      });
    });
  }
}

// ---------------------------------------------------------------------------

function valuesOf(input: { planValue?: PlanValues['planValue']; baseAmount?: PlanValues['baseAmount']; manualAmount?: PlanValues['manualAmount'] }): PlanValues {
  return { planValue: input.planValue ?? null, baseAmount: input.baseAmount ?? null, manualAmount: input.manualAmount ?? null };
}

/**
 * KPI mavjud va faol, plan kiritiladigan tur (PLAN_NOT_APPLICABLE), shu oy xodimga biriktirilgan
 * (KPI_NOT_ASSIGNED), maydonlar va sonlar to'g'ri (INVALID_PLAN — hamma xatolar birga).
 */
async function checkPlan(
  tx: Tx,
  employee: { id: bigint; employeeCode: string },
  kpiId: bigint,
  period: { year: number; month: number },
  values: PlanValues,
): Promise<void> {
  const [kpi] = await loadPlanKpis(tx, { ids: [kpiId] }, { lock: true });
  if (!kpi) throw new AppError(HttpStatus.NOT_FOUND, 'REFERENCE_NOT_FOUND', `KPI topilmadi (id=${kpiId})`);
  requireActive(kpi, 'KPI');
  const shape = requireApplicable(kpi);

  const effective = (await loadEffectiveKpis(tx, [employee.id], period.year, period.month)).get(employee.id.toString())!;
  if (!effective.kpis.some((item) => item.kpiId === kpiId.toString())) {
    throw new AppError(
      HttpStatus.BAD_REQUEST,
      'KPI_NOT_ASSIGNED',
      `${kpi.code} KPI ${period.year}-${String(period.month).padStart(2, '0')} oyida ${employee.employeeCode} xodimga biriktirilmagan`,
    );
  }

  const errors = validatePlanValues(shape, values);
  if (errors.length > 0) {
    throw new AppError(
      HttpStatus.BAD_REQUEST,
      'INVALID_PLAN',
      'Plan maydonlari noto\'g\'ri',
      errors.map((error) => ({ path: error.field, message: error.message })),
    );
  }
}

function requireApplicable(kpi: PlanKpi): ApplicablePlanShape {
  if (!kpi.shape.applicable) {
    throw new AppError(
      HttpStatus.BAD_REQUEST,
      'PLAN_NOT_APPLICABLE',
      `${kpi.code} KPI turi (${kpi.calculationType}) plan ishlatmaydi — plan kiritilmaydi`,
    );
  }
  return kpi.shape;
}

/** Plan shu xodimga tegishli bo'lishi kerak — boshqa xodimning id'si bilan topilmaydi. */
async function requirePlan(tx: Tx, code: string, id: bigint) {
  const row = await tx.kpiPlan.findFirst({ where: { id, employee: { employeeCode: code } }, include: PLAN_INCLUDE });
  if (!row) throw new AppError(HttpStatus.NOT_FOUND, 'NOT_FOUND', `Plan topilmadi (id=${id})`);
  return row;
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
