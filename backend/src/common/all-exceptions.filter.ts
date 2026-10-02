import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { Prisma } from '../generated/prisma/client';
import { AppError, ErrorBody, ErrorCode } from './app-error';

const CODE_BY_STATUS: Partial<Record<number, ErrorCode>> = {
  [HttpStatus.BAD_REQUEST]: 'BAD_REQUEST',
  [HttpStatus.UNAUTHORIZED]: 'UNAUTHORIZED',
  [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
  [HttpStatus.CONFLICT]: 'CONFLICT',
  [HttpStatus.PAYLOAD_TOO_LARGE]: 'PAYLOAD_TOO_LARGE',
  [HttpStatus.TOO_MANY_REQUESTS]: 'TOO_MANY_ATTEMPTS',
};

/**
 * Hamma xatolarni bitta formatga keltiradi: `{ code, message, details? }`.
 *
 * Kutilmagan xatolar (500) log'ga to'liq yoziladi, lekin mijozga ichki
 * tafsilot (SQL, parol, stack) chiqarilmaydi.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const { status, body } = this.toErrorResponse(exception);
    response.status(status).json(body);
  }

  private toErrorResponse(exception: unknown): { status: number; body: ErrorBody } {
    if (exception instanceof AppError) {
      return { status: exception.getStatus(), body: exception.getResponse() as ErrorBody };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      return { status, body: { code: CODE_BY_STATUS[status] ?? 'HTTP_ERROR', message: exception.message } };
    }

    // Tranzaksiya ichidagi tekshiruvdan keyin bir vaqtda kelgan so'rov unique'ni buzsa.
    if (exception instanceof Prisma.PrismaClientKnownRequestError && exception.code === 'P2002') {
      return {
        status: HttpStatus.CONFLICT,
        body: { code: 'CONFLICT', message: 'Bunday yozuv allaqachon mavjud' },
      };
    }

    // Tarixiy yozuvlar ustma-ust tushdi (EXCLUDE USING gist). Servis buni oldindan
    // tekshiradi; bu — bir vaqtdagi ikki so'rov holati. Prisma 7 + pg adapter:
    // asl Postgres kodi meta.driverAdapterError.cause.originalCode da.
    if (exception instanceof Prisma.PrismaClientKnownRequestError && postgresCode(exception) === '23P01') {
      return {
        status: HttpStatus.CONFLICT,
        body: { code: 'HISTORY_OVERLAP', message: "Tarixiy yozuvlar sanalari ustma-ust tushadi" },
      };
    }

    this.logger.error(exception instanceof Error ? exception.stack ?? exception.message : String(exception));
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: { code: 'INTERNAL_ERROR', message: 'Ichki server xatosi' },
    };
  }
}

function postgresCode(error: Prisma.PrismaClientKnownRequestError): string | undefined {
  const meta = error.meta as { driverAdapterError?: { cause?: { originalCode?: string } } } | undefined;
  return meta?.driverAdapterError?.cause?.originalCode;
}
