import { Decimal } from '../calculation/decimal';

export type AuditJson = string | number | boolean | null | AuditJson[] | { [key: string]: AuditJson };

/** Auditga hech qachon tushmasligi kerak bo'lgan maydonlar (har qanday chuqurlikda). */
const SECRET_KEYS = new Set([
  'password',
  'passwordHash',
  'password_hash',
  'currentPassword',
  'newPassword',
  'accessToken',
]);

/**
 * Qiymatni audit_logs.old_data/new_data uchun xavfsiz JSON'ga aylantiradi:
 * maxfiy maydonlar olib tashlanadi, BigInt/Decimal → aniq satr, Date → ISO satr.
 * Kirish obyekti o'zgartirilmaydi.
 */
export function sanitizeForAudit(value: unknown): AuditJson {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error(`Audit: cheksiz son JSON'ga yozilmaydi (${value})`);
    }
    return value;
  }
  if (typeof value === 'bigint') {
    return value.toString();
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  // Prisma Decimal ham decimal.js asosida — isDecimal ikkalasini taniydi.
  if (Decimal.isDecimal(value)) {
    return value.toString();
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeForAudit);
  }
  if (typeof value === 'object') {
    const result: { [key: string]: AuditJson } = {};
    for (const [key, item] of Object.entries(value)) {
      if (item === undefined || SECRET_KEYS.has(key)) continue;
      result[key] = sanitizeForAudit(item);
    }
    return result;
  }
  throw new Error(`Audit: ${typeof value} turidagi qiymat JSON'ga yozilmaydi`);
}
