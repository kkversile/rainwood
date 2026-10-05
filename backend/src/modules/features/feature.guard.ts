import { CanActivate, ExecutionContext, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { getActorScope, resolveRequestedHotel } from '../../common/role-scope';
import { PrismaService } from '../../common/prisma.service';
import { FeaturesService } from './features.service';
import { REQUIRED_FEATURE_KEY } from './require-feature.decorator';

@Injectable()
export class FeatureGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly prisma: PrismaService, private readonly features: FeaturesService) {}

  private routeFeature(request: any): string | undefined {
    const path = `${request.baseUrl ?? ''}${request.route?.path ?? request.path ?? request.originalUrl ?? ''}`;
    if (path.includes('/rate-plan-masters/') && path.includes('/rates/import')) return 'rateImport';
    if (path.includes('rate-plan-masters')) return 'ratePlans';
    if (path.includes('physical-rooms')) return 'physicalRooms';
    if (path.includes('/rooms/') && path.includes('/rate-plans')) return 'ratePlans';
    if (path.includes('/rooms/') && path.includes('/inventory')) return 'roomsInventory';
    if (path.includes('/rooms')) return 'roomsInventory';
    if (path.includes('rate-seasons')) return 'rateSeasons';
    if (path.includes('yield-rules')) return 'yieldRules';
    if (path.includes('promotions')) return 'promotions';
    if (path.includes('/rates')) return 'rates';
    const routes: [string, string][] = [
      ['/tax-settings', 'taxSettings'], ['/tax-invoices', 'taxInvoices'], ['/tax-credit-notes', 'creditNotes'], ['/tds', 'tds'],
      ['/reports/tax-invoices', 'taxInvoices'], ['/reports/credit-notes', 'creditNotes'], ['/reports/tds', 'tds'],
      ['/reports/room-rack', 'roomRack'], ['/reports/arrivals', 'arrivals'], ['/reports/expected-arrivals', 'arrivals'], ['/reports', 'reports'],
      ['/hotels/pricebook', 'rates'], ['/hotels/catalog', 'roomsInventory'], ['/hotels/rate-plans', 'ratePlans'],
      ['/revenue-management', 'rateSimulator'],
    ];
    return routes.find(([prefix]) => path.includes(prefix))?.[1];
  }

  /** Resolve the hotel from the protected resource, never from a client-supplied hotelId. */
  private async resolveFeatureHotelFromRequest(key: string, request: any): Promise<string | null | undefined> {
    const params = request.params ?? {};
    const id = params.id;
    const reference = params.reference;
    const path = `${request.baseUrl ?? ''}${request.route?.path ?? request.path ?? ''}`;
    const select = { hotelId: true };
    const find = async (delegate: string, where: any, shape: any = select) => {
      const row = await (this.prisma as any)[delegate].findUnique({ where, select: shape });
      if (!row) throw new NotFoundException('Protected resource not found.');
      if (Object.prototype.hasOwnProperty.call(row, 'hotelId')) return row.hotelId;
      return row.roomType?.hotelId ?? row.ratePlan?.roomType?.hotelId ?? row.reservation?.hotelId ?? row.cashierShift?.hotelId;
    };

    if ((key === 'reservations' || key === 'inHouse') && reference) return find('reservation', { reference });
    if (key === 'taxInvoices') {
      if (id) return find('taxInvoice', { id });
      if (reference) return find('reservation', { reference });
    }
    if (key === 'creditNotes' && id) {
      return path.includes('/tax-invoices/') ? find('taxInvoice', { id }) : find('taxCreditNote', { id });
    }
    if (key === 'tds' && id) {
      return path.includes('/tax-invoices/') ? find('taxInvoice', { id }) : find('tdsDeduction', { id });
    }
    if (key === 'taxSettings' && id && path.includes('/tax-settings/rules')) return find('taxRule', { id });
    if (key === 'payments' && reference) {
      if (params.paymentId) {
        const payment = await this.prisma.payment.findUnique({ where: { id: params.paymentId }, select: { reservation: { select: { reference: true, hotelId: true } } } });
        if (!payment) throw new NotFoundException('Payment not found.');
        if (payment.reservation.reference !== reference) throw new ForbiddenException('Payment does not belong to this reservation.');
        return payment.reservation.hotelId;
      }
      return find('reservation', { reference });
    }
    if (key === 'banquets' && id) return find('banquetEvent', { id });
    if (key === 'functionSpaces' && id) return find('functionSpace', { id });
    if (key === 'groups' && id) return find('groupReservation', { id });
    if (key === 'logbook' && id) return find('operationsLogEntry', { id });
    if (key === 'housekeeping') {
      if (params.taskId) return find('housekeepingTask', { id: params.taskId });
      if (params.roomId) return find('room', { id: params.roomId });
    }
    if (key === 'maintenance' && params.ticketId) return find('maintenanceTicket', { id: params.ticketId });
    if (key === 'physicalRooms' && id) return find('room', { id });
    if (key === 'roomsInventory') {
      if (id) return find('roomType', { id });
      if (params.roomId) return find('roomType', { id: params.roomId });
    }
    if (key === 'ratePlans' || key === 'rateImport') {
      if (params.masterId) return find('ratePlanMaster', { id: params.masterId });
      if (params.ratePlanId) return find('ratePlan', { id: params.ratePlanId }, { roomType: { select: { hotelId: true } } });
      if (params.roomId) return find('roomType', { id: params.roomId });
      if (id && path.includes('rate-plan-masters')) return find('ratePlanMaster', { id });
      if (id && path.includes('rate-plan-assignments')) return find('agentRatePlan', { id }, { ratePlan: { select: { roomType: { select: { hotelId: true } } } } });
      if (id) return find('ratePlan', { id }, { roomType: { select: { hotelId: true } } });
    }
    if (key === 'rates' && params.ratePlanId) return find('ratePlan', { id: params.ratePlanId }, { roomType: { select: { hotelId: true } } });
    if (key === 'promotions' && id) return find('promotion', { id });
    if (key === 'rateSeasons' && id) return find('rateSeason', { id });
    if (key === 'yieldRules' && id) return find('yieldRule', { id });
    if (key === 'serviceItems') {
      if (request.path?.includes('/service-orders') || request.route?.path?.includes('/service-orders')) return id ? find('guestServiceOrder', { id }) : undefined;
      if (id) return find('serviceItem', { id });
    }
    if (key === 'lostFound' && id) return find('lostFoundItem', { id });
    if (key === 'cashier' && id) return find('cashierShift', { id });
    return undefined;
  }

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<any>();
    const key = this.reflector.getAllAndOverride<string>(REQUIRED_FEATURE_KEY, [context.getHandler(), context.getClass()]) ?? this.routeFeature(request);
    if (!key) return true;
    const userId = request.user?.id;
    if (!userId) throw new ForbiddenException('Authentication required.');
    // The shared manual endpoint is also the Agent booking workflow. The
    // admin Reservations switch must not disable that authorized Agent path.
    if (key === 'reservations' && request.user?.role === 'AGENT' && String(request.route?.path ?? '').includes('/manual')) return true;
    if (request.user?.role === 'SUPER_ADMIN') return true;
    const scope = await getActorScope(this.prisma, userId);
    const entityHotel = await this.resolveFeatureHotelFromRequest(key, request);
    const requested = entityHotel !== undefined ? entityHotel : request.params?.hotelId ?? request.query?.hotelId ?? request.body?.hotelId ?? request.user?.scopeHotelId;
    // Accounts and Viewers are global read roles in the existing RBAC model,
    // even though role-scope treats only administrative roles as global.
    // They may select a hotel for read-only screens, so use that requested
    // hotel without granting any write authority.
    // Global read roles use group defaults until a screen selects a hotel. A
    // protected entity always wins once its authoritative hotel was resolved.
    const hotelId = !scope.isGlobal && !scope.hotelId ? (requested ?? null) : resolveRequestedHotel(scope, requested);
    if (!(await this.features.isEnabled(hotelId, key))) throw new ForbiddenException({ code: 'FEATURE_NOT_ENABLED', message: 'This feature is not enabled for this hotel.' });
    return true;
  }
}
