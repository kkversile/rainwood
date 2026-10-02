'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { apiRequest } from '../lib/api';
import { addHotelDays, formatHotelDate, todayInHotelTimezone } from '../lib/hotel-date-time';
import { roomRackBlockSpan, roomRackDates, roomRackDayCount, roomRackToday, ROOM_RACK_DAY_OPTIONS } from '../lib/room-rack';
import { useAdminProfile } from './AdminData';
import { ReservationWorkspaceDrawer } from './FrontDeskWorkspace';

type Hotel = { id: string; name: string; timezoneName?: string | null };
type Block = { id: string; reservationId: string; roomId: string; reference: string; guestName: string; roomType: { id: string; name: string }; checkIn: string; checkOut: string; status: string; stayStatus: string; source: string; adults: number; children: number };
type Room = { id: string; roomNumber: string; floor?: string | null; wing?: string | null; status: string; roomType: { id: string; name: string }; housekeeping?: { id: string; status: string; issueNote?: string | null } | null; maintenance?: { id: string; status: string; priority: string; title: string; requiresOutOfOrder: boolean } | null; assignments: Block[] };
type UnassignedLine = { reservationLineId: string; roomType: { id: string; name: string }; requiredRooms: number; assignedRooms: number; remainingRooms: number };
type Rack = { title: string; hotel: Hotel; range: { from: string; to: string; days: number }; dates: string[]; rooms: Room[]; assignments: Block[]; facets: { roomTypes: { id: string; name: string }[]; floors: string[]; wings: string[]; roomStatuses: string[] }; unassignedReservations: { reservationId: string; reference: string; guestName: string; checkIn: string; checkOut: string; rooms: number; assignedRooms: number; remainingRooms: number; adults: number; children: number; roomTypes: { id: string; name: string }[]; unassignedLines: UnassignedLine[]; status: string; stayStatus: string }[]; conflicts: { roomId: string; roomNumber: string; date: string; reservations: { reservationId: string; reference: string; guestName: string }[] }[]; summary: { physicalRooms: number; roomNights: number; assignedRoomNights: number; unassignedReservations: number; occupancyPercent: number; byStatus: Record<string, number> } };

const statuses = ['AVAILABLE', 'OCCUPIED', 'DIRTY', 'CLEANING', 'OUT_OF_ORDER'];
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
const label = (value?: string | null) => String(value ?? '—').replace(/_/g, ' ').toLowerCase().replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());

