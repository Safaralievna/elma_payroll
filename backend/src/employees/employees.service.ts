import { HttpStatus, Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../auth/auth.types';
import { AppError } from '../common/app-error';
import { dateOrNull, isoToDate, todayIso } from '../common/iso-date';
import { Page } from '../common/schemas';
import { Prisma } from '../generated/prisma/client';
import { applyEndDateChanges, lastClosedDay, lockEmployee, runRule, toHistoryRecord } from '../history/history-db';
import { planTermination } from '../history/history-rules';
import { PrismaService } from '../prisma/prisma.service';
import { TEAM_LINK_INCLUDE, toTeamLinkView } from '../team-links/team-link-view';
import {
  activeOn,
  ASSIGNMENT_INCLUDE,
  assignmentKey,
  employeeAuditSnapshot,
  employeeInclude,
  EmployeeView,
  toAssignmentView,
  toEmployeeView,
  toSalaryView,
  withoutId,
} from './employee-view';
import { CreateEmployeeInput, EmployeeListQuery, UpdateEmployeeInput } from './employees.schemas';

const ENTITY_TYPE = 'employees';

/**
 * Xodimlar. Xodim faqat biznes kodi (employees.employee_id) orqali aniqlanadi.
 * O'chirilmaydi — ishdan ketish sanasi va isActive=false.
 */
@Injectable()
export class EmployeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: EmployeeListQuery): Promise<Page<EmployeeView>> {
    const date = query.date ?? todayIso();
    const where: Prisma.EmployeeWhereInput = {
      isActive: query.isActive,
      OR: query.search
        ? [
            { employeeCode: { contains: query.search, mode: 'insensitive' } },
            { firstName: { contains: query.search, mode: 'insensitive' } },
            { lastName: { contains: query.search, mode: 'insensitive' } },
          ]
        : undefined,
      assignments:
        query.departmentId || query.positionId
          ? { some: { ...activeOn(date), departmentId: query.departmentId, positionId: query.positionId } }
          : undefined,
    };
    const [total, rows] = await Promise.all([
      this.prisma.employee.count({ where }),
      this.prisma.employee.findMany({
        where,
        include: employeeInclude(date),
        orderBy: { employeeCode: 'asc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return { items: rows.map(toEmployeeView), total, page: query.page, pageSize: query.pageSize };
  }

  async get(code: string, date: string = todayIso()): Promise<EmployeeView> {
    const row = await this.prisma.employee.findUnique({ where: { employeeCode: code }, include: employeeInclude(date) });
    if (!row) throw employeeNotFound(code);
    return toEmployeeView(row);
  }

  async create(actor: AuthUser, input: CreateEmployeeInput): Promise<EmployeeView> {
    checkDates(input.hireDate ?? null, input.terminationDate ?? null);
    return this.prisma.$transaction(async (tx) => {
      if (await tx.employee.findUnique({ where: { employeeCode: input.employeeCode } })) {
        throw new AppError(HttpStatus.CONFLICT, 'CODE_TAKEN', `Xodim kodi band: ${input.employeeCode}`);
      }
      const created = await tx.employee.create({
        data: {
          employeeCode: input.employeeCode,
          firstName: input.firstName ?? null,
          lastName: input.lastName ?? null,
          middleName: input.middleName ?? null,
          hireDate: toDate(input.hireDate),
          terminationDate: toDate(input.terminationDate),
          isActive: !input.terminationDate,
        },
        include: employeeInclude(todayIso()),
      });
      const view = toEmployeeView(created);
      await this.audit.log(tx, {
        userId: actor.id,
        action: 'EMPLOYEE_CREATE',
        entityType: ENTITY_TYPE,
        entityId: created.id,
        newData: employeeAuditSnapshot(view),
      });
      return view;
    });
  }

  /**
   * Ishdan ketish sanasi (T) qo'yilsa yoki o'zgarsa: shu sanada ochiq lavozim, maosh va
   * team_links (rahbar sifatida ham, a'zo sifatida ham) T kuni yopiladi, isActive=false —
   * hammasi bitta tranzaksiyada, audit bilan. Sana olib tashlansa (null) — yopilgan
   * yozuvlar qayta ochilmaydi; xodimni faollashtirish — isActive=true bilan alohida.
   */
  async update(actor: AuthUser, code: string, input: UpdateEmployeeInput): Promise<EmployeeView> {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.employee.findUnique({ where: { employeeCode: code }, include: employeeInclude(todayIso()) });
      if (!before) throw employeeNotFound(code);
      await lockEmployee(tx, before.id);

      const hireDate = input.hireDate === undefined ? dateOrNull(before.hireDate) : input.hireDate;
      const terminationDate = input.terminationDate === undefined ? dateOrNull(before.terminationDate) : input.terminationDate;
      checkDates(hireDate, terminationDate);

      const data: Prisma.EmployeeUpdateInput = {
        firstName: input.firstName,
        lastName: input.lastName,
        middleName: input.middleName,
        hireDate: input.hireDate === undefined ? undefined : toDate(input.hireDate),
        terminationDate: input.terminationDate === undefined ? undefined : toDate(input.terminationDate),
        isActive: input.isActive,
      };
      if (input.terminationDate && input.terminationDate !== dateOrNull(before.terminationDate)) {
        await this.closeOnTermination(tx, actor, before.id, input.terminationDate);
        data.isActive = false;
      }

      const after = await tx.employee.update({ where: { id: before.id }, data, include: employeeInclude(todayIso()) });
      const view = toEmployeeView(after);
      await this.audit.log(tx, {
        userId: actor.id,
        action: 'EMPLOYEE_UPDATE',
        entityType: ENTITY_TYPE,
        entityId: before.id,
        oldData: employeeAuditSnapshot(toEmployeeView(before)),
        newData: employeeAuditSnapshot(view),
      });
      return view;
    });
  }

  private async closeOnTermination(
    tx: Prisma.TransactionClient,
    actor: AuthUser,
    employeeId: bigint,
    terminationDate: string,
  ): Promise<void> {
    // Tranzaksiya bitta ulanishda — so'rovlar ketma-ket (Promise.all emas).
    const assignments = await tx.employeeAssignment.findMany({ where: { employeeId }, include: ASSIGNMENT_INCLUDE });
    const salaries = await tx.employeeSalaryHistory.findMany({ where: { employeeId } });
    const links = await tx.teamLink.findMany({
      where: { OR: [{ leaderId: employeeId }, { memberId: employeeId }] },
      include: TEAM_LINK_INCLUDE,
    });
    const rules = { lastClosedDay: await lastClosedDay(tx), monthStartOnly: true };
    // Avval hamma qoidalar tekshiriladi — xato bo'lsa, hech narsa yozilmaydi.
    const [assignmentChanges, salaryChanges, linkChanges] = runRule(() => [
      planTermination(assignments.map((row) => toHistoryRecord(row, assignmentKey(row.departmentId, row.positionId))), terminationDate, rules),
      planTermination(salaries.map((row) => toHistoryRecord(row, row.salaryAmount.toFixed(2))), terminationDate, rules),
      planTermination(links.map((row) => toHistoryRecord(row, row.leaderId.toString())), terminationDate, rules),
    ]);

    const employeeCode = (await tx.employee.findUniqueOrThrow({ where: { id: employeeId } })).employeeCode;
    await applyEndDateChanges(tx, this.audit, actor.id, assignmentChanges, {
      table: 'employee_assignments',
      rows: assignments,
      update: (id, endDate) => tx.employeeAssignment.update({ where: { id }, data: { endDate }, include: ASSIGNMENT_INCLUDE }),
      snapshot: (row) => withoutId(toAssignmentView(row, employeeCode)),
    });
    await applyEndDateChanges(tx, this.audit, actor.id, salaryChanges, {
      table: 'employee_salary_history',
      rows: salaries,
      update: (id, endDate) => tx.employeeSalaryHistory.update({ where: { id }, data: { endDate } }),
      snapshot: (row) => withoutId(toSalaryView(row, employeeCode)),
    });
    await applyEndDateChanges(tx, this.audit, actor.id, linkChanges, {
      table: 'team_links',
      rows: links,
      update: (id, endDate) => tx.teamLink.update({ where: { id }, data: { endDate }, include: TEAM_LINK_INCLUDE }),
      snapshot: (row) => withoutId(toTeamLinkView(row)),
    });
  }
}

function employeeNotFound(code: string): AppError {
  return new AppError(HttpStatus.NOT_FOUND, 'EMPLOYEE_NOT_FOUND', `Xodim topilmadi: ${code}`);
}

function toDate(value: string | null | undefined): Date | null {
  return value ? isoToDate(value) : null;
}

function checkDates(hireDate: string | null, terminationDate: string | null): void {
  if (hireDate && terminationDate && terminationDate < hireDate) {
    throw new AppError(
      HttpStatus.BAD_REQUEST,
      'INVALID_DATE_RANGE',
      "Ishdan ketish sanasi ishga kirgan sanadan oldin bo'lmasligi kerak",
    );
  }
}
