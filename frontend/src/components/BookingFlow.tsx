'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { apiRequest } from '../lib/api';
import type { AvailabilityOption, Hotel, ReservationSummary } from '../lib/types';
import { dateInDays, nextDate, validateSearchInput } from '../lib/booking-helpers';

type Hold = { token: string; expiresAt: string; lines: { quotedTotal: number | string }[] };
type Step = 'search' | 'room' | 'guest' | 'payment' | 'confirmation';

function money(value: number) {
  return `INR ${Number(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function resultHotelIdsFor(options: AvailabilityOption[]) {
  return Array.from(new Set(options.map((option) => option.hotelId)));
}

export function BookingFlow({ agentMode = false }: { agentMode?: boolean } = {}) {
  const params = useSearchParams();
  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [hotelId, setHotelId] = useState('');
  const [checkIn, setCheckIn] = useState(dateInDays(1));
  const [checkOut, setCheckOut] = useState(dateInDays(2));
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);
  const [rooms, setRooms] = useState(1);
  const [options, setOptions] = useState<AvailabilityOption[]>([]);
  const [hotelSelections, setHotelSelections] = useState<Record<string, { roomTypeId: string; ratePlanId: string }>>({});
  const [selected, setSelected] = useState<AvailabilityOption | null>(null);
  const [hold, setHold] = useState<Hold | null>(null);
  const [reservation, setReservation] = useState<ReservationSummary | null>(null);
  const [guest, setGuest] = useState({ name: '', email: '', mobile: '' });
  const [step, setStep] = useState<Step>('search');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    apiRequest<Hotel[]>('/hotels').then((items) => {
      setHotels(items);
      const requestedSlug = params.get('hotel');
      setHotelId(requestedSlug ? items.find((item) => item.slug === requestedSlug)?.id ?? '' : '');
      const requestedCheckIn = params.get('checkIn');
      const requestedCheckOut = params.get('checkOut');
      if (requestedCheckIn) setCheckIn(requestedCheckIn < dateInDays(0) ? dateInDays(1) : requestedCheckIn);
      if (requestedCheckOut) setCheckOut(requestedCheckOut <= (requestedCheckIn ?? dateInDays(0)) ? nextDate(requestedCheckIn ?? dateInDays(0)) : requestedCheckOut);
      if (params.get('adults')) setAdults(Number(params.get('adults')));
      if (params.get('children')) setChildren(Number(params.get('children')));
      if (params.get('rooms')) setRooms(Number(params.get('rooms')));
    }).catch((reason: Error) => setError(reason.message));
  }, [params]);

  useEffect(() => {
    if (!hold) return;
    const timer = window.setInterval(() => {
      if (new Date(hold.expiresAt).getTime() <= Date.now()) {
        setHold(null); setSelected(null); setStep('search');
        setError('Your temporary hold expired. Search again to see current availability.');
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [hold]);

  const selectedHotel = useMemo(() => hotels.find((hotel) => hotel.id === hotelId), [hotelId, hotels]);
  const resultHotelIds = useMemo(() => Array.from(new Set(options.map((option) => option.hotelId))), [options]);

  async function search(event: FormEvent) {
    event.preventDefault(); setError(''); setBusy(true);
    try {
      const validationError = validateSearchInput({ checkIn, checkOut, adults, children, rooms });
      if (validationError) throw new Error(validationError);
      const query = new URLSearchParams({ checkIn, checkOut, adults: String(adults), children: String(children), rooms: String(rooms) });
      if (hotelId) query.set('hotelId', hotelId);
      const nextOptions = await apiRequest<AvailabilityOption[]>(`/availability/search?${query}`);
      setOptions(nextOptions);
      setHotelSelections(Object.fromEntries(resultHotelIdsFor(nextOptions).map((resultHotelId) => {
        const first = nextOptions.find((option) => option.hotelId === resultHotelId)!;
        return [resultHotelId, { roomTypeId: first.roomTypeId, ratePlanId: first.ratePlanId }];
      })));
      setSelected(null); setStep('room');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Availability search failed'); }
    finally { setBusy(false); }
  }

  async function createHold(option: AvailabilityOption) {
    setError(''); setBusy(true);
    try {
      const created = await apiRequest<Hold>('/holds', { method: 'POST', body: JSON.stringify({ hotelId: option.hotelId, roomTypeId: option.roomTypeId, ratePlanId: option.ratePlanId, checkIn, checkOut, adults, children, rooms }) });
      setSelected(option); setHold(created); setStep('guest');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not hold inventory'); }
    finally { setBusy(false); }
  }

  async function submitGuest(event: FormEvent) {
    event.preventDefault(); if (!hold) return;
    setError(''); setBusy(true);
    try {
      const created = await apiRequest<{ reference: string }>(`/reservations/from-hold/${encodeURIComponent(hold.token)}`, { method: 'POST', body: JSON.stringify({ guestName: guest.name, email: guest.email, mobile: guest.mobile, source: agentMode ? 'AGENT' : 'WEBSITE' }) });
      await apiRequest<{ providerOrderId: string }>(`/payments/${encodeURIComponent(created.reference)}/order`, { method: 'POST', headers: { 'idempotency-key': `web:${created.reference}:${crypto.randomUUID()}` } });
      setReservation(await apiRequest<ReservationSummary>(`/reservations/${encodeURIComponent(created.reference)}`));
      setStep('payment');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not create reservation'); }
    finally { setBusy(false); }
  }

  async function completeMockPayment() {
    if (!reservation) return;
    setError(''); setBusy(true);
    try {
      await apiRequest(`/payments/${encodeURIComponent(reservation.reference)}/mock-complete`, { method: 'POST', body: JSON.stringify({ status: 'SUCCESS' }) });
      setReservation(await apiRequest<ReservationSummary>(`/reservations/${encodeURIComponent(reservation.reference)}`));
      setStep('confirmation');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Payment failed'); }
    finally { setBusy(false); }
  }

  return <div className="page bookingWorkspace">
    <div className="pageTitle public"><span>Secure direct reservation</span><h1>Book your stay</h1><p>{selectedHotel?.name ?? 'Live availability, transparent pricing and confirmation in one flow.'}</p></div>
    <ol className="steps horizontal" aria-label="Booking progress">{[['search', 'Search'], ['room', 'Room'], ['guest', 'Guest'], ['payment', 'Payment'], ['confirmation', 'Confirmation']].map(([value, label]) => <li className={step === value ? 'active' : ''} key={value}>{label}</li>)}</ol>
    {error && <p className="error" role="alert">{error}</p>}
    {step === 'search' && <form className="formCard bookingForm" onSubmit={search}>
      <h2>Find your stay</h2>
      <label>Hotel<select value={hotelId} onChange={(event) => setHotelId(event.target.value)}><option value="">All hotels</option>{hotels.map((hotel) => <option key={hotel.id} value={hotel.id}>{hotel.name} - {hotel.city}</option>)}</select></label>
      <div className="two"><label>Check-in<input type="date" min={dateInDays(0)} value={checkIn} onChange={(event) => { const value = event.target.value < dateInDays(0) ? dateInDays(0) : event.target.value; setCheckIn(value); if (checkOut <= value) setCheckOut(nextDate(value)); }} required /></label><label>Check-out<input type="date" min={nextDate(checkIn)} value={checkOut} onChange={(event) => setCheckOut(event.target.value < nextDate(checkIn) ? nextDate(checkIn) : event.target.value)} required /></label></div>
      <div className="three"><label>Adults<input type="number" min="1" max="100" value={adults} onChange={(event) => setAdults(Number(event.target.value))} required /></label><label>Children<input type="number" min="0" max="100" value={children} onChange={(event) => setChildren(Number(event.target.value))} /></label><label>Rooms<input type="number" min="1" max="20" value={rooms} onChange={(event) => setRooms(Number(event.target.value))} required /></label></div>
      <button className="btn full" disabled={busy}>{busy ? 'Checking...' : 'Check live availability'}</button>
    </form>}
    {step === 'room' && <section className="bookingResults"><div className="sectionHead left"><span>{checkIn} to {checkOut}</span><h2>Choose your room</h2><p>Select a room type and meal plan to continue your booking.</p></div>{options.length === 0 ? <p className="empty">No room plan is available for those dates. Try different dates or occupancy.</p> : <div className="bookingRoomGrid">{resultHotelIds.map((resultHotelId) => { const hotel = hotels.find((item) => item.id === resultHotelId); const hotelOptions = options.filter((option) => option.hotelId === resultHotelId); const roomChoices = Array.from(new Map(hotelOptions.map((option) => [option.roomTypeId, option])).values()); const selection = hotelSelections[resultHotelId] ?? { roomTypeId: roomChoices[0]?.roomTypeId ?? '', ratePlanId: roomChoices[0]?.ratePlanId ?? '' }; const rateChoices = Array.from(new Map(hotelOptions.filter((option) => option.roomTypeId === selection.roomTypeId).map((option) => [option.ratePlanId, option])).values()); const selectedOption = hotelOptions.find((option) => option.roomTypeId === selection.roomTypeId && option.ratePlanId === selection.ratePlanId) ?? rateChoices[0] ?? hotelOptions[0]; const setSelection = (next: { roomTypeId: string; ratePlanId: string }) => setHotelSelections((current) => ({ ...current, [resultHotelId]: next })); return <article className="bookingRoomCard" key={resultHotelId}><div className="bookingRoomImage"><img src={hotel?.images?.[0]?.url ?? hotel?.ogImageUrl ?? '/rainwood-placeholder.svg'} alt={hotel?.images?.[0]?.altText ?? hotel?.name ?? 'RainWood Hotels'} /></div><div className="bookingRoomBody"><span className="bookingRoomCity">{hotel?.city}</span><h3>{hotel?.name}</h3><p className="bookingRoomHotel">Choose the room type and meal plan for your stay.</p><div className="bookingRoomSelectors"><label>Room type<select value={selection.roomTypeId} onChange={(event) => { const nextRoomTypeId = event.target.value; const nextRate = hotelOptions.find((option) => option.roomTypeId === nextRoomTypeId); setSelection({ roomTypeId: nextRoomTypeId, ratePlanId: nextRate?.ratePlanId ?? '' }); }}>{roomChoices.map((option) => <option key={option.roomTypeId} value={option.roomTypeId}>{option.roomType}</option>)}</select></label><label>Meal plan<select value={selection.ratePlanId} onChange={(event) => setSelection({ ...selection, ratePlanId: event.target.value })}>{rateChoices.map((option) => <option key={option.ratePlanId} value={option.ratePlanId}>{option.ratePlan} · {option.mealPlan}</option>)}</select></label></div><div className="bookingRoomMeta"><span>Meal plan</span><strong>{selectedOption.mealPlan}</strong><span>{selectedOption.nights} night{selectedOption.nights === 1 ? '' : 's'}</span><span>{selectedOption.rooms} room{selectedOption.rooms === 1 ? '' : 's'}</span></div><div className="bookingRoomRate"><div><small>Total price</small><strong>{money(selectedOption.total)}</strong><span>Taxes included: {money(selectedOption.taxTotal)}</span></div><button className="btn" onClick={() => void createHold(selectedOption)} disabled={busy}>{busy ? 'Loading...' : 'Book this room'}</button></div></div></article>; })}</div>}</section>}
    {step === 'guest' && hold && <form className="formCard" onSubmit={submitGuest}><h2>Guest details</h2><p className="notice">Inventory is held until {new Date(hold.expiresAt).toLocaleTimeString()}.</p><label>Full name<input value={guest.name} onChange={(event) => setGuest({ ...guest, name: event.target.value })} required minLength={2} autoComplete="name" /></label><label>Email<input type="email" value={guest.email} onChange={(event) => setGuest({ ...guest, email: event.target.value })} required autoComplete="email" /></label><label>Mobile<input value={guest.mobile} onChange={(event) => setGuest({ ...guest, mobile: event.target.value })} required autoComplete="tel" /></label><button className="btn full" disabled={busy}>{busy ? 'Creating...' : 'Review and continue to payment'}</button></form>}
    {step === 'payment' && reservation && <section className="formCard"><h2>Payment</h2><p>Reservation <b>{reservation.reference}</b> is ready for secure payment.</p><div className="summary"><p>Total <strong>{money(Number(reservation.totalAmount))}</strong></p><p>Balance due <strong>{money(Number(reservation.balanceAmount))}</strong></p></div><button className="btn full" onClick={completeMockPayment} disabled={busy}>{busy ? 'Processing payment...' : 'Complete mock payment'}</button><p className="hint">Local mock mode sends a signed provider event through the backend webhook processor.</p></section>}
    {step === 'confirmation' && reservation && <section className="formCard confirmation"><span className="status ok">Confirmed</span><h2>Booking confirmed</h2><p>Thank you, {reservation.guestName}. Your reference is <b>{reservation.reference}</b>.</p><p>{reservation.hotel.name} - {reservation.checkIn} to {reservation.checkOut}</p><p>Payment status: <b>{reservation.paymentStatus}</b></p><a className="btn" href={`/booking/confirmation?reference=${encodeURIComponent(reservation.reference)}`}>View confirmation</a></section>}
  </div>;
}
