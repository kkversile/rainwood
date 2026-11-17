import type { AgentReservation } from '../components/AgentData';

export type BookingDateMode = 'booking' | 'checkIn' | 'checkOut';
export type AgentBookingFilters = { from: string; to: string; search: string; city: string; hotel: string; mode: BookingDateMode; cancelledOnly: boolean };

export function filterAgentBookings(rows: AgentReservation[], filters: AgentBookingFilters) {
  const { from, to, mode, cancelledOnly } = filters;
  const search = filters.search.trim().toLowerCase();
  if (from && to && from > to) return [];
  return rows.filter((row) => {
    const rooms = row.lines.map((line) => `${line.roomType.name} ${line.ratePlan.name}`).join(' ');
    const text = `${row.reference} ${row.guestName} ${row.hotel.name} ${row.hotel.city} ${rooms}`.toLowerCase();
    const date = (mode === 'booking' ? row.createdAt : mode === 'checkIn' ? row.checkIn : row.checkOut)?.slice(0, 10) ?? '';
    return (!search || text.includes(search)) && (!filters.city || row.hotel.city.toLowerCase().includes(filters.city.trim().toLowerCase()))
      && (!filters.hotel || row.hotel.name.toLowerCase().includes(filters.hotel.trim().toLowerCase()))
      && (!from || date >= from) && (!to || date <= to) && (!cancelledOnly || row.status === 'CANCELLED');
  });
}
