import { Decimal } from '../calculation/decimal';
import { requiresPlan } from '../calculation/calculators/calculator.registry';
import { decimalProblem, DecimalLimits, MONEY_LIMITS } from '../common/decimal-limits';

/**
 * Oylik plan (kpi_plans) qoidalari — toza funksiyalar (DECISIONS 2.1, 2.2).
 *
 * | Tur                         | planValue      | baseAmount    | manualAmount  |
 * |-----------------------------|----------------|---------------|---------------|
 * | STEP, LINEAR                | majburiy, > 0  | majburiy, ≥ 0 | —             |
 * | FIXED (`min_achievement`)   | majburiy, > 0  | —             | —             |
 * | MANUAL                      | —              | —             | majburiy, ≥ 0 |
 * | RESULT_PERCENTAGE, PER_UNIT, shartsiz FIXED — plan kiritilmaydi (PLAN_NOT_APPLICABLE) |
 *
 * "—" — kiritilmaydi (xato). "Plan kerakmi" — yadrodagi `requiresPlan` (registry) javobi.
 */

export type PlanField = 'planValue' | 'baseAmount' | 'manualAmount';
export const PLAN_FIELDS: readonly PlanField[] = ['planValue', 'baseAmount', 'manualAmount'];

/** plan_value decimal(18,4) > 0; summalar decimal(18,2) ≥ 0. */
export const PLAN_LIMITS: Record<PlanField, DecimalLimits> = {
  planValue: { scale: 4, integerDigits: 14, positive: true },
  baseAmount: MONEY_LIMITS,
  manualAmount: MONEY_LIMITS,
};

export type PlanShape = { applicable: false } | ApplicablePlanShape;
export interface ApplicablePlanShape {
  applicable: true;
  /** Majburiy maydonlar; qolganlari kiritilmaydi. */
  required: PlanField[];
}

export type PlanValues = Record<PlanField, Decimal | null>;

export interface PlanFieldError {
  field: PlanField;
  message: string;
}

/** Baza summa (100% to'lov) ishlatadigan turlar. */
const BASE_AMOUNT_TYPES = new Set(['STEP', 'LINEAR']);

/**
 * KPI turi va faol qoidalari konfiguratsiyasi bo'yicha plan shakli.
 * Plan turlarida faol qoida bitta (DECISIONS 2.2) — FIXED'ning sharti shu qoidada.
 */
export function planShapeFor(calculationType: string, activeRuleConfigs: readonly Record<string, unknown>[]): PlanShape {
  if (calculationType === 'MANUAL') return { applicable: true, required: ['manualAmount'] };
  const needsPlan =
    activeRuleConfigs.length === 0
      ? requiresPlan(calculationType, {})
      : activeRuleConfigs.some((configuration) => requiresPlan(calculationType, configuration));
  if (!needsPlan) return { applicable: false };
  return { applicable: true, required: BASE_AMOUNT_TYPES.has(calculationType) ? ['planValue', 'baseAmount'] : ['planValue'] };
}

/** Qaysi maydonlar to'ldirilgani bo'yicha: majburiysi yo'q yoki ortiqchasi bor. */
export function checkPlanFields(shape: ApplicablePlanShape, present: readonly PlanField[]): PlanFieldError[] {
  const errors: PlanFieldError[] = [];
  for (const field of PLAN_FIELDS) {
    const required = shape.required.includes(field);
    if (required && !present.includes(field)) errors.push({ field, message: "To'ldirilishi majburiy" });
    if (!required && present.includes(field)) errors.push({ field, message: 'Bu KPI turi uchun kiritilmaydi — bo\'sh qoldiring' });
  }
  return errors;
}

/** Maydonlar + son chegaralari. Avval maydon xatolari, keyin son xatolari (PLAN_FIELDS tartibida). */
export function validatePlanValues(shape: ApplicablePlanShape, values: PlanValues): PlanFieldError[] {
  const present = PLAN_FIELDS.filter((field) => values[field] !== null);
  const errors = checkPlanFields(shape, present);
  for (const field of present) {
    const problem = decimalProblem(values[field]!, PLAN_LIMITS[field]);
    if (problem) errors.push({ field, message: problem });
  }
  return errors;
}

/** "100" va "100.0000" — bir xil son. */
export function samePlanValues(a: PlanValues, b: PlanValues): boolean {
  return PLAN_FIELDS.every((field) => {
    const left = a[field];
    const right = b[field];
    return left === null || right === null ? left === right : left.equals(right);
  });
}

export function planKey(employeeId: bigint | string, kpiId: bigint | string): string {
  return `${employeeId}:${kpiId}`;
}

export interface ExpectedPlan {
  employeeId: string;
  kpiId: string;
  shape: PlanShape;
}

export interface MissingPlan {
  employeeId: string;
  kpiId: string;
  missing: PlanField[];
}

/**
 * Xodimning oydagi KPI'lari ichida plan talab qiladigan, lekin plani yo'q yoki
 * majburiy maydoni bo'sh bo'lganlari. 8-bosqichda bunday KPI — validatsiya xatosi.
 */
export function findMissingPlans(expected: readonly ExpectedPlan[], plans: ReadonlyMap<string, PlanValues>): MissingPlan[] {
  const result: MissingPlan[] = [];
  for (const { employeeId, kpiId, shape } of expected) {
    if (!shape.applicable) continue;
    const plan = plans.get(planKey(employeeId, kpiId));
    const missing = shape.required.filter((field) => !plan || plan[field] === null);
    if (missing.length > 0) result.push({ employeeId, kpiId, missing });
  }
  return result;
}
