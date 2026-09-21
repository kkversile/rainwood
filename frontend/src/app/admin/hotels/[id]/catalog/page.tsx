'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { AdminLayout } from '../../../../../components/Shell';
import { apiRequest } from '../../../../../lib/api';
import { RainwoodDatePicker } from '../../../../../components/RainwoodDatePicker';

type OccupancyKey = 'single' | 'double' | 'triple' | 'quad';
type RestrictionMode = 'unchanged' | 'open' | 'closed';
type Rate = {
  id: string;
  date: string;
  amount: string | number;
  taxAmount: string | number;
  childAmount?: string | number;
  extraAdultAmount?: string | number;
  occupancyPrices?: Record<string, number> | null;
  cta: boolean;
  ctd: boolean;
};
type Plan = { id: string; code: string; name: string; mealPlan: string; active: boolean; rates: Rate[] };
type Inventory = { id: string; date: string; available: number; held: number; sold: number; stopSell: boolean };
type Room = { id: string; code: string; name: string; description?: string | null; maxOccupancy: number; active: boolean; ratePlans: Plan[]; inventory: Inventory[] };
type Catalog = { id: string; name: string; rooms: Room[] };
type HotelOption = { id: string; name: string; code?: string | null; city?: string | null; state?: string | null };

const occupancyFields: { key: OccupancyKey; label: string }[] = [
  { key: 'single', label: 'Single' },
  { key: 'double', label: 'Double' },
  { key: 'triple', label: 'Triple' },
  { key: 'quad', label: 'Quad' },
];

const rateCalendarRows: { key: string; label: string }[] = [
  { key: 'single', label: 'Single' },
  { key: 'double', label: 'Double' },
  { key: 'triple', label: 'Triple' },
  { key: 'quad', label: 'Quad' },
  { key: 'childAmount', label: 'Child' },
  { key: 'extraAdultAmount', label: 'Extra Adult' },
];

