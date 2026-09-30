'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiRequest } from '../lib/api';
import { useAdminProfile } from './AdminData';

const REVENUE_FORECAST_HORIZON_DAYS = 90;
type Hotel = { id: string; name: string; timezoneName?: string };
type ForecastRow = { stayDate: string; available: boolean; sellableRooms: number | null; bookedRooms: number | null; heldRooms: number | null; roomRevenue: number | null; adr: number | null; occupancyPercent: number | null; projectedBookedRooms: number | null; demandSignal: string; signals: string[]; pickup: Record<string, number | null>; pickupRevenue: Record<string, number | null>; pace: Record<string, number | null>; revenuePace: Record<string, number | null> };
type RoomTypeTotal = { roomTypeId: string; roomType: string; sellableRoomNights: number; bookedRoomNights: number; heldRoomNights: number; roomRevenue: number; adr: number };
type Forecast = { hotel: Hotel & { timezoneName: string }; observationDate: string; observationSource: 'LIVE' | 'SNAPSHOT'; from: string; to: string; pickupWindows: number[]; summary: { availableDateCount: number; requestedDateCount: number; sellableRooms: number; bookedRooms: number; heldRooms: number; roomRevenue: number; occupancyPercent: number | null; headline: ForecastRow | null }; roomTypes: RoomTypeTotal[]; rows: ForecastRow[] };
export type RevenueForecastScopeProfile = { role: string; staffHotelId?: string | null };
export function scopedRevenueForecastHotels(profile: RevenueForecastScopeProfile, hotels: Hotel[]) { return profile.role === 'ADMIN' ? (profile.staffHotelId ? hotels.filter((hotel) => hotel.id === profile.staffHotelId) : []) : hotels; }

