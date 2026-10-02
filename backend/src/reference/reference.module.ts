import { Module } from '@nestjs/common';
import { referenceController } from './reference.controller';
import { REFERENCE_RESOURCES } from './reference.resources';
import { ReferenceService } from './reference.service';

@Module({
  controllers: REFERENCE_RESOURCES.map(referenceController),
  providers: [ReferenceService],
})
export class ReferenceModule {}
