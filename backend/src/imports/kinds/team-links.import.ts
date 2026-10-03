import { AuditEntry } from '../../audit/audit.service';
import { dateOrNull, dateToIso, isoToDate } from '../../common/iso-date';
import { withoutId } from '../../employees/employee-view';
import { TEAM_LINK_INCLUDE, TeamLinkRow, toTeamLinkView } from '../../team-links/team-link-view';
import { TeamLinkType } from '../../team-links/team-link-types';
import { ApplyContext, ImportKind, Tx } from '../import-kind';
import { planTeamLinkRows, seriesKey, TEAM_LINK_COLUMNS, TeamLinkImportContext } from '../plans/team-links.plan';
import { changedRecords, idGenerator, TeamLinkPayload, TrackedRecord } from '../plans/tracked-history';
import { rowCodes, toDate } from './employees.import';

/** TEAM_LINKS: rahbar — a'zo havolalari; xodimlar tizimda bo'lishi kerak. */
export const TEAM_LINKS_IMPORT: ImportKind = {
  importType: 'TEAM_LINKS',
  columns: TEAM_LINK_COLUMNS,
  periodic: false,

  async plan(tx, rows, { lastClosedDay }) {
    const employees = await tx.employee.findMany({
      where: { employeeCode: { in: rowCodes(rows, 'rahbar_kodi', 'xodim_kodi') } },
      select: { id: true, employeeCode: true, isActive: true },
    });
    const memberIds = employees.map((employee) => employee.id);
    const existing = await tx.teamLink.findMany({ where: { memberId: { in: memberIds } }, include: TEAM_LINK_INCLUDE });
    const existingById = new Map(existing.map((row) => [row.id, row]));

    const series = new Map<string, TrackedRecord<TeamLinkPayload>[]>();
    for (const row of existing) {
      const linkType = row.linkType as TeamLinkType;
      const key = seriesKey(row.memberId, linkType);
      const endDate = dateOrNull(row.endDate);
      const list = series.get(key) ?? [];
      list.push({
        id: row.id,
        startDate: dateToIso(row.startDate),
        endDate,
        valueKey: row.leaderId.toString(),
        payload: { leaderId: row.leaderId, memberId: row.memberId, linkType },
        isNew: false,
        originalEndDate: endDate,
      });
      series.set(key, list);
    }

    const ctx: TeamLinkImportContext = {
      employees: new Map(employees.map((employee) => [employee.employeeCode, { id: employee.id, isActive: employee.isActive }])),
      series,
      rules: { lastClosedDay },
      newId: idGenerator(),
    };
    const outcomes = planTeamLinkRows(rows, ctx);

    return {
      outcomes,
      async apply(db: Tx, { actorId }: ApplyContext, audit: AuditEntry[]) {
        const all = [...ctx.series.values()].flat();
        const { updates, creates } = changedRecords(all);
        // Avval mavjudlarini yopish, keyin yangilarini qo'shish — ustma-ust tushmasin.
        for (const record of updates) {
          const before = existingById.get(record.id) as TeamLinkRow;
          const after = await db.teamLink.update({
            where: { id: record.id },
            data: { endDate: toDate(record.endDate) },
            include: TEAM_LINK_INCLUDE,
          });
          audit.push({
            userId: actorId,
            action: 'HISTORY_UPDATE',
            entityType: 'team_links',
            entityId: record.id,
            oldData: withoutId(toTeamLinkView(before)),
            newData: withoutId(toTeamLinkView(after)),
          });
        }
        for (const record of creates) {
          const created = await db.teamLink.create({
            data: { ...record.payload, startDate: isoToDate(record.startDate), endDate: toDate(record.endDate) },
            include: TEAM_LINK_INCLUDE,
          });
          audit.push({
            userId: actorId,
            action: 'HISTORY_CREATE',
            entityType: 'team_links',
            entityId: created.id,
            newData: withoutId(toTeamLinkView(created)),
          });
        }
      },
    };
  },
};
