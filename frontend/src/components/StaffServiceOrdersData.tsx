'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { apiRequest } from '../lib/api';
import { createRetryableSubmission } from '../lib/retryable-submission';
import type { StaffProfile } from './StaffData';
import { canUseStaffServiceOrders } from '../lib/staff-navigation';

type Stay = { reference: string; guestName: string; assignedRooms: { roomNumber: string }[] };
type Item = { id: string; name: string; type: string; unitPrice: number; taxRate: number; active?: boolean };
type PostedOrder = { id: string; orderNo: string; totalAmount: number | string };
type Order = { reference: string; department: string; lines: { serviceItemId: string; quantity: number }[] };

export function StaffServiceOrdersData() {
  const [profile, setProfile] = useState<StaffProfile | null>(null);
  const [stays, setStays] = useState<Stay[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [reference, setReference] = useState('');
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [review, setReview] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [contextReady, setContextReady] = useState(false);
  const [retry, setRetry] = useState(0);
  const submission = useRef(createRetryableSubmission<Order, PostedOrder>());
  useEffect(() => {
    let current = true;
    setLoading(true); setError(''); setContextReady(false);
    apiRequest<StaffProfile>('/staff/me').then(async (me) => {
      if (!current) return;
      setProfile(me);
      if (!canUseStaffServiceOrders(me.department)) { setContextReady(true); return; }
      const [guests, catalog] = await Promise.all([apiRequest<Stay[]>('/staff/stays'), apiRequest<Item[]>('/staff/service-items')]);
      if (current) { setStays(guests); setItems(catalog.filter((item) => item.active !== false)); setReference(guests[0]?.reference ?? ''); setContextReady(true); }
    })
      .catch((reason) => { if (current) setError(reason instanceof Error ? reason.message : 'Could not load service order context.'); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [retry]);
  const selected = items.filter((item) => Number(quantities[item.id] ?? 0) > 0);
  const invalidQuantity = Object.values(quantities).some((value) => value !== '' && (!Number.isFinite(Number(value)) || Number(value) < 0 || !Number.isInteger(Number(value))));
  const estimate = selected.reduce((sum, item) => sum + Number(quantities[item.id]) * item.unitPrice * (1 + item.taxRate / 100), 0);
  const stay = stays.find((row) => row.reference === reference);
  async function post() {
    if (busy || !stay || !selected.length || !profile || invalidQuantity) return;
    if (!navigator.onLine) { setError('You are offline. Reconnect before posting this order.'); return; }
    setBusy(true); setError('');
    try {
      const order = await submission.current.submit({ reference: stay.reference, department: profile.department ?? '', lines: selected.map((item) => ({ serviceItemId: item.id, quantity: Number(quantities[item.id]) })) }, ({ reference: target, ...body }) => apiRequest<PostedOrder>(`/staff/stays/${encodeURIComponent(target)}/service-orders`, { method: 'POST', body: JSON.stringify(body) }));
      setMessage(`Service order ${order.orderNo} posted to the guest folio: INR ${Number(order.totalAmount).toFixed(2)}.`); setQuantities({}); setReview(false);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not post service order. Retry this order without changing the guest or items.'); }
    finally { setBusy(false); }
  }
  return <section className="staffContent">
    <div className="staffWelcome"><span className="staffEyebrow">Guest services</span><h1>{profile?.department === 'FOOD_BEVERAGE' ? 'F&B Service Orders' : profile?.department === 'ROOM_SERVICE' ? 'Room Service Orders' : 'Service orders'}</h1><p>Review the guest, room, items and amount before posting to the guest folio.</p></div>
    {error && <p className="staffError" role="alert">{error}{!contextReady && <button type="button" className="staffButton secondary" onClick={() => setRetry((value) => value + 1)}>Try again</button>}</p>}
    {message && <p className="staffSuccess" role="status">{message}</p>}
    {loading ? <p className="staffLoading" role="status">Loading guests and service items...</p> : profile && contextReady && (!canUseStaffServiceOrders(profile.department) ? <div className="staffEmpty"><strong>Use your department workspace</strong><span>Guest service-order posting is available to food &amp; beverage and room-service teams.</span><Link className="staffButton secondary" href="/staff">Back to my workspace</Link></div> : !stays.length ? <div className="staffEmpty"><strong>No in-house guests</strong><span>Service orders become available after a guest has checked in.</span></div> : !items.length ? <div className="staffEmpty"><strong>No service items available</strong><span>Ask an administrator to configure active items for your department.</span></div> : <>
      <label className="staffSearch">Guest / room<select value={reference} disabled={review || busy} onChange={(event) => { setReference(event.target.value); setMessage(''); }}>{stays.map((row) => <option key={row.reference} value={row.reference}>{row.assignedRooms.map((room) => room.roomNumber).join(', ') || 'Unassigned'} - {row.guestName} - {row.reference}</option>)}</select></label>
      {review ? <div className="staffConfirm"><h2>Review service order</h2><p><strong>{stay?.guestName}</strong> - {stay?.reference}<br />Room {stay?.assignedRooms.map((room) => room.roomNumber).join(', ') || 'unassigned'}</p><p>{selected.map((item) => `${item.name} x ${quantities[item.id]}`).join(', ')}</p><p>Estimated total <strong>INR {estimate.toFixed(2)}</strong></p><button className="staffButton secondary" type="button" disabled={busy} onClick={() => setReview(false)}>Back</button><button className="staffButton" type="button" disabled={busy} onClick={() => void post()}>{busy ? 'Posting...' : 'Confirm Post to Room'}</button></div> : <>
        <div className="staffChargeList">{items.map((item) => <label className="staffChargeCard" key={item.id}><div><strong>{item.name}</strong><span>{item.type.replaceAll('_', ' ')} - INR {item.unitPrice.toFixed(2)} + {item.taxRate}% tax</span></div><input aria-label={`Quantity ${item.name}`} type="number" min="0" step="1" value={quantities[item.id] ?? ''} onChange={(event) => { setQuantities({ ...quantities, [item.id]: event.target.value }); setMessage(''); }} /></label>)}</div>
        {invalidQuantity && <p className="staffError" role="alert">Use whole quantities of zero or more.</p>}<div className="staffTotal"><span>Estimated total</span><strong>INR {estimate.toFixed(2)}</strong></div><button className="staffButton full" type="button" disabled={!stay || !selected.length || invalidQuantity} onClick={() => { setReview(true); setError(''); }}>Review service order</button>
      </>}
    </>)}
  </section>;
}