const dateInZone = (timezone: string, value = new Date()) => { const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(value); const values = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value])); return `${values.year}-${values.month}-${values.day}`; };
const shiftDate = (value: string, days: number) => { const date = new Date(`${value}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10); };
const money = (value: number | null) => value === null ? 'Unavailable' : `INR ${Number(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pickupValue = (row: ForecastRow | null | undefined, window: number, field: 'pickup' | 'pickupRevenue') => row?.[field]?.[String(window)] ?? null;

export function RevenueForecast() {
  const { profile, loading: profileLoading } = useAdminProfile();
  const canView = ['SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN'].includes(profile?.role ?? '');
  const [hotels, setHotels] = useState<Hotel[]>([]); const [hotelId, setHotelId] = useState(''); const [observationDate, setObservationDate] = useState(''); const [from, setFrom] = useState(''); const [to, setTo] = useState('');
  const [data, setData] = useState<Forecast | null>(null); const [scopeLoading, setScopeLoading] = useState(false); const [loading, setLoading] = useState(false); const [error, setError] = useState('');

  useEffect(() => {
    if (!canView || profileLoading) return;
    let cancelled = false;
    async function loadScope() {
      setScopeLoading(true); setError(''); setData(null);
      try {
        if (profile?.role === 'ADMIN' && !profile.staffHotelId) throw new Error('Your account has no assigned hotel for Revenue Forecast access.');
        const allHotels = await apiRequest<Hotel[]>('/hotels'); if (cancelled) return;
        const visibleHotels = scopedRevenueForecastHotels(profile!, allHotels);
        if (!visibleHotels.length) throw new Error(profile?.role === 'ADMIN' ? 'Your assigned hotel is unavailable or inactive.' : 'No active hotel is available for Revenue Forecast.');
        const selected = profile?.role === 'ADMIN' ? visibleHotels[0] : visibleHotels[0]; setHotels(visibleHotels); setHotelId(selected.id);
        const today = dateInZone(selected.timezoneName ?? 'Asia/Kolkata'); setObservationDate(today); setFrom(today); setTo(shiftDate(today, 14));
      } catch (reason) { if (!cancelled) setError(reason instanceof Error ? reason.message : 'Could not verify Revenue Forecast hotel scope.'); } finally { if (!cancelled) setScopeLoading(false); }
    }
    void loadScope(); return () => { cancelled = true; };
  }, [canView, profileLoading, profile?.role, profile?.staffHotelId]);

  const query = useMemo(() => new URLSearchParams({ hotelId, observationDate, from, to, horizon: String(REVENUE_FORECAST_HORIZON_DAYS), pickupWindows: '1,3,7,14,30' }).toString(), [hotelId, observationDate, from, to]);
  useEffect(() => { if (!canView || scopeLoading || !hotelId || !observationDate || !from || !to) return; setLoading(true); setError(''); apiRequest<Forecast>(`/revenue-forecast?${query}`).then(setData).catch((reason: Error) => { setData(null); setError(reason.message); }).finally(() => setLoading(false)); }, [canView, scopeLoading, hotelId, observationDate, from, to, query]);
  const changeHotel = (value: string) => { const hotel = hotels.find((item) => item.id === value); setHotelId(value); if (hotel) { const today = dateInZone(hotel.timezoneName ?? 'Asia/Kolkata'); setObservationDate(today); setFrom(today); setTo(shiftDate(today, 14)); } };
  const headline = data?.summary.headline ?? data?.rows[0] ?? null;
  if (!canView && !profileLoading) return <section className="pageSection"><p className="hint">Revenue Forecast access is limited to management roles.</p></section>;
  return <section className="pageSection revenueForecastPage">
    <header className="pageTitle"><div><span>Revenue intelligence</span><h1>Revenue Forecast</h1><p>Current open business day is calculated live. Historical observations use immutable Night Audit snapshots. This page never changes rates or writes to external channels.</p></div></header>
    {error && <p className="error" role="alert">{error}</p>}{profileLoading || scopeLoading ? <section className="panel"><p className="loading">Checking authorized hotel scope…</p></section> : !hotelId ? null : <>
      <section className="panel revenueForecastFilters"><div className="managementFilterGrid"><label>Hotel<select value={hotelId} onChange={(event) => changeHotel(event.target.value)} disabled={profile?.role === 'ADMIN'}>{hotels.map((hotel) => <option key={hotel.id} value={hotel.id}>{hotel.name}</option>)}</select></label><label>Observation date<input type="date" value={observationDate} onChange={(event) => setObservationDate(event.target.value)} /></label><label>Stay from<input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label><label>Stay to<input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label></div><p className="hint">Official immutable snapshots are created by Night Audit. Manual snapshot capture is restricted to SUPER_ADMIN recovery.</p></section>
      {loading && <p className="loading">Loading forecast…</p>}{data && <>
        <section className="revenueForecastSummary"><div><strong>{data.observationSource}</strong><span>Observation source</span></div><div><strong>{headline?.occupancyPercent === null || headline?.occupancyPercent === undefined ? 'Unavailable' : `${headline.occupancyPercent}%`}</strong><span>OTB occupancy</span></div><div><strong>{money(headline?.roomRevenue ?? null)}</strong><span>OTB revenue</span></div><div><strong>{money(headline?.adr ?? null)}</strong><span>ADR</span></div><div><strong>{pickupValue(headline, 7, 'pickup') ?? 'Unavailable'}</strong><span>Pickup 7D rooms</span></div><div><strong>{money(pickupValue(headline, 7, 'pickupRevenue'))}</strong><span>Revenue pickup 7D</span></div><div><strong>{pickupValue(headline, 30, 'pickup') ?? 'Unavailable'}</strong><span>Pickup 30D rooms</span></div><div><strong>{money(pickupValue(headline, 30, 'pickupRevenue'))}</strong><span>Revenue pickup 30D</span></div></section>
        {data.summary.availableDateCount < data.summary.requestedDateCount && <p className="notice">Some dates are unavailable because no authoritative data exists for the selected observation. Historical data is never reconstructed from today&apos;s reservations.</p>}
        <section className="panel"><div className="listToolbar"><div><span>Booking curve inputs</span><h2>OTB, pickup &amp; pace</h2><p>Pickup retains negative values from cancellations or modifications. Projected OTB is a simple OTB plus positive 7-day pickup projection, not a final forecast.</p></div><span className={`status ${data.observationSource === 'LIVE' ? 'ok' : 'warn'}`}>{data.observationSource}</span></div><div className="tableScroll"><table><thead><tr><th>Date</th><th>Sellable</th><th>OTB rooms</th><th>OTB %</th><th>Held</th><th>Pickup 7D</th><th>Revenue pickup 7D</th><th>OTB revenue</th><th>ADR</th><th>Demand</th></tr></thead><tbody>{data.rows.map((row) => <tr key={row.stayDate}><td><b>{row.stayDate}</b></td><td>{row.sellableRooms ?? 'Unavailable'}</td><td>{row.bookedRooms ?? 'Unavailable'}</td><td>{row.occupancyPercent === null ? 'Unavailable' : `${row.occupancyPercent}%`}</td><td>{row.heldRooms ?? 'Unavailable'}</td><td>{pickupValue(row, 7, 'pickup') ?? 'Unavailable'}</td><td>{money(pickupValue(row, 7, 'pickupRevenue'))}</td><td>{money(row.roomRevenue)}</td><td>{money(row.adr)}</td><td><span className={`status ${row.demandSignal === 'HIGH' ? 'warn' : row.demandSignal === 'UNAVAILABLE' ? '' : 'ok'}`}>{row.demandSignal}</span><small className="forecastSignalText">{row.signals[0]}</small></td></tr>)}{!data.rows.length && <tr><td colSpan={10} className="empty">No stay dates selected.</td></tr>}</tbody></table></div></section>
        <section className="panel"><div className="listToolbar"><div><span>Period totals</span><h2>Room type breakdown</h2><p>Totals cover the selected stay-date range. ADR is room revenue divided by booked room nights.</p></div></div><div className="tableScroll"><table><thead><tr><th>Room type</th><th>Sellable room nights</th><th>Booked room nights</th><th>Held room nights</th><th>Revenue</th><th>ADR</th></tr></thead><tbody>{data.roomTypes.map((row) => <tr key={row.roomTypeId}><td>{row.roomType}</td><td>{row.sellableRoomNights}</td><td>{row.bookedRoomNights}</td><td>{row.heldRoomNights}</td><td>{money(row.roomRevenue)}</td><td>{money(row.adr)}</td></tr>)}{!data.roomTypes.length && <tr><td colSpan={6} className="empty">No room-type totals are available.</td></tr>}</tbody></table></div></section>
      </>}
    </>}
  </section>;
}