function dateKeys(start: string, end: string) {
  if (!start || !end || start > end) return [] as string[];
  const dates: string[] = [];
  const cursor = new Date(`${start}T00:00:00.000Z`);
  const last = new Date(`${end}T00:00:00.000Z`);
  while (cursor <= last && dates.length < 366) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

function optionalNumber(value: string) {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function dateLabel(date: string) {
  return new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(`${date}T00:00:00.000Z`));
}

function money(value: unknown) {
  if (value === null || value === undefined || value === '') return '—';
  return `INR ${Number(value).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

export default function CatalogPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const hotelId = params.id;
  const requestedRoomTypeId = searchParams.get('roomTypeId') ?? '';
  const requestedRatePlanId = searchParams.get('ratePlanId') ?? '';
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [hotels, setHotels] = useState<HotelOption[]>([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [selectedRoomId, setSelectedRoomId] = useState('');
  const [selectedRatePlanId, setSelectedRatePlanId] = useState('');
  const [rateStart, setRateStart] = useState('');
  const [rateEnd, setRateEnd] = useState('');
  const [baseAmount, setBaseAmount] = useState('');
  const [taxAmount, setTaxAmount] = useState('');
  const [childAmount, setChildAmount] = useState('');
  const [extraAdultAmount, setExtraAdultAmount] = useState('');
  const [occupancy, setOccupancy] = useState<Record<OccupancyKey, string>>({ single: '', double: '', triple: '', quad: '' });
  const [minLos, setMinLos] = useState('');
  const [maxLos, setMaxLos] = useState('');
  const [clearMaxLos, setClearMaxLos] = useState(false);
  const [clearOccupancy, setClearOccupancy] = useState(false);
  const [cta, setCta] = useState<RestrictionMode>('unchanged');
  const [ctd, setCtd] = useState<RestrictionMode>('unchanged');
  const [showRestrictions, setShowRestrictions] = useState(false);
  const [availabilityRoomId, setAvailabilityRoomId] = useState('');
  const [availabilityStart, setAvailabilityStart] = useState('');
  const [availabilityEnd, setAvailabilityEnd] = useState('');
  const [freeRooms, setFreeRooms] = useState(0);
  const [stopSell, setStopSell] = useState<RestrictionMode>('unchanged');
  const [viewedRateRange, setViewedRateRange] = useState<{ start: string; end: string } | null>(null);

  async function load(startDate?: string, endDate?: string) {
    try {
      const query = startDate && endDate ? `?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}` : '';
      setCatalog(await apiRequest<Catalog>(`/hotels/${hotelId}/catalog${query}`));
      setError('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not load pricebook');
    }
  }

  useEffect(() => {
    let cancelled = false;
    apiRequest<HotelOption[]>('/hotels').then((items) => { if (!cancelled) setHotels(items); }).catch((reason) => { if (!cancelled) setError(reason instanceof Error ? reason.message : 'Could not load hotels'); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    setCatalog(null);
    setSelectedRoomId('');
    setSelectedRatePlanId('');
    setAvailabilityRoomId('');
    setRateStart('');
    setRateEnd('');
    setAvailabilityStart('');
    setAvailabilityEnd('');
    setBaseAmount('');
    setTaxAmount('');
    setChildAmount('');
    setExtraAdultAmount('');
    setOccupancy({ single: '', double: '', triple: '', quad: '' });
    setViewedRateRange(null);
  }, [hotelId]);

  useEffect(() => { void load(); }, [hotelId]);

  function handleHotelChange(nextHotelId: string) {
    if (!nextHotelId || nextHotelId === hotelId) return;
    router.push(`/admin/hotels/${encodeURIComponent(nextHotelId)}/catalog`);
  }

  const rooms = catalog?.rooms ?? [];
  const hotelOptions = hotels.some((hotel) => hotel.id === hotelId)
    ? hotels
    : catalog
      ? [{ id: hotelId, name: catalog.name }, ...hotels]
      : hotels;
  const selectedRoom = rooms.find((room) => room.id === selectedRoomId) ?? rooms[0];
  const selectedPlans = selectedRoom?.ratePlans ?? [];
  const selectedPlan = selectedPlans.find((plan) => plan.id === selectedRatePlanId) ?? selectedPlans[0];
  const availabilityRoom = rooms.find((room) => room.id === availabilityRoomId) ?? rooms[0];
  const rateDates = dateKeys(rateStart, rateEnd);
  const availabilityDates = dateKeys(availabilityStart, availabilityEnd);

  useEffect(() => {
    if (!selectedRoomId && rooms.length) setSelectedRoomId(requestedRoomTypeId && rooms.some((room) => room.id === requestedRoomTypeId) ? requestedRoomTypeId : rooms[0].id);
    if (!availabilityRoomId && rooms.length) setAvailabilityRoomId(requestedRoomTypeId && rooms.some((room) => room.id === requestedRoomTypeId) ? requestedRoomTypeId : rooms[0].id);
  }, [rooms, selectedRoomId, availabilityRoomId, requestedRoomTypeId]);

  useEffect(() => {
    if (selectedRoom && !selectedPlans.some((plan) => plan.id === selectedRatePlanId)) setSelectedRatePlanId(requestedRatePlanId && selectedPlans.some((plan) => plan.id === requestedRatePlanId) ? requestedRatePlanId : selectedPlans[0]?.id ?? '');
  }, [selectedRoom, selectedPlans, selectedRatePlanId, requestedRatePlanId]);

  useEffect(() => {
    if (rateStart && rateEnd && rateStart <= rateEnd) {
      setViewedRateRange({ start: rateStart, end: rateEnd });
      void load(rateStart, rateEnd);
    }
  }, [rateStart, rateEnd, selectedRoomId, selectedRatePlanId]);

  async function save(path: string, body: unknown, refreshStart?: string, refreshEnd?: string) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await apiRequest(path, { method: 'POST', body: JSON.stringify(body) });
      await load(refreshStart, refreshEnd);
      setMessage('Updated successfully.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save changes');
    } finally {
      setBusy(false);
    }
  }

  function updateRates() {
    if (!selectedRoom || !selectedPlan || !rateDates.length) { setError('Select a room, rate plan, and valid rate date range.'); return; }
    const base = optionalNumber(baseAmount);
    if (base === undefined) { setError('Enter a default/base rate before updating.'); return; }
    const occupancyPrices = Object.fromEntries(Object.entries(occupancy).filter(([, value]) => value.trim() !== '').map(([key, value]) => [key, Number(value)]));
    void save(`/hotels/rate-plans/${selectedPlan.id}/rates`, { days: rateDates.map((date) => ({ date, amount: base, ...(optionalNumber(taxAmount) !== undefined ? { taxAmount: optionalNumber(taxAmount) } : {}), ...(optionalNumber(childAmount) !== undefined ? { childAmount: optionalNumber(childAmount) } : {}), ...(optionalNumber(extraAdultAmount) !== undefined ? { extraAdultAmount: optionalNumber(extraAdultAmount) } : {}), ...(clearOccupancy ? { occupancyPrices: null } : Object.keys(occupancyPrices).length ? { occupancyPrices } : {}), ...(cta !== 'unchanged' ? { cta: cta === 'closed' } : {}), ...(ctd !== 'unchanged' ? { ctd: ctd === 'closed' } : {}), ...(clearMaxLos ? { maxLos: null } : optionalNumber(maxLos) !== undefined ? { maxLos: optionalNumber(maxLos) } : {}), ...(optionalNumber(minLos) !== undefined ? { minLos: optionalNumber(minLos) } : {}) })) }, rateStart, rateEnd);
  }

  function updateAvailability() {
    if (!availabilityRoom || !availabilityDates.length) { setError('Select an availability room and valid availability dates.'); return; }
    void save(`/hotels/rooms/${availabilityRoom.id}/inventory`, { days: availabilityDates.map((date) => ({ date, available: Number(freeRooms), ...(stopSell === 'closed' ? { stopSell: true } : stopSell === 'open' ? { stopSell: false } : {}) })) }, undefined, undefined);
  }


  const roomsHref = `/admin/rooms-inventory?hotelId=${encodeURIComponent(hotelId)}`;
  const plansHref = `/admin/rate-plans?hotelId=${encodeURIComponent(hotelId)}${selectedRoom ? `&roomTypeId=${encodeURIComponent(selectedRoom.id)}` : ''}`;
  const rateFor = (date: string) => selectedPlan?.rates.find((rate) => rate.date.slice(0, 10) === date);
  const availabilityFor = (date: string) => availabilityRoom?.inventory.find((row) => row.date.slice(0, 10) === date);
  const draftValue = (key: string) => {
    const value = occupancyFields.some((field) => field.key === key)
      ? occupancy[key as OccupancyKey]
      : key === 'childAmount'
        ? childAmount
        : key === 'extraAdultAmount'
          ? extraAdultAmount
          : '';
    return value.trim() === '' ? undefined : Number(value);
  };

  const calendarValue = (rate: Rate | undefined, key: string) => {
    const draft = draftValue(key);
    if (draft !== undefined) return draft;
    if (!rate) return undefined;
    if (occupancyFields.some((field) => field.key === key)) return rate.occupancyPrices?.[key];
    if (key === 'childAmount') return rate.childAmount;
    if (key === 'extraAdultAmount') return rate.extraAdultAmount;
    return undefined;
  };

  return <AdminLayout title="Pricebook"><section className="rateCalendarPage">
    <p className="breadcrumb"><Link href={roomsHref}>Rooms &amp; Inventory</Link> <span>›</span> <span>{selectedRoom?.name ?? 'Room'}</span> <span>›</span> <b>Pricebook</b></p>
    <header className="catalogHeader"><div><span>Room-level pricing and availability</span><h1>Pricebook</h1><p>{catalog?.name ?? 'Hotel'} · {selectedRoom ? `${selectedRoom.name} (${selectedRoom.code})` : 'Select a room'} · {selectedPlan ? `${selectedPlan.name} · ${selectedPlan.mealPlan}` : 'Select an assigned rate plan'}</p></div><div className="catalogHeaderActions"><Link className="smallBtn" href={roomsHref}>Manage Rooms</Link><Link className="smallBtn" href={`/admin/base-rate-import?hotelId=${encodeURIComponent(hotelId)}`}>Download Rate Template</Link><Link className="btn" href={`/admin/base-rate-import?hotelId=${encodeURIComponent(hotelId)}`}>Import Base Rates</Link><Link className="btn" href={plansHref}>Manage Rate Plans</Link></div></header>
    {error && <p className="error" role="alert">{error}</p>}{message && <p className="notice" role="status">{message}</p>}

    <section className="panel priceBookFilters"><div className="rangeSectionHeader"><div><h2>PRICEBOOK</h2><p className="mutedText">Select a hotel, room type, and assigned rate plan.</p></div></div><div className="rangeToolbar"><label>Hotel<select aria-label="Hotel" value={hotelId} onChange={(event) => handleHotelChange(event.target.value)} disabled={!hotelOptions.length}><option value="">Select hotel</option>{hotelOptions.map((hotel) => <option key={hotel.id} value={hotel.id}>{hotel.name}{hotel.code ? ` (${hotel.code})` : ''}{hotel.city ? ` · ${hotel.city}` : ''}</option>)}</select></label><label>Room Type<select value={selectedRoomId} onChange={(event) => { setSelectedRoomId(event.target.value); setSelectedRatePlanId(''); }}><option value="">Select room type</option>{rooms.map((room) => <option key={room.id} value={room.id}>{room.name} ({room.code})</option>)}</select></label><label>Rate Plan<select value={selectedRatePlanId} onChange={(event) => setSelectedRatePlanId(event.target.value)}><option value="">Select rate plan</option>{selectedPlans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name} · {plan.mealPlan}</option>)}</select></label></div></section>

    <section className="panel rangeEditor"><div className="rangeSectionHeader rateDetailsHeader"><div><h2>Room Rate Details</h2><p className="mutedText">{selectedRoom?.name ?? 'Select a room type'} · {selectedPlan ? `${selectedPlan.name} · ${selectedPlan.mealPlan}` : 'Select a rate plan'}</p></div><div className="dateUpdateBar"><RainwoodDatePicker label="Start Date" value={rateStart} onChange={(next) => setRateStart(next)} /><RainwoodDatePicker label="End Date" value={rateEnd} minDate={rateStart} onChange={(next) => setRateEnd(next)} /><button type="button" className="btn" disabled={busy || !rateDates.length || !selectedPlan} onClick={updateRates}>Update</button></div></div><div className="priceBookDetailGrid"><label>Default / Base Rate<small>Used when no occupancy-specific rate is configured.</small><input type="number" min="0" step="0.01" value={baseAmount} onChange={(event) => setBaseAmount(event.target.value)} placeholder="Enter base rate" /></label><label>Tax<input type="number" min="0" step="0.01" value={taxAmount} onChange={(event) => setTaxAmount(event.target.value)} placeholder="Optional" /></label></div><h3 className="subheading">Occupancy Rates</h3><div className="occupancyGrid">{occupancyFields.map((field) => <label key={field.key}>{field.label}<input type="number" min="0" step="0.01" value={occupancy[field.key]} onChange={(event) => setOccupancy((current) => ({ ...current, [field.key]: event.target.value }))} placeholder={`Enter ${field.label}`} /></label>)}</div><h3 className="subheading">Extra Guest Charges</h3><div className="two"><label>Child Charge<input type="number" min="0" step="0.01" value={childAmount} onChange={(event) => setChildAmount(event.target.value)} placeholder="Optional" /></label><label>Extra Adult Charge<input type="number" min="0" step="0.01" value={extraAdultAmount} onChange={(event) => setExtraAdultAmount(event.target.value)} placeholder="Optional" /></label></div><button type="button" className="linkToggle" onClick={() => setShowRestrictions((current) => !current)}>{showRestrictions ? '▾' : '▸'} Stay Restrictions</button>{showRestrictions && <div className="restrictionGrid"><label>Minimum LOS<input type="number" min="1" value={minLos} onChange={(event) => setMinLos(event.target.value)} placeholder="Leave unchanged" /></label><label>Maximum LOS<input type="number" min="1" value={maxLos} onChange={(event) => setMaxLos(event.target.value)} placeholder="Leave unchanged" /></label><label>Arrival (CTA)<select value={cta} onChange={(event) => setCta(event.target.value as RestrictionMode)}><option value="unchanged">Leave unchanged</option><option value="open">Open</option><option value="closed">Closed</option></select></label><label>Departure (CTD)<select value={ctd} onChange={(event) => setCtd(event.target.value as RestrictionMode)}><option value="unchanged">Leave unchanged</option><option value="open">Open</option><option value="closed">Closed</option></select></label><label className="checkLabel"><input type="checkbox" checked={clearMaxLos} onChange={(event) => setClearMaxLos(event.target.checked)} /> Clear saved Max LOS</label><label className="checkLabel"><input type="checkbox" checked={clearOccupancy} onChange={(event) => setClearOccupancy(event.target.checked)} /> Clear occupancy prices</label></div>}</section>

    <section className="panel rangePreview"><div className="rangeSectionHeader"><div><h2>Hotel Occupancy Details</h2><p className="mutedText">{viewedRateRange ? `Selected range: ${viewedRateRange.start} to ${viewedRateRange.end}` : 'Select a date range to preview saved prices.'}</p></div></div>{rateDates.length ? <div className="tableScroll"><table className="calendarTable rateCalendarTable"><thead><tr><th>Room Type</th><th>Rate Plan</th><th>Occupancy Type</th>{rateDates.map((date) => <th key={date}>{dateLabel(date)}</th>)}</tr></thead><tbody>{rateCalendarRows.map((row) => <tr key={row.key}><th>{selectedRoom?.name ?? '—'}</th><td>{selectedPlan ? `${selectedPlan.code} · ${selectedPlan.name}` : '—'}</td><th>{row.label}</th>{rateDates.map((date) => <td key={`${row.key}-${date}`}>{money(calendarValue(rateFor(date), row.key))}</td>)}</tr>)}</tbody></table></div> : <p className="empty">Select a rate date range to display the horizontal occupancy calendar.</p>}</section>

    <section className="panel rangeSubcard"><div className="rangeSectionHeader availabilityHeader"><div><h2>Room Availability</h2><p className="mutedText">Availability is shared across all rate plans for the selected room type.</p></div><div className="dateUpdateBar"><RainwoodDatePicker label="Start Date" value={availabilityStart} onChange={(next) => setAvailabilityStart(next)} /><RainwoodDatePicker label="End Date" value={availabilityEnd} minDate={availabilityStart} onChange={(next) => setAvailabilityEnd(next)} /><button type="button" className="btn" disabled={busy || !availabilityDates.length || !availabilityRoom} onClick={updateAvailability}>Update</button></div></div><div className="availabilityToolbar"><label>Room Type<select value={availabilityRoomId} onChange={(event) => setAvailabilityRoomId(event.target.value)}><option value="">Select room type</option>{rooms.map((room) => <option key={room.id} value={room.id}>{room.name} ({room.code})</option>)}</select></label><label>Free Rooms<input type="number" min="0" value={freeRooms} onChange={(event) => setFreeRooms(Number(event.target.value))} placeholder="Enter free rooms" /></label><label>Stop Sell<select value={stopSell} onChange={(event) => setStopSell(event.target.value as RestrictionMode)}><option value="unchanged">Leave unchanged</option><option value="open">Open</option><option value="closed">Closed</option></select></label></div>{availabilityDates.length ? <div className="tableScroll"><table className="calendarTable availabilityCalendarTable"><thead><tr><th>Room Type</th>{availabilityDates.map((date) => <th key={date}>{dateLabel(date)}</th>)}</tr></thead><tbody><tr><th>{availabilityRoom?.name ?? '—'}</th>{availabilityDates.map((date) => { const row = availabilityFor(date); return <td key={date}><b>{row?.available ?? 0} rooms</b><small>Held: {row?.held ?? 0} · Sold: {row?.sold ?? 0}</small><small>Stop sell: {row?.stopSell ? 'Closed' : 'Open'}</small></td>; })}</tr></tbody></table></div> : <p className="empty">Select an availability room and date range to display the horizontal availability calendar.</p>}</section>
  </section></AdminLayout>;
}
