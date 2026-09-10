import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { addDays, eachNight, nightsBetween, parseDateOnly, todayUtc, toDateOnly } from '../../common/dates';
import { AvailabilityQueryDto } from './availability.dto';
import { RateResolverService } from './rate-resolver';

type Database = PrismaService | Prisma.TransactionClient;
export type RoomOccupancy = { adults: number; children: number };
type Selection = { hotelId: string; roomTypeId: string; ratePlanId: string; checkIn: string; checkOut: string; rooms: number; adults: number; children: number; occupancies?: RoomOccupancy[] };

@Injectable()
export class AvailabilityService {
  constructor(private prisma: PrismaService, private readonly rateResolver: RateResolverService) {}

  async search(query: AvailabilityQueryDto, agentId?: string) {
    const from = parseDateOnly(query.checkIn, 'checkIn');
    const to = parseDateOnly(query.checkOut, 'checkOut');
    const normalized = this.normalizeOccupancy(query);
    this.validateStay(from, to, normalized.rooms, normalized.adults, normalized.children, normalized.occupancies);
    const nights = nightsBetween(from, to);
    const hotels = await this.prisma.hotel.findMany({
      where: query.hotelId ? { id: query.hotelId, active: true } : { active: true },
      include: {
        rooms: {
          where: { active: true },
          include: {
            inventory: { where: { date: { gte: from, lt: to } }, orderBy: { date: 'asc' } },
            ratePlans: { where: { active: true, master: { active: true }, ...(agentId ? { assignedAgents: { some: { agentId, active: true } } } : {}) }, include: { rates: { where: { date: { gte: from, lte: to } }, orderBy: { date: 'asc' } }, ...(agentId ? { assignedAgents: { where: { agentId, active: true }, include: { rates: { where: { date: { gte: from, lte: to } }, orderBy: { date: 'asc' } } } } } : {}) } },
          },
        },
      },
    });
    if (!hotels.length) throw new BadRequestException('Hotel is unavailable');
    const options = hotels.flatMap((hotel) => hotel.rooms.flatMap((room) => room.ratePlans.map((plan) => this.calculate(room, plan, normalized, from, to, nights, agentId))));
    return options.filter((option) => option.available).map(({ available, ...option }) => option);
  }

  async quoteSelection(db: Database, input: Selection, options: { checkInventory?: boolean; agentId?: string } = {}) {
    const from = parseDateOnly(input.checkIn, 'checkIn');
    const to = parseDateOnly(input.checkOut, 'checkOut');
    const normalized = this.normalizeOccupancy(input);
    this.validateStay(from, to, normalized.rooms, normalized.adults, normalized.children, normalized.occupancies);
    const room = await db.roomType.findFirst({
      where: { id: input.roomTypeId, hotelId: input.hotelId, active: true, hotel: { active: true } },
      include: {
        inventory: { where: { date: { gte: from, lt: to } }, orderBy: { date: 'asc' } },
          ratePlans: { where: { id: input.ratePlanId, active: true, master: { active: true }, ...(options.agentId ? { assignedAgents: { some: { agentId: options.agentId, active: true } } } : {}) }, include: { rates: { where: { date: { gte: from, lte: to } }, orderBy: { date: 'asc' } }, ...(options.agentId ? { assignedAgents: { where: { agentId: options.agentId, active: true }, include: { rates: { where: { date: { gte: from, lte: to } }, orderBy: { date: 'asc' } } } } } : {}) } },
      },
    });
    const plan = room?.ratePlans[0];
    if (!room || !plan) throw new BadRequestException('Room or rate plan is unavailable');
    const quote = this.calculate(room, plan, normalized, from, to, nightsBetween(from, to), options.agentId);
    if (!quote.available && options.checkInventory !== false) throw new BadRequestException('Inventory or restrictions are no longer available');
    const { available: _available, ...result } = quote;
    return result;
  }

