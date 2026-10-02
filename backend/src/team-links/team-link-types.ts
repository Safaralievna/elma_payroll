/** Havola turi: xodim bir vaqtda bitta supervayzerga va bitta operatorga bo'ysunishi mumkin (DECISIONS 2.4). */
export const TEAM_LINK_TYPES = ['SUPERVISOR', 'OPERATOR'] as const;
export type TeamLinkType = (typeof TEAM_LINK_TYPES)[number];
