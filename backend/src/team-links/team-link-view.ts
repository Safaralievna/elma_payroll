import { z } from 'zod';
import { dateOrNull, dateToIso, isoDateSchema } from '../common/iso-date';
import { codeSchema } from '../common/schemas';
import { Prisma } from '../generated/prisma/client';
import { TEAM_LINK_TYPES } from './team-link-types';

export const TEAM_LINK_INCLUDE = {
  leader: { select: { employeeCode: true } },
  member: { select: { employeeCode: true } },
} satisfies Prisma.TeamLinkInclude;

export type TeamLinkRow = Prisma.TeamLinkGetPayload<{ include: typeof TEAM_LINK_INCLUDE }>;

export interface TeamLinkView {
  id: string;
  leaderCode: string;
  memberCode: string;
  linkType: string;
  startDate: string;
  endDate: string | null;
}

export function toTeamLinkView(row: TeamLinkRow): TeamLinkView {
  return {
    id: row.id.toString(),
    leaderCode: row.leader.employeeCode,
    memberCode: row.member.employeeCode,
    linkType: row.linkType,
    startDate: dateToIso(row.startDate),
    endDate: dateOrNull(row.endDate),
  };
}

export const createTeamLinkSchema = z
  .strictObject({
    leaderCode: codeSchema,
    memberCode: codeSchema,
    linkType: z.enum(TEAM_LINK_TYPES),
    startDate: isoDateSchema,
    endDate: isoDateSchema.nullable().optional(),
  })
  .refine((value) => value.leaderCode !== value.memberCode, {
    message: "Xodim o'ziga o'zi rahbar bo'la olmaydi",
    path: ['leaderCode'],
  });
export type CreateTeamLinkInput = z.output<typeof createTeamLinkSchema>;

export const updateTeamLinkSchema = z
  .strictObject({
    leaderCode: codeSchema.optional(),
    startDate: isoDateSchema.optional(),
    endDate: isoDateSchema.nullable().optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: "Kamida bitta maydon o'zgartirilishi kerak",
  });
export type UpdateTeamLinkInput = z.output<typeof updateTeamLinkSchema>;

export const teamLinkListSchema = z.strictObject({
  leaderCode: codeSchema.optional(),
  memberCode: codeSchema.optional(),
  linkType: z.enum(TEAM_LINK_TYPES).optional(),
  /** Shu sanada amal qiladigan havolalar. */
  date: isoDateSchema.optional(),
});
export type TeamLinkListQuery = z.output<typeof teamLinkListSchema>;
