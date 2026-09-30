import { BadRequestException, Injectable } from '@nestjs/common';
import { BookingSource, Prisma, SupplementaryChargeScope } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { addDays, eachNight, nightsBetween, parseDateOnly, todayUtc, toDateOnly } from '../../common/dates';
import { getHotelOperationalDate } from '../../common/hotel-dates';
import { AvailabilityQueryDto } from './availability.dto';
import { RateResolverService } from './rate-resolver';
import { selectBestPromotion } from './promotion.utils';

type Database = PrismaService | Prisma.TransactionClient;
export type RoomOccupancy = { adults: number; children: number };
type Selection = { hotelId: string; roomTypeId: string; ratePlanId: string; checkIn: string; checkOut: string; rooms: number; adults: number; children: number; occupancies?: RoomOccupancy[]; source?: BookingSource; promotionCode?: string };

export function supplementaryScopeFilter(agentId?: string) {
  return agentId ? { in: [SupplementaryChargeScope.AGENTS, SupplementaryChargeScope.ALL] } : SupplementaryChargeScope.ALL;
}

function applyAdjustment(amount: number, type: 'PERCENT' | 'FIXED', value: number) {
  return Math.max(0, type === 'PERCENT' ? amount + amount * value / 100 : amount + value);
}

function targetMatches(targets: Array<{ roomTypeId?: string; ratePlanId?: string }> | undefined, id: string) {
  return !targets?.length || targets.some((target) => target.roomTypeId === id || target.ratePlanId === id);
}

function selectedSeason(seasons: any[], date: string, weekday: number, roomTypeId: string, ratePlanId: string) {
  return seasons.find((season) => date >= toDateOnly(season.startDate) && date <= toDateOnly(season.endDate) && (!season.daysOfWeek?.length || season.daysOfWeek.includes(weekday)) && targetMatches(season.roomTypes, roomTypeId) && targetMatches(season.ratePlans, ratePlanId));
}

