import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';

/**
 * Ildiz modul.
 *
 * Hisoblash yadrosi (src/calculation) NestJS'ga bog'lanmagan toza funksiyalar —
 * u bazasiz va HTTP'siz testlanadi. PrismaModule global: hamma servislar
 * PrismaService'ni inject qila oladi. Keyingi bosqichlarda bu yerga
 * AuthModule, OrganizationModule, KpiModule, ImportModule, PayrollModule qo'shiladi.
 */
@Module({
  imports: [PrismaModule],
})
export class AppModule {}
