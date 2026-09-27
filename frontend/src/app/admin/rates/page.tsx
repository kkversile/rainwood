'use client';

import { useEffect, useMemo, useState } from 'react';
import { AdminLayout } from '../../../components/Shell';
import { apiRequest } from '../../../lib/api';

type Hotel = { id: string; name: string };
type Rate = { date: string; amount: number | string; baseAmount?: number | string | null; overrideAmount?: number | string | null; effectiveAmount?: number | string | null; cta: boolean; ctd: boolean; minLos: number; maxLos?: number | null };
type Plan = { id: string; code: string; name: string; rates: Rate[] };
type Room = { id: string; name: string; ratePlans: Plan[] };
type Catalog = { rooms: Room[] };
type Change = { ratePlan: string; roomType: string; date: string; before: { effectiveAmount?: number | string | null } | null; after: { effectiveAmount?: number | string | null; amount?: number | string | null; cta: boolean; ctd: boolean; minLos: number; maxLos?: number | null } };

function dates(from: string, to: string) {
  if (!from || !to || from > to) return [] as string[];
  const result: string[] = [];
  const cursor = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (cursor <= end && result.length < 367) { result.push(cursor.toISOString().slice(0, 10)); cursor.setUTCDate(cursor.getUTCDate() + 1); }
  return result;
}

function money(value: unknown) { return value == null ? '—' : `INR ${Number(value).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`; }

