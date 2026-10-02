import { HttpStatus, Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../auth/auth.types';
import { AppError } from '../common/app-error';
import { dateToIso, isoToDate } from '../common/iso-date';
import { activeOn, withoutId } from '../employees/employee-view';
import { Prisma } from '../generated/prisma/client';
import {
  applyEndDateChanges,
  lastClosedDay,
  lockEmployee,
  noChange,
  requireActive,
  requireEmployee,
  runRule,
  toHistoryRecord,
} from '../history/history-db';
import { EndDateChange, HistoryRules, planAppend, planDeleteLast, planUpdateLast } from '../history/history-rules';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateTeamLinkInput,
  TEAM_LINK_INCLUDE,
  TeamLinkListQuery,
  TeamLinkRow,
  TeamLinkView,
  toTeamLinkView,
  UpdateTeamLinkInput,
} from './team-link-view';

type Tx = Prisma.TransactionClient;
const TABLE = 'team_links';

/**
 * Jamoa havolalari (DECISIONS 2.4). Tarix har bir a'zo va havola turi
 * (SUPERVISOR / OPERATOR) bo'yicha alohida: yangi rahbar oldingisini bir kun oldin
 * yopadi. Sana — istalgan kun. Rahbarning lavozimi tekshirilmaydi.
 */
