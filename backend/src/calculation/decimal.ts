import Decimal from 'decimal.js';

/**
 * Pul va foizlar bilan ishlash uchun yagona joy.
 *
 * QOIDA: hisoblash yadrosida `number` bilan arifmetika qilinmaydi.
 * Hamma qiymat Decimal'ga aylantiriladi va faqat Decimal metodlari ishlatiladi.
 *
 * Aniqlik 40 xona — oraliq qiymatlar (masalan 1171000 / 1450000) yaxlitlanmaydi.
 */
Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

export { Decimal };

export type DecimalInput = Decimal.Value;

export const ZERO = new Decimal(0);
export const HUNDRED = new Decimal(100);

/**
 * Yakuniy pul summasi necha kasr xonagacha yaxlitlanadi.
 *
 * test_cases.json: "half-up, butun so'mgacha" → 0.
 * DB ustunlari decimal(18,2) bo'lib qoladi — kerak bo'lsa bu yerni 2 ga
 * o'zgartirish kifoya (OPEN BUSINESS QUESTIONS, 8-band).
 */
export const MONEY_DECIMAL_PLACES = 0;

export function toDecimal(value: DecimalInput): Decimal {
  const result = new Decimal(value);
  if (!result.isFinite()) {
    throw new TypeError(`Noto'g'ri son: ${String(value)}`);
  }
  return result;
}

/** null/undefined → null, aks holda Decimal. */
export function toDecimalOrNull(value: DecimalInput | null | undefined): Decimal | null {
  return value === null || value === undefined ? null : toDecimal(value);
}

/** Pul summasini yakuniy ko'rinishga keltiradi (half-up). */
export function roundMoney(value: Decimal): Decimal {
  return value.toDecimalPlaces(MONEY_DECIMAL_PLACES, Decimal.ROUND_HALF_UP);
}

/** Foizni ko'rsatish uchun yaxlitlash (masalan 80.7586... → 80.76). */
export function roundPercent(value: Decimal, decimalPlaces = 2): Decimal {
  return value.toDecimalPlaces(decimalPlaces, Decimal.ROUND_HALF_UP);
}

export function sumDecimals(values: readonly Decimal[]): Decimal {
  return values.reduce((acc, v) => acc.plus(v), ZERO);
}
