import { Global, Module } from '@nestjs/common';
import { FeaturesController } from './features.controller';
import { FeaturesService } from './features.service';
import { FeatureGuard } from './feature.guard';

@Global()
@Module({ controllers: [FeaturesController], providers: [FeaturesService, FeatureGuard], exports: [FeaturesService, FeatureGuard] })
export class FeaturesModule {}
