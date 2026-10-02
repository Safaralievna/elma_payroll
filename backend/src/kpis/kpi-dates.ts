import { addDays, isMonthEnd, isMonthStart } from '../common/iso-date';
import { HistoryRuleError } from '../history/history-rules';

/**
 * position_kpis va employee_kpi_overrides sanalari — toza funksiyalar.
 *
 * Lavozim/maosh tarixidan farqi: bitta "juftlik" (lavozim + KPI yoki xodim + KPI)
 * yozuvlari zanjir emas — yangi yozuv oldingisini avtomatik yopmaydi, faqat
 * ustma-ust tushmasligi kerak (DB'da ham EXCLUDE bor).
 *
 * - start — oyning 1-kuni, end — oyning oxirgi kuni yoki bo'sh (DECISIONS 2.5);
 * - oxirgi CLOSED davrgacha bo'lgan kunlarga ta'sir qiladigan o'zgarish — PERIOD_CLOSED.
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
  checkNotClosed(input.startDate, lastClosedDay);
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
  // O'zgarish kichikroq tugash sanasidan keyingi kundan boshlanadi (null — cheksiz).
  const earlierEnd = endDate === null ? target.endDate : target.endDate === null || endDate < target.endDate ? endDate : target.endDate;
  checkNotClosed(addDays(earlierEnd as string, 1), lastClosedDay);
  checkNoOverlap(
    records.filter((record) => record.id !== id),
    target.startDate,
    endDate,
  );
}

export function planKpiLinkDelete(target: DatedRange, lastClosedDay: string | null): void {
  checkNotClosed(target.startDate, lastClosedDay);
}

// ---------------------------------------------------------------------------

function checkRange(startDate: string, endDate: string | null): void {
  if (endDate !== null && endDate < startDate) {
    throw new HistoryRuleError('INVALID_DATE_RANGE', "Tugash sanasi boshlanish sanasidan oldin bo'lmasligi kerak");
  }
  if (!isMonthStart(startDate)) {
    throw new HistoryRuleError('START_NOT_MONTH_START', `Boshlanish sanasi oyning 1-kuni bo'lishi kerak (${startDate})`);
  }
  if (endDate !== null && !isMonthEnd(endDate)) {
    throw new HistoryRuleError('END_NOT_MONTH_END', `Tugash sanasi oyning oxirgi kuni bo'lishi kerak (${endDate})`);
  }
}

function checkNotClosed(firstAffectedDay: string, lastClosedDay: string | null): void {
  if (lastClosedDay !== null && firstAffectedDay <= lastClosedDay) {
    throw new HistoryRuleError(
      'PERIOD_CLOSED',
      `O'zgarish yopilgan davrga (${lastClosedDay} gacha) ta'sir qiladi — tuzatish keyingi ochiq davrda qayta hisob orqali`,
    );
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
