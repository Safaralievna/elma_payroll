import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser, Roles } from '../auth/decorators';
import { idParamSchema, ZodValidationPipe } from '../common/zod-validation.pipe';
import {
  CreateTeamLinkInput,
  createTeamLinkSchema,
  TeamLinkListQuery,
  teamLinkListSchema,
  TeamLinkView,
  UpdateTeamLinkInput,
  updateTeamLinkSchema,
} from './team-link-view';
import { TeamLinksService } from './team-links.service';

const idPipe = new ZodValidationPipe(idParamSchema);

@Controller('team-links')
@Roles('CALCULATOR')
export class TeamLinksController {
  constructor(private readonly links: TeamLinksService) {}

  @Get()
  @Roles('ADMIN', 'CALCULATOR', 'APPROVER')
  list(@Query(new ZodValidationPipe(teamLinkListSchema)) query: TeamLinkListQuery): Promise<TeamLinkView[]> {
    return this.links.list(query);
  }

  @Post()
  create(
    @CurrentUser() actor: AuthUser,
    @Body(new ZodValidationPipe(createTeamLinkSchema)) body: CreateTeamLinkInput,
  ): Promise<TeamLinkView> {
    return this.links.create(actor, body);
  }

  @Patch(':id')
  update(
    @CurrentUser() actor: AuthUser,
    @Param('id', idPipe) id: bigint,
    @Body(new ZodValidationPipe(updateTeamLinkSchema)) body: UpdateTeamLinkInput,
  ): Promise<TeamLinkView> {
    return this.links.update(actor, id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(@CurrentUser() actor: AuthUser, @Param('id', idPipe) id: bigint): Promise<void> {
    return this.links.delete(actor, id);
  }
}
