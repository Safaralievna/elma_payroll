import { z } from 'zod';
import { isoDateSchema } from '../common/iso-date';
import { booleanQuerySchema, codeSchema, idSchema, moneySchema, paginationShape } from '../common/schemas';

const nameSchema = z.string().trim().min(1).max(100).nullable().optional();
const optionalDate = isoDateSchema.nullable().optional();

const notEmpty = (value: object) => Object.values(value).some((field) => field !== undefined);
const NOT_EMPTY = { message: "Kamida bitta maydon o'zgartirilishi kerak" };

export const createEmployeeSchema = z.strictObject({
  employeeCode: codeSchema,
  firstName: nameSchema,
  lastName: nameSchema,
  middleName: nameSchema,
  hireDate: optionalDate,
  terminationDate: optionalDate,
});
export type CreateEmployeeInput = z.output<typeof createEmployeeSchema>;

/**
 * Kod o'zgartirilmaydi (u Excel va savdo qatorlarini bog'laydi).
 * terminationDate berilsa — xodim nofaol bo'ladi va ochiq tarix yopiladi,
 * shuning uchun u bilan birga isActive=true yuborish ziddiyat.
 */
export const updateEmployeeSchema = z
  .strictObject({
    firstName: nameSchema,
    lastName: nameSchema,
    middleName: nameSchema,
    hireDate: optionalDate,
    terminationDate: optionalDate,
    isActive: z.boolean().optional(),
  })
  .refine(notEmpty, NOT_EMPTY)
  .refine((value) => !(value.terminationDate && value.isActive === true), {
    message: "Ishdan ketish sanasi bilan birga isActive=true bo'lmaydi",
    path: ['isActive'],
  });
export type UpdateEmployeeInput = z.output<typeof updateEmployeeSchema>;

export const employeeListSchema = z.strictObject({
  isActive: booleanQuerySchema.optional(),
  /** Kod, ism yoki familiya bo'yicha. */
  search: z.string().trim().min(1).max(100).optional(),
  /** Shu sanadagi lavozim bo'yicha filtr; standart — bugun. */
  departmentId: idSchema.optional(),
  positionId: idSchema.optional(),
  date: isoDateSchema.optional(),
  ...paginationShape,
});
export type EmployeeListQuery = z.output<typeof employeeListSchema>;

export const employeeGetSchema = z.strictObject({ date: isoDateSchema.optional() });

export const createAssignmentSchema = z.strictObject({
  departmentId: idSchema,
  positionId: idSchema,
  startDate: isoDateSchema,
});
export type CreateAssignmentInput = z.output<typeof createAssignmentSchema>;

export const updateAssignmentSchema = z
  .strictObject({
    departmentId: idSchema.optional(),
    positionId: idSchema.optional(),
    startDate: isoDateSchema.optional(),
    endDate: optionalDate,
  })
  .refine(notEmpty, NOT_EMPTY);
export type UpdateAssignmentInput = z.output<typeof updateAssignmentSchema>;

export const createSalarySchema = z.strictObject({
  salaryAmount: moneySchema,
  startDate: isoDateSchema,
});
export type CreateSalaryInput = z.output<typeof createSalarySchema>;

export const updateSalarySchema = z
  .strictObject({
    salaryAmount: moneySchema.optional(),
    startDate: isoDateSchema.optional(),
    endDate: optionalDate,
  })
  .refine(notEmpty, NOT_EMPTY);
export type UpdateSalaryInput = z.output<typeof updateSalarySchema>;
