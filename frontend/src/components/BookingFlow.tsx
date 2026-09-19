'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { apiAssetUrl, apiRequest } from '../lib/api';
import type { AvailabilityOption, Hotel, ReservationSummary } from '../lib/types';
import { dateInDays, nextDate, validateSearchInput } from '../lib/booking-helpers';

type Hold = { token: string; expiresAt: string; lines: { quotedTotal: number | string; quotedTax?: number | string }[] };
type Wallet = { balance: number | string; currency?: string };
type Step = 'search' | 'room' | 'guest' | 'payment' | 'confirmation';
type GuestForm = {
  salutation: string;
  firstName: string;
  lastName: string;
  email: string;
  countryCode: string;
  mobile: string;
  address: string;
  gstin: string;
  companyName: string;
  billingAddress: string;
  internalRemark: string;
  mailMessage: string;
  referenceNo: string;
  agree: boolean;
};

const initialGuest: GuestForm = {
  salutation: 'Mr', firstName: '', lastName: '', email: '', countryCode: '+91', mobile: '',
  address: '', gstin: '', companyName: '', billingAddress: '', internalRemark: '',
  mailMessage: '', referenceNo: '', agree: false,
};

function money(value: number) {
  return `INR ${Number(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function resultHotelIdsFor(options: AvailabilityOption[]) {
  return Array.from(new Set(options.map((option) => option.hotelId)));
}

function fullGuestName(guest: GuestForm) {
  return [guest.salutation, guest.firstName.trim(), guest.lastName.trim()].filter(Boolean).join(' ');
}

function AgentBookingRail({
  checkIn,
  checkOut,
  nights,
  adults,
  children,
  rooms,
  onCheckIn,
  onCheckOut,
  onAdults,
  onChildren,
  onRooms,
  onBook,
  onShowTariff,
}: {
  checkIn: string;
  checkOut: string;
  nights: number;
  adults: number;
  children: number;
  rooms: number;
  onCheckIn: (value: string) => void;
  onCheckOut: (value: string) => void;
  onAdults: (value: number) => void;
  onChildren: (value: number) => void;
  onRooms: (value: number) => void;
  onBook: () => void;
  onShowTariff: () => void;
}) {
  return <aside className="agentBookingRail" aria-label="Booking criteria">
    <label>Checkin Date<input type="date" value={checkIn} onChange={(event) => onCheckIn(event.target.value)} /></label>
    <label>Nights<input type="number" min="1" value={nights} readOnly /></label>
    <label>Checkout Date<input type="date" value={checkOut} onChange={(event) => onCheckOut(event.target.value)} /></label>
    <div className="agentRailCounter"><span>Total Rooms</span><div><button type="button" onClick={() => onRooms(Math.max(1, rooms - 1))}>−</button><b>{rooms}</b><button type="button" onClick={() => onRooms(Math.min(20, rooms + 1))}>+</button></div></div>
    <div className="agentRailOccupancy"><span>Adults <b>{adults}</b></span><span>Child <b>{children}</b></span><span>FreeChild <b>0</b></span></div>
    <label>Room 1<input type="text" value={`${adults} Adults`} readOnly /></label>
    <div className="agentRailActions"><button type="button" className="btn" onClick={onBook}>Book</button><button type="button" className="btn secondary" onClick={onShowTariff}>Show Tariff</button></div>
    <div className="agentRailAdjust"><label>Adults<input type="number" min="1" value={adults} onChange={(event) => onAdults(Math.max(1, Number(event.target.value)))} /></label><label>Child<input type="number" min="0" value={children} onChange={(event) => onChildren(Math.max(0, Number(event.target.value)))} /></label></div>
  </aside>;
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
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [guest, setGuest] = useState<GuestForm>(initialGuest);
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
    if (!agentMode) return;
    apiRequest<Wallet>('/wallet').then(setWallet).catch((reason: Error) => setError(reason.message));
  }, [agentMode]);

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
  const resultHotelIds = useMemo(() => resultHotelIdsFor(options), [options]);
  const holdTotal = hold?.lines.reduce((total, line) => total + Number(line.quotedTotal), 0) ?? Number(selected?.total ?? 0);
  const walletBalance = Number(wallet?.balance ?? 0);
  const nights = selected?.nights ?? Math.max(1, Math.round((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86_400_000));

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
    setError('');
    if (agentMode && wallet && walletBalance < Number(option.total)) {
      setError(`Wallet balance is ${money(walletBalance)} but this booking needs ${money(Number(option.total))}. Recharge your wallet before booking.`);
      return;
    }
    setBusy(true);
    try {
      const created = await apiRequest<Hold>('/holds', { method: 'POST', body: JSON.stringify({ hotelId: option.hotelId, roomTypeId: option.roomTypeId, ratePlanId: option.ratePlanId, checkIn, checkOut, adults, children, rooms }) });
      setSelected(option); setHold(created); setStep('guest');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not hold inventory'); }
    finally { setBusy(false); }
  }

  async function submitGuest(event: FormEvent) {
    event.preventDefault(); if (!hold) return;
    if (!guest.agree) { setError('Please confirm the hotel booking and cancellation policies.'); return; }
    setError(''); setBusy(true);
    try {
      const billing = [guest.companyName && `Bill to company: ${guest.companyName}`, guest.billingAddress && `Billing address: ${guest.billingAddress}`, guest.referenceNo && `Agent reference: ${guest.referenceNo}`].filter(Boolean).join('\n');
      const internal = [guest.internalRemark, guest.mailMessage && `Mail message: ${guest.mailMessage}`].filter(Boolean).join('\n');
      const created = await apiRequest<{ reference: string }>(`/reservations/from-hold/${encodeURIComponent(hold.token)}`, {
        method: 'POST',
        body: JSON.stringify({
          guestName: fullGuestName(guest), email: guest.email, mobile: `${guest.countryCode} ${guest.mobile}`.trim(),
          address: guest.address, gstin: guest.gstin, billingInstruction: billing || undefined,
          internalRemark: internal || undefined, source: agentMode ? 'AGENT' : 'WEBSITE',
        }),
      });
      const loaded = await apiRequest<ReservationSummary>(`/reservations/${encodeURIComponent(created.reference)}`);
      setReservation(loaded);
      if (agentMode) {
        setWallet(await apiRequest<Wallet>('/wallet'));
        setStep('confirmation');
      } else if (Number(loaded.balanceAmount) <= 0 || loaded.paymentStatus === 'PAID') setStep('confirmation');
      else {
        await apiRequest<{ providerOrderId: string }>(`/payments/${encodeURIComponent(created.reference)}/order`, { method: 'POST', headers: { 'idempotency-key': `web:${created.reference}:${crypto.randomUUID()}` } });
        setStep('payment');
      }
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

  function updateGuest<K extends keyof GuestForm>(key: K, value: GuestForm[K]) {
    setGuest((current) => ({ ...current, [key]: value }));
  }

  const steps = agentMode ? [['search', 'Search'], ['room', 'Room'], ['guest', 'Guest'], ['confirmation', 'Confirmation']] : [['search', 'Search'], ['room', 'Room'], ['guest', 'Guest'], ['payment', 'Payment'], ['confirmation', 'Confirmation']];

  return <div className={`page bookingWorkspace${agentMode ? ' agentBookingFlow' : ''}`}>
    <div className="pageTitle public"><span>{agentMode ? 'Partner reservation desk' : 'Secure direct reservation'}</span><h1>{agentMode ? 'Create agent booking' : 'Book your stay'}</h1><p>{selectedHotel?.name ?? (agentMode ? 'Search assigned rates, add guest details and confirm against your wallet.' : 'Live availability, transparent pricing and confirmation in one flow.')}</p></div>
    {agentMode && <div className="agentBookingWallet"><div><span>Available wallet balance</span><strong>{wallet ? money(walletBalance) : 'Loading...'}</strong></div><a className="smallBtn" href="/agent/wallet">Recharge wallet</a></div>}
    <ol className="steps horizontal" aria-label="Booking progress">{steps.map(([value, label]) => <li className={step === value ? 'active' : ''} key={value}>{label}</li>)}</ol>
    {error && <p className="error" role="alert">{error}</p>}
    {agentMode && step !== 'search' && <AgentBookingRail checkIn={checkIn} checkOut={checkOut} nights={nights} adults={adults} children={children} rooms={rooms} onCheckIn={(value) => { setCheckIn(value); if (checkOut <= value) setCheckOut(nextDate(value)); }} onCheckOut={(value) => setCheckOut(value < nextDate(checkIn) ? nextDate(checkIn) : value)} onAdults={setAdults} onChildren={setChildren} onRooms={setRooms} onBook={() => setStep('guest')} onShowTariff={() => setStep('room')} />}
    {step === 'search' && <div className="agentSearchLayout"><form className="formCard bookingForm" onSubmit={search}>
      <h2>Choose your stay</h2>
      <p className="mutedText">{agentMode ? 'Only hotels and rate plans assigned to your agent account will be shown.' : 'Select dates and occupancy to see live room availability.'}</p>
      <label>Hotel<select value={hotelId} onChange={(event) => setHotelId(event.target.value)}><option value="">All hotels</option>{hotels.map((hotel) => <option key={hotel.id} value={hotel.id}>{hotel.name} - {hotel.city}</option>)}</select></label>
      <div className="two"><label>Check-in<input type="date" min={dateInDays(0)} value={checkIn} onChange={(event) => { const value = event.target.value < dateInDays(0) ? dateInDays(0) : event.target.value; setCheckIn(value); if (checkOut <= value) setCheckOut(nextDate(value)); }} required /></label><label>Check-out<input type="date" min={nextDate(checkIn)} value={checkOut} onChange={(event) => setCheckOut(event.target.value < nextDate(checkIn) ? nextDate(checkIn) : event.target.value)} required /></label></div>
      <div className="three"><label>Adults<input type="number" min="1" max="100" value={adults} onChange={(event) => setAdults(Number(event.target.value))} required /></label><label>Children<input type="number" min="0" max="100" value={children} onChange={(event) => setChildren(Number(event.target.value))} /></label><label>Total rooms<input type="number" min="1" max="20" value={rooms} onChange={(event) => setRooms(Number(event.target.value))} required /></label></div>
      <button className="btn full" disabled={busy}>{busy ? 'Checking...' : 'Show available rooms'}</button>
    </form>{agentMode && <section className="agentHotelIntro"><span>Selected property</span><h2>{selectedHotel?.name ?? 'Choose your hotel'}</h2><p>{selectedHotel?.city ?? 'Select a property and stay dates from the booking rail.'}</p><p className="agentHotelIntroHint">Assigned partner rates and live availability will appear here after you search.</p></section>}</div>}
    {step === 'room' && <section className="bookingResults"><div className="sectionHead left"><span>{checkIn} to {checkOut} · {nights} night{nights === 1 ? '' : 's'}</span><h2>Choose a room and rate</h2><p>{agentMode ? 'Rates shown are limited to your active agent assignments.' : 'Select a room type and meal plan to continue your booking.'}</p></div>{options.length === 0 ? <p className="empty">No room plan is available for those dates. Try different dates or occupancy.</p> : <div className="bookingRoomGrid">{resultHotelIds.map((resultHotelId) => { const hotel = hotels.find((item) => item.id === resultHotelId); const hotelOptions = options.filter((option) => option.hotelId === resultHotelId); const roomChoices = Array.from(new Map(hotelOptions.map((option) => [option.roomTypeId, option])).values()); const selection = hotelSelections[resultHotelId] ?? { roomTypeId: roomChoices[0]?.roomTypeId ?? '', ratePlanId: roomChoices[0]?.ratePlanId ?? '' }; const rateChoices = Array.from(new Map(hotelOptions.filter((option) => option.roomTypeId === selection.roomTypeId).map((option) => [option.ratePlanId, option])).values()); const selectedOption = hotelOptions.find((option) => option.roomTypeId === selection.roomTypeId && option.ratePlanId === selection.ratePlanId) ?? rateChoices[0] ?? hotelOptions[0]; const setSelection = (next: { roomTypeId: string; ratePlanId: string }) => setHotelSelections((current) => ({ ...current, [resultHotelId]: next })); return <article className="bookingRoomCard" key={resultHotelId}><div className="bookingRoomImage"><img src={apiAssetUrl(hotel?.images?.[0]?.url ?? hotel?.ogImageUrl) || '/rainwood-placeholder.svg'} alt={hotel?.images?.[0]?.altText ?? hotel?.name ?? 'RainWood Hotels'} /></div><div className="bookingRoomBody"><span className="bookingRoomCity">{hotel?.city}</span><h3>{hotel?.name}</h3><p className="bookingRoomHotel">{selectedOption.roomType}</p><div className="bookingRoomSelectors"><label>Room type<select value={selection.roomTypeId} onChange={(event) => { const nextRoomTypeId = event.target.value; const nextRate = hotelOptions.find((option) => option.roomTypeId === nextRoomTypeId); setSelection({ roomTypeId: nextRoomTypeId, ratePlanId: nextRate?.ratePlanId ?? '' }); }}>{roomChoices.map((option) => <option key={option.roomTypeId} value={option.roomTypeId}>{option.roomType}</option>)}</select></label><label>Rate / meal plan<select value={selection.ratePlanId} onChange={(event) => setSelection({ ...selection, ratePlanId: event.target.value })}>{rateChoices.map((option) => <option key={option.ratePlanId} value={option.ratePlanId}>{option.ratePlan} · {option.mealPlan}</option>)}</select></label></div><div className="bookingRoomMeta"><span>Available {selectedOption.availableRooms ?? ' - '}</span><strong>{selectedOption.mealPlan}</strong><span>{selectedOption.rooms} room{selectedOption.rooms === 1 ? '' : 's'}</span><span>{selectedOption.adults} adult{selectedOption.adults === 1 ? '' : 's'}</span></div><div className="bookingRoomRate"><div><small>Grand total</small><strong>{money(selectedOption.total)}</strong><span>Taxes: {money(selectedOption.taxTotal)}</span></div><button type="button" className="btn" onClick={() => void createHold(selectedOption)} disabled={busy}>{busy ? 'Holding...' : agentMode ? 'Add to cart' : 'Book this room'}</button></div></div></article>; })}</div>}</section>}
    {step === 'guest' && hold && <section className="bookingCheckoutGrid"><aside className="formCard bookingCart"><div className="rangeSectionHeader"><div><span className="eyebrow">Cart details</span><h2>{selected?.roomType}</h2></div><span className="status ok">Held</span></div><p className="mutedText">{selected?.ratePlan} · {selected?.mealPlan}</p><dl className="bookingSummary"><div><dt>Stay</dt><dd>{checkIn} to {checkOut} ({nights} night{nights === 1 ? '' : 's'})</dd></div><div><dt>Rooms / guests</dt><dd>{rooms} room{rooms === 1 ? '' : 's'} · {adults} adults · {children} children</dd></div><div><dt>Room total</dt><dd>{money(holdTotal)}</dd></div></dl><p className="notice">Inventory held until {new Date(hold.expiresAt).toLocaleTimeString()}.</p>{agentMode && <p className={walletBalance >= holdTotal ? 'walletCheck okText' : 'walletCheck errorText'}>Wallet after booking: {money(walletBalance - holdTotal)}</p>}</aside><form className="formCard bookingGuestForm" onSubmit={submitGuest}><div className="rangeSectionHeader"><div><span className="eyebrow">Guest details</span><h2>Complete reservation</h2></div><span>{agentMode ? 'Wallet booking' : 'Pay at confirmation'}</span></div><div className="three"><label>Salutation<select value={guest.salutation} onChange={(event) => updateGuest('salutation', event.target.value)}><option>Mr</option><option>Mrs</option><option>Ms</option><option>Dr</option></select></label><label>First name<input value={guest.firstName} onChange={(event) => updateGuest('firstName', event.target.value)} autoComplete="given-name" required /></label><label>Last name<input value={guest.lastName} onChange={(event) => updateGuest('lastName', event.target.value)} autoComplete="family-name" required /></label></div><div className="two"><label>Mobile number<div className="phoneInput"><input className="phoneCode" value={guest.countryCode} onChange={(event) => updateGuest('countryCode', event.target.value)} aria-label="Country code" required /><input value={guest.mobile} onChange={(event) => updateGuest('mobile', event.target.value)} autoComplete="tel" required /></div></label><label>Email address<input type="email" value={guest.email} onChange={(event) => updateGuest('email', event.target.value)} autoComplete="email" required /></label></div><label>Guest address<textarea rows={2} value={guest.address} onChange={(event) => updateGuest('address', event.target.value)} /></label><div className="two"><label>GST / tax number<input value={guest.gstin} onChange={(event) => updateGuest('gstin', event.target.value)} /></label><label>Bill to company<input value={guest.companyName} onChange={(event) => updateGuest('companyName', event.target.value)} /></label></div><label>Billing address<textarea rows={2} value={guest.billingAddress} onChange={(event) => updateGuest('billingAddress', event.target.value)} /></label><div className="two"><label>Internal notes<textarea rows={2} value={guest.internalRemark} onChange={(event) => updateGuest('internalRemark', event.target.value)} /></label><label>Mail message<textarea rows={2} value={guest.mailMessage} onChange={(event) => updateGuest('mailMessage', event.target.value)} /></label></div><label>Agent reference number<input value={guest.referenceNo} onChange={(event) => updateGuest('referenceNo', event.target.value)} placeholder="Optional" /></label><label className="checkLabel"><input type="checkbox" checked={guest.agree} onChange={(event) => updateGuest('agree', event.target.checked)} required /> I agree to the hotel booking and cancellation policies</label><button className="btn full" disabled={busy}>{busy ? 'Confirming...' : agentMode ? `Confirm booking · ${money(holdTotal)}` : 'Review and continue to payment'}</button></form></section>}
    {step === 'payment' && reservation && <section className="formCard"><h2>Payment</h2><p>Reservation <b>{reservation.reference}</b> is ready for secure payment.</p><div className="summary"><p>Total <strong>{money(Number(reservation.totalAmount))}</strong></p><p>Balance due <strong>{money(Number(reservation.balanceAmount))}</strong></p></div><button className="btn full" onClick={completeMockPayment} disabled={busy}>{busy ? 'Processing payment...' : 'Complete mock payment'}</button><p className="hint">Local mock mode sends a signed provider event through the backend webhook processor.</p></section>}
    {step === 'confirmation' && reservation && <section className="formCard confirmation"><span className="status ok">Confirmed</span><h2>Booking confirmed</h2><p>Thank you, {reservation.guestName}. Your reference is <b>{reservation.reference}</b>.</p><p>{reservation.hotel.name} - {reservation.checkIn} to {reservation.checkOut}</p><p>Payment status: <b>{reservation.paymentStatus}</b></p>{agentMode && <p className="notice">The booking amount was deducted from your agent wallet.</p>}<div className="actions"><a className="btn" href={`/booking/confirmation?reference=${encodeURIComponent(reservation.reference)}`}>View confirmation</a>{agentMode && <a className="btn secondary" href="/agent/bookings">View my bookings</a>}</div></section>}
  </div>;
}
