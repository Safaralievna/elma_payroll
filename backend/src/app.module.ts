import { Module } from '@nestjs/common';

/**
 * Ildiz modul.
 *
 * 1-bosqichda hisoblash yadrosi (src/calculation) NestJS'ga bog'lanmagan toza
 * funksiyalardan iborat — u bazasiz va HTTP'siz testlanadi. Keyingi bosqichlarda
 * bu yerga PrismaModule, OrganizationModule, KpiModule, ImportModule,
 * PayrollModule va boshqalar qo'shiladi.
 */
@Module({
  imports: [],
})
export class AppModule {}
