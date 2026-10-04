import { HotelBusinessDayStatus, Prisma } from '@prisma/client';
import { addDays } from './dates';
import { getHotelOperationalDate } from './hotel-dates';

type BusinessDayDb = Pick<Prisma.TransactionClient, 'hotelBusinessDay'> | { hotelBusinessDay: { findFirst(args: any): Promise<any> } };

/**
 * Returns the hotel's currently open operational day. A closed night audit
 * advances the open day by one calendar day; before the first close we use the
 * hotel's local calendar date, matching the existing operational fallback.
 */
export async function getCurrentHotelBusinessDate(db: BusinessDayDb, hotelId: string, timezoneName: string, now = new Date()) {
  const latestClosed = await db.hotelBusinessDay.findFirst({
    where: { hotelId, status: HotelBusinessDayStatus.CLOSED },
    orderBy: { businessDate: 'desc' },
    select: { businessDate: true },
  });
  if (latestClosed?.businessDate) return addDays(new Date(latestClosed.businessDate), 1);

  const openDay = await db.hotelBusinessDay.findFirst({
    where: { hotelId, status: HotelBusinessDayStatus.OPEN },
    orderBy: { businessDate: 'desc' },
    select: { businessDate: true },
  });
  return openDay?.businessDate ? new Date(openDay.businessDate) : getHotelOperationalDate(timezoneName, now);
}
