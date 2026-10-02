import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser, Roles } from '../auth/decorators';
import { codeSchema, Page } from '../common/schemas';
import { idParamSchema, ZodValidationPipe } from '../common/zod-validation.pipe';
import { EmployeeHistoryService } from './employee-history.service';
import { AssignmentView, EmployeeView, SalaryView } from './employee-view';
import {
  CreateAssignmentInput,
  createAssignmentSchema,
  CreateEmployeeInput,
  createEmployeeSchema,
  CreateSalaryInput,
  createSalarySchema,
  employeeGetSchema,
  EmployeeListQuery,
  employeeListSchema,
  UpdateAssignmentInput,
  updateAssignmentSchema,
  UpdateEmployeeInput,
  updateEmployeeSchema,
  UpdateSalaryInput,
  updateSalarySchema,
} from './employees.schemas';
import { EmployeesService } from './employees.service';

const codePipe = new ZodValidationPipe(codeSchema);
const idPipe = new ZodValidationPipe(idParamSchema);

/**
 * Xodimlar va ularning lavozim/maosh tarixi. URL'da xodimning biznes kodi
 * (CLAUDE.md 8-qoida). O'qish — hamma rol, yozish — CALCULATOR.
 */
@Controller('employees')
@Roles('CALCULATOR')
export class EmployeesController {
  constructor(
    private readonly employees: EmployeesService,
    private readonly history: EmployeeHistoryService,
  ) {}

  @Get()
  @Roles('ADMIN', 'CALCULATOR', 'APPROVER')
  list(@Query(new ZodValidationPipe(employeeListSchema)) query: EmployeeListQuery): Promise<Page<EmployeeView>> {
    return this.employees.list(query);
  }

  @Get(':code')
  @Roles('ADMIN', 'CALCULATOR', 'APPROVER')
  get(
    @Param('code', codePipe) code: string,
    @Query(new ZodValidationPipe(employeeGetSchema)) query: { date?: string },
  ): Promise<EmployeeView> {
    return this.employees.get(code, query.date);
  }

  @Post()
  create(
    @CurrentUser() actor: AuthUser,
    @Body(new ZodValidationPipe(createEmployeeSchema)) body: CreateEmployeeInput,
  ): Promise<EmployeeView> {
    return this.employees.create(actor, body);
  }

  @Patch(':code')
  update(
    @CurrentUser() actor: AuthUser,
    @Param('code', codePipe) code: string,
    @Body(new ZodValidationPipe(updateEmployeeSchema)) body: UpdateEmployeeInput,
  ): Promise<EmployeeView> {
    return this.employees.update(actor, code, body);
  }

  // ---------- Lavozim tarixi ----------

  @Get(':code/assignments')
  @Roles('ADMIN', 'CALCULATOR', 'APPROVER')
  listAssignments(@Param('code', codePipe) code: string): Promise<AssignmentView[]> {
    return this.history.listAssignments(code);
  }

  @Post(':code/assignments')
  createAssignment(
    @CurrentUser() actor: AuthUser,
    @Param('code', codePipe) code: string,
    @Body(new ZodValidationPipe(createAssignmentSchema)) body: CreateAssignmentInput,
  ): Promise<AssignmentView> {
    return this.history.createAssignment(actor, code, body);
  }

  @Patch(':code/assignments/:id')
  updateAssignment(
    @CurrentUser() actor: AuthUser,
    @Param('code', codePipe) code: string,
    @Param('id', idPipe) id: bigint,
    @Body(new ZodValidationPipe(updateAssignmentSchema)) body: UpdateAssignmentInput,
  ): Promise<AssignmentView> {
    return this.history.updateAssignment(actor, code, id, body);
  }

  @Delete(':code/assignments/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteAssignment(
    @CurrentUser() actor: AuthUser,
    @Param('code', codePipe) code: string,
    @Param('id', idPipe) id: bigint,
  ): Promise<void> {
    return this.history.deleteAssignment(actor, code, id);
  }

  // ---------- Maosh tarixi ----------

  @Get(':code/salaries')
  @Roles('ADMIN', 'CALCULATOR', 'APPROVER')
  listSalaries(@Param('code', codePipe) code: string): Promise<SalaryView[]> {
    return this.history.listSalaries(code);
  }

  @Post(':code/salaries')
  createSalary(
    @CurrentUser() actor: AuthUser,
    @Param('code', codePipe) code: string,
    @Body(new ZodValidationPipe(createSalarySchema)) body: CreateSalaryInput,
  ): Promise<SalaryView> {
    return this.history.createSalary(actor, code, body);
  }

  @Patch(':code/salaries/:id')
  updateSalary(
    @CurrentUser() actor: AuthUser,
    @Param('code', codePipe) code: string,
    @Param('id', idPipe) id: bigint,
    @Body(new ZodValidationPipe(updateSalarySchema)) body: UpdateSalaryInput,
  ): Promise<SalaryView> {
    return this.history.updateSalary(actor, code, id, body);
  }

  @Delete(':code/salaries/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteSalary(
    @CurrentUser() actor: AuthUser,
    @Param('code', codePipe) code: string,
    @Param('id', idPipe) id: bigint,
  ): Promise<void> {
    return this.history.deleteSalary(actor, code, id);
  }
}
