import { Module } from '@nestjs/common';
import { CorporatesController } from './corporates.controller';
import { CorporatesService } from './corporates.service';
@Module({ controllers: [CorporatesController], providers: [CorporatesService] })
export class CorporatesModule {}