export default function RatesPage() {
  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [hotelId, setHotelId] = useState('');
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [selectedRoomIds, setSelectedRoomIds] = useState<string[]>([]);
  const [selectedPlanIds, setSelectedPlanIds] = useState<string[]>([]);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);
  const [action, setAction] = useState('SET_RATE');
  const [value, setValue] = useState('');
  const [preview, setPreview] = useState<Change[]>([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const range = useMemo(() => dates(fromDate, toDate), [fromDate, toDate]);

  useEffect(() => { apiRequest<Hotel[]>('/hotels').then((items) => { setHotels(items); if (!hotelId && items[0]) setHotelId(items[0].id); }).catch((reason) => setError(reason instanceof Error ? reason.message : 'Could not load hotels')); }, []);
  useEffect(() => { if (!hotelId) return; const query = fromDate && toDate ? `?startDate=${fromDate}&endDate=${toDate}` : ''; apiRequest<Catalog>(`/hotels/${hotelId}/catalog${query}`).then(setCatalog).catch((reason) => setError(reason instanceof Error ? reason.message : 'Could not load rates')); }, [hotelId, fromDate, toDate]);

  const rateRows = (catalog?.rooms ?? []).flatMap((room) => room.ratePlans.map((plan) => ({ room, plan })));
  const payload = { fromDate, toDate, daysOfWeek, action, ...(selectedRoomIds.length ? { roomTypeIds: selectedRoomIds } : {}), ...(selectedPlanIds.length ? { ratePlanIds: selectedPlanIds } : {}), ...(value.trim() ? { value: Number(value) } : {}) };
  function toggleDay(day: number) { setDaysOfWeek((current) => current.includes(day) ? current.filter((item) => item !== day) : [...current, day].sort()); }
  async function run(commit: boolean) {
    setBusy(true); setError(''); setMessage('');
    try {
      if (!hotelId || !fromDate || !toDate || !range.length) throw new Error('Select a hotel and valid date range first.');
      const result = await apiRequest<{ changes: Change[]; affected: number }>(`/hotels/${hotelId}/rates/bulk${commit ? '' : '/preview'}`, { method: 'POST', body: JSON.stringify(payload) });
      setPreview(result.changes); setMessage(commit ? `Updated ${result.affected} rate day(s).` : `Preview: ${result.affected} rate day(s) will change.`);
      if (commit) { const query = `?startDate=${fromDate}&endDate=${toDate}`; setCatalog(await apiRequest<Catalog>(`/hotels/${hotelId}/catalog${query}`)); }
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not update rates'); } finally { setBusy(false); }
  }
  return <AdminLayout title="Rates"><section className="pageSection"><header className="pageTitle"><div><span>Commercial controls</span><h1>Rate Calendar</h1><p>Review base, override, and effective rates before applying a bulk change.</p></div></header>
    {error && <p className="error" role="alert">{error}</p>}{message && <p className="notice" role="status">{message}</p>}
    <section className="panel"><div className="rangeToolbar"><label>Hotel<select value={hotelId} onChange={(event) => setHotelId(event.target.value)}><option value="">Select hotel</option>{hotels.map((hotel) => <option key={hotel.id} value={hotel.id}>{hotel.name}</option>)}</select></label><label>From date<input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} /></label><label>To date<input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} /></label><label>Room Types<select multiple value={selectedRoomIds} onChange={(event) => setSelectedRoomIds(Array.from(event.target.selectedOptions, (option) => option.value))}>{(catalog?.rooms ?? []).map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}</select><small>Leave empty for all room types.</small></label><label>Rate Plans<select multiple value={selectedPlanIds} onChange={(event) => setSelectedPlanIds(Array.from(event.target.selectedOptions, (option) => option.value))}>{rateRows.map(({ plan }) => <option key={plan.id} value={plan.id}>{plan.code} · {plan.name}</option>)}</select><small>Leave empty for all plans.</small></label></div><div className="checkRow">{[['Sun', 0], ['Mon', 1], ['Tue', 2], ['Wed', 3], ['Thu', 4], ['Fri', 5], ['Sat', 6]].map(([label, day]) => <label key={String(day)}><input type="checkbox" checked={daysOfWeek.includes(Number(day))} onChange={() => toggleDay(Number(day))} /> {label}</label>)}</div><div className="rangeToolbar"><label>Bulk action<select value={action} onChange={(event) => setAction(event.target.value)}><option value="SET_RATE">Set base rate</option><option value="INCREASE_PERCENT">Increase effective rate %</option><option value="DECREASE_PERCENT">Decrease effective rate %</option><option value="SET_MLOS">Set MLOS</option><option value="SET_MAXLOS">Set MAXLOS</option><option value="CLOSE_ARRIVAL">Close arrival (CTA)</option><option value="CLOSE_DEPARTURE">Close departure (CTD)</option><option value="REMOVE_OVERRIDE">Remove override</option></select></label>{!['CLOSE_ARRIVAL', 'CLOSE_DEPARTURE', 'REMOVE_OVERRIDE'].includes(action) && <label>Value<input type="number" min="0" step="0.01" value={value} onChange={(event) => setValue(event.target.value)} placeholder="Required" /></label>}<div className="listActions"><button className="smallBtn" type="button" disabled={busy} onClick={() => void run(false)}>Preview changes</button><button className="btn" type="button" disabled={busy || !preview.length} onClick={() => void run(true)}>Apply preview</button></div></div></section>
    <section className="panel"><div className="rangeSectionHeader"><div><h2>Rate calendar</h2><p className="mutedText">{range.length ? `${range.length} date(s) selected` : 'Select a date range to display rates.'}</p></div></div>{range.length && rateRows.length ? <div className="tableScroll"><table className="calendarTable"><thead><tr><th>Room Type</th><th>Rate Plan</th>{range.map((date) => <th key={date}>{date}</th>)}</tr></thead><tbody>{rateRows.map(({ room, plan }) => <tr key={plan.id}><th>{room.name}</th><td>{plan.code} · {plan.name}</td>{range.map((date) => { const rate = plan.rates.find((item) => item.date.slice(0, 10) === date); return <td key={date}><div>Base {money(rate?.baseAmount ?? rate?.amount)}</div><div>Override {money(rate?.overrideAmount)}</div><strong>Effective {money(rate?.effectiveAmount ?? rate?.amount)}</strong><small>{rate?.cta ? 'CTA closed · ' : ''}{rate?.ctd ? 'CTD closed · ' : ''}LOS {rate?.minLos ?? 1}–{rate?.maxLos ?? '∞'}</small></td>; })}</tr>)}</tbody></table></div> : <p className="empty">No rates match the selected range.</p>}</section>
    {preview.length > 0 && <section className="panel"><h2>Bulk update preview</h2><p className="mutedText">Reviewing {preview.length} affected day(s). Only the first 500 are shown.</p><div className="tableScroll"><table className="dataTable"><thead><tr><th>Date</th><th>Room Type</th><th>Rate Plan</th><th>Before effective</th><th>After effective</th><th>Restrictions</th></tr></thead><tbody>{preview.slice(0, 100).map((change, index) => <tr key={`${change.ratePlan}-${change.date}-${index}`}><td>{change.date}</td><td>{change.roomType}</td><td>{change.ratePlan}</td><td>{money(change.before?.effectiveAmount)}</td><td>{money(change.after.effectiveAmount ?? change.after.amount)}</td><td>{change.after.cta ? 'CTA closed ' : ''}{change.after.ctd ? 'CTD closed ' : ''}LOS {change.after.minLos}–{change.after.maxLos ?? '∞'}</td></tr>)}</tbody></table></div></section>}
  </section></AdminLayout>;
}
