import { z } from 'zod';
import { Decimal } from '../calculation/decimal';
import { codeSchema, idSchema, paginationShape, yearMonthShape } from '../common/schemas';

/**
 * Plan maydonlari — faqat satr (float xatoligi bo'lmasin), oddiy o'nlik son: "1500000.50".
 * "1e5", "0x10" qabul qilinmaydi. Ishora, kasr xonalari va qaysi maydon majburiyligi —
 * plan-rules.ts da (400 INVALID_PLAN, hamma xatolar birga; Excel importi bilan bir xil xabarlar).
 */
const decimalTextSchema = z
  .string()
  .trim()
  .regex(/^-?\d{1,18}(\.\d{1,10})?$/, 'Son satr ko\'rinishida bo\'lishi kerak, masalan "1500000.50"')
  .transform((value) => new Decimal(value));

const planFieldsShape = {
  planValue: decimalTextSchema.nullable().optional(),
  baseAmount: decimalTextSchema.nullable().optional(),
  manualAmount: decimalTextSchema.nullable().optional(),
};

export const createPlanSchema = z.strictObject({
  ...yearMonthShape,
  kpiId: idSchema,
  ...planFieldsShape,
});
export type CreatePlanInput = z.output<typeof createPlanSchema>;

/** undefined — o'zgarmaydi; null — bo'shatiladi. */
export const updatePlanSchema = z
  .strictObject(planFieldsShape)
  .refine((value) => Object.values(value).some((field) => field !== undefined), { message: "Kamida bitta maydon o'zgartirilishi kerak" });
export type UpdatePlanInput = z.output<typeof updatePlanSchema>;

export const periodQuerySchema = z.strictObject(yearMonthShape);
export type PeriodQuery = z.output<typeof periodQuerySchema>;

export const planListSchema = z.strictObject({
  ...yearMonthShape,
  employeeCode: codeSchema.optional(),
  kpiId: idSchema.optional(),
  /** MANUAL — qo'lda kiritilgan (import_batch_id = NULL), IMPORT — Excel'dan. */
  source: z.enum(['MANUAL', 'IMPORT']).optional(),
  ...paginationShape,
});
export type PlanListQuery = z.output<typeof planListSchema>;
