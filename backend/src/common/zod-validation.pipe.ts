import { HttpStatus, PipeTransform } from '@nestjs/common';
import { z } from 'zod';
import { AppError } from './app-error';

/**
 * Kiruvchi ma'lumotni Zod sxemasi bilan tekshiradi.
 * Ishlatilishi: `@Body(new ZodValidationPipe(createUserSchema)) body: CreateUserInput`.
 * Xato bo'lsa — 400 VALIDATION_ERROR, `details` da har bir maydon yo'li va sababi.
 */
export class ZodValidationPipe<T extends z.ZodType> implements PipeTransform<unknown, z.output<T>> {
  constructor(private readonly schema: T) {}

  transform(value: unknown): z.output<T> {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new AppError(
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR',
        "Ma'lumot noto'g'ri",
        result.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
      );
    }
    return result.data;
  }
}

/** DB'dagi bigint id (URL parametri yoki filtr) → BigInt. 18 xonagacha — bigint chegarasidan oshmaydi. */
export const idParamSchema = z
  .string()
  .regex(/^\d{1,18}$/, "id musbat butun son bo'lishi kerak")
  .transform((value) => BigInt(value));
