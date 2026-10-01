'use client';

import { FormEvent, useEffect, useState } from 'react';
import { apiRequest } from '../lib/api';
import { useAdminProfile } from './AdminData';

type Hotel = { id: string; name: string };
type Shift = { id: string; shiftNo: string; status: 'OPEN' | 'CLOSED'; businessDate: string; openedAt: string; closedAt?: string | null; openingCash: number; expectedCash: number; actualCash?: number | null; cashVariance?: number | null; closingNote?: string | null; openedBy?: { name: string }; closedBy?: { name: string } | null; hotel?: Hotel; paymentTotals?: { byMode?: Record<string, number>; cash?: number; total?: number } };

const money = (value: unknown) => `INR ${Number(value ?? 0).toFixed(2)}`;
const varianceLabel = (value: number | null | undefined) => value == null ? '—' : Math.abs(value) < 0.005 ? 'BALANCED' : value < 0 ? `SHORT ${money(Math.abs(value))}` : `OVER ${money(value)}`;

export function AdminCashierData() {
  const { profile } = useAdminProfile();
  const canOperate = ['SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN', 'RESERVATION'].includes(profile?.role ?? '');
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
        apiRequest<{ shift: Shift | null }>(`/cashier-shifts/current?hotelId=${encodeURIComponent(nextHotelId)}`),
        apiRequest<Shift[]>(`/cashier-shifts?hotelId=${encodeURIComponent(nextHotelId)}`),
      ]);
      setCurrent(now.shift);
      setHistory(rows);
      if (now.shift) setActualCash(String(now.shift.expectedCash));
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not load cashier shifts.'); }
  }

  useEffect(() => {
    apiRequest<Hotel[]>('/hotels').then((rows) => { setHotels(rows); if (rows[0]) setHotelId(rows[0].id); }).catch((reason) => setError(reason instanceof Error ? reason.message : 'Could not load hotels.'));
  }, []);
  useEffect(() => { if (hotelId) void load(hotelId); }, [hotelId]);

  async function openShift(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    try { await apiRequest('/cashier-shifts/open', { method: 'POST', body: JSON.stringify({ hotelId, openingCash: Number(openingCash) }) }); setMessage('Cashier shift opened.'); await load(); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not open cashier shift.'); } finally { setBusy(false); }
  }

  async function closeShift(event: FormEvent) {
    event.preventDefault(); if (!current) return; setBusy(true); setError(''); setMessage('');
    try { await apiRequest(`/cashier-shifts/${current.id}/close`, { method: 'POST', body: JSON.stringify({ actualCash: Number(actualCash), closingNote: closingNote || undefined }) }); setMessage('Cashier shift closed and snapshotted.'); setCurrent(null); await load(); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not close cashier shift.'); } finally { setBusy(false); }
  }

  const cash = current?.paymentTotals?.cash ?? 0;
  const expectedPreview = (current?.openingCash ?? 0) + cash;
  const variancePreview = Number(actualCash || 0) - expectedPreview;
  return <section className="pageSection"><header className="pageTitle"><div><span>Front office operations</span><h1>Cashier shift</h1><p>Open and close the front-desk drawer with an immutable payment snapshot.</p></div></header>{error && <p className="error" role="alert">{error}</p>}{message && <p className="notice" role="status">{message}</p>}<section className="panel"><label>Hotel<select value={hotelId} onChange={(event) => setHotelId(event.target.value)}>{hotels.map((hotel) => <option key={hotel.id} value={hotel.id}>{hotel.name}</option>)}</select></label>{!canOperate && <p className="mutedText">Accounts access is read-only for cashier shift history.</p>}{canOperate && !current ? <form className="formCard" onSubmit={openShift}><h2>Open front-desk drawer</h2><p className="mutedText">Only one open cashier shift is allowed per hotel.</p><label>Opening cash<input required min="0" step="0.01" type="number" value={openingCash} onChange={(event) => setOpeningCash(event.target.value)} /></label><button className="btn" disabled={busy || !hotelId}>{busy ? 'Opening…' : 'Open shift'}</button></form> : canOperate && current ? <div className="cashierOpenCard"><div className="kpiGrid"><article><span>Shift</span><strong>{current.shiftNo}</strong></article><article><span>Business date</span><strong>{current.businessDate}</strong></article><article><span>Opening cash</span><strong>{money(current.openingCash)}</strong></article><article><span>Cash receipts</span><strong>{money(cash)}</strong></article><article><span>Expected cash</span><strong>{money(expectedPreview)}</strong></article></div><form className="formCard" onSubmit={closeShift}><h2>Close shift</h2><div className="two"><label>Actual counted cash<input required min="0" step="0.01" type="number" value={actualCash} onChange={(event) => setActualCash(event.target.value)} /></label><label>Variance preview<input readOnly value={varianceLabel(variancePreview)} /></label></div><label>Closing note{Math.abs(variancePreview) > 0.005 && <small> Required for a non-zero variance.</small>}<textarea value={closingNote} onChange={(event) => setClosingNote(event.target.value)} /></label><button className="btn" disabled={busy || (Math.abs(variancePreview) > 0.005 && !closingNote.trim())}>{busy ? 'Closing…' : 'Confirm close'}</button></form></div> : null}</section><section className="panel"><h2>Shift history</h2><div className="tableScroll"><table><thead><tr><th>Shift</th><th>Business date</th><th>Opened by</th><th>Opened at</th><th>Status</th><th>Cash receipts</th><th>Expected</th><th>Actual</th><th>Variance</th></tr></thead><tbody>{history.map((row) => <tr key={row.id}><td>{row.shiftNo}</td><td>{row.businessDate}</td><td>{row.openedBy?.name ?? '—'}</td><td>{row.openedAt.slice(0, 16).replace('T', ' ')}</td><td>{row.status}</td><td>{money(row.paymentTotals?.cash)}</td><td>{money(row.expectedCash)}</td><td>{row.actualCash == null ? '—' : money(row.actualCash)}</td><td>{varianceLabel(row.cashVariance)}</td></tr>)}{!history.length && <tr><td colSpan={9}><p className="empty">No cashier shifts found.</p></td></tr>}</tbody></table></div></section></section>;
}
