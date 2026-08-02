import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { AxisInventoryDto, AxisRatesDto } from './axisrooms.dto';
import { hmac, safeEqual } from '../../common/security';

@Injectable()
export class AxisRoomsService {
  constructor(private p: PrismaService, private c: ConfigService) {}

  verifyInbound(raw: Buffer, signature?: string) {
    if (this.c.get('AXISROOMS_MODE', 'mock') === 'mock') return true;
    const secret = this.c.get('AXISROOMS_WEBHOOK_SECRET');
    if (!secret || !signature) return false;
    return safeEqual(signature, hmac(secret, raw));
  }

  async inbound(type: 'inventory' | 'rate', payload: AxisInventoryDto | AxisRatesDto) {
    const property = await this.p.hotel.findFirst({ where: { axisPropertyId: payload.propertyId, active: true } });
    if (!property) throw new BadRequestException('Unmapped AxisRooms property');
    return this.p.$transaction(async (tx) => {
      if (type === 'inventory') {
        const inventoryPayload = payload as AxisInventoryDto;
        for (const item of inventoryPayload.inventory) {
          const room = await tx.roomType.findFirst({ where: { hotelId: property.id, axisRoomId: item.roomId, active: true } });
          if (!room) throw new BadRequestException(`Unmapped AxisRooms room ${item.roomId}`);
          const date = new Date(`${item.date}T00:00:00.000Z`);
          const current = await tx.inventoryDay.findUnique({ where: { roomTypeId_date: { roomTypeId: room.id, date } } });
          if (current && item.available < current.held + current.sold) throw new BadRequestException(`AxisRooms inventory would violate held/sold invariant for ${item.date}`);
          await tx.inventoryDay.upsert({ where: { roomTypeId_date: { roomTypeId: room.id, date } }, create: { roomTypeId: room.id, date, available: item.available, stopSell: Boolean(item.stopSell), updatedFromAxisAt: new Date() }, update: { available: item.available, stopSell: Boolean(item.stopSell), updatedFromAxisAt: new Date(), version: { increment: 1 } } });
        }
      } else {
        const ratePayload = payload as AxisRatesDto;
        for (const item of ratePayload.rates) {
          const rate = await tx.ratePlan.findFirst({ where: { axisRatePlanId: item.ratePlanId, roomType: { hotelId: property.id, axisRoomId: item.roomId, active: true }, active: true } });
          if (!rate) throw new BadRequestException(`Unmapped AxisRooms rate plan ${item.ratePlanId}`);
          const date = new Date(`${item.date}T00:00:00.000Z`);
          await tx.rateDay.upsert({ where: { ratePlanId_date: { ratePlanId: rate.id, date } }, create: { ratePlanId: rate.id, date, amount: item.amount, taxAmount: item.taxAmount ?? 0, cta: Boolean(item.cta), ctd: Boolean(item.ctd), minLos: item.minLos ?? 1, maxLos: item.maxLos, updatedFromAxisAt: new Date() }, update: { amount: item.amount, taxAmount: item.taxAmount ?? 0, cta: Boolean(item.cta), ctd: Boolean(item.ctd), minLos: item.minLos ?? 1, maxLos: item.maxLos, updatedFromAxisAt: new Date() } });
        }
      }
      const count = type === 'inventory' ? (payload as AxisInventoryDto).inventory.length : (payload as AxisRatesDto).rates.length;
      return { ok: true, type, count };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async push(job: { aggregateId: string; type: string; idempotencyKey: string }) {
    const reservation = await this.p.reservation.findUniqueOrThrow({ where: { id: job.aggregateId }, include: { hotel: true, lines: { include: { roomType: true, ratePlan: true } } } });
    if (!reservation.hotel.axisPropertyId) throw new BadRequestException('Missing AxisRooms property mapping');
    const rooms = reservation.lines.map((line) => {
      if (!line.roomType.axisRoomId || !line.ratePlan.axisRatePlanId) throw new BadRequestException(`Missing AxisRooms mapping for ${line.roomType.code}/${line.ratePlan.code}`);
      return { roomId: line.roomType.axisRoomId, ratePlanId: line.ratePlan.axisRatePlanId, quantity: line.rooms, adults: line.adults, children: line.children };
    });
    const payload = { bookingRef: reservation.reference, propertyId: reservation.hotel.axisPropertyId, status: reservation.status, guest: { name: reservation.guestName, email: reservation.email, mobile: reservation.mobile }, stay: { checkIn: reservation.checkIn.toISOString().slice(0, 10), checkOut: reservation.checkOut.toISOString().slice(0, 10) }, rooms, amount: Number(reservation.totalAmount), currency: reservation.currency, idempotencyKey: job.idempotencyKey };
    if (this.c.get('AXISROOMS_MODE', 'mock') === 'mock') return { success: true, externalReference: `AX-${reservation.reference}`, payload };
    const baseUrl = this.c.getOrThrow<string>('AXISROOMS_BASE_URL');
    const path = job.type.includes('CANCEL') ? '/bookings/cancellation' : job.type.includes('MODIFY') ? '/bookings/modification' : '/bookings';
    const apiKey = this.c.get('AXISROOMS_API_KEY');
    const username = this.c.get('AXISROOMS_USERNAME');
    const password = this.c.get('AXISROOMS_PASSWORD');
    const authorization = apiKey ? `Bearer ${apiKey}` : username && password ? `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}` : undefined;
    if (!authorization) throw new BadRequestException('AxisRooms live credentials are not configured');
    const response = await fetch(`${baseUrl}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', authorization, 'idempotency-key': job.idempotencyKey }, body: JSON.stringify(payload) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`AxisRooms ${response.status}: ${JSON.stringify(result)}`);
    return result;
  }
}
