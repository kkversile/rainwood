import { Module } from '@nestjs/common';
import { AvailabilityModule } from '../availability/availability.module';
import { InquiriesController } from './inquiries.controller';
import { InquiriesService } from './inquiries.service';
@Module({ imports: [AvailabilityModule], controllers: [InquiriesController], providers: [InquiriesService] })
export class InquiriesModule {}
