import { Module } from '@nestjs/common';
import { GuestServicesService } from './guest-services.service';
import { LostFoundController, ServiceItemsController, ServiceOrdersController } from './guest-services.controller';

@Module({ controllers: [ServiceItemsController, ServiceOrdersController, LostFoundController], providers: [GuestServicesService], exports: [GuestServicesService] })
export class GuestServicesModule {}
