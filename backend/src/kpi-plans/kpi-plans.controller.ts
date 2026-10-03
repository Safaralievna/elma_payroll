import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser, Roles } from '../auth/decorators';
import { codeSchema, Page } from '../common/schemas';
import { idParamSchema, ZodValidationPipe } from '../common/zod-validation.pipe';
import { KpiPlanView } from './kpi-plan-view';
import {
  CreatePlanInput,
  createPlanSchema,
  PeriodQuery,
  periodQuerySchema,
  PlanListQuery,
  planListSchema,
  UpdatePlanInput,
  updatePlanSchema,
} from './kpi-plans.schemas';
import { KpiPlansService, MissingPlansView } from './kpi-plans.service';

const codePipe = new ZodValidationPipe(codeSchema);
const idPipe = new ZodValidationPipe(idParamSchema);
const periodPipe = new ZodValidationPipe(periodQuerySchema);

/** Davr bo'yicha planlar. O'qish — hamma rol. */
@Controller('kpi-plans')
@Roles('ADMIN', 'CALCULATOR', 'APPROVER')
export class KpiPlansController {
  constructor(private readonly plans: KpiPlansService) {}

  @Get()
  list(@Query(new ZodValidationPipe(planListSchema)) query: PlanListQuery): Promise<Page<KpiPlanView>> {
    return this.plans.list(query);
  }

  /** Plan talab qiladigan, lekin kiritilmagan planlar — hisoblashdan oldin tekshirish uchun. */
  @Get('missing')
  missing(@Query(periodPipe) query: PeriodQuery): Promise<MissingPlansView> {
    return this.plans.missing(query);
  }
}

/** Xodimning planlari. URL'da xodimning biznes kodi, tanada KPI id'si. Yozish — CALCULATOR. */
@Controller('employees/:code/kpi-plans')
@Roles('CALCULATOR')
export class EmployeeKpiPlansController {
  constructor(private readonly plans: KpiPlansService) {}

  @Get()
  @Roles('ADMIN', 'CALCULATOR', 'APPROVER')
  list(@Param('code', codePipe) code: string, @Query(periodPipe) query: PeriodQuery): Promise<KpiPlanView[]> {
    return this.plans.listForEmployee(code, query);
  }

  @Post()
  create(
    @CurrentUser() actor: AuthUser,
    @Param('code', codePipe) code: string,
    @Body(new ZodValidationPipe(createPlanSchema)) body: CreatePlanInput,
  ): Promise<KpiPlanView> {
    return this.plans.create(actor, code, body);
  }

  @Patch(':id')
  update(
    @CurrentUser() actor: AuthUser,
    @Param('code', codePipe) code: string,
    @Param('id', idPipe) id: bigint,
    @Body(new ZodValidationPipe(updatePlanSchema)) body: UpdatePlanInput,
  ): Promise<KpiPlanView> {
    return this.plans.update(actor, code, id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(@CurrentUser() actor: AuthUser, @Param('code', codePipe) code: string, @Param('id', idPipe) id: bigint): Promise<void> {
    return this.plans.delete(actor, code, id);
  }
}
