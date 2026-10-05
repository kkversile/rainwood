import { CanActivate, ExecutionContext, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { assertActorCanManageHotel, getActorScope, isGlobalRole } from '../../common/role-scope';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';

/**
 * Controller-boundary authorization for hotel-owned resources.
 * The guard deliberately fails closed when it cannot resolve the resource's
 * hotel. It also writes the effective hotel onto the request so list routes
 * cannot accidentally return every property for a scoped account.
 */
@Injectable()
export class HotelScopeGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<any>();
    let userId = request.user?.id;
    const route = this.normalizedRoute(request);
    // The public hotel catalogue and detail routes must remain available to
    // anonymous guests. Nest exposes controller-level route paths as `/` and
    // `/:slug` here, while some adapters report the full `/hotels` paths.
    if (request.method === 'GET' && (route === '/' || route === '/:slug' || route === '/hotels' || route === '/hotels/:slug' || request.path?.endsWith('/hotels') || request.path?.endsWith('/hotels/'))) return true;
    // This guard is bound at controller level, so Nest evaluates it before a
    // method-level JwtAuthGuard. Authenticate here first; otherwise every
    // protected hotel route is rejected before its normal auth/role guards run.
    if (!userId) {
      await new JwtAuthGuard().canActivate(context);
      userId = request.user?.id;
    }

    if (!request.user?.id) throw new ForbiddenException('Authentication required.');

    const scope = await getActorScope(this.prisma, userId);
    let hotelId = request.params?.hotelId ?? request.query?.hotelId ?? null;

    if (!hotelId) hotelId = await this.resolveResourceHotel(route, request.params ?? {});

    if (hotelId) {
      await assertActorCanManageHotel(this.prisma, userId, hotelId);
      request.scopeHotelId = hotelId;
      request.user.scopeHotelId = hotelId;
      return true;
    }

    if (isGlobalRole(scope.role)) return true;
    if (!scope.hotelId) throw new ForbiddenException('This account has no hotel scope.');
    request.scopeHotelId = scope.hotelId;
    request.user.scopeHotelId = scope.hotelId;
    return true;
  }

  private async resolveResourceHotel(route: string, params: Record<string, string>) {
    const id = params.id;
    if (route === '/hotels/:id' && id) return this.findHotel(id);
    if (params.hotelId) return params.hotelId;

    const direct: Record<string, { delegate: string; relation?: string }> = {
      '/hotels/physical-rooms/:id': { delegate: 'room' },
      '/hotels/rate-plan-masters/:id': { delegate: 'ratePlanMaster' },
      '/hotels/rate-plan-masters/:id/assignments': { delegate: 'ratePlanMaster' },
      '/hotels/rate-plans/:id/copy': { delegate: 'ratePlan' },
      '/hotels/rate-plan-assignments/:id': { delegate: 'agentRatePlan' },
      '/hotels/reviews/:id': { delegate: 'hotelReview' },
      '/hotels/contacts/:id': { delegate: 'hotelContact' },
      '/hotels/documents/:id': { delegate: 'hotelDocument' },
      '/hotels/location/attractions/:id': { delegate: 'hotelLocationAttraction' },
      '/hotels/location/transports/:id': { delegate: 'hotelLocationTransport' },
      '/hotels/rooms/:id': { delegate: 'roomType' },
      '/hotels/rate-plans/:id': { delegate: 'ratePlan' },
      '/hotels/promotions/:id': { delegate: 'promotion' },
      '/hotels/rate-seasons/:id': { delegate: 'rateSeason' },
      '/hotels/yield-rules/:id': { delegate: 'yieldRule' },
    };
    const target = id ? direct[route] : undefined;
    if (target) {
      const record = await (this.prisma as any)[target.delegate].findUnique({ where: { id }, select: this.selectFor(target.delegate) });
      if (!record) throw new NotFoundException('Resource not found.');
      return this.hotelIdFromRecord(target.delegate, record);
    }

    if (params.roomId) {
      const room = await this.prisma.roomType.findUnique({ where: { id: params.roomId }, select: { hotelId: true } });
      if (!room) throw new NotFoundException('Room type not found.');
      return room.hotelId;
    }
    if (params.masterId) {
      const master = await this.prisma.ratePlanMaster.findUnique({ where: { id: params.masterId }, select: { hotelId: true } });
      if (!master) throw new NotFoundException('Rate-plan master not found.');
      return master.hotelId;
    }
    if (params.ratePlanId) {
      const plan = await this.prisma.ratePlan.findUnique({ where: { id: params.ratePlanId }, select: { roomType: { select: { hotelId: true } } } });
      if (!plan) throw new NotFoundException('Rate plan not found.');
      return plan.roomType.hotelId;
    }
    return null;
  }

  private normalizedRoute(request: any) {
    const routePath = String(request.route?.path ?? request.path ?? '');
    const fullPath = `${request.baseUrl ?? ''}${routePath}`.replace(/\/+$/, '') || '/';
    const hotelIndex = fullPath.indexOf('/hotels');
    if (hotelIndex >= 0) return fullPath.slice(hotelIndex);
    if (routePath.startsWith('/hotels')) return routePath;
    return `/hotels${routePath.startsWith('/') ? routePath : `/${routePath}`}`;
  }

  private selectFor(delegate: string) {
    if (delegate === 'room' || delegate === 'ratePlanMaster' || delegate === 'hotelReview' || delegate === 'hotelContact' || delegate === 'hotelDocument' || delegate === 'hotelLocationAttraction' || delegate === 'hotelLocationTransport' || delegate === 'roomType') return { hotelId: true };
    if (delegate === 'agentRatePlan') return { ratePlan: { select: { roomType: { select: { hotelId: true } } } } };
    if (delegate === 'promotion' || delegate === 'rateSeason' || delegate === 'yieldRule') return { hotelId: true };
    if (delegate === 'ratePlan') return { roomType: { select: { hotelId: true } } };
    return { id: true };
  }

  private hotelIdFromRecord(delegate: string, record: any) {
    if (delegate === 'ratePlan') return record.roomType?.hotelId;
    if (delegate === 'agentRatePlan') return record.ratePlan?.roomType?.hotelId;
    return record.hotelId;
  }

  private async findHotel(id: string) {
    const hotel = await this.prisma.hotel.findUnique({ where: { id }, select: { id: true, active: true } });
    if (!hotel) throw new NotFoundException('Hotel not found.');
    return hotel.id;
  }
}
