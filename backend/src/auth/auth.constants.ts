/** MVP rollari (seed yaratadi). DECISIONS 5. */
export const ROLE_NAMES = ['ADMIN', 'CALCULATOR', 'APPROVER'] as const;
export type RoleName = (typeof ROLE_NAMES)[number];

/** Parol uzunligi. Yuqori chegara — juda uzun parol argon2 ni sekinlashtirmasligi uchun. */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

/** /auth/login: bitta IP'dan daqiqasiga 5 ta urinish. */
export const LOGIN_THROTTLE = { name: 'login', ttlMs: 60_000, limit: 5 } as const;

export const IS_PUBLIC_KEY = 'auth:isPublic';
export const ROLES_KEY = 'auth:roles';
