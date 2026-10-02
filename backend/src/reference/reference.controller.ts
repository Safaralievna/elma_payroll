import { Body, Controller, Get, Param, Patch, Post, Query, Type } from '@nestjs/common';
import { z } from 'zod';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser, Roles } from '../auth/decorators';
import { booleanQuerySchema, Page, paginationShape } from '../common/schemas';
import { idParamSchema, ZodValidationPipe } from '../common/zod-validation.pipe';
import { ReferenceResource } from './reference.resources';
import { ReferenceListQuery, ReferenceService, ReferenceView } from './reference.service';

const idPipe = new ZodValidationPipe(idParamSchema);

/**
 * Har bir ma'lumotnoma uchun bir xil kontroller: GET ro'yxat/bitta, POST, PATCH.
 * O'qish — hamma rol, yozish — faqat CALCULATOR. DELETE yo'q.
 */
export function referenceController(resource: ReferenceResource): Type<unknown> {
  const listSchema = z.strictObject({
    isActive: booleanQuerySchema.optional(),
    search: z.string().trim().min(1).max(100).optional(),
    ...paginationShape,
    ...resource.filterShape,
  });

  @Controller(resource.path)
  class ReferenceController {
    constructor(readonly service: ReferenceService) {}

    @Get()
    @Roles('ADMIN', 'CALCULATOR', 'APPROVER')
    list(@Query(new ZodValidationPipe(listSchema)) query: ReferenceListQuery): Promise<Page<ReferenceView>> {
      return this.service.list(resource, query);
    }

    @Get(':id')
    @Roles('ADMIN', 'CALCULATOR', 'APPROVER')
    get(@Param('id', idPipe) id: bigint): Promise<ReferenceView> {
      return this.service.get(resource, id);
    }

    @Post()
    @Roles('CALCULATOR')
    create(
      @CurrentUser() actor: AuthUser,
      @Body(new ZodValidationPipe(resource.createSchema)) body: Record<string, unknown>,
    ): Promise<ReferenceView> {
      return this.service.create(resource, actor, body);
    }

    @Patch(':id')
    @Roles('CALCULATOR')
    update(
      @CurrentUser() actor: AuthUser,
      @Param('id', idPipe) id: bigint,
      @Body(new ZodValidationPipe(resource.updateSchema)) body: Record<string, unknown>,
    ): Promise<ReferenceView> {
      return this.service.update(resource, actor, id, body);
    }
  }

  // Log va xatolarda qaysi ma'lumotnoma ekani ko'rinsin (masalan, "ProductGroupsController").
  const name = resource.path.replace(/(^|-)(\w)/g, (_match, _dash, letter: string) => letter.toUpperCase());
  Object.defineProperty(ReferenceController, 'name', { value: `${name}Controller` });
  return ReferenceController;
}
