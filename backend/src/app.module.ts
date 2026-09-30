import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './common/prisma.module';
import { CommonModule } from './common/common.module';
import { validateEnvironment } from './common/env.validation';
import { HotelsModule } from './modules/hotels/hotels.module';
import { AvailabilityModule } from './modules/availability/availability.module';
import { ReservationsModule } from './modules/reservations/reservations.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { ReportsModule } from './modules/reports/reports.module';
import { AxisRoomsModule } from './modules/axisrooms/axisrooms.module';
import { AuthModule } from './modules/auth/auth.module';
import { HoldsModule } from './modules/holds/holds.module';
import { FilesModule } from './modules/files/files.module';
import { VouchersModule } from './modules/vouchers/vouchers.module';
import { JobsModule } from './modules/jobs/jobs.module';
import { HealthModule } from './modules/health/health.module';
import { UsersModule } from './modules/users/users.module';
import { AuditModule } from './modules/audit/audit.module';
import { ReconciliationModule } from './modules/reconciliation/reconciliation.module';
import { WalletModule } from './modules/wallet/wallet.module';
import { ContactModule } from './modules/contact/contact.module';
import { SiteSettingsModule } from './modules/site-settings/site-settings.module';
import { AgentsModule } from './modules/agents/agents.module';
import { SupplementaryChargesModule } from './modules/supplementary-charges/supplementary-charges.module';
import { StaffModule } from './modules/staff/staff.module';
import { HousekeepingModule } from './modules/housekeeping/housekeeping.module';
import { MaintenanceModule } from './modules/maintenance/maintenance.module';
import { NightAuditModule } from './modules/night-audit/night-audit.module';
import { ManagementDashboardModule } from './modules/management-dashboard/management-dashboard.module';
import { ExpensesModule } from './modules/expenses/expenses.module';
import { CorporatesModule } from './modules/corporates/corporates.module';
import { InquiriesModule } from './modules/inquiries/inquiries.module';
import { GuestsModule } from './modules/guests/guests.module';
import { RevenueForecastModule } from './modules/revenue-forecast/revenue-forecast.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnvironment }),
    PrismaModule,
    CommonModule,
    AuthModule,
    HotelsModule,
    AvailabilityModule,
    HoldsModule,
    ReservationsModule,
    PaymentsModule,
    ReportsModule,
    AxisRoomsModule,
    FilesModule,
    VouchersModule,
    JobsModule,
    HealthModule,
    UsersModule,
    AuditModule,
    ReconciliationModule,
    WalletModule,
    ContactModule,
    SiteSettingsModule,
    AgentsModule,
    SupplementaryChargesModule,
    StaffModule,
    HousekeepingModule,
    MaintenanceModule,
    NightAuditModule,
    ManagementDashboardModule,
    ExpensesModule,
    CorporatesModule,
    InquiriesModule,
    GuestsModule,
    RevenueForecastModule,
  ],
})
export class AppModule {}
