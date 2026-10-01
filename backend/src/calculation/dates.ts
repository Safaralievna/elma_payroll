import { CalculationError } from './calculation.errors';

/**
 * Yadroda sana — "YYYY-MM-DD" satri (DB `date` ustuni shu ko'rinishda keladi).
 * Bu formatda satrlarni oddiy `<` / `>` bilan solishtirish to'g'ri ishlaydi,
 * vaqt zonasi muammolari ham bo'lmaydi.
 */
const ISO_DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export function requireIsoDate(value: string | null | undefined, field: string): string {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) {
    throw new CalculationError('INVALID_DATE', `"${field}" sanasi YYYY-MM-DD ko'rinishida bo'lishi kerak`, {
      field,
      value,
    });
  }
  return value;
}

/** Davrning birinchi kuni: (2026, 3) → "2026-03-01". */
export function periodStartDate(year: number, month: number): string {
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new CalculationError('INVALID_DATE', "Davr yili yoki oyi noto'g'ri", { year, month });
  }
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-01`;
}
