import { Module } from '@nestjs/common';
import { BanquetsController } from './banquets.controller';
import { FunctionSpacesController } from './function-spaces.controller';
import { BanquetsService } from './banquets.service';
import { FeaturesModule } from '../features/features.module';

@Module({ imports: [FeaturesModule], controllers: [BanquetsController, FunctionSpacesController], providers: [BanquetsService], exports: [BanquetsService] })
export class BanquetsModule {}
