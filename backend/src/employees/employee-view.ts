import { dateOrNull, dateToIso, isoToDate } from '../common/iso-date';
import { Prisma } from '../generated/prisma/client';

/** Sanada amal qiladigan tarixiy yozuv sharti: start ≤ sana ≤ end (end NULL — cheksiz). */
export function activeOn(date: string) {
  const day = isoToDate(date);
  return { startDate: { lte: day }, OR: [{ endDate: null }, { endDate: { gte: day } }] };
}

export const ASSIGNMENT_INCLUDE = {
  department: { select: { code: true, name: true } },
  position: { select: { code: true, name: true } },
} satisfies Prisma.EmployeeAssignmentInclude;

/** Lavozim yozuvining qiymat kaliti — "bir xil lavozim"ni aniqlash uchun. */
export function assignmentKey(departmentId: bigint, positionId: bigint): string {
  return `${departmentId}:${positionId}`;
}

export type AssignmentRow = Prisma.EmployeeAssignmentGetPayload<{ include: typeof ASSIGNMENT_INCLUDE }>;
export type SalaryRow = Prisma.EmployeeSalaryHistoryGetPayload<object>;

export interface AssignmentView {
  id: string;
  employeeCode: string;
  departmentId: string;
  departmentCode: string | null;
  departmentName: string;
  positionId: string;
  positionCode: string | null;
  positionName: string;
  startDate: string;
  endDate: string | null;
}

export interface SalaryView {
  id: string;
  employeeCode: string;
  salaryAmount: string;
  startDate: string;
  endDate: string | null;
}

export function toAssignmentView(row: AssignmentRow, employeeCode: string): AssignmentView {
  return {
    id: row.id.toString(),
    employeeCode,
    departmentId: row.departmentId.toString(),
    departmentCode: row.department.code,
    departmentName: row.department.name,
    positionId: row.positionId.toString(),
    positionCode: row.position.code,
    positionName: row.position.name,
    startDate: dateToIso(row.startDate),
    endDate: dateOrNull(row.endDate),
  };
}

export function toSalaryView(row: SalaryRow, employeeCode: string): SalaryView {
  return {
    id: row.id.toString(),
    employeeCode,
    salaryAmount: row.salaryAmount.toFixed(2),
    startDate: dateToIso(row.startDate),
    endDate: dateOrNull(row.endDate),
  };
}

export function employeeInclude(date: string) {
  return {
    assignments: { where: activeOn(date), include: ASSIGNMENT_INCLUDE, take: 1 },
    salaryHistory: { where: activeOn(date), take: 1 },
  } satisfies Prisma.EmployeeInclude;
}

export type EmployeeRow = Prisma.EmployeeGetPayload<{ include: ReturnType<typeof employeeInclude> }>;

export interface EmployeeView {
  id: string;
  employeeCode: string;
  firstName: string | null;
  lastName: string | null;
  middleName: string | null;
  hireDate: string | null;
  terminationDate: string | null;
  isActive: boolean;
  /** So'rovdagi sanada (standart — bugun) amal qiladigan lavozim va oylik. */
  assignment: AssignmentView | null;
  salary: SalaryView | null;
  createdAt: string;
  updatedAt: string;
}

export function toEmployeeView(row: EmployeeRow): EmployeeView {
  const [assignment] = row.assignments;
  const [salary] = row.salaryHistory;
  return {
    id: row.id.toString(),
    employeeCode: row.employeeCode,
    firstName: row.firstName,
    lastName: row.lastName,
    middleName: row.middleName,
    hireDate: dateOrNull(row.hireDate),
    terminationDate: dateOrNull(row.terminationDate),
    isActive: row.isActive,
    assignment: assignment ? toAssignmentView(assignment, row.employeeCode) : null,
    salary: salary ? toSalaryView(salary, row.employeeCode) : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Audit uchun: id va vaqtlarsiz (tarixiy yozuvlar uchun ham). */
export function withoutId<T extends { id: string }>(view: T): Omit<T, 'id'> {
  const { id: _id, ...rest } = view;
  return rest;
}

export function employeeAuditSnapshot(view: EmployeeView) {
  const { employeeCode, firstName, lastName, middleName, hireDate, terminationDate, isActive } = view;
  return { employeeCode, firstName, lastName, middleName, hireDate, terminationDate, isActive };
}
