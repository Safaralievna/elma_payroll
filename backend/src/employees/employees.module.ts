import { Module } from '@nestjs/common';
import { EmployeeHistoryService } from './employee-history.service';
import { EmployeesController } from './employees.controller';
import { EmployeesService } from './employees.service';

@Module({
  controllers: [EmployeesController],
  providers: [EmployeesService, EmployeeHistoryService],
})
export class EmployeesModule {}
