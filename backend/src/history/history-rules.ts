import { addDays, isMonthStart } from '../common/iso-date';

/**
 * Tarixiy yozuvlar qoidalari — lavozim (employee_assignments), maosh
 * (employee_salary_history) va jamoa havolalari (team_links) uchun bir xil.
 *
 * Toza funksiyalar: bazaga bog'liq emas. Servis bitta "qator"ning (bir xodimning
 * lavozimlari yoki bir xodim + havola turi) hamma yozuvlarini beradi, funksiya
 * nima qilish kerakligini aytadi yoki HistoryRuleError tashlaydi.
 *
 * - `end_date` ham davrga kiradi (DB'dagi daterange '[]'): yangi yozuv S kuni
 *   boshlansa, oldingi ochiq yozuv S − 1 kuni yopiladi.
 * - Faqat oxiriga qo'shiladi; tuzatish va o'chirish — faqat oxirgi yozuvga.
 * - Oxirgi CLOSED davrning oxirgi kunigacha bo'lgan kunlarga ta'sir qiladigan
 *   har qanday o'zgarish — PERIOD_CLOSED (CLAUDE.md 4-qoida).
 */

export interface HistoryRecord {
  id: bigint;
  startDate: string;
  endDate: string | null;
  /** Qiymatni solishtirish kaliti: masalan "bo'lim:lavozim", oylik summasi yoki rahbar id'si. */
  valueKey: string;
}

export interface HistoryRules {
  /** Oxirgi CLOSED davr oyining oxirgi kuni; yopilgan davr bo'lmasa — null. */
  lastClosedDay: string | null;
  /** Maosh va lavozim: boshlanish faqat oyning 1-kuni. team_links — istalgan kun. */
  monthStartOnly: boolean;
}

export type HistoryErrorCode =
  | 'START_NOT_MONTH_START'
  | 'HISTORY_ORDER'
  | 'PERIOD_CLOSED'
  | 'INVALID_DATE_RANGE'
  | 'NOT_LAST_RECORD'
  | 'NO_CHANGE';

export class HistoryRuleError extends Error {
  constructor(
    readonly code: HistoryErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'HistoryRuleError';
  }
}

export interface EndDateChange {
  id: bigint;
  endDate: string | null;
}

export type AppendPlan = { kind: 'UNCHANGED' } | { kind: 'APPEND'; closePrevious: EndDateChange | null };

export interface AppendInput {
  startDate: string;
  endDate: string | null;
  valueKey: string;
}

export function planAppend(records: readonly HistoryRecord[], input: AppendInput, rules: HistoryRules): AppendPlan {
  checkRange(input.startDate, input.endDate);

  // Avval "o'zgarmadi" holatlari — eski ma'lumotni qayta import qilish xato bo'lmasin.
  const sameStart = records.find((record) => record.startDate === input.startDate);
  if (sameStart) {
    if (sameStart.valueKey === input.valueKey && sameStart.endDate === input.endDate) return { kind: 'UNCHANGED' };
    throw new HistoryRuleError(
      'HISTORY_ORDER',
      `${input.startDate} dan boshlanadigan yozuv allaqachon bor — uni tuzatish uchun oxirgi yozuvni tahrirlang`,
    );
  }
  const last = latest(records);
  if (
    last &&
    last.valueKey === input.valueKey &&
    last.endDate === null &&
    input.endDate === null &&
    input.startDate > last.startDate
  ) {
    return { kind: 'UNCHANGED' };
  }

  checkMonthStart(input.startDate, rules);
  checkNotClosed(input.startDate, rules);
  if (last) {
    if (input.startDate <= last.startDate) {
      throw new HistoryRuleError(
        'HISTORY_ORDER',
        `Yangi yozuv oxirgi yozuvdan (${last.startDate}) keyin boshlanishi kerak`,
      );
    }
    if (last.endDate !== null && last.endDate >= input.startDate) {
      throw new HistoryRuleError(
        'HISTORY_ORDER',
        `Oxirgi yozuv ${last.endDate} gacha amal qiladi — yangi yozuv undan keyin boshlanishi kerak`,
      );
    }
  }
  return {
    kind: 'APPEND',
    closePrevious: last && last.endDate === null ? { id: last.id, endDate: addDays(input.startDate, -1) } : null,
  };
}

export interface UpdatePatch {
  startDate?: string;
  /** undefined — o'zgarmaydi; null — ochiq qilinadi. */
  endDate?: string | null;
  /** Qiymat (summa, lavozim, rahbar) o'zgaradimi. */
  valueChanged: boolean;
}

