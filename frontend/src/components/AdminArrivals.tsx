"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { apiRequest } from '../lib/api';
import { todayInHotelTimezone } from '../lib/hotel-date-time';
import { ArrivalDetailsModal } from './ArrivalDetailsModal';

type Hotel = { id: string; name: string; city?: string };
type RoomType = { id: string; name: string; rooms: number };
type ArrivalRow = {
  rowType: 'RESERVATION' | 'WAITLIST'; reservationId: string | null; reference: string; hotel: { id: string; name: string };
  guestName: string; arrival: string | null; departure: string | null; nights: number; rooms: number; roomTypes: RoomType[];
  adults: number | null; children: number | null; pax: number | null; status: string; source: string | null; sourceName: string | null; businessType: string | null;
  advance: number; totalAmount: number; balance: number; paymentStatus: string | null; paymentMode: string | null; paymentModes: string[]; creditDate: string | null;
  bookedBy: { id: string; name: string } | null; mobile: string | null; gstin: string | null; specialRequest: string | null; billingInstruction: string | null; internalRemark: string | null;
  reconfirmed: boolean; reconfirmedAt: string | null; reconfirmedBy: { id: string; name: string } | null;
  stayStatus?: string; assignedRooms?: { roomNumber: string; roomType?: { name: string } | null }[];
  guestProfile?: { id: string; repeatGuest: boolean; completedStays: number; lastStay: string | null } | null;
};
type ArrivalResponse = { items: ArrivalRow[]; summary: { reservations: number; rooms: number; adults: number; children: number; pax: number; totalAmount: number; advance: number; balance: number; waitlist: number }; pagination: { page: number; limit: number; total: number; pages: number } };
type Filters = { from: string; to: string; hotelIds: string[]; statuses: string[]; source: string; includeWaitlist: boolean; reconfirmedOnly: boolean; showRemarks: boolean };

const sourceOptions = ['WEBSITE', 'DIRECT', 'PHONE', 'EMAIL', 'WHATSAPP', 'WALK_IN', 'AGENT', 'COMPANY', 'OTA'];
const statusOptions = [{ value: 'CONFIRMED', label: 'Confirmed' }, { value: 'TENTATIVE', label: 'Tentative' }, { value: 'PENDING_PAYMENT', label: 'Pending Payment' }];
function defaultFilters(): Filters { const date = todayInHotelTimezone(); return { from: date, to: date, hotelIds: [], statuses: ['CONFIRMED', 'TENTATIVE'], source: '', includeWaitlist: false, reconfirmedOnly: false, showRemarks: false }; }
function money(value: number) { return `INR ${Number(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }
function dateLabel(value: string | null) { return value ? new Date(`${value}T00:00:00Z`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—'; }
function csvValue(value: unknown) { return `"${String(value ?? '').replace(/"/g, '""')}"`; }

