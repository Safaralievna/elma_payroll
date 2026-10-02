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
  // 4-bosqich. entity_type jadval nomini bildiradi (departments, products, employee_assignments ...).
  'REFERENCE_CREATE',
  'REFERENCE_UPDATE',
  'EMPLOYEE_CREATE',
  'EMPLOYEE_UPDATE',
  'HISTORY_CREATE',
  'HISTORY_UPDATE',
  'HISTORY_DELETE',
  'IMPORT_APPLY',
  'IMPORT_INVALID',
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];
