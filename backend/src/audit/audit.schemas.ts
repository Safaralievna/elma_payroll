import { z } from 'zod';
import { idParamSchema } from '../common/zod-validation.pipe';

/** GET /audit-logs filtrlari. Noma'lum parametr — xato (xato yozilgan filtr jim e'tiborsiz qolmasin). */
export const auditQuerySchema = z.strictObject({
  entityType: z.string().trim().min(1).max(100).optional(),
  entityId: idParamSchema.optional(),
  userId: idParamSchema.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

export type AuditQuery = z.output<typeof auditQuerySchema>;
