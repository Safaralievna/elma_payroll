import { isMonthEnd, isMonthStart } from '../common/iso-date';
import { assertNotClosed, checkDateOrder, firstDayAfterEndChange, HistoryRuleError } from '../history/history-rules';

/**
 * position_kpis va employee_kpi_overrides sanalari — toza funksiyalar.
 *
 * Lavozim/maosh tarixidan farqi: bitta "juftlik" (lavozim + KPI yoki xodim + KPI)
 * yozuvlari zanjir emas — yangi yozuv oldingisini avtomatik yopmaydi, faqat
 * ustma-ust tushmasligi kerak (DB'da ham EXCLUDE bor).
 *
 * - start — oyning 1-kuni, end — oyning oxirgi kuni yoki bo'sh (DECISIONS 2.5);
 * - CLOSED davr himoyasi — lavozim/maosh tarixidagi bilan bir xil (history-rules.ts:
 *   assertNotClosed, firstDayAfterEndChange; DECISIONS 2.5):
 *   yaratish va o'chirish — start oxirgi CLOSED kunidan keyin bo'lishi kerak;
 *   tugash sanasini o'zgartirish — kichikroq (eski/yangi) sanadan keyingi kun undan keyin.
 */

export interface DatedRange {
  id: bigint;
  startDate: string;
  endDate: string | null;
}

/** `others` — shu juftlikning (lavozim+KPI yoki xodim+KPI) mavjud yozuvlari. */
export function planKpiLinkCreate(
  others: readonly DatedRange[],
  input: { startDate: string; endDate: string | null },
  lastClosedDay: string | null,
): void {
  checkRange(input.startDate, input.endDate);
  assertNotClosed(input.startDate, lastClosedDay);
  checkNoOverlap(others, input.startDate, input.endDate);
}

/** Faqat tugash sanasi o'zgaradi (yopish, uzaytirish, qayta ochish). */
export function planKpiLinkEnd(
  records: readonly DatedRange[],
  id: bigint,
  endDate: string | null,
  lastClosedDay: string | null,
): void {
  const target = records.find((record) => record.id === id);
  if (!target) throw new Error(`Yozuv ro'yxatda yo'q (id=${id})`);
  if (endDate === target.endDate) throw new HistoryRuleError('NO_CHANGE', "Hech narsa o'zgarmadi");
  checkRange(target.startDate, endDate);
  assertNotClosed(firstDayAfterEndChange(target.endDate, endDate), lastClosedDay);
  checkNoOverlap(
    records.filter((record) => record.id !== id),
    target.startDate,
    endDate,
  );
}

/** Yozuv davri (start..end) birorta CLOSED kunga tegsa — PERIOD_CLOSED. */
export function planKpiLinkDelete(target: DatedRange, lastClosedDay: string | null): void {
  assertNotClosed(target.startDate, lastClosedDay);
}

// ---------------------------------------------------------------------------

function checkRange(startDate: string, endDate: string | null): void {
  checkDateOrder(startDate, endDate);
  if (!isMonthStart(startDate)) {
    throw new HistoryRuleError('START_NOT_MONTH_START', `Boshlanish sanasi oyning 1-kuni bo'lishi kerak (${startDate})`);
  }
  if (endDate !== null && !isMonthEnd(endDate)) {
    throw new HistoryRuleError('END_NOT_MONTH_END', `Tugash sanasi oyning oxirgi kuni bo'lishi kerak (${endDate})`);
  }
}

function checkNoOverlap(others: readonly DatedRange[], startDate: string, endDate: string | null): void {
  const clash = others.find(
    (other) => (endDate === null || other.startDate <= endDate) && (other.endDate === null || other.endDate >= startDate),
  );
  if (clash) {
    throw new HistoryRuleError(
      'HISTORY_OVERLAP',
      `Shu KPI uchun ${clash.startDate} – ${clash.endDate ?? '…'} yozuvi bilan sanalar ustma-ust tushadi`,
    );
  }
}
