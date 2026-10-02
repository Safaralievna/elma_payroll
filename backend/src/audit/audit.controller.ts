import { Controller, Get, Query } from '@nestjs/common';
import { Roles } from '../auth/decorators';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AuditQuery, auditQuerySchema } from './audit.schemas';
import { AuditPage, AuditService } from './audit.service';

@Controller('audit-logs')
@Roles('ADMIN', 'APPROVER')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  list(@Query(new ZodValidationPipe(auditQuerySchema)) query: AuditQuery): Promise<AuditPage> {
    return this.audit.list(query);
  }
}
