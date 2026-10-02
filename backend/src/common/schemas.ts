import { z } from 'zod';
import { idParamSchema } from './zod-validation.pipe';

/** Biznes kodi (xodim, bo'lim, mahsulot ...). */
export const codeSchema = z.string().trim().min(1).max(50);

/** Pul summasi — faqat satr ("1500000.50"), float xatoligi bo'lmasligi uchun. ≥ 0, ko'pi bilan 2 kasr. */
export const moneySchema = z
  .string()
  .trim()
  .regex(/^\d{1,16}(\.\d{1,2})?$/, "Summa satr ko'rinishida, ≥ 0 va ko'pi bilan 2 kasr belgisi bilan bo'lishi kerak");

/** Query'dagi true/false. */
export const booleanQuerySchema = z.enum(['true', 'false']).transform((value) => value === 'true');

/** Query yoki body'dagi DB id'si (satr). */
export const idSchema = idParamSchema;

export const paginationShape = {
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(50),
};

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
