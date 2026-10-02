import { z } from 'zod';

/**
 * Sana — "YYYY-MM-DD" satri (hisoblash yadrosidagi kabi). Bunday satrlarni
 * oddiy `<` / `>` bilan solishtirish to'g'ri ishlaydi, vaqt zonasi muammosi yo'q.
 *
 * DB'dagi `date` ustunlari Prisma'da UTC yarim tundagi `Date` bo'lib keladi —
 * `dateToIso` / `isoToDate` shu chegarada ishlatiladi.
 */
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isIsoDate(value: string): boolean {
  const match = ISO_DATE.exec(value);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function isoToDate(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

export function dateToIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  const date = isoToDate(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return dateToIso(date);
}

export function isMonthStart(iso: string): boolean {
  return iso.endsWith('-01');
}

/** Oyning oxirgi kuni: (2026, 2) → "2026-02-28". */
export function monthEnd(year: number, month: number): string {
  return dateToIso(new Date(Date.UTC(year, month, 0)));
}

/** Server joylashgan joydagi bugungi sana. */
export function todayIso(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function dateOrNull(date: Date | null): string | null {
  return date ? dateToIso(date) : null;
}

/** API'da sana maydoni: "YYYY-MM-DD", haqiqiy sana. */
export const isoDateSchema = z.string().refine(isIsoDate, "Sana YYYY-MM-DD ko'rinishida bo'lishi kerak");
