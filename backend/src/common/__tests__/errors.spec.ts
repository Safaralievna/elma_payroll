import {
  ArgumentsHost,
  ForbiddenException,
  HttpStatus,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { z } from 'zod';
import { Prisma } from '../../generated/prisma/client';
import { AppError } from '../app-error';
import { AllExceptionsFilter } from '../all-exceptions.filter';
import { ZodValidationPipe } from '../zod-validation.pipe';

function runFilter(exception: unknown): { status: number; body: unknown } {
  const result = { status: 0, body: undefined as unknown };
  const response = {
    status(code: number) {
      result.status = code;
      return this;
    },
    json(body: unknown) {
      result.body = body;
      return this;
    },
  };
  const host = { switchToHttp: () => ({ getResponse: () => response }) } as unknown as ArgumentsHost;
  new AllExceptionsFilter().catch(exception, host);
  return result;
}

describe('AllExceptionsFilter — javob doim { code, message, details? }', () => {
  it('AppError — o\'z kodi, xabari va tafsilotlari bilan', () => {
    const error = new AppError(HttpStatus.CONFLICT, 'LAST_ADMIN', 'Oxirgi admin', { userId: '1' });
    expect(runFilter(error)).toEqual({
      status: 409,
      body: { code: 'LAST_ADMIN', message: 'Oxirgi admin', details: { userId: '1' } },
    });
  });

  it('AppError tafsilotsiz — details maydoni bo\'lmaydi', () => {
    expect(runFilter(new AppError(HttpStatus.FORBIDDEN, 'FORBIDDEN', 'Ruxsat yo\'q')).body).toEqual({
      code: 'FORBIDDEN',
      message: 'Ruxsat yo\'q',
    });
  });

  it('NestJS HttpException — status bo\'yicha kod', () => {
    expect(runFilter(new NotFoundException('Cannot GET /api/xyz'))).toEqual({
      status: 404,
      body: { code: 'NOT_FOUND', message: 'Cannot GET /api/xyz' },
    });
    expect(runFilter(new ForbiddenException()).body).toMatchObject({ code: 'FORBIDDEN' });
  });

  it('Prisma unique buzilishi (P2002) — 409 CONFLICT', () => {
    const error = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: 'test',
    });
    expect(runFilter(error)).toMatchObject({ status: 409, body: { code: 'CONFLICT' } });
  });

  it('Tarixiy yozuvlar ustma-ust (EXCLUDE, Postgres 23P01) — 409 HISTORY_OVERLAP', () => {
    const error = new Prisma.PrismaClientKnownRequestError('Exclusion constraint', {
      code: 'P2039',
      clientVersion: 'test',
      meta: { driverAdapterError: { cause: { originalCode: '23P01', constraint: 'x' } } },
    });
    expect(runFilter(error)).toMatchObject({ status: 409, body: { code: 'HISTORY_OVERLAP' } });
  });

  it('Juda katta so\'rov/fayl (413) — PAYLOAD_TOO_LARGE', () => {
    expect(runFilter(new PayloadTooLargeException('File too large'))).toMatchObject({
      status: 413,
      body: { code: 'PAYLOAD_TOO_LARGE' },
    });
  });

  it('Kutilmagan xato — 500 INTERNAL_ERROR, ichki tafsilot tashqariga chiqmaydi, lekin log yoziladi', () => {
    const logSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const result = runFilter(new Error('DB parol: secret123'));
    expect(result.status).toBe(500);
    expect(result.body).toEqual({ code: 'INTERNAL_ERROR', message: expect.any(String) });
    expect(JSON.stringify(result.body)).not.toContain('secret123');
    expect(logSpy).toHaveBeenCalled();
    logSpy.mockRestore();
  });
});

describe('ZodValidationPipe', () => {
  const pipe = new ZodValidationPipe(z.object({ name: z.string().min(1), age: z.number().int() }));

  it('to\'g\'ri ma\'lumot — tozalangan qiymat qaytadi', () => {
    expect(pipe.transform({ name: 'Ali', age: 3 })).toEqual({ name: 'Ali', age: 3 });
  });

  it('noto\'g\'ri ma\'lumot — 400 VALIDATION_ERROR, details da maydon yo\'llari', () => {
    let caught: unknown;
    try {
      pipe.transform({ name: '', age: 'x' });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AppError);
    const appError = caught as AppError;
    expect(appError.getStatus()).toBe(400);
    expect(appError.code).toBe('VALIDATION_ERROR');
    const paths = (appError.details as { path: string }[]).map((d) => d.path).sort();
    expect(paths).toEqual(['age', 'name']);
  });
});
