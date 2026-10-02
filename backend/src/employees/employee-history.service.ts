import { HttpStatus, Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../auth/auth.types';
import { AppError } from '../common/app-error';
import { dateToIso, isoToDate } from '../common/iso-date';
import { Prisma } from '../generated/prisma/client';
import {
  applyEndDateChanges,
  lastClosedDay,
  noChange,
  requireActive,
  requireEmployee,
  runRule,
  toHistoryRecord,
} from '../history/history-db';
import { planAppend, planDeleteLast, planUpdateLast } from '../history/history-rules';
import { PrismaService } from '../prisma/prisma.service';
import {
  ASSIGNMENT_INCLUDE,
  assignmentKey,
  AssignmentRow,
  AssignmentView,
  SalaryRow,
  SalaryView,
  toAssignmentView,
  toSalaryView,
  withoutId,
} from './employee-view';
import { CreateAssignmentInput, CreateSalaryInput, UpdateAssignmentInput, UpdateSalaryInput } from './employees.schemas';

type Tx = Prisma.TransactionClient;
type HistoryRow = { id: bigint; startDate: Date; endDate: Date | null };

/** Lavozim va maosh jadvallari uchun farq qiladigan qismlar. */
interface HistoryTable<Row extends HistoryRow, View extends { id: string }> {
  /** audit_logs.entity_type */
  table: string;
  load(tx: Tx, employeeId: bigint): Promise<Row[]>;
  valueKey(row: Row): string;
  view(row: Row, employeeCode: string): View;
  update(tx: Tx, id: bigint, data: { startDate?: Date; endDate?: Date | null } & Record<string, unknown>): Promise<Row>;
  delete(tx: Tx, id: bigint): Promise<void>;
}

const ASSIGNMENTS: HistoryTable<AssignmentRow, AssignmentView> = {
  table: 'employee_assignments',
  load: (tx, employeeId) =>
    tx.employeeAssignment.findMany({ where: { employeeId }, include: ASSIGNMENT_INCLUDE, orderBy: { startDate: 'asc' } }),
  valueKey: (row) => assignmentKey(row.departmentId, row.positionId),
  view: toAssignmentView,
  update: (tx, id, data) => tx.employeeAssignment.update({ where: { id }, data, include: ASSIGNMENT_INCLUDE }),
  delete: async (tx, id) => {
    await tx.employeeAssignment.delete({ where: { id } });
  },
};

const SALARIES: HistoryTable<SalaryRow, SalaryView> = {
  table: 'employee_salary_history',
  load: (tx, employeeId) => tx.employeeSalaryHistory.findMany({ where: { employeeId }, orderBy: { startDate: 'asc' } }),
  valueKey: (row) => row.salaryAmount.toFixed(2),
  view: toSalaryView,
  update: (tx, id, data) => tx.employeeSalaryHistory.update({ where: { id }, data }),
  delete: async (tx, id) => {
    await tx.employeeSalaryHistory.delete({ where: { id } });
  },
};

/**
 * Lavozim va maosh tarixi. Qoidalar (history-rules.ts): faqat oxiriga qo'shiladi,
 * oldingi ochiq yozuv avtomatik yopiladi, boshlanish — oyning 1-kuni, tuzatish va
 * o'chirish — faqat oxirgi yozuvga, yopilgan davrga tegilmaydi.
 * Har bir amal xodim qatorini qulflab, bitta tranzaksiyada, audit bilan bajariladi.
 */
@Injectable()
export class EmployeeHistoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ---------- Lavozim ----------

  listAssignments(code: string): Promise<AssignmentView[]> {
    return this.list(ASSIGNMENTS, code);
  }

  async createAssignment(actor: AuthUser, code: string, input: CreateAssignmentInput): Promise<AssignmentView> {
    return this.prisma.$transaction(async (tx) => {
      const department = await requireRef(tx, 'department', input.departmentId);
      const position = await requireRef(tx, 'position', input.positionId);
      return this.append(tx, actor, ASSIGNMENTS, code, {
        startDate: input.startDate,
        valueKey: assignmentKey(department.id, position.id),
        beforeCreate: () => {
          requireActive(department, "Bo'lim");
          requireActive(position, 'Lavozim');
        },
        create: (employeeId) =>
          tx.employeeAssignment.create({
            data: { employeeId, departmentId: department.id, positionId: position.id, startDate: isoToDate(input.startDate) },
            include: ASSIGNMENT_INCLUDE,
          }),
      });
    });
  }

  async updateAssignment(actor: AuthUser, code: string, id: bigint, input: UpdateAssignmentInput): Promise<AssignmentView> {
    return this.prisma.$transaction(async (tx) => {
      const department = input.departmentId ? await requireRef(tx, 'department', input.departmentId) : null;
      const position = input.positionId ? await requireRef(tx, 'position', input.positionId) : null;
      return this.updateLast(tx, actor, ASSIGNMENTS, code, id, {
        startDate: input.startDate,
        endDate: input.endDate,
        valueChanged: (target) =>
          (department !== null && department.id !== target.departmentId) ||
          (position !== null && position.id !== target.positionId),
        beforeUpdate: () => {
          if (department) requireActive(department, "Bo'lim");
          if (position) requireActive(position, 'Lavozim');
        },
        data: { departmentId: department?.id, positionId: position?.id },
      });
    });
  }

  deleteAssignment(actor: AuthUser, code: string, id: bigint): Promise<void> {
    return this.deleteLast(actor, ASSIGNMENTS, code, id);
  }

  // ---------- Maosh ----------

  listSalaries(code: string): Promise<SalaryView[]> {
    return this.list(SALARIES, code);
  }

  async createSalary(actor: AuthUser, code: string, input: CreateSalaryInput): Promise<SalaryView> {
    const amount = new Prisma.Decimal(input.salaryAmount);
    return this.prisma.$transaction((tx) =>
      this.append(tx, actor, SALARIES, code, {
        startDate: input.startDate,
        valueKey: amount.toFixed(2),
        create: (employeeId) =>
          tx.employeeSalaryHistory.create({
            data: { employeeId, salaryAmount: amount, startDate: isoToDate(input.startDate) },
          }),
      }),
    );
  }

  async updateSalary(actor: AuthUser, code: string, id: bigint, input: UpdateSalaryInput): Promise<SalaryView> {
    const amount = input.salaryAmount === undefined ? null : new Prisma.Decimal(input.salaryAmount);
    return this.prisma.$transaction((tx) =>
      this.updateLast(tx, actor, SALARIES, code, id, {
        startDate: input.startDate,
        endDate: input.endDate,
        valueChanged: (target) => amount !== null && !amount.equals(target.salaryAmount),
        data: { salaryAmount: amount ?? undefined },
      }),
    );
  }

  deleteSalary(actor: AuthUser, code: string, id: bigint): Promise<void> {
    return this.deleteLast(actor, SALARIES, code, id);
  }

  // ---------- Umumiy qadamlar ----------

  private async list<Row extends HistoryRow, View extends { id: string }>(
    kind: HistoryTable<Row, View>,
    code: string,
  ): Promise<View[]> {
    const employee = await requireEmployee(this.prisma, code);
    const rows = await kind.load(this.prisma, employee.id);
    return rows.map((row) => kind.view(row, code));
  }

  private async append<Row extends HistoryRow, View extends { id: string }>(
    tx: Tx,
    actor: AuthUser,
    kind: HistoryTable<Row, View>,
    code: string,
    options: {
      startDate: string;
      valueKey: string;
      beforeCreate?: () => void;
      create: (employeeId: bigint) => Promise<Row>;
    },
  ): Promise<View> {
    const employee = await requireEmployee(tx, code, { lock: true });
    const rows = await kind.load(tx, employee.id);
    const rules = { lastClosedDay: await lastClosedDay(tx), monthStartOnly: true };
    const records = rows.map((row) => toHistoryRecord(row, kind.valueKey(row)));

    const plan = runRule(() => planAppend(records, { startDate: options.startDate, endDate: null, valueKey: options.valueKey }, rules));
    if (plan.kind === 'UNCHANGED') throw noChange();
    options.beforeCreate?.();

    if (plan.closePrevious) await this.changeEnds(tx, actor, kind, code, rows, [plan.closePrevious]);
    const created = await options.create(employee.id);
    const view = kind.view(created, code);
    await this.audit.log(tx, {
      userId: actor.id,
      action: 'HISTORY_CREATE',
      entityType: kind.table,
      entityId: created.id,
      newData: withoutId(view),
    });
    return view;
  }

  private async updateLast<Row extends HistoryRow, View extends { id: string }>(
    tx: Tx,
    actor: AuthUser,
    kind: HistoryTable<Row, View>,
    code: string,
    id: bigint,
    options: {
      startDate?: string;
      endDate?: string | null;
      valueChanged: (target: Row) => boolean;
      beforeUpdate?: () => void;
      data: Record<string, unknown>;
    },
  ): Promise<View> {
    const employee = await requireEmployee(tx, code, { lock: true });
    const rows = await kind.load(tx, employee.id);
    const target = requireRow(rows, id);
    const rules = { lastClosedDay: await lastClosedDay(tx), monthStartOnly: true };
    const records = rows.map((row) => toHistoryRecord(row, kind.valueKey(row)));
    const valueChanged = options.valueChanged(target);

    const plan = runRule(() =>
      planUpdateLast(records, id, { startDate: options.startDate, endDate: options.endDate, valueChanged }, rules),
    );
    if (valueChanged) options.beforeUpdate?.();

    // Ustma-ust tushmasligi uchun avval qisqaradigan yozuv o'zgartiriladi:
    // boshlanish keyinga surilsa — avval shu yozuv, keyin oldingisi cho'ziladi; aks holda teskari.
    const movesLater = options.startDate !== undefined && options.startDate > dateToIso(target.startDate);
    if (plan.previousEnd && !movesLater) await this.changeEnds(tx, actor, kind, code, rows, [plan.previousEnd]);

    const data: Record<string, unknown> = { ...options.data };
    if (options.startDate !== undefined) data.startDate = isoToDate(options.startDate);
    if (options.endDate !== undefined) data.endDate = options.endDate === null ? null : isoToDate(options.endDate);
    const updated = await kind.update(tx, id, data);
    const view = kind.view(updated, code);
    await this.audit.log(tx, {
      userId: actor.id,
      action: 'HISTORY_UPDATE',
      entityType: kind.table,
      entityId: id,
      oldData: withoutId(kind.view(target, code)),
      newData: withoutId(view),
    });

    if (plan.previousEnd && movesLater) await this.changeEnds(tx, actor, kind, code, rows, [plan.previousEnd]);
    return view;
  }

  private async deleteLast<Row extends HistoryRow, View extends { id: string }>(
    actor: AuthUser,
    kind: HistoryTable<Row, View>,
    code: string,
    id: bigint,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const employee = await requireEmployee(tx, code, { lock: true });
      const rows = await kind.load(tx, employee.id);
      const target = requireRow(rows, id);
      const rules = { lastClosedDay: await lastClosedDay(tx), monthStartOnly: true };
      const records = rows.map((row) => toHistoryRecord(row, kind.valueKey(row)));

      const plan = runRule(() => planDeleteLast(records, id, rules));
      await kind.delete(tx, id);
      await this.audit.log(tx, {
        userId: actor.id,
        action: 'HISTORY_DELETE',
        entityType: kind.table,
        entityId: id,
        oldData: withoutId(kind.view(target, code)),
      });
      if (plan.reopenPrevious) await this.changeEnds(tx, actor, kind, code, rows, [plan.reopenPrevious]);
    });
  }

  private changeEnds<Row extends HistoryRow, View extends { id: string }>(
    tx: Tx,
    actor: AuthUser,
    kind: HistoryTable<Row, View>,
    code: string,
    rows: Row[],
    changes: { id: bigint; endDate: string | null }[],
  ): Promise<void> {
    return applyEndDateChanges(tx, this.audit, actor.id, changes, {
      table: kind.table,
      rows,
      update: (id, endDate) => kind.update(tx, id, { endDate }),
      snapshot: (row) => withoutId(kind.view(row, code)),
    });
  }
}

/** Yozuv shu xodimga tegishli bo'lishi kerak — boshqa xodimning id'si bilan topilmaydi. */
function requireRow<Row extends { id: bigint }>(rows: Row[], id: bigint): Row {
  const row = rows.find((item) => item.id === id);
  if (!row) throw new AppError(HttpStatus.NOT_FOUND, 'NOT_FOUND', `Tarixiy yozuv topilmadi (id=${id})`);
  return row;
}

async function requireRef(
  tx: Tx,
  model: 'department' | 'position',
  id: bigint,
): Promise<{ id: bigint; isActive: boolean }> {
  const row =
    model === 'department'
      ? await tx.department.findUnique({ where: { id }, select: { id: true, isActive: true } })
      : await tx.position.findUnique({ where: { id }, select: { id: true, isActive: true } });
  if (!row) {
    const label = model === 'department' ? "Bo'lim" : 'Lavozim';
    throw new AppError(HttpStatus.NOT_FOUND, 'REFERENCE_NOT_FOUND', `${label} topilmadi (id=${id})`);
  }
  return row;
}