  private validateStay(from: Date, to: Date, rooms: number, adults: number, children: number, occupancies?: RoomOccupancy[]) {
    const nights = nightsBetween(from, to);
    if (from >= to || nights < 1) throw new BadRequestException('checkOut must be after checkIn');
    if (from < todayUtc()) throw new BadRequestException('checkIn cannot be in the past');
    if (nights > 30) throw new BadRequestException('Stay cannot exceed 30 nights');
    if (!Number.isInteger(rooms) || rooms < 1 || rooms > 20) throw new BadRequestException('rooms must be positive');
    if (!Number.isInteger(adults) || adults < 1) throw new BadRequestException('adults must be positive');
    if (!Number.isInteger(children) || children < 0) throw new BadRequestException('children cannot be negative');
    if (occupancies) {
      if (occupancies.length !== rooms) throw new BadRequestException('occupancies must contain one entry per room');
      occupancies.forEach((occupancy, index) => {
        if (!Number.isInteger(occupancy.adults) || occupancy.adults < 1) throw new BadRequestException(`occupancies[${index}].adults must be positive`);
        if (!Number.isInteger(occupancy.children) || occupancy.children < 0) throw new BadRequestException(`occupancies[${index}].children cannot be negative`);
      });
    }
  }

  private calculate(room: any, plan: any, input: { rooms: number; adults: number; children: number; occupancies?: RoomOccupancy[] }, from: Date, to: Date, nights: number, agentId?: string) {
    const occupiedNights = eachNight(from, to);
    const inventoryByDate = new Map<string, any>(room.inventory.map((day: any) => [toDateOnly(day.date), day]));
    const rateByDate = new Map<string, any>(plan.rates.map((day: any) => [toDateOnly(day.date), day]));
    const arrivalRate = rateByDate.get(toDateOnly(from));
    const departureRate = rateByDate.get(toDateOnly(to));
    const resolved = this.rateResolver.byDate(plan, agentId);
    const inventoryComplete = occupiedNights.every((night) => inventoryByDate.has(toDateOnly(night)));
    const ratesComplete = occupiedNights.every((night) => rateByDate.has(toDateOnly(night)));
    const inventoryAvailable = inventoryComplete && occupiedNights.every((night) => {
      const day = inventoryByDate.get(toDateOnly(night));
      return !day.stopSell && day.available - day.held - day.sold >= input.rooms;
    });
    const restrictionsValid = Boolean(arrivalRate) && ratesComplete && !arrivalRate.cta && !departureRate?.ctd && (arrivalRate.minLos ?? 1) <= nights && (arrivalRate.maxLos == null || nights <= arrivalRate.maxLos);
    const maxOccupancy = room.maxOccupancy ?? room.maxAdults + room.maxChildren;
    const occupancies = input.occupancies ?? this.distributeOccupancy(room, input);
    const occupancyValid = occupancies.every((occupancy) => occupancy.adults <= room.maxAdults && occupancy.children <= room.maxChildren && occupancy.adults + occupancy.children <= maxOccupancy);
    const breakdown = occupiedNights.map((night) => {
      const baseRate = rateByDate.get(toDateOnly(night));
      const rate = resolved.get(baseRate);
      const roomBreakdown = occupancies.map((occupancy, index) => {
        const occupancyKey = this.occupancyKey(occupancy.adults + occupancy.children);
        const occupancyPrices = rate?.occupancyPrices && typeof rate.occupancyPrices === 'object' ? rate.occupancyPrices as Record<string, unknown> : {};
        const hasOccupancyPrice = Object.prototype.hasOwnProperty.call(occupancyPrices, occupancyKey) && Number.isFinite(Number(occupancyPrices[occupancyKey]));
        const baseAmount = hasOccupancyPrice ? Number(occupancyPrices[occupancyKey]) : Number(rate?.amount ?? 0);
        const supplementAmount = hasOccupancyPrice ? 0 : Number(rate?.childAmount ?? 0) * occupancy.children + Number(rate?.extraAdultAmount ?? 0) * Math.max(0, occupancy.adults - 2);
        return { roomIndex: index, adults: occupancy.adults, children: occupancy.children, occupancyKey, baseAmount, supplementAmount };
      });
      const occupancyKeys = roomBreakdown.map((item) => item.occupancyKey);
      const base = roomBreakdown.reduce((sum, item) => sum + item.baseAmount, 0);
      const tax = Number(rate?.taxAmount ?? 0) * input.rooms;
      const extras = roomBreakdown.reduce((sum, item) => sum + item.supplementAmount, 0);
      return { date: toDateOnly(night), rooms: roomBreakdown, occupancy: occupancyKeys, baseAmount: base, taxAmount: tax, extrasAmount: extras, totalAmount: base + tax + extras, priceSource: rate?.priceSource ?? 'BASE', agentRatePlanId: rate?.agentRatePlanId ?? null };
    });
    const total = breakdown.reduce((sum, item) => sum + item.totalAmount, 0);
    const taxTotal = breakdown.reduce((sum, item) => sum + item.taxAmount, 0);
    return {
      hotelId: room.hotelId,
      roomTypeId: room.id,
      roomType: room.name,
      ratePlanId: plan.id,
      ratePlan: plan.name,
      mealPlan: plan.mealPlan,
      checkIn: toDateOnly(from),
      checkOut: toDateOnly(to),
      nights,
      rooms: input.rooms,
      adults: input.adults,
      children: input.children,
      total,
      taxTotal,
      available: inventoryAvailable && restrictionsValid && occupancyValid,
      availableRooms: inventoryComplete ? Math.min(...occupiedNights.map((night) => {
        const day = inventoryByDate.get(toDateOnly(night));
        return Math.max(0, day.available - day.held - day.sold);
      })) : 0,
      priceBreakdown: breakdown,
      priceSource: breakdown.some((item) => item.priceSource === 'AGENT_OVERRIDE') ? 'AGENT_OVERRIDE' : 'BASE',
      agentRatePlanId: resolved.assignment?.id ?? null,
      restrictions: { cta: Boolean(arrivalRate?.cta), ctd: Boolean(departureRate?.ctd), minLos: arrivalRate?.minLos ?? null, maxLos: arrivalRate?.maxLos ?? null },
    };
  }

