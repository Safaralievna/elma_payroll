import { Decimal } from '../../calculation/decimal';
import { AppendInput, AppendPlan, EndDateChange, HistoryRecord } from '../../history/history-rules';
import { TeamLinkType } from '../../team-links/team-link-types';
import { RowError } from '../import-errors';

export interface AssignmentPayload {
  departmentId: bigint;
  positionId: bigint;
}
export interface SalaryPayload {
  salaryAmount: Decimal;
}
export interface TeamLinkPayload {
  leaderId: bigint;
  memberId: bigint;
  linkType: TeamLinkType;
}

/**
 * Importni rejalashtirishda xotiradagi tarixiy yozuv. Reja to'liq tuzilgach,
 * servis `changedRecords` orqali faqat farqni bazaga yozadi.
 * Yangi yozuvlarning id'si — vaqtinchalik manfiy son.
 */
export interface TrackedRecord<P> extends HistoryRecord {
  isNew: boolean;
  /** Bazadan o'qilgandagi end_date — o'zgarganini aniqlash uchun. */
  originalEndDate: string | null;
  payload: P;
}

export type Outcome = 'CREATED' | 'UPDATED' | 'UNCHANGED';

/** Bitta qatorning natijasi. Xato bo'lsa — outcome null. */
export interface RowOutcome {
  rowNumber: number;
  employeeCode: string | null;
  outcome: Outcome | null;
  errors: RowError[];
}

/** Ma'lumotnoma yozuvi (bo'lim, lavozim, guruh, kategoriya, xodim) — kod bo'yicha qidirish uchun. */
export interface RefEntry {
  id: bigint;
  isActive: boolean;
}

export function idGenerator(): () => bigint {
  let next = 0n;
  return () => {
    next -= 1n;
    return next;
  };
}

/** `planAppend` natijasini xotiradagi ro'yxatga qo'llaydi. */
export function applyAppend<P>(
  records: TrackedRecord<P>[],
  plan: AppendPlan,
  input: AppendInput,
  payload: P,
  newId: () => bigint,
): void {
  if (plan.kind === 'UNCHANGED') return;
  if (plan.closePrevious) applyEndChanges(records, [plan.closePrevious]);
  records.push({ ...input, id: newId(), isNew: true, originalEndDate: null, payload });
}

export function applyEndChanges<P>(records: TrackedRecord<P>[], changes: readonly EndDateChange[]): void {
  for (const change of changes) {
    const record = records.find((item) => item.id === change.id);
    if (!record) throw new Error(`Tarixiy yozuv topilmadi (id=${change.id})`);
    record.endDate = change.endDate;
  }
}

export function changedRecords<P>(records: readonly TrackedRecord<P>[]): {
  updates: TrackedRecord<P>[];
  creates: TrackedRecord<P>[];
} {
  return {
    updates: records.filter((record) => !record.isNew && record.endDate !== record.originalEndDate),
    creates: records.filter((record) => record.isNew),
  };
}

/** Faylda bir necha marta uchragan kodlar. */
export function duplicatedCodes(codes: readonly (string | null)[]): Set<string> {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const code of codes) {
    if (code === null) continue;
    if (seen.has(code)) duplicates.add(code);
    seen.add(code);
  }
  return duplicates;
}
