import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser, Roles } from '../auth/decorators';
import { codeSchema, Page } from '../common/schemas';
import { idParamSchema, ZodValidationPipe } from '../common/zod-validation.pipe';
import { EffectiveKpisView, KpiLinksService } from './kpi-links.service';
import { KpiView, OverrideView, PositionKpiView, RuleView } from './kpi-view';
import {
  CreateKpiInput,
  createKpiSchema,
  CreateOverrideInput,
  createOverrideSchema,
  CreatePositionKpiInput,
  createPositionKpiSchema,
  EffectiveKpisQuery,
  effectiveKpisSchema,
  KpiListQuery,
  kpiListSchema,
  PositionKpiListQuery,
  positionKpiListSchema,
  RuleInput,
  ruleSchema,
  UpdateKpiInput,
  UpdateKpiLinkInput,
  updateKpiLinkSchema,
  updateKpiSchema,
} from './kpis.schemas';
import { KpiSummaryView, KpisService } from './kpis.service';

const codePipe = new ZodValidationPipe(codeSchema);
const idPipe = new ZodValidationPipe(idParamSchema);

/**
 * KPI konstruktor. URL'da KPI kodi. O'qish — hamma rol, yozish — CALCULATOR (DECISIONS 2.5).
 * KPI o'chirilmaydi — nofaol qilinadi.
 */
@Controller('kpis')
@Roles('CALCULATOR')
export class KpisController {
  constructor(private readonly kpis: KpisService) {}

  @Get()
  @Roles('ADMIN', 'CALCULATOR', 'APPROVER')
  list(@Query(new ZodValidationPipe(kpiListSchema)) query: KpiListQuery): Promise<Page<KpiSummaryView>> {
    return this.kpis.list(query);
  }

  @Get(':code')
  @Roles('ADMIN', 'CALCULATOR', 'APPROVER')
  get(@Param('code', codePipe) code: string): Promise<KpiView> {
    return this.kpis.get(code);
  }

  @Post()
  create(@CurrentUser() actor: AuthUser, @Body(new ZodValidationPipe(createKpiSchema)) body: CreateKpiInput): Promise<KpiView> {
    return this.kpis.create(actor, body);
  }

  @Patch(':code')
  update(
    @CurrentUser() actor: AuthUser,
    @Param('code', codePipe) code: string,
    @Body(new ZodValidationPipe(updateKpiSchema)) body: UpdateKpiInput,
  ): Promise<KpiView> {
    return this.kpis.update(actor, code, body);
  }

  @Post(':code/rules')
  createRule(
    @CurrentUser() actor: AuthUser,
    @Param('code', codePipe) code: string,
    @Body(new ZodValidationPipe(ruleSchema)) body: RuleInput,
  ): Promise<RuleView> {
    return this.kpis.createRule(actor, code, body);
  }

  @Put(':code/rules/:ruleId')
  replaceRule(
    @CurrentUser() actor: AuthUser,
    @Param('code', codePipe) code: string,
    @Param('ruleId', idPipe) ruleId: bigint,
    @Body(new ZodValidationPipe(ruleSchema)) body: RuleInput,
  ): Promise<RuleView> {
    return this.kpis.replaceRule(actor, code, ruleId, body);
  }

  @Delete(':code/rules/:ruleId')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteRule(
    @CurrentUser() actor: AuthUser,
    @Param('code', codePipe) code: string,
    @Param('ruleId', idPipe) ruleId: bigint,
  ): Promise<void> {
    return this.kpis.deleteRule(actor, code, ruleId);
  }
}

/** KPI'ni lavozimga biriktirish. */
@Controller('position-kpis')
@Roles('CALCULATOR')
export class PositionKpisController {
  constructor(private readonly links: KpiLinksService) {}

  @Get()
  @Roles('ADMIN', 'CALCULATOR', 'APPROVER')
  list(@Query(new ZodValidationPipe(positionKpiListSchema)) query: PositionKpiListQuery): Promise<PositionKpiView[]> {
    return this.links.listPositionKpis(query);
  }

  @Post()
  create(
    @CurrentUser() actor: AuthUser,
    @Body(new ZodValidationPipe(createPositionKpiSchema)) body: CreatePositionKpiInput,
  ): Promise<PositionKpiView> {
    return this.links.createPositionKpi(actor, body);
  }

  @Patch(':id')
  update(
    @CurrentUser() actor: AuthUser,
    @Param('id', idPipe) id: bigint,
    @Body(new ZodValidationPipe(updateKpiLinkSchema)) body: UpdateKpiLinkInput,
  ): Promise<PositionKpiView> {
    return this.links.updatePositionKpi(actor, id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(@CurrentUser() actor: AuthUser, @Param('id', idPipe) id: bigint): Promise<void> {
    return this.links.deletePositionKpi(actor, id);
  }
}

/** Xodim uchun ADD/REMOVE va xodimning oydagi amaldagi KPI'lari. URL'da xodimning biznes kodi. */
@Controller('employees/:code')
@Roles('CALCULATOR')
export class EmployeeKpisController {
  constructor(private readonly links: KpiLinksService) {}

  @Get('kpis')
  @Roles('ADMIN', 'CALCULATOR', 'APPROVER')
  effective(
    @Param('code', codePipe) code: string,
    @Query(new ZodValidationPipe(effectiveKpisSchema)) query: EffectiveKpisQuery,
  ): Promise<EffectiveKpisView> {
    return this.links.effectiveKpis(code, query);
  }

  @Get('kpi-overrides')
  @Roles('ADMIN', 'CALCULATOR', 'APPROVER')
  listOverrides(@Param('code', codePipe) code: string): Promise<OverrideView[]> {
    return this.links.listOverrides(code);
  }

  @Post('kpi-overrides')
  createOverride(
    @CurrentUser() actor: AuthUser,
    @Param('code', codePipe) code: string,
    @Body(new ZodValidationPipe(createOverrideSchema)) body: CreateOverrideInput,
  ): Promise<OverrideView> {
    return this.links.createOverride(actor, code, body);
  }

  @Patch('kpi-overrides/:id')
  updateOverride(
    @CurrentUser() actor: AuthUser,
    @Param('code', codePipe) code: string,
    @Param('id', idPipe) id: bigint,
    @Body(new ZodValidationPipe(updateKpiLinkSchema)) body: UpdateKpiLinkInput,
  ): Promise<OverrideView> {
    return this.links.updateOverride(actor, code, id, body);
  }

  @Delete('kpi-overrides/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteOverride(
    @CurrentUser() actor: AuthUser,
    @Param('code', codePipe) code: string,
    @Param('id', idPipe) id: bigint,
  ): Promise<void> {
    return this.links.deleteOverride(actor, code, id);
  }
}
