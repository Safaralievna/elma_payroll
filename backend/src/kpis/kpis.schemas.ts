import { z } from 'zod';
import { isoDateSchema } from '../common/iso-date';
import { booleanQuerySchema, codeSchema, idSchema, paginationShape } from '../common/schemas';

/**
 * So'rov shakli (turlar va uzunliklar). Ma'no — hisoblash turi, scope, fact_source,
 * configuration kalitlari, filtr operatorlari — kpi-config.ts da tekshiriladi
 * (400 INVALID_CONFIGURATION, hamma xatolar birga).
 */

const notEmpty = (value: object) => Object.values(value).some((field) => field !== undefined);
const NOT_EMPTY = { message: "Kamida bitta maydon o'zgartirilishi kerak" };

/** decimal(10,2) — foizlar. */
const percentSchema = z
  .string()
  .trim()
  .regex(/^-?\d{1,8}(\.\d{1,2})?$/, "Son satr ko'rinishida, ko'pi bilan 2 kasr belgisi bilan");
/** decimal(10,4) — koeffitsiyent. */
const coefficientSchema = z
  .string()
  .trim()
  .regex(/^-?\d{1,6}(\.\d{1,4})?$/, "Son satr ko'rinishida, ko'pi bilan 4 kasr belgisi bilan");

const stepSchema = z.strictObject({
  minPercent: percentSchema,
  maxPercent: percentSchema.nullable().default(null),
  coefficient: coefficientSchema,
  maxRewardPercent: percentSchema.nullable().default(null),
});

const filterSchema = z.strictObject({
  fieldName: z.string().trim().min(1).max(100),
  operator: z.string().trim().min(1).max(30),
  /** ID'lar (satr) yoki amount/quantity uchun son-satr. */
  values: z.array(z.string().trim().min(1).max(50)).max(1000),
});

/** Qoida — yaratishda ham, to'liq almashtirishda (PUT) ham bir xil. */
export const ruleSchema = z.strictObject({
  name: z.string().trim().min(1).max(200),
  priority: z.number().int().min(1).max(1_000_000),
  isActive: z.boolean().default(true),
  /** Hisoblash turi parametrlari: percent, rate_per_unit, amount, min_achievement, min_percent, max_percent. */
  configuration: z.record(z.string(), z.unknown()).default({}),
  steps: z.array(stepSchema).max(50).default([]),
  filters: z.array(filterSchema).max(50).default([]),
});
export type RuleInput = z.output<typeof ruleSchema>;

const definitionShape = {
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).nullable(),
  unitId: idSchema,
  calculationType: z.string().trim().min(1).max(50),
  aggregation: z.string().trim().min(1).max(30).nullable(),
  sourceField: z.string().trim().min(1).max(100).nullable(),
  scope: z.string().trim().min(1).max(20),
  teamLinkType: z.string().trim().min(1).max(20).nullable(),
  factSource: z.string().trim().min(1).max(50),
  isActive: z.boolean(),
};

export const createKpiSchema = z.strictObject({
  code: codeSchema,
  ...definitionShape,
  description: definitionShape.description.default(null),
  aggregation: definitionShape.aggregation.default(null),
  sourceField: definitionShape.sourceField.default(null),
  scope: definitionShape.scope.default('OWN'),
  teamLinkType: definitionShape.teamLinkType.default(null),
  isActive: definitionShape.isActive.default(true),
  rules: z.array(ruleSchema).min(1).max(50),
});
export type CreateKpiInput = z.output<typeof createKpiSchema>;

/** Kod o'zgarmaydi (importlar va rejalar unga bog'lanadi). Qoidalar — alohida endpointlarda. */
export const updateKpiSchema = z.strictObject(definitionShape).partial().refine(notEmpty, NOT_EMPTY);
export type UpdateKpiInput = z.output<typeof updateKpiSchema>;

export const kpiListSchema = z.strictObject({
  isActive: booleanQuerySchema.optional(),
  /** Kod yoki nom bo'yicha. */
  search: z.string().trim().min(1).max(100).optional(),
  calculationType: z.string().trim().min(1).max(50).optional(),
  ...paginationShape,
});
export type KpiListQuery = z.output<typeof kpiListSchema>;

// ---------- Lavozimga biriktirish va override ----------

export const createPositionKpiSchema = z.strictObject({
  positionId: idSchema,
  kpiId: idSchema,
  startDate: isoDateSchema,
  endDate: isoDateSchema.nullable().default(null),
});
export type CreatePositionKpiInput = z.output<typeof createPositionKpiSchema>;

export const positionKpiListSchema = z.strictObject({
  positionId: idSchema.optional(),
  kpiId: idSchema.optional(),
});
export type PositionKpiListQuery = z.output<typeof positionKpiListSchema>;

/** Faqat tugash sanasi: yopish, uzaytirish, qayta ochish (null). Xato yozuv — DELETE. */
export const updateKpiLinkSchema = z.strictObject({ endDate: isoDateSchema.nullable() });
export type UpdateKpiLinkInput = z.output<typeof updateKpiLinkSchema>;

export const createOverrideSchema = z.strictObject({
  kpiId: idSchema,
  action: z.enum(['ADD', 'REMOVE']),
  startDate: isoDateSchema,
  endDate: isoDateSchema.nullable().default(null),
});
export type CreateOverrideInput = z.output<typeof createOverrideSchema>;

export const effectiveKpisSchema = z.strictObject({
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
});
export type EffectiveKpisQuery = z.output<typeof effectiveKpisSchema>;
