import { HistoryRules, planAppend } from '../../history/history-rules';
import { RowReader } from '../excel/row-reader';
import { ColumnSpec, SheetRow } from '../excel/sheet';
import { failed, requireActive, withRuleErrors } from './employees.plan';
import { TEAM_LINK_TYPES, TeamLinkType } from '../../team-links/team-link-types';
import { applyAppend, RefEntry, RowOutcome, TeamLinkPayload, TrackedRecord } from './tracked-history';

export const TEAM_LINK_COLUMNS: ColumnSpec[] = [
  { name: 'rahbar_kodi', required: true },
  { name: 'xodim_kodi', required: true },
  { name: 'turi', required: true },
  { name: 'boshlanish_sanasi', required: true },
  { name: 'tugash_sanasi', required: false },
];

export interface TeamLinkImportContext {
  /** Xodim kodi → id. */
  employees: Map<string, RefEntry>;
  /** `seriesKey(memberId, linkType)` → shu xodim va turdagi havolalar. Reja to'ldiradi va o'zgartiradi. */
  series: Map<string, TrackedRecord<TeamLinkPayload>[]>;
  rules: Pick<HistoryRules, 'lastClosedDay'>;
  newId: () => bigint;
}

/** Bir xodimda har bir tur (SUPERVISOR / OPERATOR) bo'yicha alohida tarix. */
export function seriesKey(memberId: bigint, linkType: TeamLinkType): string {
  return `${memberId}:${linkType}`;
}

/**
 * TEAM_LINKS importi. Qatorlar boshlanish sanasi bo'yicha tartibda qo'llanadi —
 * fayl bir xodimning butun tarixini aralash tartibda bersa ham to'g'ri yig'iladi.
 * Natijalar fayldagi qator tartibida qaytadi.
 */
export function planTeamLinkRows(rows: readonly SheetRow[], ctx: TeamLinkImportContext): RowOutcome[] {
  const parsed = rows.map((row) => parseRow(row, ctx));
  const order = [...parsed].sort((a, b) => (a.startDate ?? '').localeCompare(b.startDate ?? ''));
  const outcomes = new Map<SheetRow, RowOutcome>();
  for (const item of order) outcomes.set(item.row, applyRow(item, ctx));
  return rows.map((row) => outcomes.get(row) as RowOutcome);
}

interface ParsedRow {
  row: SheetRow;
  reader: RowReader;
  memberCode: string | null;
  leader: RefEntry | null;
  member: RefEntry | null;
  linkType: TeamLinkType | null;
  startDate: string | null;
  endDate: string | null;
}

function parseRow(row: SheetRow, ctx: TeamLinkImportContext): ParsedRow {
  const r = new RowReader(row.values);
  const leaderCode = r.text('rahbar_kodi', { required: true, max: 50 });
  const memberCode = r.text('xodim_kodi', { required: true, max: 50 });
  const linkType = r.oneOf('turi', TEAM_LINK_TYPES, { required: true });
  const startDate = r.date('boshlanish_sanasi', { required: true });
  const endDate = r.date('tugash_sanasi', { required: false });

  const leader = leaderCode === null ? null : (ctx.employees.get(leaderCode) ?? null);
  const member = memberCode === null ? null : (ctx.employees.get(memberCode) ?? null);
  if (leaderCode !== null && leaderCode === memberCode) {
    r.addError('rahbar_kodi', "Xodim o'ziga o'zi rahbar bo'la olmaydi");
  } else {
    if (leaderCode !== null && !leader) r.addError('rahbar_kodi', `Xodim topilmadi: ${leaderCode}`);
    if (memberCode !== null && !member) r.addError('xodim_kodi', `Xodim topilmadi: ${memberCode}`);
  }
  return { row, reader: r, memberCode, leader, member, linkType, startDate, endDate };
}

function applyRow(item: ParsedRow, ctx: TeamLinkImportContext): RowOutcome {
  const { row, reader: r, leader, member, linkType, startDate, endDate } = item;
  if (r.errors.length > 0 || !leader || !member || !linkType || !startDate) return failed(row, item.memberCode, r);

  const key = seriesKey(member.id, linkType);
  const records = ctx.series.get(key) ?? [];
  ctx.series.set(key, records);

  let outcome: RowOutcome['outcome'] = null;
  withRuleErrors(r, 'boshlanish_sanasi', () => {
    const input = { startDate, endDate, valueKey: leader.id.toString() };
    const plan = planAppend(records, input, { lastClosedDay: ctx.rules.lastClosedDay, monthStartOnly: false });
    if (plan.kind === 'APPEND') {
      requireActive(r, 'rahbar_kodi', leader, 'Rahbar');
      requireActive(r, 'xodim_kodi', member, 'Xodim');
    }
    applyAppend(records, plan, input, { leaderId: leader.id, memberId: member.id, linkType }, ctx.newId);
    outcome = plan.kind === 'APPEND' ? 'CREATED' : 'UNCHANGED';
  });
  if (r.errors.length > 0) return failed(row, item.memberCode, r);
  return { rowNumber: row.rowNumber, employeeCode: item.memberCode, outcome, errors: [] };
}
