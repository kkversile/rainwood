import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { addDays, eachNight, nightsBetween, parseDateOnly, todayUtc, toDateOnly } from '../../common/dates';
import { AvailabilityQueryDto } from './availability.dto';

type Database = PrismaService | Prisma.TransactionClient;
type Selection = { hotelId: string; roomTypeId: string; ratePlanId: string; checkIn: string; checkOut: string; rooms: number; adults: number; children: number };

@Injectable()
export class AvailabilityService {
  constructor(private prisma: PrismaService) {}

  async search(query: AvailabilityQueryDto, agentId?: string) {
    const from = parseDateOnly(query.checkIn, 'checkIn');
    const to = parseDateOnly(query.checkOut, 'checkOut');
    this.validateStay(from, to, query.rooms, query.adults, query.children);
    const nights = nightsBetween(from, to);
    const hotels = await this.prisma.hotel.findMany({
      where: query.hotelId ? { id: query.hotelId, active: true } : { active: true },
      include: {
        rooms: {
          where: { active: true },
          include: {
            inventory: { where: { date: { gte: from, lt: to } }, orderBy: { date: 'asc' } },
            ratePlans: { where: { active: true, ...(agentId ? { assignedAgents: { some: { agentId } } } : {}) }, include: { rates: { where: { date: { gte: from, lte: to } }, orderBy: { date: 'asc' } } } },
          },
        },
      },
    });
    if (!hotels.length) throw new BadRequestException('Hotel is unavailable');
    const options = hotels.flatMap((hotel) => hotel.rooms.flatMap((room) => room.ratePlans.map((plan) => this.calculate(room, plan, query, from, to, nights))));
    return options.filter((option) => option.available).map(({ available, ...option }) => option);
  }

  async quoteSelection(db: Database, input: Selection, options: { checkInventory?: boolean; agentId?: string } = {}) {
    const from = parseDateOnly(input.checkIn, 'checkIn');
    const to = parseDateOnly(input.checkOut, 'checkOut');
    this.validateStay(from, to, input.rooms, input.adults, input.children);
    const room = await db.roomType.findFirst({
      where: { id: input.roomTypeId, hotelId: input.hotelId, active: true, hotel: { active: true } },
      include: {
        inventory: { where: { date: { gte: from, lt: to } }, orderBy: { date: 'asc' } },
        ratePlans: { where: { id: input.ratePlanId, active: true, ...(options.agentId ? { assignedAgents: { some: { agentId: options.agentId } } } : {}) }, include: { rates: { where: { date: { gte: from, lte: to } }, orderBy: { date: 'asc' } } } },
      },
    });
    const plan = room?.ratePlans[0];
    if (!room || !plan) throw new BadRequestException('Room or rate plan is unavailable');
    const quote = this.calculate(room, plan, input, from, to, nightsBetween(from, to));
    if (!quote.available && options.checkInventory !== false) throw new BadRequestException('Inventory or restrictions are no longer available');
    const { available: _available, ...result } = quote;
    return result;
  }

  private validateStay(from: Date, to: Date, rooms: number, adults: number, children: number) {
    const nights = nightsBetween(from, to);
    if (from >= to || nights < 1) throw new BadRequestException('checkOut must be after checkIn');
    if (from < todayUtc()) throw new BadRequestException('checkIn cannot be in the past');
    if (nights > 30) throw new BadRequestException('Stay cannot exceed 30 nights');
    if (!Number.isInteger(rooms) || rooms < 1 || rooms > 20) throw new BadRequestException('rooms must be positive');
    if (!Number.isInteger(adults) || adults < 1) throw new BadRequestException('adults must be positive');
    if (!Number.isInteger(children) || children < 0) throw new BadRequestException('children cannot be negative');
  }

  private calculate(room: any, plan: any, input: { rooms: number; adults: number; children: number }, from: Date, to: Date, nights: number) {
    const occupiedNights = eachNight(from, to);
    const inventoryByDate = new Map<string, any>(room.inventory.map((day: any) => [toDateOnly(day.date), day]));
    const rateByDate = new Map<string, any>(plan.rates.map((day: any) => [toDateOnly(day.date), day]));
    const arrivalRate = rateByDate.get(toDateOnly(from));
    const departureRate = rateByDate.get(toDateOnly(to));
    const inventoryComplete = occupiedNights.every((night) => inventoryByDate.has(toDateOnly(night)));
    const ratesComplete = occupiedNights.every((night) => rateByDate.has(toDateOnly(night)));
    const inventoryAvailable = inventoryComplete && occupiedNights.every((night) => {
      const day = inventoryByDate.get(toDateOnly(night));
      return !day.stopSell && day.available - day.held - day.sold >= input.rooms;
    });
    const restrictionsValid = Boolean(arrivalRate) && ratesComplete && !arrivalRate.cta && !departureRate?.ctd && (arrivalRate.minLos ?? 1) <= nights && (arrivalRate.maxLos == null || nights <= arrivalRate.maxLos);
    const occupancyValid = input.adults <= room.maxAdults * input.rooms && input.children <= room.maxChildren * input.rooms;
    const breakdown = occupiedNights.map((night) => {
      const rate = rateByDate.get(toDateOnly(night));
      const extraChildren = Math.max(0, input.children - input.rooms * room.maxChildren);
      const extraAdults = Math.max(0, input.adults - input.rooms * Math.min(2, room.maxAdults));
      const base = Number(rate?.amount ?? 0) * input.rooms;
      const tax = Number(rate?.taxAmount ?? 0) * input.rooms;
      const extras = Number(rate?.childAmount ?? 0) * extraChildren + Number(rate?.extraAdultAmount ?? 0) * extraAdults;
      return { date: toDateOnly(night), rooms: input.rooms, baseAmount: base, taxAmount: tax, extrasAmount: extras, totalAmount: base + tax + extras };
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
      restrictions: { cta: Boolean(arrivalRate?.cta), ctd: Boolean(departureRate?.ctd), minLos: arrivalRate?.minLos ?? null, maxLos: arrivalRate?.maxLos ?? null },
    };
  }
}
