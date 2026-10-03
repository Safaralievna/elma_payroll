import { AuditEntry } from '../../audit/audit.service';
import { dateOrNull, dateToIso, isoToDate } from '../../common/iso-date';
import {
  ASSIGNMENT_INCLUDE,
  assignmentKey,
  AssignmentRow,
  SalaryRow,
  toAssignmentView,
  toSalaryView,
  withoutId,
} from '../../employees/employee-view';
import { TEAM_LINK_INCLUDE, TeamLinkRow, toTeamLinkView } from '../../team-links/team-link-view';
import { TeamLinkType } from '../../team-links/team-link-types';
import { RowReader } from '../excel/row-reader';
import { SheetRow } from '../excel/sheet';
import { ApplyContext, ImportKind, Tx } from '../import-kind';
import { EMPLOYEE_COLUMNS, EmployeeFields, EmployeeImportContext, EmployeeState, planEmployeeRows } from '../plans/employees.plan';
import {
  AssignmentPayload,
  changedRecords,
  idGenerator,
  RefEntry,
  SalaryPayload,
  TeamLinkPayload,
  TrackedRecord,
} from '../plans/tracked-history';

/** EMPLOYEES: xodim, joriy lavozim va oylik; ishdan ketish sanasi tarixni yopadi. */
export const EMPLOYEES_IMPORT: ImportKind = {
  importType: 'EMPLOYEES',
  columns: EMPLOYEE_COLUMNS,
  periodic: false,

  async plan(tx, rows, { lastClosedDay }) {
    const codes = rowCodes(rows, 'xodim_kodi');
    const employees = await tx.employee.findMany({
      where: { employeeCode: { in: codes } },
      include: {
        assignments: { include: ASSIGNMENT_INCLUDE },
        salaryHistory: true,
        ledLinks: { include: TEAM_LINK_INCLUDE },
        memberLinks: { include: TEAM_LINK_INCLUDE },
      },
    });

    // Bazadagi qatorlar — audit uchun "eski" holat. Havola ikki xodimda uchrashi mumkin — bitta obyekt.
    const assignmentRows = new Map<bigint, AssignmentRow>();
    const salaryRows = new Map<bigint, SalaryRow>();
    const linkRows = new Map<bigint, TeamLinkRow>();
    const links = new Map<bigint, TrackedRecord<TeamLinkPayload>>();
    const trackLink = (row: TeamLinkRow) => {
      linkRows.set(row.id, row);
      if (!links.has(row.id)) {
        links.set(row.id, track(row, row.leaderId.toString(), {
          leaderId: row.leaderId,
          memberId: row.memberId,
          linkType: row.linkType as TeamLinkType,
        }));
      }
      return links.get(row.id) as TrackedRecord<TeamLinkPayload>;
    };

    const ctx: EmployeeImportContext = {
      employees: new Map(
        employees.map((employee): [string, EmployeeState] => {
          const fields: EmployeeFields = {
            firstName: employee.firstName,
            lastName: employee.lastName,
            middleName: employee.middleName,
            hireDate: dateOrNull(employee.hireDate),
            terminationDate: dateOrNull(employee.terminationDate),
            isActive: employee.isActive,
          };
          employee.assignments.forEach((row) => assignmentRows.set(row.id, row));
          employee.salaryHistory.forEach((row) => salaryRows.set(row.id, row));
          return [
            employee.employeeCode,
            {
              id: employee.id,
              code: employee.employeeCode,
              fields,
              original: { ...fields },
              assignments: employee.assignments.map((row) =>
                track<AssignmentPayload>(row, assignmentKey(row.departmentId, row.positionId), {
                  departmentId: row.departmentId,
                  positionId: row.positionId,
                }),
              ),
              salaries: employee.salaryHistory.map((row) =>
                track<SalaryPayload>(row, row.salaryAmount.toFixed(2), { salaryAmount: row.salaryAmount }),
              ),
              teamLinks: [...employee.ledLinks, ...employee.memberLinks].map(trackLink),
            },
          ];
        }),
      ),
      departments: await codeMap(tx.department.findMany({ select: { id: true, code: true, isActive: true } })),
      positions: await codeMap(tx.position.findMany({ select: { id: true, code: true, isActive: true } })),
      rules: { lastClosedDay },
      newId: idGenerator(),
    };

    const outcomes = planEmployeeRows(rows, ctx);

    return {
      outcomes,
      async apply(db: Tx, { actorId }: ApplyContext, audit: AuditEntry[]) {
        const states = [...ctx.employees.values()];

        // 1. Xodimlar.
        for (const state of states) {
          const snapshot = { employeeCode: state.code, ...state.fields };
          if (state.id === null) {
            const created = await db.employee.create({ data: { employeeCode: state.code, ...toEmployeeData(state.fields) } });
            state.id = created.id;
            audit.push({ userId: actorId, action: 'EMPLOYEE_CREATE', entityType: 'employees', entityId: created.id, newData: snapshot });
          } else if (JSON.stringify(state.fields) !== JSON.stringify(state.original)) {
            await db.employee.update({ where: { id: state.id }, data: toEmployeeData(state.fields) });
            audit.push({
              userId: actorId,
              action: 'EMPLOYEE_UPDATE',
              entityType: 'employees',
              entityId: state.id,
              oldData: { employeeCode: state.code, ...state.original },
              newData: snapshot,
            });
          }
        }

        // 2. Mavjud yozuvlarning tugash sanasi — yangilari qo'shilishidan OLDIN (ustma-ust tushmasin).
        const history = (table: string, entityId: bigint, oldData: object | undefined, newData: object): AuditEntry => ({
          userId: actorId,
          action: oldData ? 'HISTORY_UPDATE' : 'HISTORY_CREATE',
          entityType: table,
          entityId,
          oldData,
          newData,
        });
        for (const state of states) {
          for (const record of changedRecords(state.assignments).updates) {
            const before = assignmentRows.get(record.id) as AssignmentRow;
            const after = await db.employeeAssignment.update({
              where: { id: record.id },
              data: { endDate: toDate(record.endDate) },
              include: ASSIGNMENT_INCLUDE,
            });
            audit.push(history('employee_assignments', record.id, withoutId(toAssignmentView(before, state.code)), withoutId(toAssignmentView(after, state.code))));
          }
          for (const record of changedRecords(state.salaries).updates) {
            const before = salaryRows.get(record.id) as SalaryRow;
            const after = await db.employeeSalaryHistory.update({ where: { id: record.id }, data: { endDate: toDate(record.endDate) } });
            audit.push(history('employee_salary_history', record.id, withoutId(toSalaryView(before, state.code)), withoutId(toSalaryView(after, state.code))));
          }
        }
        for (const record of changedRecords([...links.values()]).updates) {
          const before = linkRows.get(record.id) as TeamLinkRow;
          const after = await db.teamLink.update({ where: { id: record.id }, data: { endDate: toDate(record.endDate) }, include: TEAM_LINK_INCLUDE });
          audit.push(history('team_links', record.id, withoutId(toTeamLinkView(before)), withoutId(toTeamLinkView(after))));
        }

        // 3. Yangi yozuvlar.
        for (const state of states) {
          const employeeId = state.id as bigint;
          for (const record of changedRecords(state.assignments).creates) {
            const created = await db.employeeAssignment.create({
              data: { employeeId, ...record.payload, startDate: isoToDate(record.startDate), endDate: toDate(record.endDate) },
              include: ASSIGNMENT_INCLUDE,
            });
            audit.push(history('employee_assignments', created.id, undefined, withoutId(toAssignmentView(created, state.code))));
          }
          for (const record of changedRecords(state.salaries).creates) {
            const created = await db.employeeSalaryHistory.create({
              data: { employeeId, salaryAmount: record.payload.salaryAmount, startDate: isoToDate(record.startDate), endDate: toDate(record.endDate) },
            });
            audit.push(history('employee_salary_history', created.id, undefined, withoutId(toSalaryView(created, state.code))));
          }
        }
      },
    };
  },
};

