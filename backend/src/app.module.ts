import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { AllExceptionsFilter } from './common/all-exceptions.filter';
import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './users/users.module';

/**
 * Ildiz modul.
 *
 * Hisoblash yadrosi (src/calculation) NestJS'ga bog'lanmagan toza funksiyalar —
 * u bazasiz va HTTP'siz testlanadi. PrismaModule va AuditModule global.
 * AuthModule hamma endpointga JwtAuthGuard + RolesGuard qo'yadi (ochiqlari — @Public()).
 */
@Module({
  imports: [PrismaModule, AuditModule, AuthModule, UsersModule],
  providers: [{ provide: APP_FILTER, useClass: AllExceptionsFilter }],
})
export class AppModule {}
