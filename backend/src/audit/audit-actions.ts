/**
 * audit_logs.action qiymatlari — bitta joyda.
 * Keyingi bosqichlar (KPI, import, davr, to'lov) o'z amallarini shu yerga qo'shadi.
 */
export const AUDIT_ACTIONS = [
  'LOGIN_SUCCESS',
  'LOGIN_FAILED',
  'PASSWORD_CHANGE',
  'USER_CREATE',
  'USER_UPDATE',
  'USER_PASSWORD_RESET',
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];