export function RoomRackWorkspace() {
  const { profile } = useAdminProfile();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [rack, setRack] = useState<Rack | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const selectedHotelId = params.get('hotelId') ?? profile?.staffHotel?.id ?? hotels[0]?.id ?? '';
  const visibleHotels = profile?.staffHotel?.id ? hotels.filter((hotel) => hotel.id === profile.staffHotel?.id) : hotels;
  const selectedHotel = visibleHotels.find((hotel) => hotel.id === selectedHotelId);
  const selectedHotelTimezone = selectedHotel?.timezoneName ?? rack?.hotel.timezoneName ?? undefined;
  const from = params.get('from') ?? todayInHotelTimezone(selectedHotelTimezone);
  const days = roomRackDayCount(params.get('days'));
  const search = params.get('search') ?? '';
  const roomTypeId = params.get('roomTypeId') ?? '';
  const floor = params.get('floor') ?? '';
  const wing = params.get('wing') ?? '';
  const roomStatus = params.get('roomStatus') ?? '';
  const stayStatus = params.get('stayStatus') ?? '';
  const selectedDate = params.get('selectedDate') ?? from;
  const openReference = params.get('open');
  const [searchInput, setSearchInput] = useState(search);

  useEffect(() => { void apiRequest<Hotel[]>('/hotels').then(setHotels).catch(() => setHotels([])); }, []);

  const updateQuery = useCallback((changes: Record<string, string | number | null | undefined>) => {
    const next = new URLSearchParams(params.toString());
    Object.entries(changes).forEach(([key, value]) => { if (value === null || value === undefined || value === '') next.delete(key); else next.set(key, String(value)); });
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }, [params, pathname, router]);

  const load = useCallback(async () => {
    if (!selectedHotelId) { setLoading(false); return; }
    setLoading(true); setError('');
    const query = new URLSearchParams({ hotelId: selectedHotelId, from, days: String(days) });
    for (const [key, value] of Object.entries({ roomTypeId, floor, wing, roomStatus, stayStatus, search })) if (value) query.set(key, value);
    try { setRack(await apiRequest<Rack>(`/reports/room-rack?${query.toString()}`)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to load the Room Rack.'); setRack(null); }
    finally { setLoading(false); }
  }, [days, floor, from, roomStatus, roomTypeId, search, selectedHotelId, stayStatus, wing]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setSearchInput(search); }, [search]);
  useEffect(() => {
    if (searchInput === search) return;
    const timer = window.setTimeout(() => updateQuery({ search: searchInput, open: null }), 300);
    return () => window.clearTimeout(timer);
  }, [search, searchInput, updateQuery]);

  const roomTypes = useMemo(() => rack?.facets.roomTypes ?? [], [rack]);
  const floors = useMemo(() => rack?.facets.floors ?? [], [rack]);
  const wings = useMemo(() => rack?.facets.wings ?? [], [rack]);
  const roomStatuses = useMemo(() => rack?.facets.roomStatuses.length ? rack.facets.roomStatuses : statuses, [rack]);
  const dates = rack?.dates ?? roomRackDates(from, days);
  const mobileDate = dates.includes(selectedDate) ? selectedDate : dates[0];
  const blocksForDate = rack?.assignments.filter((block) => block.checkIn <= mobileDate && block.checkOut > mobileDate) ?? [];
  const hotelToday = roomRackToday(rack?.hotel.timezoneName ?? selectedHotelTimezone);

  function moveRange(offset: number) { updateQuery({ from: addHotelDays(from, offset), open: null }); }

  return <section className="roomRackPage">
    <header className="roomRackHero"><div><span className="eyebrow">{rack?.title ?? 'RAINWOOD ROOM RACK & OCCUPANCY PLANNING REPORT'}</span><h1>Room Rack</h1><p>Physical-room occupancy planning by hotel-local stay date. This is separate from sellable inventory and rate availability.</p></div><div className="roomRackContext"><strong>{rack?.hotel.name ?? hotels.find((hotel) => hotel.id === selectedHotelId)?.name ?? 'Select a hotel'}</strong><span>{from} → {rack?.range.to ?? addHotelDays(from, days - 1)}</span></div></header>
    <section className="panel roomRackControls" aria-label="Room Rack controls">
      <div className="roomRackControlRow"><label>Hotel<select aria-label="Hotel" value={selectedHotelId} onChange={(event) => updateQuery({ hotelId: event.target.value, open: null })}><option value="">Select hotel</option>{visibleHotels.map((hotel) => <option key={hotel.id} value={hotel.id}>{hotel.name}</option>)}</select></label><div className="roomRackRangeButtons" aria-label="Date range"><button type="button" className="smallBtn secondary" onClick={() => moveRange(-days)}>Previous</button><button type="button" className="smallBtn secondary" onClick={() => updateQuery({ from: todayInHotelTimezone(selectedHotelTimezone), open: null })}>Today</button><button type="button" className="smallBtn secondary" onClick={() => moveRange(days)}>Next</button>{ROOM_RACK_DAY_OPTIONS.map((option) => <button key={option} type="button" className={`smallBtn ${days === option ? '' : 'secondary'}`} onClick={() => updateQuery({ days: option, open: null })}>{option} days</button>)}</div></div>
      <div className="roomRackFilterRow"><label>Search room, guest or reference<input aria-label="Search room, guest or reference" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Room, guest, reference…" /></label><label>Room type<select aria-label="Room type" value={roomTypeId} onChange={(event) => updateQuery({ roomTypeId: event.target.value, open: null })}><option value="">All room types</option>{roomTypes.map((roomType) => <option key={roomType.id} value={roomType.id}>{roomType.name}</option>)}</select></label><label>Floor<select aria-label="Floor" value={floor} onChange={(event) => updateQuery({ floor: event.target.value, open: null })}><option value="">All floors</option>{floors.map((value) => <option key={value} value={value}>{value}</option>)}</select></label><label>Wing<select aria-label="Wing" value={wing} onChange={(event) => updateQuery({ wing: event.target.value, open: null })}><option value="">All wings</option>{wings.map((value) => <option key={value} value={value}>{value}</option>)}</select></label><label>Room status<select aria-label="Room status" value={roomStatus} onChange={(event) => updateQuery({ roomStatus: event.target.value, open: null })}><option value="">All statuses</option>{roomStatuses.map((value) => <option key={value} value={value}>{label(value)}</option>)}</select></label><label>Stay status<select aria-label="Stay status" value={stayStatus} onChange={(event) => updateQuery({ stayStatus: event.target.value, open: null })}><option value="">All stays</option><option value="EXPECTED">Expected</option><option value="CHECKED_IN">Checked In</option><option value="CHECKED_OUT">Checked Out</option></select></label></div>
    </section>
    {error && <div className="error roomRackError" role="alert">{error}<button className="smallBtn" type="button" onClick={() => void load()}>Retry</button></div>}
    {loading ? <div className="panel roomRackState" role="status">Loading physical-room planning…</div> : !rack ? <div className="panel roomRackState">Select a hotel to load the Room Rack.</div> : <>
      <section className="roomRackSummary" aria-label="Room Rack occupancy summary"><div><span>Physical rooms</span><strong>{rack.summary.physicalRooms}</strong></div><div><span>Room nights</span><strong>{rack.summary.assignedRoomNights} / {rack.summary.roomNights}</strong></div><div><span>Planned occupancy</span><strong>{rack.summary.occupancyPercent}%</strong></div><div><span>Needs assignment</span><strong>{rack.summary.unassignedReservations}</strong></div><div><span>Current available</span><strong>{rack.summary.byStatus.AVAILABLE ?? 0}</strong></div></section>
      <div className="roomRackNote"><strong>Planning semantics:</strong> blocks show physical room assignments across the selected stay dates. Current housekeeping and maintenance status is an operational overlay only; it is not back-projected into historical cells. <a href={`${basePath}/admin/housekeeping`}>Open housekeeping</a> · <a href={`${basePath}/admin/maintenance`}>Open maintenance</a></div>
      {rack.conflicts.length > 0 && <div className="roomRackConflict" role="alert"><strong>Assignment conflict warning:</strong>{rack.conflicts.map((conflict) => <div key={`${conflict.roomId}-${conflict.date}`}><span>{conflict.roomNumber} on {conflict.date}: </span>{conflict.reservations.map((item) => <span key={item.reservationId}><button type="button" className="roomRackConflictLink" onClick={() => updateQuery({ open: item.reference })}>Open {item.reference}</button>{' '}</span>)}</div>)}</div>}
      {rack.unassignedReservations.length > 0 && <section className="roomRackUnassigned panel"><div><span className="eyebrow">Unassigned lane</span><h2>Reservations requiring physical assignment</h2><p>These bookings overlap the selected range but do not have enough physical-room coverage. No assignment has been inferred.</p></div><div className="roomRackUnassignedList">{rack.unassignedReservations.map((item) => <button key={item.reservationId} type="button" className="roomRackUnassignedCard" onClick={() => updateQuery({ open: item.reference })}><strong>{item.guestName}</strong><span>{item.reference} · {item.checkIn} → {item.checkOut}</span>{item.unassignedLines.map((line) => <span key={line.reservationLineId}>{line.roomType.name}: {line.assignedRooms} of {line.requiredRooms} assigned · {line.remainingRooms} remaining</span>)}</button>)}</div></section>}
      <div className="roomRackMobileControls"><label>Selected date<select aria-label="Selected planning date" value={mobileDate} onChange={(event) => updateQuery({ selectedDate: event.target.value })}>{dates.map((date) => <option key={date} value={date}>{formatHotelDate(date)}</option>)}</select></label></div>
      <section className="roomRackBoard" aria-label="Physical room rack"><div className="roomRackBoardHeader"><div className="roomRackCorner">Room / current status</div><div className="roomRackDateHeaders">{dates.map((date) => <div key={date} className={date === hotelToday ? 'today' : ''}><strong>{formatHotelDate(date)}</strong><span>{date === hotelToday ? 'Today' : ''}</span></div>)}</div></div>{rack.rooms.map((room) => <div className="roomRackRow" key={room.id}><div className="roomRackRoomLabel"><strong>{room.roomNumber}</strong><span>{room.roomType.name}{room.floor ? ` · Floor ${room.floor}` : ''}{room.wing ? ` · ${room.wing}` : ''}</span><em className={`roomStatus roomStatus-${room.status.toLowerCase()}`}>{label(room.status)}</em>{room.housekeeping && <small>HK: {label(room.housekeeping.status)}</small>}{room.maintenance && <small>Maintenance: {label(room.maintenance.status)}</small>}</div><div className="roomRackTrack">{dates.map((date) => <span key={date} className={`roomRackDay ${date === hotelToday ? 'today' : ''}`} aria-hidden="true" />)}{room.assignments.map((block) => { const span = roomRackBlockSpan(block.checkIn, block.checkOut, dates); if (!span) return null; return <button key={block.id} type="button" className={`roomRackBlock stay-${block.stayStatus.toLowerCase()}`} style={{ left: `${(span.start / dates.length) * 100}%`, width: `${(span.span / dates.length) * 100}%` }} onClick={() => updateQuery({ open: block.reference })} aria-label={`${block.reference}, ${block.guestName}, ${block.checkIn} to ${block.checkOut}`}><strong>{block.guestName}</strong><span>{block.reference} · {label(block.stayStatus)}</span></button>; })}</div></div>)}</section>
      <section className="roomRackMobileList" aria-label="Selected date room list"><h2>{formatHotelDate(mobileDate)}</h2>{rack.rooms.map((room) => <article key={room.id} className="roomRackMobileCard"><div><strong>{room.roomNumber}</strong><span>{room.roomType.name} · {label(room.status)}</span></div>{blocksForDate.filter((block) => block.roomId === room.id).map((block) => <button key={block.id} type="button" onClick={() => updateQuery({ open: block.reference })}><strong>{block.guestName}</strong><span>{block.reference} · {label(block.stayStatus)}</span></button>)}{!blocksForDate.some((block) => block.roomId === room.id) && <small>No assigned stay on this date.</small>}</article>)}</section>
    </>}
    {openReference && <ReservationWorkspaceDrawer reference={openReference} role={profile?.role} onClose={() => updateQuery({ open: null })} onChanged={() => void load()} />}
  </section>;
}
