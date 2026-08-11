import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma.service';
import { AvailabilityService } from '../availability/availability.service';
import { addDays, eachNight, parseDateOnly } from '../../common/dates';
import { randomToken, sha256 } from '../../common/security';
import { HoldCreateDto, HoldLineDto } from './holds.dto';

type LockRow = { id: string; roomTypeId: string; date: Date; available: number; held: number; sold: number; stopSell: boolean };

@Injectable()
export class HoldsService {
  constructor(private p: PrismaService, private availability: AvailabilityService, private c: ConfigService) {}

  async create(input: HoldCreateDto, agentId?: string) {
    const lines = input.lines?.length ? input.lines : [input];
    const sortedLines = [...lines].sort((a, b) => `${a.roomTypeId}:${a.checkIn}`.localeCompare(`${b.roomTypeId}:${b.checkIn}`));
    const rawToken = randomToken();
    const expiry = new Date(Date.now() + Number(this.c.get('HOLD_EXPIRY_MINUTES', this.c.get('HOLD_MINUTES', 15))) * 60_000);
    const result = await this.serializable(async (tx) => {
      const lockRows = await this.lockInventoryForLines(tx, sortedLines);
      await this.expireStaleHoldsForLockedRows(tx, lockRows);
      const quotes = [] as any[];
      for (const line of sortedLines) {
        const quote = await this.availability.quoteSelection(tx, line, { checkInventory: true, agentId });
        quotes.push(quote);
      }
      for (const line of sortedLines) {
        const expected = eachNight(parseDateOnly(line.checkIn, 'checkIn'), parseDateOnly(line.checkOut, 'checkOut')).map((date) => `${line.roomTypeId}:${date.toISOString().slice(0, 10)}`);
        for (const key of expected) {
          const row = lockRows.find((candidate) => `${candidate.roomTypeId}:${candidate.date.toISOString().slice(0, 10)}` === key);
          if (!row || row.stopSell || row.available - row.held - row.sold < line.rooms) throw new BadRequestException('Inventory changed while creating the hold');
          const updated = await tx.inventoryDay.updateMany({ where: { id: row.id, held: { lte: row.available - row.sold - line.rooms } }, data: { held: { increment: line.rooms }, version: { increment: 1 } } });
          if (updated.count !== 1) throw new BadRequestException('Inventory changed while creating the hold');
        }
      }
      const hold = await tx.inventoryHold.create({
        data: {
          tokenHash: sha256(rawToken),
          hotelId: sortedLines[0].hotelId,
          guestEmail: input.guestEmail,
          expiresAt: expiry,
          lines: {
            create: sortedLines.map((line, index) => {
              const quote = quotes[index];
              return {
                roomTypeId: line.roomTypeId,
                ratePlanId: line.ratePlanId,
                checkIn: parseDateOnly(line.checkIn, 'checkIn'),
                checkOut: parseDateOnly(line.checkOut, 'checkOut'),
                rooms: line.rooms,
                adults: line.adults,
                children: line.children,
                quotedTotal: quote.total,
                quotedTax: quote.taxTotal,
                quotedBreakdown: quote.priceBreakdown,
                nights: { create: quote.priceBreakdown.map((night: any) => ({ date: parseDateOnly(night.date, 'date'), rooms: line.rooms })) },
              };
            }),
          },
        },
        include: { lines: { include: { nights: true } } },
      });
      return hold;
    });
    return { ...result, token: rawToken };
  }

  async get(rawToken: string) {
    const hold = await this.p.inventoryHold.findUnique({ where: { tokenHash: sha256(rawToken) }, include: { lines: { include: { nights: true, roomType: true, ratePlan: true } }, hotel: true } });
    if (!hold) throw new NotFoundException('Hold not found');
    if (hold.status === 'ACTIVE' && hold.expiresAt <= new Date()) {
      await this.release(hold.id, 'EXPIRED');
      return { ...hold, status: 'EXPIRED' as const };
    }
    return hold;
  }

  async releaseExpired() {
    const holds = await this.p.inventoryHold.findMany({ where: { status: 'ACTIVE', expiresAt: { lte: new Date() } }, select: { id: true }, take: 100, orderBy: { expiresAt: 'asc' } });
    let released = 0;
    for (const hold of holds) {
      const result = await this.release(hold.id, 'EXPIRED');
      if (result.status === 'EXPIRED') released += 1;
    }
    return { released };
  }

