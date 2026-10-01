'use client';

import { FormEvent, useEffect, useState } from 'react';
import { apiRequest } from '../lib/api';
import { formatHotelDateTime } from '../lib/hotel-date-time';
import { isCashierOperationRole, isCashierReadRole, isPropertyCashierRole, scopedCashierHotels, type CashierHotel } from '../lib/cashier-scope';
import { useAdminProfile } from './AdminData';

type Hotel = CashierHotel;
type Shift = { id: string; shiftNo: string; status: 'OPEN' | 'CLOSED'; businessDate: string; openedAt: string; closedAt?: string | null; openingCash: number; expectedCash: number; actualCash?: number | null; cashVariance?: number | null; closingNote?: string | null; openedBy?: { name: string }; closedBy?: { name: string } | null; hotel?: Hotel; paymentTotals?: { byMode?: Record<string, number>; cash?: number; total?: number } };

const money = (value: unknown) => `INR ${Number(value ?? 0).toFixed(2)}`;
const varianceLabel = (value: number | null | undefined) => value == null ? '—' : Math.abs(value) < 0.005 ? 'BALANCED' : value < 0 ? `SHORT ${money(Math.abs(value))}` : `OVER ${money(value)}`;

export function AdminCashierData() {
  const { profile, loading: profileLoading } = useAdminProfile();
  const role = profile?.role;
  const canRead = isCashierReadRole(role);
  const canOperate = isCashierOperationRole(role);
  const propertyScoped = isPropertyCashierRole(role);
  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [hotelId, setHotelId] = useState('');
  const [current, setCurrent] = useState<Shift | null>(null);
  const [history, setHistory] = useState<Shift[]>([]);
  const [openingCash, setOpeningCash] = useState('0');
  const [actualCash, setActualCash] = useState('0');
  const [closingNote, setClosingNote] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function load(nextHotelId = hotelId) {
    if (!nextHotelId) return;
    try {
      const [now, rows] = await Promise.all([
        apiRequest<{ hotel: Hotel; shift: Shift | null }>(`/cashier-shifts/current?hotelId=${encodeURIComponent(nextHotelId)}`),
        apiRequest<Shift[]>(`/cashier-shifts?hotelId=${encodeURIComponent(nextHotelId)}`),
      ]);
      setCurrent(now.shift ? { ...now.shift, hotel: now.hotel } : null);
      setHistory(rows);
      if (now.shift) setActualCash(String(now.shift.expectedCash));
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not load cashier shifts.'); }
  }

  useEffect(() => {
    if (profileLoading || !profile) return;
    setError('');
    setCurrent(null);
    setHistory([]);
    setHotelId('');
    if (!canRead) return;
    if (propertyScoped && !profile.staffHotelId) {
      setError('Cashier access is not configured: this property-scoped account has no assigned hotel.');
      return;
    }
    apiRequest<Hotel[]>('/hotels').then((rows) => {
      const visible = scopedCashierHotels(profile, rows);
      setHotels(visible);
      const initialHotelId = propertyScoped ? profile.staffHotelId! : visible[0]?.id ?? '';
      if (initialHotelId && visible.some((hotel) => hotel.id === initialHotelId)) setHotelId(initialHotelId);
      else if (propertyScoped) setError('Cashier access is not configured: the assigned hotel is unavailable.');
    }).catch((reason) => setError(reason instanceof Error ? reason.message : 'Could not load hotels.'));
  }, [canRead, profile, profileLoading, propertyScoped]);

  useEffect(() => { if (hotelId) void load(hotelId); }, [hotelId]);

  async function openShift(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    try { await apiRequest('/cashier-shifts/open', { method: 'POST', body: JSON.stringify({ hotelId, openingCash: Number(openingCash) }) }); setMessage('Cashier shift opened.'); await load(); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not open cashier shift.'); } finally { setBusy(false); }
  }

  async function closeShift(event: FormEvent) {
    event.preventDefault(); if (!current) return; setBusy(true); setError(''); setMessage('');
    try { await apiRequest(`/cashier-shifts/${current.id}/close`, { method: 'POST', body: JSON.stringify({ actualCash: Number(actualCash), closingNote: closingNote || undefined }) }); setMessage('Cashier shift closed and snapshotted.'); setCurrent(null); await load(); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not close cashier shift.'); } finally { setBusy(false); }
  }

  if (profileLoading) return <p className="loading">Loading staff profile…</p>;
  if (!canRead) return <p className="error" role="alert">Cashier access is not available for this account.</p>;
  const selectedHotel = hotels.find((hotel) => hotel.id === hotelId);
  const cash = current?.paymentTotals?.cash ?? 0;
  const expectedPreview = (current?.openingCash ?? 0) + cash;
  const variancePreview = Number(actualCash || 0) - expectedPreview;
  const hotelControl = propertyScoped
    ? <p className="mutedText">Hotel: <strong>{selectedHotel?.name ?? profile?.staffHotel?.name ?? 'Assigned hotel'}</strong></p>
    : <label>Hotel<select value={hotelId} onChange={(event) => setHotelId(event.target.value)}>{hotels.map((hotel) => <option key={hotel.id} value={hotel.id}>{hotel.name}</option>)}</select></label>;

  return <section className="pageSection"><header className="pageTitle"><div><span>Front office operations</span><h1>Cashier shift</h1><p>Open and close the front-desk drawer with an immutable payment snapshot.</p></div></header>{error && <p className="error" role="alert">{error}</p>}{message && <p className="notice" role="status">{message}</p>}<section className="panel">{hotelControl}{!canOperate && <p className="mutedText">Accounts access is read-only for cashier shift history.</p>}{canOperate && !current ? <form className="formCard" onSubmit={openShift}><h2>Open front-desk drawer</h2><p className="mutedText">Only one open cashier shift is allowed per hotel.</p><label>Opening cash<input required min="0" step="0.01" type="number" value={openingCash} onChange={(event) => setOpeningCash(event.target.value)} /></label><button className="btn" disabled={busy || !hotelId}>{busy ? 'Opening…' : 'Open shift'}</button></form> : canOperate && current ? <div className="cashierOpenCard"><div className="kpiGrid"><article><span>Shift</span><strong>{current.shiftNo}</strong></article><article><span>Business date</span><strong>{current.businessDate}</strong></article><article><span>Opened at</span><strong>{formatHotelDateTime(current.openedAt, current.hotel?.timezoneName)}</strong></article><article><span>Opening cash</span><strong>{money(current.openingCash)}</strong></article><article><span>Cash receipts</span><strong>{money(cash)}</strong></article><article><span>Expected cash</span><strong>{money(expectedPreview)}</strong></article></div><form className="formCard" onSubmit={closeShift}><h2>Close shift</h2><div className="two"><label>Actual counted cash<input required min="0" step="0.01" type="number" value={actualCash} onChange={(event) => setActualCash(event.target.value)} /></label><label>Variance preview<input readOnly value={varianceLabel(variancePreview)} /></label></div><label>Closing note{Math.abs(variancePreview) > 0.005 && <small> Required for a non-zero variance.</small>}<textarea value={closingNote} onChange={(event) => setClosingNote(event.target.value)} /></label><button className="btn" disabled={busy || (Math.abs(variancePreview) > 0.005 && !closingNote.trim())}>{busy ? 'Closing…' : 'Confirm close'}</button></form></div> : null}</section><section className="panel"><h2>Shift history</h2><div className="tableScroll"><table><thead><tr><th>Shift</th><th>Business date</th><th>Opened by</th><th>Opened at</th><th>Closed by</th><th>Closed at</th><th>Status</th><th>Cash receipts</th><th>Expected</th><th>Actual</th><th>Variance</th></tr></thead><tbody>{history.map((row) => { const timezone = row.hotel?.timezoneName ?? selectedHotel?.timezoneName; return <tr key={row.id}><td>{row.shiftNo}</td><td>{row.businessDate}</td><td>{row.openedBy?.name ?? '—'}</td><td>{formatHotelDateTime(row.openedAt, timezone)}</td><td>{row.closedBy?.name ?? '—'}</td><td>{formatHotelDateTime(row.closedAt, timezone)}</td><td>{row.status}</td><td>{money(row.paymentTotals?.cash)}</td><td>{money(row.expectedCash)}</td><td>{row.actualCash == null ? '—' : money(row.actualCash)}</td><td>{varianceLabel(row.cashVariance)}</td></tr>; })}{!history.length && <tr><td colSpan={11}><p className="empty">No cashier shifts found.</p></td></tr>}</tbody></table></div></section></section>;
}
