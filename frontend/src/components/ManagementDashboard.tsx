'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, CalendarDays, ChevronDown, RefreshCw } from 'lucide-react';
import { apiRequest } from '../lib/api';
import { useAdminProfile } from './AdminData';
import { canAccessAdminRoute } from './Shell';
import { useAdminFeatureAccess } from '../lib/admin-features';
import { dashboardDrilldownHref } from '../lib/dashboard-drilldown';

type Hotel = { id: string; name: string; timezoneName?: string };
type Dashboard = {
  period: { hotel: { id: string; name: string; timezoneName: string }; from: string; to: string; days: number };
  kpis: Record<string, number | string>;
  daily: { date: string; occupancy: number; adr: number; revpar: number; roomRevenue: number; incidentalRevenue: number; grossRevenue: number; legacyOccupancySemantics?: boolean }[];
  sources: { source: string; reservations: number; roomNights: number; roomRevenue: number }[];
  roomTypes: { roomTypeId: string; roomType: string; roomNights: number; roomRevenue: number; adr: number }[];
  operations: { roomsAvailable: number; dirtyRooms: number; cleaningRooms: number; outOfOrderRooms: number; openMaintenanceTickets: number };
  sourceReservationSemantics?: string;
};

const dateInZone = (timezone: string, value = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(value);
  const values = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
};
const shiftDate = (value: string, days: number) => { const date = new Date(`${value}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10); };
const money = (value: unknown) => value == null ? '—' : `₹${Number(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dateLabel = (value: string) => value ? new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${value.slice(0, 10)}T12:00:00Z`)) : '—';
const presets = [['today', 'Today'], ['yesterday', 'Yesterday'], ['last7', 'Last 7 days'], ['month', 'This month']] as const;
const sourceLabel = (value: string) => value.toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());

export function ManagementDashboard() {
  const { profile } = useAdminProfile();
  const features = useAdminFeatureAccess();
  const canView = ['SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN'].includes(profile?.role ?? '');
  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [hotelId, setHotelId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [preset, setPreset] = useState('today');
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const [hotelRetry, setHotelRetry] = useState(0);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [metric, setMetric] = useState<'roomRevenue' | 'occupancy'>('roomRevenue');
  const [showDates, setShowDates] = useState(false);
  const validRange = Boolean(from && to && from <= to);
  const canOpen = (href: string, feature: string) => canAccessAdminRoute(profile?.role, href) && (profile?.role === 'SUPER_ADMIN' || (features.status === 'ready' && features.isEnabled(feature)));

  useEffect(() => {
    if (!canView) return;
    let cancelled = false;
    setLoading(true); setError('');
    apiRequest<Hotel[]>('/hotels').then((items) => {
      if (cancelled) return;
      setHotels(items);
      if (items[0]) {
        const today = dateInZone(items[0].timezoneName ?? 'UTC');
        setHotelId(items[0].id); setFrom(today); setTo(today);
      } else setLoading(false);
    }).catch((reason: Error) => { if (!cancelled) { setError(reason.message); setLoading(false); } });
    return () => { cancelled = true; };
  }, [canView, hotelRetry]);

  const query = useMemo(() => new URLSearchParams({ hotelId, from, to }).toString(), [hotelId, from, to]);
  useEffect(() => {
    if (!canView || !hotelId) return;
    if (!validRange) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true); setError('');
    apiRequest<Dashboard>(`/management/dashboard?${query}`).then((result) => {
      if (!cancelled) { setData(result); setUpdatedAt(new Date()); }
    }).catch((reason: Error) => { if (!cancelled) { setData(null); setError(reason.message); } }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [canView, hotelId, query, refresh, validRange]);

  function selectPreset(value: string, selectedHotel = hotelId) {
    setPreset(value);
    const hotel = hotels.find((item) => item.id === selectedHotel); if (!hotel) return;
    const today = dateInZone(hotel.timezoneName ?? 'UTC');
    const nextFrom = value === 'yesterday' ? shiftDate(today, -1) : value === 'last7' ? shiftDate(today, -6) : value === 'month' ? `${today.slice(0, 7)}-01` : today;
    const nextTo = value === 'yesterday' ? shiftDate(today, -1) : today;
    if (from !== nextFrom || to !== nextTo || hotelId !== selectedHotel) { setData(null); setLoading(true); }
    setFrom(nextFrom); setTo(nextTo);
  }

  const k = data?.kpis;
  const op = data?.operations;
  const daily = data?.daily ?? [];
  const maximum = Math.max(1, ...daily.map((day) => Number(day[metric])));
  const magnitude = 10 ** Math.floor(Math.log10(maximum));
  const chartMax = metric === 'occupancy' ? 100 : (Math.floor(maximum / magnitude) + 1) * magnitude;
  const kpi = (key: string) => k?.[key] ?? '—';
  const period = from === to ? dateLabel(from) : `${dateLabel(from)} – ${dateLabel(to)}`;
  const financials = [['incidentalRevenue', 'Incidental revenue'], ['grossRevenue', 'Gross revenue'], ['operatingExpenses', 'Approved + paid expenses'], ['operatingContribution', 'Operating contribution'], ['paymentsReceived', 'Payments received']] as const;
  const workspaceLink = (href: string, feature: string, label: string) => canOpen(href, feature) ? <Link className="dashTextLink" href={`${href}?hotelId=${encodeURIComponent(hotelId)}`}>{label}<ArrowRight size={14} aria-hidden="true" /></Link> : null;
  function retry() { if (hotels.length) setRefresh((value) => value + 1); else setHotelRetry((value) => value + 1); }

  if (!canView) return <section className="managementDashboard"><h1>Dashboard</h1><p className="hint">Management dashboard access is limited to management roles.</p></section>;

  return <section className="managementDashboard rainwoodDashboard" aria-label="Hotel management dashboard">
    <header className="dashHeading"><div><h1>Property overview</h1><p>Your rooms, revenue and operations at a glance.</p></div><div className="dashFreshness"><span role="status">{loading ? 'Updating dashboard…' : updatedAt ? `Updated ${updatedAt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}` : 'Hotel-local time'}</span><button className="dashIconButton" type="button" aria-label="Refresh dashboard" disabled={loading || !validRange} onClick={retry}><RefreshCw size={16} aria-hidden="true" /></button></div></header>
    <div className="dashFilters"><label className="dashHotelLabel"><span>Property</span><select aria-label="Dashboard hotel" value={hotelId} disabled={!hotels.length} onChange={(event) => { const value = event.target.value; setHotelId(value); selectPreset(preset === 'custom' ? 'today' : preset, value); setData(null); }}>{!hotels.length && <option value="">{loading ? 'Loading properties…' : 'No properties available'}</option>}{hotels.map((hotel) => <option key={hotel.id} value={hotel.id}>{hotel.name}</option>)}</select></label><div className="dashPeriodControls"><div className="dashPresets" role="group" aria-label="Reporting period">{presets.map(([value, label]) => <button type="button" key={value} aria-pressed={preset === value} onClick={() => selectPreset(value)}>{label}</button>)}</div><button type="button" className="dashDateButton" aria-expanded={showDates} aria-controls="dashboard-dates" onClick={() => setShowDates(!showDates)}><CalendarDays size={15} aria-hidden="true" />{period}<ChevronDown size={14} aria-hidden="true" /></button></div></div>
    {showDates && <div className="dashCustomDates" id="dashboard-dates"><label>From date<input type="date" value={from} max={to || undefined} onChange={(event) => { setFrom(event.target.value); setPreset('custom'); setData(null); setLoading(true); }} /></label><label>To date<input type="date" value={to} min={from || undefined} onChange={(event) => { setTo(event.target.value); setPreset('custom'); setData(null); setLoading(true); }} /></label><span>Dates follow the property’s local time.</span></div>}
    {(!from || !to || !validRange) && hotelId && <p className="dashError" role="alert">Choose a start date and an end date on or after it.</p>}
    {error && <div className="dashError" role="alert"><div><strong>Dashboard couldn’t load</strong><p>{error}</p></div><button type="button" className="dashDateButton" onClick={retry}>Try again</button></div>}
    {!loading && !error && !hotels.length && <div className="dashEmpty">No hotels are assigned to this account. Contact your administrator to get started.</div>}
    {!error && (loading || data) && <div className="dashData" aria-busy={loading}>
      <section className="dashKpiStrip" aria-label="Period performance">{[
        ['Room revenue', money(k?.roomRevenue), 'Room nights in the selected period'],
        ['Occupancy', k ? `${Number(k.occupancy).toFixed(1)}%` : '—', `${kpi('occupiedRoomNights')} of ${kpi('sellableRoomNights')} sellable room nights`],
        ['Average daily rate', money(k?.adr), 'Per occupied room night'],
        ['RevPAR', money(k?.revpar), 'Revenue per sellable room night'],
      ].map(([label, value, description], index) => <div key={label} className={index === 0 ? 'dashLeadKpi' : ''}><span>{label}</span><strong className={loading && !data ? 'dashSkeleton' : undefined}>{value}</strong><small>{description}</small></div>)}</section>
      <section className="dashMovement" aria-label="Guest movement">{[
        { label: 'Arrivals', value: kpi('arrivals'), note: 'During the period', href: '/admin/arrivals', feature: 'arrivals' },
        { label: 'Departures', value: kpi('departures'), note: 'During the period', href: '/admin/front-desk', feature: 'frontDesk' },
        { label: 'In house', value: kpi('inHouse'), note: 'At period end', href: '/admin/in-house', feature: 'inHouse' },
        { label: 'Available rooms', value: op?.roomsAvailable ?? '—', note: 'At period end', href: '/admin/rooms-inventory', feature: 'roomsInventory' },
      ].map((item) => { const content = <><div><span>{item.label}</span><small>{item.note}</small></div><strong>{item.value}</strong>{canOpen(item.href, item.feature) && <ArrowRight size={15} aria-hidden="true" />}</>; return canOpen(item.href, item.feature) ? <Link href={dashboardDrilldownHref(item.href, hotelId, from, to)} key={item.label}>{content}</Link> : <div key={item.label}>{content}</div>; })}</section>
      <div className="dashMainGrid"><section className="dashPanel dashTrendPanel"><div className="dashPanelHeading"><h2>Performance trend</h2><div className="dashChartTabs" role="group" aria-label="Chart metric"><button type="button" aria-pressed={metric === 'roomRevenue'} onClick={() => setMetric('roomRevenue')}>Revenue</button><button type="button" aria-pressed={metric === 'occupancy'} onClick={() => setMetric('occupancy')}>Occupancy</button></div></div><div className="dashChart" aria-label={metric === 'roomRevenue' ? 'Daily room revenue' : 'Daily occupancy'}><div className="dashChartScale" aria-hidden="true">{[1, .5, 0].map((ratio) => <span key={ratio}>{metric === 'occupancy' ? `${chartMax * ratio}%` : `₹${(chartMax * ratio).toLocaleString('en-IN', { notation: 'compact', maximumFractionDigits: 1 })}`}</span>)}</div><div className="dashPlot"><div className="dashChartGrid" aria-hidden="true"><i /><i /><i /></div><div className="dashBars">{daily.map((day, index) => <div className="dashBarColumn" key={day.date} tabIndex={0} aria-label={`${dateLabel(day.date)}: ${metric === 'occupancy' ? `${day.occupancy}%` : money(day.roomRevenue)}`}><div className="dashBarArea"><span className="dashBar" style={{ height: `${Math.max(0, Math.min(100, Number(day[metric]) / chartMax * 100))}%` }} /><span className="dashBarTooltip">{dateLabel(day.date)} · {metric === 'occupancy' ? `${day.occupancy}%` : money(day.roomRevenue)}</span></div><small>{daily.length <= 7 || index % Math.ceil(daily.length / 7) === 0 ? dateLabel(day.date) : ''}</small></div>)}</div>{!daily.length && <p className="dashChartEmpty">{loading ? 'Loading performance…' : 'No room-night activity in this period.'}</p>}</div></div><div className="dashChartCaption"><span>{metric === 'roomRevenue' ? 'Room revenue' : 'Occupancy'} · {period}</span><span>{data?.period.days ?? '—'} {data?.period.days === 1 ? 'day' : 'days'}{daily.some((day) => day.legacyOccupancySemantics) ? ' · Includes legacy occupancy' : ''}</span></div></section>
      <section className="dashPanel dashRoomPanel"><div className="dashPanelHeading"><h2>Room readiness</h2>{workspaceLink('/admin/housekeeping', 'housekeeping', 'Housekeeping')}</div><p className="dashPanelNote">Operational snapshot at period end</p><dl className="dashReadiness">{[['Dirty rooms', op?.dirtyRooms, '/admin/housekeeping', 'housekeeping'], ['Being cleaned', op?.cleaningRooms, '/admin/housekeeping', 'housekeeping'], ['Out of order', op?.outOfOrderRooms, '/admin/maintenance', 'maintenance'], ['Open maintenance tickets', op?.openMaintenanceTickets, '/admin/maintenance', 'maintenance']].map(([label, value, href, feature]) => <div key={String(label)}><dt>{canOpen(String(href), String(feature)) ? <Link href={`${href}?hotelId=${encodeURIComponent(hotelId)}`}>{label}<ArrowRight size={13} aria-hidden="true" /></Link> : label}</dt><dd>{value ?? '—'}</dd></div>)}</dl><div className="dashOutstanding"><span>Outstanding balance</span><strong>{money(k?.outstandingBalance)}</strong></div></section></div>
      <section className="dashFinancials" aria-label="Revenue and collections">{financials.map(([key, label]) => <div key={key}><span>{label}</span><strong>{money(k?.[key])}</strong></div>)}</section>
      <div className="dashTables"><section className="dashPanel"><div className="dashPanelHeading"><h2>Booking sources</h2><span className="dashPanelNote">{data?.sources.length ?? 0} channels</span></div><div className="dashTableScroll" tabIndex={0} role="region" aria-label="Booking source performance"><table><thead><tr><th scope="col">Source</th><th scope="col">Bookings</th><th scope="col">Nights</th><th scope="col">Room revenue</th></tr></thead><tbody>{data?.sources.map((row) => <tr key={row.source}><td>{sourceLabel(row.source)}</td><td>{row.reservations}</td><td>{row.roomNights}</td><td>{money(row.roomRevenue)}</td></tr>)}{!data?.sources.length && <tr><td colSpan={4} className="dashEmpty">{loading ? 'Loading booking sources…' : 'No bookings contributed room nights in this period.'}</td></tr>}</tbody></table></div><p className="dashTableNote">{data?.sourceReservationSemantics === 'MIXED_UNIQUE_AND_LEGACY_DAILY_RESERVATIONS' ? 'Includes legacy daily reservation counts.' : 'Unique bookings contributing room nights in this period.'}</p></section>
      <section className="dashPanel"><div className="dashPanelHeading"><h2>Room categories</h2><span className="dashPanelNote">Revenue by room type</span></div><div className="dashTableScroll" tabIndex={0} role="region" aria-label="Room type performance"><table><thead><tr><th scope="col">Room type</th><th scope="col">Nights</th><th scope="col">Revenue</th><th scope="col"><abbr title="Average daily rate">ADR</abbr></th></tr></thead><tbody>{data?.roomTypes.map((row) => <tr key={row.roomTypeId}><td>{row.roomType}</td><td>{row.roomNights}</td><td>{money(row.roomRevenue)}</td><td>{money(row.adr)}</td></tr>)}{!data?.roomTypes.length && <tr><td colSpan={4} className="dashEmpty">{loading ? 'Loading room categories…' : 'No room-category activity in this period.'}</td></tr>}</tbody></table></div><p className="dashTableNote">Average daily rate is based on occupied room nights.</p></section></div>
      <footer className="dashFooter"><span>{data?.period.hotel.name ?? 'Loading property'} · {data?.period.hotel.timezoneName ?? 'Property local time'}</span><details><summary>How these figures are calculated</summary><p>Occupancy = occupied room nights ÷ sellable room nights. ADR = room revenue ÷ occupied room nights. RevPAR = room revenue ÷ sellable room nights. Historical inventory uses Night Audit close-time snapshots. Operational counts show the period-end state and are not summed across days.</p></details></footer>
    </div>}
  </section>;
}