  async release(id: string, status: 'RELEASED' | 'EXPIRED' = 'RELEASED') {
    return this.serializable(async (tx) => {
      const hold = await tx.inventoryHold.findUnique({ where: { id }, include: { lines: { include: { nights: true } } } });
      if (!hold) throw new NotFoundException('Hold not found');
      const rows = await this.lockInventoryForLines(tx, hold.lines.map((line) => ({ roomTypeId: line.roomTypeId, checkIn: line.checkIn.toISOString().slice(0, 10), checkOut: line.checkOut.toISOString().slice(0, 10), rooms: line.rooms })) as HoldLineDto[]);
      const changed = await tx.inventoryHold.updateMany({ where: { id, status: 'ACTIVE' }, data: { status } });
      if (changed.count === 1) {
        for (const line of hold.lines) {
          for (const night of line.nights) {
            const row = rows.find((candidate) => candidate.id && candidate.roomTypeId === line.roomTypeId && candidate.date.toISOString().slice(0, 10) === night.date.toISOString().slice(0, 10));
            if (row) await tx.inventoryDay.update({ where: { id: row.id }, data: { held: { decrement: Math.min(night.rooms, row.held) }, version: { increment: 1 } } });
          }
        }
      }
      return tx.inventoryHold.findUniqueOrThrow({ where: { id }, include: { lines: { include: { nights: true } } } });
    });
  }

  async lockInventoryForLines(tx: Prisma.TransactionClient, lines: Array<{ roomTypeId: string; checkIn: string; checkOut: string }>) {
    const keys = new Set<string>();
    for (const line of lines) for (const date of eachNight(parseDateOnly(line.checkIn, 'checkIn'), parseDateOnly(line.checkOut, 'checkOut'))) keys.add(`${line.roomTypeId}:${date.toISOString().slice(0, 10)}`);
    const roomIds = [...new Set([...keys].map((key) => key.split(':')[0]))].sort();
    const rows: LockRow[] = [];
    for (const roomTypeId of roomIds) {
      const dates = [...keys].filter((key) => key.startsWith(`${roomTypeId}:`)).map((key) => key.slice(roomTypeId.length + 1)).sort();
      if (!dates.length) continue;
      const locked = await tx.$queryRaw<LockRow[]>(Prisma.sql`SELECT id, "roomTypeId", date, available, held, sold, "stopSell" FROM "InventoryDay" WHERE "roomTypeId" = ${roomTypeId} AND date >= ${dates[0]}::date AND date <= ${dates[dates.length - 1]}::date ORDER BY date FOR UPDATE`);
      rows.push(...locked.filter((row) => keys.has(`${row.roomTypeId}:${row.date.toISOString().slice(0, 10)}`)));
    }
    return rows.sort((a, b) => `${a.roomTypeId}:${a.date.toISOString()}`.localeCompare(`${b.roomTypeId}:${b.date.toISOString()}`));
  }

  private async expireStaleHoldsForLockedRows(tx: Prisma.TransactionClient, rows: LockRow[]) {
    if (!rows.length) return;
    const keys = new Set(rows.map((row) => `${row.roomTypeId}:${row.date.toISOString().slice(0, 10)}`));
    const stale = await tx.inventoryHold.findMany({ where: { status: 'ACTIVE', expiresAt: { lte: new Date() } }, include: { lines: { include: { nights: true } } }, take: 100 });
    for (const hold of stale) {
      const allNights = hold.lines.flatMap((line) => line.nights);
      if (allNights.some((night) => !keys.has(`${hold.lines.find((line) => line.nights.some((candidate) => candidate.id === night.id))?.roomTypeId}:${night.date.toISOString().slice(0, 10)}`))) continue;
      const relevant = hold.lines.flatMap((line) => line.nights.filter((night) => keys.has(`${line.roomTypeId}:${night.date.toISOString().slice(0, 10)}`)));
      if (!relevant.length) continue;
      const changed = await tx.inventoryHold.updateMany({ where: { id: hold.id, status: 'ACTIVE' }, data: { status: 'EXPIRED' } });
      if (changed.count !== 1) continue;
      for (const night of relevant) {
        const line = hold.lines.find((candidate) => candidate.nights.some((candidateNight) => candidateNight.id === night.id));
        const row = rows.find((candidate) => candidate.roomTypeId === line?.roomTypeId && candidate.date.toISOString().slice(0, 10) === night.date.toISOString().slice(0, 10));
        if (row) await tx.inventoryDay.update({ where: { id: row.id }, data: { held: { decrement: Math.min(night.rooms, row.held) }, version: { increment: 1 } } });
      }
    }
  }

  private async serializable<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      try {
        return await this.p.$transaction(operation, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      } catch (error: any) {
        lastError = error;
        const serializationFailure = error?.code === 'P2034' || (error?.code === 'P2010' && error?.meta?.code === '40001');
        if (!serializationFailure || attempt === 7) throw error;
        await new Promise((resolve) => setTimeout(resolve, 35 * (attempt + 1) + Math.floor(Math.random() * 25)));
      }
    }
    throw lastError;
  }
}
