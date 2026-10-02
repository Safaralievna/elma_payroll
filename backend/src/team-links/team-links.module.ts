import { Module } from '@nestjs/common';
import { TeamLinksController } from './team-links.controller';
import { TeamLinksService } from './team-links.service';

@Module({
  controllers: [TeamLinksController],
  providers: [TeamLinksService],
})
export class TeamLinksModule {}
