import { Module } from '@nestjs/common';
import { FilesModule } from '../files/files.module';
import { AgentsController } from './agents.controller';
import { AgentsService } from './agents.service';

@Module({ imports: [FilesModule], controllers: [AgentsController], providers: [AgentsService], exports: [AgentsService] })
export class AgentsModule {}
