import { Module } from '@nestjs/common';
import { KpiLinksService } from './kpi-links.service';
import { EmployeeKpisController, KpisController, PositionKpisController } from './kpis.controller';
import { KpisService } from './kpis.service';

@Module({
  controllers: [KpisController, PositionKpisController, EmployeeKpisController],
  providers: [KpisService, KpiLinksService],
})
export class KpisModule {}
