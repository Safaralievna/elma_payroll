import { monthStart } from '../common/iso-date';
import { assertNotClosed, HistoryRuleError } from '../history/history-rules';

/**
 * Davr (payroll_periods) ga yozish qoidalari — toza funksiyalar (DECISIONS 5, 6-bosqich).
 *
 * - Oy oxirgi CLOSED davrgacha bo'lsa — PERIOD_CLOSED (tarix bilan umumiy `assertNotClosed`).
 * - Davr mavjud bo'lsa, unga faqat OPEN holatda yoziladi: REVIEW — PERIOD_NOT_OPEN
 *   (tuzatish uchun avval OPEN ga qaytariladi), CLOSED — PERIOD_CLOSED.
 */
export function assertPeriodNotClosed(year: number, month: number, lastClosedDay: string | null): void {
  assertNotClosed(monthStart(year, month), lastClosedDay);
}

export function assertPeriodOpen(status: string): void {
  if (status === 'CLOSED') {
    throw new HistoryRuleError('PERIOD_CLOSED', "Davr yopilgan — tuzatish keyingi ochiq davrda qayta hisob orqali");
  }
  if (status !== 'OPEN') {
    throw new HistoryRuleError('PERIOD_NOT_OPEN', `Davr ${status} holatida — o'zgartirish uchun avval OPEN ga qaytaring`);
  }
}