@Injectable()
export class TeamLinksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: TeamLinkListQuery): Promise<TeamLinkView[]> {
    const rows = await this.prisma.teamLink.findMany({
      where: {
        leader: query.leaderCode ? { employeeCode: query.leaderCode } : undefined,
        member: query.memberCode ? { employeeCode: query.memberCode } : undefined,
        linkType: query.linkType,
        ...(query.date ? activeOn(query.date) : {}),
      },
      include: TEAM_LINK_INCLUDE,
      orderBy: [{ memberId: 'asc' }, { linkType: 'asc' }, { startDate: 'asc' }],
    });
    return rows.map(toTeamLinkView);
  }

  async create(actor: AuthUser, input: CreateTeamLinkInput): Promise<TeamLinkView> {
    return this.prisma.$transaction(async (tx) => {
      const leader = await requireEmployee(tx, input.leaderCode);
      const member = await requireEmployee(tx, input.memberCode, { lock: true });
      const rows = await loadSeries(tx, member.id, input.linkType);
      const endDate = input.endDate ?? null;
      const rules = await rulesOf(tx);

      const plan = runRule(() =>
        planAppend(rows.map(toRecord), { startDate: input.startDate, endDate, valueKey: leader.id.toString() }, rules),
      );
      if (plan.kind === 'UNCHANGED') throw noChange();
      requireActive(leader, 'Rahbar');
      requireActive(member, 'Xodim');

      if (plan.closePrevious) await this.changeEnds(tx, actor, rows, [plan.closePrevious]);
      const created = await tx.teamLink.create({
        data: {
          leaderId: leader.id,
          memberId: member.id,
          linkType: input.linkType,
          startDate: isoToDate(input.startDate),
          endDate: endDate === null ? null : isoToDate(endDate),
        },
        include: TEAM_LINK_INCLUDE,
      });
      const view = toTeamLinkView(created);
      await this.audit.log(tx, {
        userId: actor.id,
        action: 'HISTORY_CREATE',
        entityType: TABLE,
        entityId: created.id,
        newData: withoutId(view),
      });
      return view;
    });
  }

  /** Faqat a'zo va tur bo'yicha oxirgi havola: rahbarni, boshlanish yoki tugash sanasini tuzatish. */
  async update(actor: AuthUser, id: bigint, input: UpdateTeamLinkInput): Promise<TeamLinkView> {
    return this.prisma.$transaction(async (tx) => {
      const target = await requireLink(tx, id);
      await lockEmployee(tx, target.memberId);
      const rows = await loadSeries(tx, target.memberId, target.linkType);
      const leader = input.leaderCode ? await requireEmployee(tx, input.leaderCode) : null;
      if (leader && leader.id === target.memberId) {
        throw new AppError(HttpStatus.BAD_REQUEST, 'VALIDATION_ERROR', "Xodim o'ziga o'zi rahbar bo'la olmaydi");
      }
      const valueChanged = leader !== null && leader.id !== target.leaderId;
      const rules = await rulesOf(tx);

      const plan = runRule(() =>
        planUpdateLast(rows.map(toRecord), id, { startDate: input.startDate, endDate: input.endDate, valueChanged }, rules),
      );
      if (valueChanged && leader) requireActive(leader, 'Rahbar');

      // Ustma-ust tushmasligi uchun avval qisqaradigan yozuv o'zgartiriladi.
      const movesLater = input.startDate !== undefined && input.startDate > dateToIso(target.startDate);
      if (plan.previousEnd && !movesLater) await this.changeEnds(tx, actor, rows, [plan.previousEnd]);
      const updated = await tx.teamLink.update({
        where: { id },
        data: {
          leaderId: leader?.id,
          startDate: input.startDate === undefined ? undefined : isoToDate(input.startDate),
          endDate: input.endDate === undefined ? undefined : input.endDate === null ? null : isoToDate(input.endDate),
        },
        include: TEAM_LINK_INCLUDE,
      });
      const view = toTeamLinkView(updated);
      await this.audit.log(tx, {
        userId: actor.id,
        action: 'HISTORY_UPDATE',
        entityType: TABLE,
        entityId: id,
        oldData: withoutId(toTeamLinkView(target)),
        newData: withoutId(view),
      });
      if (plan.previousEnd && movesLater) await this.changeEnds(tx, actor, rows, [plan.previousEnd]);
      return view;
    });
  }

  async delete(actor: AuthUser, id: bigint): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const target = await requireLink(tx, id);
      await lockEmployee(tx, target.memberId);
      const rows = await loadSeries(tx, target.memberId, target.linkType);
      const rules = await rulesOf(tx);

      const plan = runRule(() => planDeleteLast(rows.map(toRecord), id, rules));
      await tx.teamLink.delete({ where: { id } });
      await this.audit.log(tx, {
        userId: actor.id,
        action: 'HISTORY_DELETE',
        entityType: TABLE,
        entityId: id,
        oldData: withoutId(toTeamLinkView(target)),
      });
      if (plan.reopenPrevious) await this.changeEnds(tx, actor, rows, [plan.reopenPrevious]);
    });
  }

  private changeEnds(tx: Tx, actor: AuthUser, rows: TeamLinkRow[], changes: EndDateChange[]): Promise<void> {
    return applyEndDateChanges(tx, this.audit, actor.id, changes, {
      table: TABLE,
      rows,
      update: (id, endDate) => tx.teamLink.update({ where: { id }, data: { endDate }, include: TEAM_LINK_INCLUDE }),
      snapshot: (row) => withoutId(toTeamLinkView(row)),
    });
  }
}

function loadSeries(tx: Tx, memberId: bigint, linkType: string): Promise<TeamLinkRow[]> {
  return tx.teamLink.findMany({ where: { memberId, linkType }, include: TEAM_LINK_INCLUDE, orderBy: { startDate: 'asc' } });
}

function toRecord(row: TeamLinkRow) {
  return toHistoryRecord(row, row.leaderId.toString());
}

async function rulesOf(tx: Tx): Promise<HistoryRules> {
  return { lastClosedDay: await lastClosedDay(tx), monthStartOnly: false };
}

async function requireLink(tx: Tx, id: bigint): Promise<TeamLinkRow> {
  const link = await tx.teamLink.findUnique({ where: { id }, include: TEAM_LINK_INCLUDE });
  if (!link) throw new AppError(HttpStatus.NOT_FOUND, 'NOT_FOUND', `Havola topilmadi (id=${id})`);
  return link;
}