function track<P>(row: { id: bigint; startDate: Date; endDate: Date | null }, valueKey: string, payload: P): TrackedRecord<P> {
  const endDate = dateOrNull(row.endDate);
  return { id: row.id, startDate: dateToIso(row.startDate), endDate, valueKey, payload, isNew: false, originalEndDate: endDate };
}

function toEmployeeData(fields: EmployeeFields) {
  return {
    firstName: fields.firstName,
    lastName: fields.lastName,
    middleName: fields.middleName,
    hireDate: toDate(fields.hireDate),
    terminationDate: toDate(fields.terminationDate),
    isActive: fields.isActive,
  };
}

export function toDate(value: string | null): Date | null {
  return value === null ? null : isoToDate(value);
}

/** Fayldagi kodlar (bazadan faqat keraklilarini o'qish uchun). */
export function rowCodes(rows: readonly SheetRow[], ...columns: string[]): string[] {
  const codes = new Set<string>();
  for (const row of rows) {
    const reader = new RowReader(row.values);
    for (const column of columns) {
      const code = reader.text(column, { required: false, max: 50 });
      if (code) codes.add(code);
    }
  }
  return [...codes];
}

/** Kodli ma'lumotnoma yozuvlari → kod bo'yicha xarita (kodsizlari importda ishlatib bo'lmaydi). */
export async function codeMap(
  rows: Promise<{ id: bigint; code: string | null; isActive: boolean }[]>,
): Promise<Map<string, RefEntry>> {
  const map = new Map<string, RefEntry>();
  for (const row of await rows) if (row.code) map.set(row.code, { id: row.id, isActive: row.isActive });
  return map;
}