export function AdminArrivals() {
  const [filters, setFilters] = useState<Filters>(() => defaultFilters());
  const [applied, setApplied] = useState<Filters>(() => defaultFilters());
  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [data, setData] = useState<ArrivalResponse | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [hotelError, setHotelError] = useState('');
  const [actionError, setActionError] = useState('');
  const [selectedReference, setSelectedReference] = useState<string | null>(null);
  const reservationButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  useEffect(() => { apiRequest<Hotel[]>('/hotels').then(setHotels).catch((reason) => setHotelError(reason instanceof Error ? reason.message : 'Could not load hotels')); }, []);
  useEffect(() => {
    let cancelled = false;
    const query = new URLSearchParams({ from: applied.from, to: applied.to, page: String(page), limit: String(pageSize) });
    if (applied.includeWaitlist) query.set('includeWaitlist', 'true');
    if (applied.reconfirmedOnly) query.set('reconfirmedOnly', 'true');
    if (applied.showRemarks) query.set('showRemarks', 'true');
    if (applied.hotelIds.length) query.set('hotelIds', applied.hotelIds.join(','));
    if (applied.statuses.length) query.set('statuses', applied.statuses.join(','));
    if (applied.source) query.set('source', applied.source);
    setLoading(true); setError('');
    apiRequest<ArrivalResponse>(`/reports/expected-arrivals?${query.toString()}`)
      .then((body) => { if (!cancelled) setData(body); })
      .catch((reason) => { if (!cancelled) setError(reason instanceof Error ? reason.message : 'Could not load arrivals'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [applied, page, pageSize]);

  const visibleRows = data?.items ?? [];
  const selectedHotelLabel = useMemo(() => !filters.hotelIds.length ? 'All Hotels' : `${filters.hotelIds.length} hotel${filters.hotelIds.length === 1 ? '' : 's'} selected`, [filters.hotelIds]);
  function updateFilter<K extends keyof Filters>(key: K, value: Filters[K]) { setFilters((current) => ({ ...current, [key]: value })); }
  function toggleHotel(id: string) { updateFilter('hotelIds', filters.hotelIds.includes(id) ? filters.hotelIds.filter((item) => item !== id) : [...filters.hotelIds, id]); }
  function toggleStatus(value: string) { updateFilter('statuses', filters.statuses.includes(value) ? filters.statuses.filter((item) => item !== value) : [...filters.statuses, value]); }
  function submit(event: FormEvent) { event.preventDefault(); setActionError(''); if (filters.from > filters.to) { setError('Arrival To must be on or after Arrival From.'); return; } setPage(1); setApplied({ ...filters }); }
  function clear() { const next = defaultFilters(); setFilters(next); setPage(1); setApplied(next); setActionError(''); }
  function closeDetails() { const reference = selectedReference; setSelectedReference(null); requestAnimationFrame(() => { if (reference) reservationButtonRefs.current[reference]?.focus(); }); }
  function updateReconfirmation(reference: string, result: { reconfirmed: boolean; reconfirmedAt: string | null; reconfirmedBy: { id: string; name: string } | null }) { setData((current) => current ? { ...current, items: current.items.map((item) => item.reference === reference ? { ...item, reconfirmed: result.reconfirmed, reconfirmedAt: result.reconfirmedAt, reconfirmedBy: result.reconfirmedBy } : item) } : current); }
  async function reconfirm(row: ArrivalRow) {
    if (row.rowType !== 'RESERVATION') return;
    setActionError('');
    try { const result = await apiRequest<{ reconfirmed: boolean; reconfirmedAt: string | null; reconfirmedBy: { id: string; name: string } | null }>(`/reservations/${encodeURIComponent(row.reference)}/reconfirmation`, { method: 'PATCH', body: JSON.stringify({ reconfirmed: !row.reconfirmed }) }); updateReconfirmation(row.reference, result); }
    catch (reason) { setActionError(reason instanceof Error ? reason.message : 'Could not update reconfirmation'); }
  }
  function exportCsv() {
    if (!data) return;
    const rows = [['Row Type', 'Hotel', 'Reservation #', 'Guest Name', 'Arrival', 'Departure', 'Nights', 'Rooms', 'Room Type', 'Adults', 'Children', 'Pax', 'Source', 'Source Name', 'Business Type', 'Advance', 'Payment Mode', 'Payment Status', 'Credit Date', 'Booked By', 'Mobile', 'GST No.', 'Total Amount', 'Balance', 'Reconfirmed', 'Special Request', 'Billing Instruction', 'Internal Remark'], ...visibleRows.map((row) => [row.rowType, row.hotel.name, row.reference, row.guestName, row.arrival, row.departure, row.nights, row.rooms, row.roomTypes.map((item) => `${item.name} x ${item.rooms}`).join('; '), row.adults, row.children, row.pax, row.source, row.sourceName, row.businessType, row.advance, row.paymentModes.join('; '), row.paymentStatus, row.creditDate, row.bookedBy?.name, row.mobile, row.gstin, row.totalAmount, row.balance, row.reconfirmed ? 'Yes' : 'No', row.specialRequest, row.billingInstruction, row.internalRemark])];
    const csv = rows.map((row) => row.map(csvValue).join(',')).join('\n');
    const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); link.download = `rainwood-arrivals-page-${data.pagination.page}-${applied.from}-${applied.to}.csv`; link.click(); URL.revokeObjectURL(link.href);
  }

  return <section className="arrivalsPage">
    <form className="formCard arrivalsFilters" onSubmit={submit}>
      <div className="arrivalsFilterHeader"><div><span className="eyebrow">Front Desk Operations</span><h1>Expected Arrivals</h1><p>Bookings arriving between the selected dates.</p></div><div className="arrivalsActions"><button className="btn" type="submit">View / Search</button><button className="smallBtn secondary" type="button" onClick={clear}>Clear</button><button className="smallBtn" type="button" onClick={exportCsv} disabled={!data} title="Exports the currently displayed page">CSV (current page)</button><button className="smallBtn" type="button" onClick={() => window.print()} disabled={!data}>Print</button></div></div>
      <div className="arrivalsFilterGrid"><label>Arrival From<input type="date" value={filters.from} onChange={(event) => updateFilter('from', event.target.value)} /></label><label>Arrival To<input type="date" value={filters.to} min={filters.from} onChange={(event) => updateFilter('to', event.target.value)} /></label><div className="arrivalsDays"><span>Days</span><b>{filters.from && filters.to && filters.to >= filters.from ? Math.round((Date.parse(`${filters.to}T00:00:00Z`) - Date.parse(`${filters.from}T00:00:00Z`)) / 86400000) + 1 : '—'}</b></div><label>Booking Source<select value={filters.source} onChange={(event) => updateFilter('source', event.target.value)}><option value="">All Sources</option>{sourceOptions.map((source) => <option key={source}>{source}</option>)}</select></label></div>
      <div className="arrivalsFilterColumns"><fieldset><legend>Hotels · {selectedHotelLabel}</legend><label className="arrivalsCheck"><input type="checkbox" checked={!filters.hotelIds.length} onChange={() => updateFilter('hotelIds', [])} /> All Hotels</label>{hotels.map((hotel) => <label className="arrivalsCheck" key={hotel.id}><input type="checkbox" checked={filters.hotelIds.includes(hotel.id)} onChange={() => toggleHotel(hotel.id)} /> {hotel.name}{hotel.city ? ` · ${hotel.city}` : ''}</label>)}{hotelError && <small className="errorText">{hotelError}</small>}</fieldset><fieldset><legend>Status</legend>{statusOptions.map((option) => <label className="arrivalsCheck" key={option.value}><input type="checkbox" checked={filters.statuses.includes(option.value)} onChange={() => toggleStatus(option.value)} /> {option.label}</label>)}<label className="arrivalsCheck"><input type="checkbox" checked={filters.includeWaitlist} onChange={(event) => updateFilter('includeWaitlist', event.target.checked)} /> Waiting List</label></fieldset><fieldset><legend>Display</legend><label className="arrivalsCheck"><input type="checkbox" checked={filters.reconfirmedOnly} onChange={(event) => updateFilter('reconfirmedOnly', event.target.checked)} /> Reconfirmed Only</label><label className="arrivalsCheck"><input type="checkbox" checked={filters.showRemarks} onChange={(event) => updateFilter('showRemarks', event.target.checked)} /> Show Remarks</label></fieldset></div>
    </form>
    {error && <p className="error" role="alert">{error}</p>}{actionError && <p className="error" role="alert">{actionError}</p>}
    {data && <><div className="arrivalsMetrics" aria-label="Filtered arrivals summary">{[['Reservations', data.summary.reservations], ['Rooms', data.summary.rooms], ['Adults', data.summary.adults], ['Children', data.summary.children], ['Pax', data.summary.pax], ['Total Amount', money(data.summary.totalAmount)], ['Advance', money(data.summary.advance)], ['Balance Due', money(data.summary.balance)]].map(([label, value]) => <div key={String(label)}><span>{label}</span><b>{value}</b></div>)}</div>
      <section className="panel arrivalsTablePanel"><div className="arrivalsTableMeta"><span>{data.pagination.total} filtered arrival{data.pagination.total === 1 ? '' : 's'} · {applied.from} to {applied.to}</span>{data.summary.waitlist > 0 && <b>{data.summary.waitlist} waiting list</b>}<label>Rows per page <select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }}><option value={25}>25</option><option value={50}>50</option><option value={100}>100</option></select></label></div><div className="tableScroll"><table className="arrivalsTable"><thead><tr><th>Guest / Booking</th><th>Room / Room Type</th><th>Arrival / Departure</th><th>Stay</th><th>PAX</th><th>Payment / Balance</th><th>Status</th><th>Action</th></tr></thead><tbody>
        {loading ? <tr><td colSpan={8} className="loading">Loading arrivals...</td></tr> : visibleRows.map((row) => <tr key={row.rowType + '-' + row.reference}><td><div className="arrivalsPrimaryGuest"><strong>{row.guestName}</strong>{row.guestProfile?.repeatGuest && <span className="status ok arrivalsReturningBadge">RETURNING GUEST</span>}<small>{row.hotel.name} · {row.rowType === 'RESERVATION' ? <button ref={(element) => { reservationButtonRefs.current[row.reference] = element; }} className="arrivalsReservationLink" type="button" aria-label={'View arrival details for ' + row.reference} onClick={() => setSelectedReference(row.reference)}>{row.reference}</button> : <b>{row.reference}</b>}</small></div></td><td><strong>{row.roomTypes.map((item) => item.name + ' × ' + item.rooms).join(', ')}</strong><small>{row.rooms} room{row.rooms === 1 ? '' : 's'}</small></td><td><strong>{dateLabel(row.arrival)}</strong><small>to {dateLabel(row.departure)}</small></td><td>{row.nights} night{row.nights === 1 ? '' : 's'}</td><td><strong>{row.pax ?? '—'}</strong><small>{row.adults ?? '—'} adults · {row.children ?? '—'} children</small></td><td><strong>{money(row.balance)}</strong><small>{row.paymentStatus || row.status} · Advance {money(row.advance)}</small></td><td><span className={'status ' + (row.status === 'CONFIRMED' ? 'ok' : 'warn')}>{row.status}</span>{row.reconfirmed && <small className="arrivalsReconfirmed">Reconfirmed</small>}{row.rowType === 'WAITLIST' && <small className="arrivalsWaitlistTag">WAITLIST</small>}</td><td>{row.rowType === 'RESERVATION' && <button className="smallBtn arrivalsReconfirmButton" type="button" onClick={() => void reconfirm(row)}>{row.reconfirmed ? 'Undo' : 'Reconfirm'}</button>}</td></tr>)}{!loading && !visibleRows.length && <tr><td colSpan={8} className="empty">No arrivals found for the selected filters.</td></tr>}</tbody></table></div></section>
      <nav className="arrivalsPagination" aria-label="Arrivals pagination"><button className="smallBtn secondary" type="button" disabled={page <= 1 || loading} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</button><strong>Page {data.pagination.page} of {Math.max(1, data.pagination.pages)}</strong><button className="smallBtn secondary" type="button" disabled={page >= data.pagination.pages || loading} onClick={() => setPage((value) => Math.min(data.pagination.pages, value + 1))}>Next</button></nav>
      <div className="arrivalsStayStatusSummary"><strong>Stay status</strong>{visibleRows.filter((row) => row.rowType === 'RESERVATION').map((row) => <span key={`stay-${row.reference}`}>{row.reference}: {row.stayStatus === 'CHECKED_IN' ? `IN HOUSE · ${row.assignedRooms?.map((room) => room.roomNumber).join(', ') || 'Room pending'}` : row.stayStatus === 'CHECKED_OUT' ? 'CHECKED OUT' : 'EXPECTED'}</span>)}</div>
    </>}
    {selectedReference && <ArrivalDetailsModal reference={selectedReference} onClose={closeDetails} onReconfirmed={updateReconfirmation} />}
  </section>;
}
