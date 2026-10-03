import { Decimal } from '../calculation/decimal';

/**
 * DB'dagi decimal(p, s) ustuniga sig'ish va ishora chegaralari.
 * API (satr) va Excel importi (katakcha) bir xil tekshiruvdan o'tadi — xabarlar ham bir xil.
 */
export interface DecimalLimits {
  /** Kasr qismi ko'pi bilan necha xona (ortig'i jim yaxlitlanmaydi — xato). */
  scale: number;
  /** Butun qismi ko'pi bilan necha xona: decimal(18,2) → 16, decimal(18,4) → 14. */
  integerDigits: number;
  /** true — qat'iy > 0 (plan: 0 ga bo'linmaydi); aks holda ≥ 0. */
  positive?: boolean;
}

/** Pul summasi: decimal(18,2), ≥ 0. */
export const MONEY_LIMITS: DecimalLimits = { scale: 2, integerDigits: 16 };

/** Chegaradan chiqsa — foydalanuvchiga xabar, aks holda null. */
export function decimalProblem(value: Decimal, limits: DecimalLimits): string | null {
  if (limits.positive && !value.greaterThan(0)) return "0 dan katta bo'lishi kerak";
  if (value.isNegative()) return "Manfiy bo'lmasligi kerak";
  if (value.decimalPlaces() > limits.scale) return `Ko'pi bilan ${limits.scale} kasr belgisi bo'lishi mumkin`;
  if (value.abs().greaterThanOrEqualTo(new Decimal(10).pow(limits.integerDigits))) return 'Son juda katta';
  return null;
}
