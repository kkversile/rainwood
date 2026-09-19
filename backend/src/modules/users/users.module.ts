import { Module } from '@nestjs/common';
import { AgentsModule } from '../agents/agents.module';
import { UsersController } from './users.controller';

@Module({ imports: [AgentsModule], controllers: [UsersController] })
export class UsersModule {}
