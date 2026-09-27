'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiRequest } from '../lib/api';

type Hotel = { id: string; name: string; timezoneName?: string };
type Issue = { code: string; message: string; details?: unknown };
type Audit = { businessDate: string; hotel: Hotel; summary: any; blockers: Issue[]; warnings: Issue[]; alreadyClosed: boolean; closed: { closedAt: string; closedBy: { id: string; name: string } | null } | null; snapshot: any };

function money(value: number | string) { return `INR ${Number(value ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }
function count(value: number | string) { return Number(value ?? 0).toLocaleString('en-IN'); }
function dateLabel(value: string | null | undefined) { return value ? new Date(value).toLocaleString('en-IN') : '—'; }

export function NightAuditBoard() {
  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [hotelId, setHotelId] = useState('');
  const [businessDate, setBusinessDate] = useState('');
  const [audit, setAudit] = useState<Audit | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showSnapshot, setShowSnapshot] = useState(false);

  async function loadHotels() {
    try {
      const rows = await apiRequest<Hotel[]>('/hotels');
      setHotels(rows);
      if (!hotelId && rows[0]) setHotelId(rows[0].id);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not load hotels.'); }
  }

  async function loadPreview() {
    if (!hotelId) return;
    setLoading(true); setError(''); setShowSnapshot(false);
    try {
      const params = new URLSearchParams({ hotelId });
      if (businessDate) params.set('date', businessDate);
      const body = await apiRequest<Audit>(`/night-audit/preview?${params}`);
      setAudit(body);
      if (!businessDate) setBusinessDate(body.businessDate);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not load the Night Audit preview.'); }
    finally { setLoading(false); }
  }

  useEffect(() => { void loadHotels(); }, []);
  useEffect(() => { if (hotelId) void loadPreview(); }, [hotelId, businessDate]);

  async function closeBusinessDay() {
    if (!audit || audit.blockers.length || audit.alreadyClosed) return;
    setBusy(true); setError('');
    try { setAudit(await apiRequest<Audit>('/night-audit/close', { method: 'POST', body: JSON.stringify({ hotelId, businessDate: audit.businessDate }) })); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not close the business day.'); }
    finally { setBusy(false); }
  }

  const selectedHotel = useMemo(() => hotels.find((hotel) => hotel.id === hotelId), [hotels, hotelId]);
  const summary = audit?.summary;
  return <section className="arrivalsPage nightAuditPage">
    <div className="formCard arrivalsFilters">
      <div className="arrivalsFilterHeader"><div><span className="eyebrow">Hotel Operations</span><h1>Night Audit</h1><p>Preview and close one hotel’s local business day without changing guest stays.</p></div><button className="btn" type="button" onClick={() => void loadPreview()} disabled={loading || !hotelId}>Refresh Preview</button></div>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="arrivalsFilterGrid"><label>Hotel<select value={hotelId} onChange={(event) => { setHotelId(event.target.value); setBusinessDate(''); }} disabled={!hotels.length}>{hotels.map((hotel) => <option key={hotel.id} value={hotel.id}>{hotel.name}</option>)}</select></label><label>Business Date<input type="date" value={businessDate} onChange={(event) => setBusinessDate(event.target.value)} /></label><div className="nightAuditTimezone">Hotel timezone<strong>{audit?.hotel.timezoneName ?? selectedHotel?.timezoneName ?? 'Hotel local time'}</strong></div></div>
    </div>
    {loading && <div className="panel loading" role="status">Loading Night Audit preview…</div>}
    {!loading && audit && <>
      <div className="nightAuditStatus panel"><div><span className="eyebrow">Business day</span><strong>{audit.businessDate}</strong></div>{audit.alreadyClosed ? <div className="nightAuditClosed"><b>CLOSED</b><span>Closed at {dateLabel(audit.closed?.closedAt)} · {audit.closed?.closedBy?.name ?? 'Unknown user'}</span></div> : <span className="status ok">OPEN</span>}</div>
      <div className="nightAuditCards"><article><span>Occupancy</span><strong>{summary.occupancy.occupancyPercent}%</strong><small>{count(summary.occupancy.occupiedRoomNights ?? summary.occupancy.occupiedRooms)} / {count(summary.occupancy.sellableRoomNights ?? summary.occupancy.sellableRooms)} room nights{summary.occupancy.occupiedRoomNights === undefined ? ' · legacy snapshot' : ''}</small></article><article><span>Arrivals</span><strong>{count(summary.stays.arrivals)}</strong><small>{count(summary.stays.checkedIn)} checked in</small></article><article><span>Departures</span><strong>{count(summary.stays.departures)}</strong><small>{count(summary.stays.checkedOut)} checked out</small></article><article><span>In House</span><strong>{count(summary.stays.inHouse)}</strong><small>{count(summary.balances.unsettledCheckoutCount)} unsettled checkouts</small></article><article><span>Room Revenue</span><strong>{money(summary.revenue.roomRevenue)}</strong><small>Selected night only</small></article><article><span>Incidentals</span><strong>{money(summary.revenue.incidentalRevenue)}</strong><small>Posted charges</small></article><article><span>Payments</span><strong>{money(summary.payments.total)}</strong><small>Verified receipts</small></article><article><span>Outstanding</span><strong>{money(summary.balances.outstandingGuestBalance)}</strong><small>Warning, not a blocker</small></article></div>
      <section className="panel nightAuditSection"><div className="arrivalsTableMeta"><h2>Operational Status</h2><span>Physical rooms at preview time</span></div><div className="nightAuditOps"><div><b>Available</b><strong>{count(summary.occupancy.availableRooms)}</strong></div><div><b>Occupied</b><strong>{count(summary.occupancy.occupiedRooms)}</strong></div><div><b>Dirty</b><strong>{count(summary.occupancy.dirtyRooms)}</strong></div><div><b>Cleaning</b><strong>{count(summary.occupancy.cleaningRooms)}</strong></div><div><b>Out of Order</b><strong>{count(summary.occupancy.outOfOrderRooms)}</strong></div></div></section>
      <section className="panel nightAuditSection"><div className="arrivalsTableMeta"><h2>Exceptions</h2><span>{audit.blockers.length} blockers · {audit.warnings.length} warnings</span></div><div className="nightAuditIssues"><div><h3>BLOCKERS</h3>{audit.blockers.length ? audit.blockers.map((issue) => <p className="nightAuditIssue blocker" key={`${issue.code}-${issue.message}`}>{issue.message}</p>) : <p className="nightAuditClear">No blockers. This business day can be closed.</p>}</div><div><h3>WARNINGS</h3>{audit.warnings.length ? audit.warnings.map((issue) => <p className="nightAuditIssue warning" key={`${issue.code}-${issue.message}`}>{issue.message}</p>) : <p className="nightAuditClear">No warnings.</p>}</div></div></section>
      <div className="nightAuditActions">{audit.alreadyClosed ? <><button className="btn secondary" type="button" onClick={() => setShowSnapshot((value) => !value)}>{showSnapshot ? 'Hide Snapshot' : 'View Snapshot'}</button>{showSnapshot && <pre className="nightAuditSnapshot">{JSON.stringify(audit.snapshot, null, 2)}</pre>}</> : <button className="btn" type="button" disabled={busy || Boolean(audit.blockers.length)} onClick={() => void closeBusinessDay()}>{busy ? 'Closing…' : 'Close Business Day'}</button>}</div>
    </>}
  </section>;
}
