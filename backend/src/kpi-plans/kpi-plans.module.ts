import { Module } from '@nestjs/common';
import { EmployeeKpiPlansController, KpiPlansController } from './kpi-plans.controller';
import { KpiPlansService } from './kpi-plans.service';

@Module({
  controllers: [KpiPlansController, EmployeeKpiPlansController],
  providers: [KpiPlansService],
})
export class KpiPlansModule {}