export function planUpdateLast(
  records: readonly HistoryRecord[],
  id: bigint,
  patch: UpdatePatch,
  rules: HistoryRules,
): { previousEnd: EndDateChange | null } {
  const target = requireLast(records, id);
  const newStart = patch.startDate ?? target.startDate;
  const newEnd = patch.endDate === undefined ? target.endDate : patch.endDate;
  checkRange(newStart, newEnd);
  if (newStart !== target.startDate) checkMonthStart(newStart, rules);

  const affected: string[] = [];
  if (newStart !== target.startDate || patch.valueChanged) affected.push(minDate(newStart, target.startDate));
  if (newEnd !== target.endDate) {
    // null = cheksiz; o'zgarish kichikroq tugash sanasidan keyingi kundan boshlanadi.
    const earlierEnd = newEnd === null ? target.endDate : target.endDate === null ? newEnd : minDate(newEnd, target.endDate);
    affected.push(addDays(earlierEnd as string, 1));
  }
  if (affected.length === 0) throw new HistoryRuleError('NO_CHANGE', "Hech narsa o'zgarmadi");
  checkNotClosed(affected.reduce(minDate), rules);

  const previous = latest(records.filter((record) => record.startDate < target.startDate));
  if (!previous) return { previousEnd: null };
  if (newStart <= previous.startDate) {
    throw new HistoryRuleError(
      'HISTORY_ORDER',
      `Boshlanish sanasi oldingi yozuvdan (${previous.startDate}) keyin bo'lishi kerak`,
    );
  }
  const adjacent = previous.endDate === addDays(target.startDate, -1);
  if (adjacent) {
    return newStart === target.startDate
      ? { previousEnd: null }
      : { previousEnd: { id: previous.id, endDate: addDays(newStart, -1) } };
  }
  if (previous.endDate === null || previous.endDate >= newStart) {
    throw new HistoryRuleError('HISTORY_ORDER', `Oldingi yozuv ${previous.endDate ?? '…'} gacha amal qiladi`);
  }
  return { previousEnd: null };
}

export function planDeleteLast(
  records: readonly HistoryRecord[],
  id: bigint,
  rules: HistoryRules,
): { reopenPrevious: EndDateChange | null } {
  const target = requireLast(records, id);
  checkNotClosed(target.startDate, rules);
  const previous = latest(records.filter((record) => record.startDate < target.startDate));
  if (previous && previous.endDate === addDays(target.startDate, -1)) {
    return { reopenPrevious: { id: previous.id, endDate: target.endDate } };
  }
  return { reopenPrevious: null };
}

/** Ishdan ketish sanasida (T) ochiq yoki T dan keyin tugaydigan yozuvlar T kuni yopiladi. */
export function planTermination(
  records: readonly HistoryRecord[],
  terminationDate: string,
  rules: HistoryRules,
): EndDateChange[] {
  const changes: EndDateChange[] = [];
  for (const record of records) {
    if (record.startDate > terminationDate) {
      throw new HistoryRuleError(
        'HISTORY_ORDER',
        `${record.startDate} dan boshlanadigan yozuv ishdan ketish sanasidan (${terminationDate}) keyin`,
      );
    }
    if (record.endDate === null || record.endDate > terminationDate) {
      changes.push({ id: record.id, endDate: terminationDate });
    }
  }
  if (changes.length > 0) checkNotClosed(addDays(terminationDate, 1), rules);
  return changes;
}

// ---------------------------------------------------------------------------

function latest<T extends HistoryRecord>(records: readonly T[]): T | undefined {
  return records.reduce<T | undefined>((best, record) => (!best || record.startDate > best.startDate ? record : best), undefined);
}

function requireLast(records: readonly HistoryRecord[], id: bigint): HistoryRecord {
  const target = records.find((record) => record.id === id);
  if (!target) throw new Error(`Tarixiy yozuv ro'yxatda yo'q (id=${id})`);
  if (latest(records) !== target) {
    throw new HistoryRuleError('NOT_LAST_RECORD', "Faqat oxirgi yozuvni tahrirlash yoki o'chirish mumkin");
  }
  return target;
}

function minDate(a: string, b: string): string {
  return a < b ? a : b;
}

function checkRange(startDate: string, endDate: string | null): void {
  if (endDate !== null && endDate < startDate) {
    throw new HistoryRuleError('INVALID_DATE_RANGE', "Tugash sanasi boshlanish sanasidan oldin bo'lmasligi kerak");
  }
}

function checkMonthStart(startDate: string, rules: HistoryRules): void {
  if (rules.monthStartOnly && !isMonthStart(startDate)) {
    throw new HistoryRuleError('START_NOT_MONTH_START', `Boshlanish sanasi oyning 1-kuni bo'lishi kerak (${startDate})`);
  }
}

/** `firstAffectedDay` — o'zgarish ta'sir qiladigan birinchi kun. */
function checkNotClosed(firstAffectedDay: string, rules: HistoryRules): void {
  if (rules.lastClosedDay !== null && firstAffectedDay <= rules.lastClosedDay) {
    throw new HistoryRuleError(
      'PERIOD_CLOSED',
      `O'zgarish yopilgan davrga (${rules.lastClosedDay} gacha) ta'sir qiladi — tuzatish keyingi ochiq davrda qayta hisob orqali`,
    );
  }
}