function selectedYieldRule(rules: any[], occupancyPercent: number, roomTypeId: string) {
  return rules.find((rule) => occupancyPercent >= rule.occupancyFrom && (occupancyPercent < rule.occupancyTo || (rule.occupancyTo === 100 && occupancyPercent <= 100)) && (!rule.roomTypeId || rule.roomTypeId === roomTypeId));
}

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
        supplementaryCharges: { where: { active: true, scope: supplementaryScopeFilter(agentId), startDate: { lte: to }, endDate: { gte: from } } },
        promotions: { where: { active: true }, include: { roomTypes: true, ratePlans: true } },
        rateSeasons: { where: { active: true, startDate: { lte: to }, endDate: { gte: from } }, include: { roomTypes: true, ratePlans: true }, orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }, { id: 'asc' }] },
        yieldRules: { where: { active: true }, orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }] },
        rooms: {
          where: { active: true },
          include: {
            inventory: { where: { date: { gte: from, lt: to } }, orderBy: { date: 'asc' } },
            ratePlans: { where: { active: true, master: { active: true }, ...(agentId ? { assignedAgents: { some: { agentId, active: true } } } : {}) }, include: { rates: { where: { date: { gte: from, lte: to } }, orderBy: { date: 'asc' } }, ...(agentId ? { assignedAgents: { where: { agentId, active: true } } } : {}) } },
          },
        },
      },
    });
    if (!hotels.length) throw new BadRequestException('Hotel is unavailable');
    const options = hotels.flatMap((hotel) => hotel.rooms.flatMap((room) => room.ratePlans.map((plan) => this.calculate(room, plan, normalized, from, to, nights, agentId, hotel.supplementaryCharges, hotel.promotions, query.source, query.promotionCode, hotel.timezoneName, hotel.rateSeasons, hotel.yieldRules))));
    return options.filter((option) => option.available).map(({ available, ...option }) => option);
  }

  async quoteSelection(db: Database, input: Selection, options: { checkInventory?: boolean; agentId?: string; channel?: string; promotionCode?: string } = {}) {
    const from = parseDateOnly(input.checkIn, 'checkIn');
    const to = parseDateOnly(input.checkOut, 'checkOut');
    const normalized = this.normalizeOccupancy(input);
    this.validateStay(from, to, normalized.rooms, normalized.adults, normalized.children, normalized.occupancies);
    const room = await db.roomType.findFirst({
      where: { id: input.roomTypeId, hotelId: input.hotelId, active: true, hotel: { active: true } },
      include: {
        hotel: { include: { supplementaryCharges: { where: { active: true, scope: supplementaryScopeFilter(options.agentId), startDate: { lte: to }, endDate: { gte: from } } }, promotions: { where: { active: true }, include: { roomTypes: true, ratePlans: true } }, rateSeasons: { where: { active: true, startDate: { lte: to }, endDate: { gte: from } }, include: { roomTypes: true, ratePlans: true }, orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }, { id: 'asc' }] }, yieldRules: { where: { active: true }, orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }, { id: 'asc' }] } } },
        inventory: { where: { date: { gte: from, lt: to } }, orderBy: { date: 'asc' } },
          ratePlans: { where: { id: input.ratePlanId, active: true, master: { active: true }, ...(options.agentId ? { assignedAgents: { some: { agentId: options.agentId, active: true } } } : {}) }, include: { rates: { where: { date: { gte: from, lte: to } }, orderBy: { date: 'asc' } }, ...(options.agentId ? { assignedAgents: { where: { agentId: options.agentId, active: true } } } : {}) } },
      },
    });
    const plan = room?.ratePlans[0];
    if (!room || !plan) throw new BadRequestException('Room or rate plan is unavailable');
    const quote = this.calculate(room, plan, normalized, from, to, nightsBetween(from, to), options.agentId, room.hotel.supplementaryCharges, room.hotel.promotions, options.channel, options.promotionCode, room.hotel.timezoneName, room.hotel.rateSeasons, room.hotel.yieldRules);
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

  private calculate(room: any, plan: any, input: { rooms: number; adults: number; children: number; occupancies?: RoomOccupancy[] }, from: Date, to: Date, nights: number, agentId?: string, supplementaryCharges: any[] = [], promotions: any[] = [], channel?: string, promotionCode?: string, timezoneName = 'UTC', seasons: any[] = [], yieldRules: any[] = []) {
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
    const breakdown: any[] = occupiedNights.map((night) => {
      const baseRate = rateByDate.get(toDateOnly(night));
      const rate = resolved.get(baseRate);
      const roomBreakdown = occupancies.map((occupancy, index) => {
        const occupancyKey = this.occupancyKey(occupancy.adults + occupancy.children);
        const occupancyPrices = rate?.occupancyPrices && typeof rate.occupancyPrices === 'object' ? rate.occupancyPrices as Record<string, unknown> : {};
        const hasManualOverride = rate?.overrideAmount != null;
        const hasOccupancyPrice = !hasManualOverride && Object.prototype.hasOwnProperty.call(occupancyPrices, occupancyKey) && Number.isFinite(Number(occupancyPrices[occupancyKey]));
        const commercialBase = hasManualOverride ? Number(rate.overrideAmount) : hasOccupancyPrice ? Number(occupancyPrices[occupancyKey]) : Number(rate?.baseAmount ?? rate?.amount ?? 0);
        const season = hasManualOverride ? null : selectedSeason(seasons, toDateOnly(night), night.getUTCDay(), room.id, plan.id);
        const inventoryDay = inventoryByDate.get(toDateOnly(night));
        const occupancyPercent = inventoryDay?.available > 0 ? Math.min(100, Math.max(0, (Number(inventoryDay.held ?? 0) + Number(inventoryDay.sold ?? 0)) / Number(inventoryDay.available) * 100)) : 100;
        const yieldRule = hasManualOverride ? null : selectedYieldRule(yieldRules, occupancyPercent, room.id);
        const seasonAmount = season ? applyAdjustment(commercialBase, season.adjustmentType, Number(season.adjustmentValue)) : commercialBase;
        const effectiveAmount = yieldRule ? applyAdjustment(seasonAmount, yieldRule.adjustmentType, Number(yieldRule.adjustmentValue)) : seasonAmount;
        const seasonAdjustment = effectiveAmount - commercialBase - (yieldRule ? effectiveAmount - seasonAmount : 0);
        const supplementAmount = hasOccupancyPrice || hasManualOverride ? 0 : Number(rate?.childAmount ?? 0) * occupancy.children + Number(rate?.extraAdultAmount ?? 0) * Math.max(0, occupancy.adults - 2);
        return { roomIndex: index, adults: occupancy.adults, children: occupancy.children, occupancyKey, baseRate: Math.round(commercialBase * 100) / 100, baseAmount: Math.round(effectiveAmount * 100) / 100, supplementAmount, manualOverride: hasManualOverride ? Number(rate.overrideAmount) : null, seasonApplied: season ? { id: season.id, name: season.name, adjustment: Math.round(seasonAdjustment * 100) / 100 } : null, yieldRuleApplied: yieldRule ? { id: yieldRule.id, name: yieldRule.name, occupancyPercent: Math.round(occupancyPercent * 100) / 100, adjustment: Math.round((effectiveAmount - seasonAmount) * 100) / 100 } : null };
      });
      const occupancyKeys = roomBreakdown.map((item) => item.occupancyKey);
      const base = roomBreakdown.reduce((sum, item) => sum + item.baseAmount, 0);
      const tax = Number(rate?.taxAmount ?? 0) * input.rooms;
      const extras = roomBreakdown.reduce((sum, item) => sum + item.supplementAmount, 0);
      const applicableCharges = supplementaryCharges.filter((charge) => toDateOnly(charge.startDate) <= toDateOnly(night) && toDateOnly(charge.endDate) >= toDateOnly(night));
      const supplementaryChargeLines = applicableCharges.map((charge) => ({ id: charge.id, name: charge.name, amountPerRoomNight: Number(charge.amountPerRoomNight), rooms: input.rooms, amount: Math.round(Number(charge.amountPerRoomNight) * input.rooms * 100) / 100 }));
      const supplementaryAmount = supplementaryChargeLines.reduce((sum, charge) => sum + charge.amount, 0);
      return { date: toDateOnly(night), rooms: roomBreakdown, occupancy: occupancyKeys, baseRate: roomBreakdown.reduce((sum, item) => sum + item.baseRate, 0), baseAmount: base, manualOverride: roomBreakdown.length === 1 ? roomBreakdown[0].manualOverride : null, seasonApplied: roomBreakdown.length === 1 ? roomBreakdown[0].seasonApplied : null, yieldRuleApplied: roomBreakdown.length === 1 ? roomBreakdown[0].yieldRuleApplied : null, taxAmount: tax, extrasAmount: extras, supplementaryCharges: supplementaryChargeLines, supplementaryAmount, prePromotionAmount: base + tax + extras + supplementaryAmount, totalAmount: base + tax + extras + supplementaryAmount, priceSource: rate?.priceSource ?? 'RATE_PLAN', agentRatePlanId: rate?.agentRatePlanId ?? null };
    });
    for (const item of breakdown) item.totalAmount = Math.round(Number(item.totalAmount) * 100) / 100;
    const subtotal = Math.round(breakdown.reduce((sum, item) => sum + item.totalAmount, 0) * 100) / 100;
    const selectedPromotion = selectBestPromotion(promotions, { bookingDate: toDateOnly(getHotelOperationalDate(timezoneName)), stayDate: from, nights, subtotal, channel, code: promotionCode, roomTypeId: room.id, ratePlanId: plan.id });
    const discountAmount = Math.round(Math.min(subtotal, selectedPromotion?.discount ?? 0) * 100) / 100;
    const total = Math.max(0, Math.round((subtotal - discountAmount) * 100) / 100);
    if (discountAmount > 0 && subtotal > 0) {
      const itemCents = breakdown.map((item) => Math.max(0, Math.round(item.totalAmount * 100)));
      const discounts = itemCents.map((cents, index) => index === itemCents.length - 1 ? 0 : Math.min(cents, Math.round(discountAmount * (cents / Math.round(subtotal * 100)) * 100)));
      let remainingCents = Math.round(discountAmount * 100) - discounts.reduce((sum, cents) => sum + cents, 0);
      discounts[discounts.length - 1] = Math.min(itemCents[itemCents.length - 1], remainingCents);
      remainingCents -= discounts[discounts.length - 1];
      for (let index = discounts.length - 2; index >= 0 && remainingCents > 0; index -= 1) {
        const capacity = itemCents[index] - discounts[index];
        const extra = Math.min(capacity, remainingCents);
        discounts[index] += extra;
        remainingCents -= extra;
      }
      for (let index = 0; index < breakdown.length; index += 1) {
        const item = breakdown[index];
        const itemDiscount = discounts[index] / 100;
        item.discountAmount = itemDiscount;
        item.totalAmount = Math.max(0, (itemCents[index] - discounts[index]) / 100);
        item.promotionApplied = { id: selectedPromotion!.promotion.id, code: selectedPromotion!.promotion.code ?? null, name: selectedPromotion!.promotion.name, discountType: selectedPromotion!.promotion.discountType, discountValue: Number(selectedPromotion!.promotion.discountValue) };
      }
    }
    const taxTotal = breakdown.reduce((sum, item) => sum + item.taxAmount, 0);
    const supplementaryTotal = breakdown.reduce((sum, item) => sum + Number(item.supplementaryAmount ?? 0), 0);
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
      supplementaryTotal,
      discountAmount,
      promotionApplied: selectedPromotion ? { id: selectedPromotion.promotion.id, code: selectedPromotion.promotion.code ?? null, name: selectedPromotion.promotion.name, discountType: selectedPromotion.promotion.discountType, discountValue: Number(selectedPromotion.promotion.discountValue) } : null,
      available: inventoryAvailable && restrictionsValid && occupancyValid,
      availableRooms: inventoryComplete ? Math.min(...occupiedNights.map((night) => {
        const day = inventoryByDate.get(toDateOnly(night));
        return Math.max(0, day.available - day.held - day.sold);
      })) : 0,
      priceBreakdown: breakdown,
      priceSource: 'RATE_PLAN',
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