  private occupancyKey(persons: number) {
    return persons <= 1 ? 'single' : persons === 2 ? 'double' : persons === 3 ? 'triple' : 'quad';
  }

  private normalizeOccupancy(input: { rooms: number; adults: number; children: number; occupancies?: RoomOccupancy[] }) {
    if (!input.occupancies?.length) return input;
    return { ...input, rooms: input.occupancies.length, adults: input.occupancies.reduce((sum, item) => sum + item.adults, 0), children: input.occupancies.reduce((sum, item) => sum + item.children, 0) };
  }

  private distributeOccupancy(room: any, input: { rooms: number; adults: number; children: number }) {
    let adults = input.adults;
    let children = input.children;
    const maxAdults = Math.max(1, Number(room.maxAdults ?? 1));
    const maxChildren = Math.max(0, Number(room.maxChildren ?? 0));
    const maxOccupancy = Math.max(1, Number(room.maxOccupancy ?? maxAdults + maxChildren));
    return Array.from({ length: input.rooms }, (_, index) => {
      const roomsLeft = input.rooms - index - 1;
      const adultsForRoom = Math.min(adults, maxAdults, maxOccupancy);
      adults -= adultsForRoom;
      const childrenCapacity = Math.min(maxChildren, maxOccupancy - adultsForRoom);
      const childrenForRoom = Math.min(children, Math.max(0, childrenCapacity));
      children -= childrenForRoom;
      // A booked room is charged at least its single-occupancy price even when
      // aggregate guest counts leave one room empty.
      if (roomsLeft === 0 && (adults > 0 || children > 0)) return { adults: adultsForRoom + adults + children, children: childrenForRoom };
      return { adults: adultsForRoom, children: childrenForRoom };
    });
  }
}
