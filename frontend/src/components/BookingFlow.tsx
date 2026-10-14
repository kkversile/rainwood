'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { apiRequest } from '../lib/api';
import type { AvailabilityOption, Hotel, ReservationSummary } from '../lib/types';
import { agentPaymentConfirmation, aggregatePriceBreakdown, dueNowForAgentBooking, paymentMilestoneLabel, type PaymentMilestoneView } from '../lib/booking-pricing';
import { dateInDays, nextDate, parseBookingSearch, serializeBookingSearch, validateSearchInput } from '../lib/booking-helpers';
import { HotelImage } from './HotelImage';
import { RainwoodDatePicker } from './RainwoodDatePicker';

type Hold = { token: string; expiresAt: string; lines: { quotedTotal: number | string; quotedTax?: number | string }[] };
type Wallet = { balance: number | string; currency?: string };
type AgentTerms = { paymentTerms?: { mode: 'MILESTONES'; milestones: PaymentMilestoneView[] } | null };
type OfflinePaymentMode = 'UPI' | 'BANK_TRANSFER' | 'CHEQUE';
type AgentRateBook = {
  coverage: { hotel: { name: string; city: string }; status: 'VALID' | 'PARTIAL' | 'UNAVAILABLE' }[];
  rates: { hotel: { name: string; city: string }; rates: { date: string }[] }[];
};
type Step = 'hotels' | 'search' | 'room' | 'guest' | 'payment' | 'confirmation';
type PaymentOrder = { provider: string; providerOrderId: string; order_id: string; amount: number; currency: string };
type AgentPaymentMethod = 'WALLET' | 'RAZORPAY' | 'OFFLINE';
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

function dateAfterNights(value: string, nights: number) {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return nextDate(value);
  date.setUTCDate(date.getUTCDate() + Math.max(1, nights));
  return date.toISOString().slice(0, 10);
}

function displayDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

function hotelIdentity(hotel: { name: string; city: string }) {
  return `${hotel.name}::${hotel.city}`;
}

function eligibleRateBookHotelKeys(rateBook: AgentRateBook) {
  const hotelsWithRates = new Set(rateBook.rates.filter((plan) => plan.rates.length > 0).map((plan) => hotelIdentity(plan.hotel)));
  return rateBook.coverage.filter((item) => item.status === 'VALID' && hotelsWithRates.has(hotelIdentity(item.hotel))).map((item) => hotelIdentity(item.hotel));
}

const AgentHotelImage = HotelImage;
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

async function loadRazorpayCheckout() {
  if (window.Razorpay) return;
  await new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-razorpay-checkout]');
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Could not load Razorpay Checkout')), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.dataset.razorpayCheckout = 'true';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Could not load Razorpay Checkout'));
    document.body.appendChild(script);
  });
  if (!window.Razorpay) throw new Error('Razorpay Checkout is unavailable');
}

function AgentHotelSelection({ hotels, onSelect, loading = false }: { hotels: Hotel[]; onSelect: (hotelId: string) => void; loading?: boolean }) {
  const [city, setCity] = useState('all');
  const [query, setQuery] = useState('');
  const cities = Array.from(new Set(hotels.map((hotel) => hotel.city))).sort();
  const filteredHotels = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return hotels.filter((hotel) => {
      const cityMatches = city === 'all' || hotel.city === city;
      const queryMatches = !normalizedQuery || `${hotel.name} ${hotel.city} ${hotel.description ?? ''}`.toLowerCase().includes(normalizedQuery);
      return cityMatches && queryMatches;
    });
  }, [city, hotels, query]);

  return <section className="agentHotelSelection" aria-label="Choose a hotel">
    <aside className="agentHotelFilters">
      <h2>Filter your stay</h2>
      <label htmlFor="agent-hotel-city">Select city</label>
      <select id="agent-hotel-city" value={city} onChange={(event) => setCity(event.target.value)}>
        <option value="all">All cities</option>
        {cities.map((item) => <option key={item} value={item}>{item}</option>)}
      </select>
    </aside>
    <div className="agentHotelCatalog">
      <div className="agentHotelCatalogToolbar">
        <div><span className="agentHotelRibbon">All available hotels &amp; resorts</span><strong>{filteredHotels.length}</strong></div>
        <div className="agentHotelSearch"><input aria-label="Search hotel's name" placeholder="Search hotel's name" value={query} onChange={(event) => setQuery(event.target.value)} /><button type="button" onClick={() => setQuery(query.trim())}>Go</button></div>
      </div>
      {loading ? <p className="loading">Loading latest published rates...</p> : !filteredHotels.length ? <p className="empty">No hotels have complete published rates for these dates.</p> : <div className="agentHotelGrid">
        {filteredHotels.map((hotel) => {
          return <article className="agentHotelCard" key={hotel.id}>
            <div className="agentHotelCardImage"><AgentHotelImage hotel={hotel} alt={hotel.images?.[0]?.altText ?? `${hotel.name} property`} /></div>
            <div className="agentHotelCardBody"><h3>{hotel.name}</h3><p>{hotel.city}</p><button type="button" className="btn" onClick={() => onSelect(hotel.id)}>Book now</button></div>
          </article>;
        })}
      </div>}
    </div>
  </section>;
}

function AgentBookingRail({
  publicMode = false,
  hotelId,
  hotels = [],
  onHotelChange,
  checkIn,
  checkOut,
  nights,
  adults,
  children,
  childrenWithBed,
  childrenWithoutBed,
  rooms,
  onCheckIn,
  onCheckOut,
  onNights,
  onAdults,
  onChildren,
  onChildrenWithBed,
  onChildrenWithoutBed,
  onRooms,
  onBook,
  onShowTariff,
  onChangeHotel,
}: {
  publicMode?: boolean;
  hotelId?: string;
  hotels?: Hotel[];
  onHotelChange?: (value: string) => void;
  checkIn: string;
  checkOut: string;
  nights: number;
  adults: number;
  children: number;
  childrenWithBed?: number;
  childrenWithoutBed?: number;
  rooms: number;
  onCheckIn: (value: string) => void;
  onCheckOut: (value: string) => void;
  onNights: (value: number) => void;
  onAdults: (value: number) => void;
  onChildren: (value: number) => void;
  onChildrenWithBed?: (value: number) => void;
  onChildrenWithoutBed?: (value: number) => void;
  onRooms: (value: number) => void;
  onBook: () => void;
  onShowTariff: () => void;
  onChangeHotel?: () => void;
}) {
  return <aside className={`agentBookingRail${publicMode ? ' publicBookingRail' : ''}`} aria-label="Booking criteria">
    {publicMode ? <>
      <h2>Choose your stay</h2>
      <p>Select dates and occupancy to see live room availability.</p>
      <label>Hotel<select value={hotelId ?? ''} onChange={(event) => onHotelChange?.(event.target.value)}><option value="">All hotels</option>{hotels.map((hotel) => <option key={hotel.id} value={hotel.id}>{hotel.name} - {hotel.city}</option>)}</select></label>
    </> : onChangeHotel && <button type="button" className="agentChangeHotel" onClick={onChangeHotel}>← Change hotel</button>}
    <div className="publicBookingDates">
      <label>Check-in<RainwoodDatePicker label="Check-in" displayLabel="Check-in date" value={checkIn} minDate={dateInDays(0)} accent onChange={onCheckIn} /></label>
      {!publicMode && <label>Nights<input type="number" min="1" max="30" value={nights} onChange={(event) => onNights(Math.max(1, Number(event.target.value) || 1))} /></label>}
      <label>Check-out<RainwoodDatePicker label="Check-out" displayLabel="Check-out date" value={checkOut} minDate={nextDate(checkIn)} accent onChange={onCheckOut} /></label>
    </div>
    {publicMode ? <div className="publicBookingOccupancy"><label>Adults<input type="number" min="1" max="100" value={adults} onChange={(event) => onAdults(Math.max(1, Number(event.target.value) || 1))} required /></label><label>Children<input type="number" min="0" max="100" value={children} onChange={(event) => onChildren(Math.max(0, Number(event.target.value) || 0))} /></label><label>Total rooms<input type="number" min="1" max="20" value={rooms} onChange={(event) => onRooms(Math.max(1, Number(event.target.value) || 1))} required /></label></div> : <>
      <div className="agentRailCounter"><span>Total Rooms</span><div><button type="button" onClick={() => onRooms(Math.max(1, rooms - 1))}>−</button><b>{rooms}</b><button type="button" onClick={() => onRooms(Math.min(20, rooms + 1))}>+</button></div></div>
      <div className="agentRailOccupancy"><span>Adults <b>{adults}</b></span><span>Child with bed <b>{childrenWithBed ?? 0}</b></span><span>Child without bed <b>{childrenWithoutBed ?? 0}</b></span></div>
      <label>Room 1<input type="text" value={`${adults} Adults · ${children} Children`} readOnly /></label>
    </>}
    <div className="agentRailActions">{publicMode ? <button type="button" className="btn" onClick={onBook}>Show available rooms</button> : <><button type="button" className="btn" onClick={onBook}>Book</button><button type="button" className="btn secondary" onClick={onShowTariff}>Show Tariff</button></>}</div>
    {!publicMode && <div className="agentRailAdjust"><label>Adults<input type="number" min="1" value={adults} onChange={(event) => onAdults(Math.max(1, Number(event.target.value)))} /></label><label>Children with bed<input aria-label="Children with bed" type="number" min="0" value={childrenWithBed ?? 0} onChange={(event) => onChildrenWithBed?.(Math.max(0, Number(event.target.value) || 0))} /></label><label>Children without bed<input aria-label="Children without bed" type="number" min="0" value={childrenWithoutBed ?? 0} onChange={(event) => onChildrenWithoutBed?.(Math.max(0, Number(event.target.value) || 0))} /></label></div>}
  </aside>;
}

function AgentConfirmationRail({
  hotelName,
  checkIn,
  checkOut,
  nights,
  adults,
  childrenWithBed,
  childrenWithoutBed,
  rooms,
}: {
  hotelName: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  adults: number;
  childrenWithBed: number;
  childrenWithoutBed: number;
  rooms: number;
}) {
  const totalChildren = childrenWithBed + childrenWithoutBed;

  return <aside className="agentConfirmationRail" aria-label="Confirmed booking summary">
    <span className="agentConfirmationEyebrow">Booking complete</span>
    <h2>Stay summary</h2>
    <div className="agentConfirmationDates">
      <div><span>Check-in</span><strong>{displayDate(checkIn)}</strong></div>
      <div><span>Check-out</span><strong>{displayDate(checkOut)}</strong></div>
    </div>
    <div className="agentConfirmationFacts">
      <span>Nights <b>{nights}</b></span>
      <span>Rooms <b>{rooms}</b></span>
      <span>Adults <b>{adults}</b></span>
      <span>Children <b>{totalChildren}</b></span>
    </div>
    <div className="agentConfirmationHotel"><span>Property</span><strong>{hotelName}</strong></div>
    <p>Your reservation details are ready on this page.</p>
  </aside>;
}

function AgentRoomResults({
  hotels,
  options,
  checkIn,
  checkOut,
  nights,
  busy,
  cartOption,
  expandedRoomTypes,
  onToggleRoom,
  onAddToCart,
}: {
  hotels: Hotel[];
  options: AvailabilityOption[];
  checkIn: string;
  checkOut: string;
  nights: number;
  busy: boolean;
  cartOption: AvailabilityOption | null;
  expandedRoomTypes: Record<string, boolean>;
  onToggleRoom: (key: string) => void;
  onAddToCart: (option: AvailabilityOption) => void;
}) {
  return <section className="agentAbadResults" aria-label="Available rooms">
    {resultHotelIdsFor(options).map((resultHotelId) => {
      const hotel = hotels.find((item) => item.id === resultHotelId);
      const hotelOptions = options.filter((option) => option.hotelId === resultHotelId);
      const roomTypeIds = Array.from(new Set(hotelOptions.map((option) => option.roomTypeId)));
      return <div className="agentAbadHotel" key={resultHotelId}>
        <div className="agentAbadHotelIntro">
          <div>
            <span>{hotel?.city ?? 'RainWood Hotels'}</span>
            <h2>{hotel?.name ?? 'Available rooms'}</h2>
            {hotel?.description && <p>{hotel.description}</p>}
          </div>
          <div className="agentAbadStay"><b>{displayDate(checkIn)} - {displayDate(checkOut)}</b><span>({nights} night{nights === 1 ? '' : 's'})</span></div>
        </div>
        <div className="agentAbadRoomList">
          {roomTypeIds.map((roomTypeId) => {
            const roomOptions = hotelOptions.filter((option) => option.roomTypeId === roomTypeId);
            const primary = roomOptions[0];
            const roomKey = `${resultHotelId}:${roomTypeId}`;
            const expanded = Boolean(expandedRoomTypes[roomKey]);
            const available = Math.max(...roomOptions.map((option) => Number(option.availableRooms ?? 0)));
            return <article className={`agentAbadRoom${expanded ? ' expanded' : ''}`} key={roomKey}>
              <div className="agentAbadRoomHeader">
                <div><strong>{primary.roomType}</strong><span>({available} Available)</span></div>
                <button type="button" className="agentTariffButton" onClick={() => onToggleRoom(roomKey)}>{expanded ? 'Hide Tariff' : 'Show Tariff'}</button>
                <button type="button" className="agentRoomToggle" aria-label={`${expanded ? 'Collapse' : 'Expand'} ${primary.roomType}`} aria-expanded={expanded} onClick={() => onToggleRoom(roomKey)}>{expanded ? '−' : '+'}</button>
              </div>
              {expanded && <div className="agentAbadRoomDetails">
                <div className="agentAbadRoomImage"><AgentHotelImage hotel={hotel} alt={hotel?.images?.[0]?.altText ?? primary.roomType} /></div>
                <div className="agentTariffContent">
                  {roomOptions.map((option) => {
                    const selectedInCart = cartOption?.roomTypeId === option.roomTypeId && cartOption.ratePlanId === option.ratePlanId;
                    const firstNight = option.priceBreakdown[0];
                    const tariffPerDay = Number(firstNight?.baseAmount ?? option.total / Math.max(1, option.nights * option.rooms));
                    return <div className={`agentRateOption${selectedInCart ? ' selected' : ''}`} key={option.ratePlanId}>
                      <div className="agentRateHeading"><b>{option.ratePlan} ({option.mealPlan})</b><span>{option.taxTotal > 0 ? `Taxes: ${money(option.taxTotal)}` : 'Tax included'}</span></div>
                      <div className="agentRateTableWrap"><table className="agentRateTable"><thead><tr><th>Occupancy</th><th>Tariff / Day</th><th>E.Adlt</th><th>E.Chld</th><th>E.Inf</th></tr></thead><tbody><tr><td>Double</td><td>{money(tariffPerDay)}</td><td>—</td><td>—</td><td>—</td></tr></tbody></table></div>
                      <div className="agentOccupancyBlock"><b>Occupancy Chart</b><table className="agentOccupancyTable"><thead><tr><th>Occupancy</th><th>Base Pax</th><th>Extra Pax</th><th>Max Adlt</th><th>Max Chld</th><th>Max Inf</th></tr></thead><tbody><tr><td>Double</td><td>{option.adults}</td><td>{option.children}</td><td>—</td><td>—</td><td>—</td></tr></tbody></table></div>
                      <div className="agentRateFooter"><span>Grand total <b>{money(option.total)}</b></span><button type="button" className={`btn ${selectedInCart ? 'selected' : ''}`} onClick={() => onAddToCart(option)} disabled={busy}>{selectedInCart ? 'Remove' : 'Add'}</button></div>
                    </div>;
                  })}
                </div>
              </div>}
            </article>;
          })}
        </div>
      </div>;
    })}
  </section>;
}

function AgentCheckoutSummary({ selected, checkIn, checkOut, nights, rooms, adults, children, childrenWithBed, childrenWithoutBed, holdTotal, requiredPayment = holdTotal, terms = null, walletBalance, onBack }: { selected: AvailabilityOption; checkIn: string; checkOut: string; nights: number; rooms: number; adults: number; children: number; childrenWithBed: number; childrenWithoutBed: number; holdTotal: number; requiredPayment?: number; terms?: AgentTerms | null; walletBalance: number; onBack: () => void }) {
  const price = aggregatePriceBreakdown(selected);
  return <div className="agentCheckoutSummary">
    <button type="button" className="agentBackButton" onClick={onBack}>← Back</button>
    <h2>Cart Details</h2>
    <div className="agentCartTableWrap"><table className="agentCartTable"><thead><tr><th>Price summary</th><th>Amount</th></tr></thead><tbody><tr><td>Room Charges</td><td>{money(price.roomCharges)}</td></tr>{price.extraGuestCharges > 0 && <tr><td>Extra Guest Charges</td><td>{money(price.extraGuestCharges)}</td></tr>}{price.supplementaryCharges.map((charge) => <tr key={charge.id}><td>{charge.name}</td><td>{money(charge.amount)}</td></tr>)}<tr><td>Tax</td><td>{money(price.tax)}</td></tr></tbody><tfoot><tr><td>Grand total</td><td>{money(holdTotal)}</td></tr></tfoot></table></div>
    <div className="agentPolicySection"><h3>Age Policy</h3><p>Adult: According to hotel policy <span>Child: According to hotel policy</span> <span>Free child: According to hotel policy</span></p></div>
    <div className="agentPolicySection"><h3>Cancellation Policy</h3><p>Free cancellation up to 48 hours before check-in. Later cancellation may attract the first-night charge.</p></div>
    <div className="agentPolicySection"><h3>Payment Milestones</h3><div className="agentMilestoneBadges">{terms?.paymentTerms?.milestones.map((item, index) => <span key={`${item.dueType}-${item.daysBeforeCheckIn}-${index}`} className="status">{paymentMilestoneLabel(item)}</span>)}</div><p>Booking Total: <b>{money(holdTotal)}</b></p><p>Pay Now: <b>{money(requiredPayment)}</b></p><p>Balance: <b>{money(Math.max(0, holdTotal - requiredPayment))}</b></p><p>Future installments are due according to the milestone schedule.</p><p>Wallet Balance: <b>{money(walletBalance)}</b></p><p>Wallet After: <b>{money(Math.max(0, walletBalance - requiredPayment))}</b></p></div>
    <p className="agentStaySummary">Stay: {displayDate(checkIn)} - {displayDate(checkOut)} · {nights} night{nights === 1 ? '' : 's'} · {rooms} room{rooms === 1 ? '' : 's'} · {adults} adults · {childrenWithBed} child with bed · {childrenWithoutBed} child without bed</p>
  </div>;
}

function PublicPriceSummary({ selected, total }: { selected: AvailabilityOption; total: number }) {
  const price = aggregatePriceBreakdown(selected);
  return <dl className="bookingSummary"><div><dt>Room Charges</dt><dd>{money(price.roomCharges)}</dd></div>{price.extraGuestCharges > 0 && <div><dt>Extra Guest Charges</dt><dd>{money(price.extraGuestCharges)}</dd></div>}{price.supplementaryCharges.map((charge) => <div key={charge.id}><dt>{charge.name}</dt><dd>{money(charge.amount)}</dd></div>)}<div><dt>Tax</dt><dd>{money(price.tax)}</dd></div><div><dt>Grand Total</dt><dd>{money(total)}</dd></div></dl>;
}

type GuestUpdater = <K extends keyof GuestForm>(key: K, value: GuestForm[K]) => void;

function AgentGuestForm({ guest, updateGuest, submitGuest, busy, holdExpired, holdTotal, requiredPayment = holdTotal, credit = false, paymentMethod, setPaymentMethod, offlineMode, setOfflineMode, offlineReference, setOfflineReference, offlineProof, setOfflineProof }: { guest: GuestForm; updateGuest: GuestUpdater; submitGuest: (event: FormEvent) => void; busy: boolean; holdExpired: boolean; holdTotal: number; requiredPayment?: number; credit?: boolean; paymentMethod: AgentPaymentMethod; setPaymentMethod: (value: AgentPaymentMethod) => void; offlineMode: OfflinePaymentMode; setOfflineMode: (value: OfflinePaymentMode) => void; offlineReference: string; setOfflineReference: (value: string) => void; offlineProof: File | null; setOfflineProof: (value: File | null) => void }) {
  return <form className="agentAbadGuestForm" onSubmit={submitGuest}>
    <div className="agentGuestHeading"><h2>Guest Details</h2><span>All fields marked * are required</span></div>
    <div className="agentGuestGrid agentGuestGridThree"><label>Salutation *<select value={guest.salutation} onChange={(event) => updateGuest('salutation', event.target.value)}><option>Mr</option><option>Mrs</option><option>Ms</option><option>Dr</option></select></label><label>First Name *<input value={guest.firstName} onChange={(event) => updateGuest('firstName', event.target.value)} autoComplete="given-name" required /></label><label>Last Name *<input value={guest.lastName} onChange={(event) => updateGuest('lastName', event.target.value)} autoComplete="family-name" required /></label></div>
    <div className="agentGuestGrid agentGuestGridThree"><label>Code<select value={guest.countryCode} onChange={(event) => updateGuest('countryCode', event.target.value)}><option>+91</option><option>+971</option><option>+1</option><option>+44</option></select></label><label>Mobile No. *<input value={guest.mobile} onChange={(event) => updateGuest('mobile', event.target.value)} autoComplete="tel" required /></label><label>Email *<input type="email" value={guest.email} onChange={(event) => updateGuest('email', event.target.value)} autoComplete="email" required /></label></div>
    <label>Guest Address *<textarea rows={2} value={guest.address} onChange={(event) => updateGuest('address', event.target.value)} required /></label>
    <div className="agentGuestGrid agentGuestGridTwo"><label>GST / Tax Number (Optional)<input value={guest.gstin} onChange={(event) => updateGuest('gstin', event.target.value)} /></label><label>Bill To Company Name *<input value={guest.companyName} onChange={(event) => updateGuest('companyName', event.target.value)} required /></label></div>
    <div className="agentGuestGrid agentGuestGridTwo"><label>Bill To Company Address *<textarea rows={2} value={guest.billingAddress} onChange={(event) => updateGuest('billingAddress', event.target.value)} required /></label><label>Internal Notes <span className="agentOptionalLabel">(Not visible to hotel)</span><textarea rows={2} value={guest.internalRemark} onChange={(event) => updateGuest('internalRemark', event.target.value)} /></label></div>
    <div className="agentGuestGrid agentGuestGridTwo"><label>Mail Message<textarea rows={2} value={guest.mailMessage} onChange={(event) => updateGuest('mailMessage', event.target.value)} /></label><label>Reference No. (If any)<input value={guest.referenceNo} onChange={(event) => updateGuest('referenceNo', event.target.value)} /></label></div>
    <label className="checkLabel agentPolicyCheck"><input type="checkbox" checked={guest.agree} onChange={(event) => updateGuest('agree', event.target.checked)} required /> I agree to the hotel booking and cancellation policies</label>
    <fieldset className="agentPaymentChoice"><legend>Payment method</legend><label><input type="radio" name="agent-payment-method" checked={paymentMethod === 'RAZORPAY'} disabled={requiredPayment <= 0.005} onChange={() => setPaymentMethod('RAZORPAY')} /> Pay Online{requiredPayment <= 0.005 ? ' (nothing due now)' : ''}</label><label><input type="radio" name="agent-payment-method" checked={paymentMethod === 'OFFLINE'} disabled={requiredPayment <= 0.005} onChange={() => setPaymentMethod('OFFLINE')} /> Offline payment{requiredPayment <= 0.005 ? ' (nothing due now)' : ''}</label><label><input type="radio" name="agent-payment-method" checked={paymentMethod === 'WALLET'} onChange={() => setPaymentMethod('WALLET')} /> Wallet</label></fieldset>
    {paymentMethod === 'OFFLINE' && <div className="agentOfflinePayment"><p>Pay by UPI, bank transfer, or cheque and submit the proof. The booking will remain pending until an admin approves it.</p><div className="agentGuestGrid agentGuestGridTwo"><label>Payment mode<select value={offlineMode} onChange={(event) => setOfflineMode(event.target.value as OfflinePaymentMode)}><option value="UPI">UPI</option><option value="BANK_TRANSFER">Bank transfer</option><option value="CHEQUE">Cheque</option></select></label><label>Transaction / cheque reference<input value={offlineReference} onChange={(event) => setOfflineReference(event.target.value)} placeholder="Optional reference" /></label></div><label>Payment screenshot or proof *<input type="file" accept="image/png,image/jpeg,application/pdf" required onChange={(event) => setOfflineProof(event.target.files?.[0] ?? null)} /><small>PNG, JPEG, or PDF up to 5 MB.</small></label></div>}
    <div className="agentPayBar"><span>{paymentMethod === 'OFFLINE' ? 'Submit for approval' : 'Pay now'} <b>{money(requiredPayment)}</b> · Balance <b>{money(Math.max(0, holdTotal - requiredPayment))}</b></span><button className="btn" disabled={busy}>{busy ? 'Submitting...' : paymentMethod === 'OFFLINE' ? 'Submit proof for approval' : paymentMethod === 'RAZORPAY' ? `Confirm booking · Pay ${money(requiredPayment)}` : credit ? 'Confirm booking on credit' : `Confirm booking · Pay ${money(requiredPayment)}`}</button></div>
  </form>;
}

export function BookingFlow({ agentMode = false }: { agentMode?: boolean } = {}) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [catalogHotels, setCatalogHotels] = useState<Hotel[]>([]);
  const [agentEligibleHotelKeys, setAgentEligibleHotelKeys] = useState<string[]>([]);
  const [rateBookLoading, setRateBookLoading] = useState(agentMode);
  const [hotelId, setHotelId] = useState('');
  const [checkIn, setCheckIn] = useState(dateInDays(1));
  const [checkOut, setCheckOut] = useState(dateInDays(2));
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);
  const [childrenWithBed, setChildrenWithBed] = useState(0);
  const [childrenWithoutBed, setChildrenWithoutBed] = useState(0);
  const [rooms, setRooms] = useState(1);
  const [options, setOptions] = useState<AvailabilityOption[]>([]);
  const [hotelSelections, setHotelSelections] = useState<Record<string, { roomTypeId: string; ratePlanId: string }>>({});
  const [cartOption, setCartOption] = useState<AvailabilityOption | null>(null);
  const [expandedRoomTypes, setExpandedRoomTypes] = useState<Record<string, boolean>>({});
  const [selected, setSelected] = useState<AvailabilityOption | null>(null);
  const [hold, setHold] = useState<Hold | null>(null);
  const [holdRemainingMs, setHoldRemainingMs] = useState(0);
  const [holdExpired, setHoldExpired] = useState(false);
  const [reservation, setReservation] = useState<ReservationSummary | null>(null);
  const [paymentOrder, setPaymentOrder] = useState<PaymentOrder | null>(null);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [agentTerms, setAgentTerms] = useState<AgentTerms | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<AgentPaymentMethod>('RAZORPAY');
  const [offlineMode, setOfflineMode] = useState<OfflinePaymentMode>('UPI');
  const [offlineReference, setOfflineReference] = useState('');
  const [offlineProof, setOfflineProof] = useState<File | null>(null);
  const [guest, setGuest] = useState<GuestForm>(initialGuest);
  const [step, setStep] = useState<Step>(agentMode ? 'hotels' : 'search');
  const stepRef = useRef<Step>(agentMode ? 'hotels' : 'search');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [hotelPickerOpen, setHotelPickerOpen] = useState(false);
  const autoOpenedPaymentRef = useRef<string | null>(null);

  useEffect(() => {
    stepRef.current = step;
  }, [step]);

  useEffect(() => {
    apiRequest<Hotel[]>('/hotels').then((items) => {
      setCatalogHotels(items);
      const requestedSearch = parseBookingSearch(params);
      const requestedSlug = requestedSearch.hotel;
      const requestedHotel = requestedSlug ? items.find((item) => item.slug === requestedSlug) : undefined;
      setHotelId(requestedHotel?.id ?? '');
      setCheckIn(requestedSearch.checkIn);
      setCheckOut(requestedSearch.checkOut);
      setAdults(requestedSearch.adults);
      setChildren(requestedSearch.children);
      setChildrenWithBed(requestedSearch.childrenWithBed ?? 0);
      setChildrenWithoutBed(requestedSearch.childrenWithoutBed ?? 0);
      setRooms(requestedSearch.rooms);
      if (agentMode && requestedHotel && stepRef.current === 'hotels') setStep('search');
    }).catch((reason: Error) => setError(reason.message));
  }, [params]);

  useEffect(() => {
    if (!agentMode || !checkIn || !checkOut || checkOut <= checkIn) return;
    let active = true;
    const query = new URLSearchParams({ view: 'rate-book', from: checkIn, to: checkOut });
    setRateBookLoading(true);
    setError('');
    apiRequest<AgentRateBook>(`/reservations/mine/rate-plans?${query.toString()}`)
      .then((payload) => {
        if (!active) return;
        const eligibleKeys = eligibleRateBookHotelKeys(payload);
        setAgentEligibleHotelKeys(eligibleKeys);
        const selected = catalogHotels.find((hotel) => hotel.id === hotelId);
        if (selected && !eligibleKeys.includes(hotelIdentity(selected))) {
          setHotelId('');
          setOptions([]);
          setSelected(null);
          setCartOption(null);
          setExpandedRoomTypes({});
          if (stepRef.current !== 'confirmation' && stepRef.current !== 'hotels') setStep('hotels');
        }
      })
      .catch((reason: Error) => {
        if (active) {
          setAgentEligibleHotelKeys([]);
          setError(reason.message);
        }
      })
      .finally(() => { if (active) setRateBookLoading(false); });
    return () => { active = false; };
  }, [agentMode, catalogHotels, checkIn, checkOut, hotelId]);

  useEffect(() => {
    if (!agentMode) return;
    apiRequest<Wallet>('/wallet').then(setWallet).catch((reason: Error) => setError(reason.message));
    apiRequest<AgentTerms>('/agents/me/profile').then(setAgentTerms).catch((reason: Error) => setError(reason.message));
  }, [agentMode]);

  useEffect(() => {
    if (!hold) { setHoldRemainingMs(0); return; }
    const update = () => {
      const remaining = new Date(hold.expiresAt).getTime() - Date.now();
      setHoldRemainingMs(Math.max(0, remaining));
      if (remaining <= 0) setHoldExpired(true);
    };
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [hold]);

  const hotels = useMemo(() => agentMode ? catalogHotels.filter((hotel) => agentEligibleHotelKeys.includes(hotelIdentity(hotel))) : catalogHotels, [agentEligibleHotelKeys, agentMode, catalogHotels]);
  const selectedHotel = useMemo(() => hotels.find((hotel) => hotel.id === hotelId), [hotelId, hotels]);
  const resultHotelIds = useMemo(() => resultHotelIdsFor(options), [options]);
  const holdTotal = hold?.lines.reduce((total, line) => total + Number(line.quotedTotal), 0) ?? Number(selected?.total ?? 0);
  const walletBalance = Number(wallet?.balance ?? 0);
  const requiredPayment = agentMode ? dueNowForAgentBooking(holdTotal, checkIn, agentTerms?.paymentTerms?.milestones) : holdTotal;
  const holdClock = `${String(Math.floor(holdRemainingMs / 60000)).padStart(2, '0')}:${String(Math.floor((holdRemainingMs % 60000) / 1000)).padStart(2, '0')}`;
  const nights = selected?.nights ?? Math.max(1, Math.round((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86_400_000));

  function openHotelPicker() {
    setHotelPickerOpen(true);
  }

  function selectHotel(selectedId: string) {
    setHotelPickerOpen(false);
    setHotelId(selectedId);
    setOptions([]);
    setSelected(null);
    setHold(null);
    setCartOption(null);
    setExpandedRoomTypes({});
    setStep('search');
  }

  function resetSearchResults() {
    setOptions([]);
    setHotelSelections({});
    setSelected(null);
    setHold(null);
    setCartOption(null);
    setExpandedRoomTypes({});
    if (agentMode && stepRef.current !== 'hotels' && stepRef.current !== 'confirmation') setStep('search');
  }

  function updateCheckIn(value: string) {
    const nextCheckOut = checkOut <= value ? nextDate(value) : checkOut;
    setCheckIn(value);
    setCheckOut(nextCheckOut);
    resetSearchResults();
  }

  function updateCheckOut(value: string) {
    setCheckOut(value < nextDate(checkIn) ? nextDate(checkIn) : value);
    resetSearchResults();
  }

  function updateNights(value: number) {
    setCheckOut(dateAfterNights(checkIn, value));
    resetSearchResults();
  }

  async function searchBooking() {
    setError(''); setBusy(true);
    try {
      const validationError = validateSearchInput({ checkIn, checkOut, adults, children, childrenWithBed: agentMode ? childrenWithBed : undefined, childrenWithoutBed: agentMode ? childrenWithoutBed : undefined, rooms });
      if (validationError) throw new Error(validationError);
      if (agentMode && !hotelId) throw new Error('Select a hotel with published rates before searching.');
      const query = new URLSearchParams({ checkIn, checkOut, adults: String(adults), children: String(children), rooms: String(rooms) });
      if (agentMode) {
        query.set('childrenWithBed', String(childrenWithBed));
        query.set('childrenWithoutBed', String(childrenWithoutBed));
      }
      if (hotelId) query.set('hotelId', hotelId);
      const canonicalSearch = serializeBookingSearch({ hotel: selectedHotel?.slug, checkIn, checkOut, adults, children, childrenWithBed: agentMode ? childrenWithBed : undefined, childrenWithoutBed: agentMode ? childrenWithoutBed : undefined, rooms });
      router.replace(`${pathname}?${canonicalSearch.toString()}`, { scroll: false });
      const nextOptions = await apiRequest<AvailabilityOption[]>(`/availability/search?${query}`);
      setOptions(nextOptions);
      setHotelSelections(Object.fromEntries(resultHotelIdsFor(nextOptions).map((resultHotelId) => {
        const first = nextOptions.find((option) => option.hotelId === resultHotelId)!;
        return [resultHotelId, { roomTypeId: first.roomTypeId, ratePlanId: first.ratePlanId }];
      })));
      setSelected(null); setHold(null); setCartOption(null); setExpandedRoomTypes({}); setStep('room');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Availability search failed'); }
    finally { setBusy(false); }
  }

  function search(event: FormEvent) {
    event.preventDefault();
    void searchBooking();
  }

  async function createHold(option: AvailabilityOption) {
    setError('');
    setBusy(true);
    try {
      const created = await apiRequest<Hold>('/holds', { method: 'POST', body: JSON.stringify({ hotelId: option.hotelId, roomTypeId: option.roomTypeId, ratePlanId: option.ratePlanId, checkIn, checkOut, adults, children, ...(agentMode ? { childrenWithBed, childrenWithoutBed } : {}), rooms }) });
      setSelected(option); setHold(created); setHoldExpired(false); setStep('guest');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not hold inventory'); }
    finally { setBusy(false); }
  }

  function toggleCartOption(option: AvailabilityOption) {
    setCartOption((current) => current?.roomTypeId === option.roomTypeId && current.ratePlanId === option.ratePlanId ? null : option);
  }

  async function recheckAvailability() {
    setHold(null); setHoldExpired(false); setSelected(null); setCartOption(null); setStep('search'); setError('');
    await searchBooking();
  }

  function toggleRoom(roomKey: string) {
    setExpandedRoomTypes((current) => ({ ...current, [roomKey]: !current[roomKey] }));
  }

  async function submitGuest(event: FormEvent) {
    event.preventDefault(); if (!hold || holdExpired) { setError('Your temporary hold expired. Search again to see current availability.'); return; }
    if (!guest.agree) { setError('Please confirm the hotel booking and cancellation policies.'); return; }
    if (agentMode && paymentMethod !== 'WALLET' && requiredPayment <= 0.005) { setError('There is no payment due at booking. Use the wallet or credit option.'); return; }
    if (agentMode && paymentMethod === 'OFFLINE' && !offlineProof) { setError('Upload the payment screenshot or proof before submitting for approval.'); return; }
    setError(''); setBusy(true);
    try {
      const billing = [guest.companyName && `Bill to company: ${guest.companyName}`, guest.billingAddress && `Billing address: ${guest.billingAddress}`, agentMode && guest.referenceNo && `Agent reference: ${guest.referenceNo}`].filter(Boolean).join('\n');
      const internal = agentMode ? [guest.internalRemark, guest.mailMessage && `Mail message: ${guest.mailMessage}`].filter(Boolean).join('\n') : '';
      const created = await apiRequest<{ reference: string }>(`/reservations/from-hold/${encodeURIComponent(hold.token)}`, {
        method: 'POST',
        body: JSON.stringify({
          guestName: fullGuestName(guest), email: guest.email, mobile: `${guest.countryCode} ${guest.mobile}`.trim(),
          address: guest.address, gstin: guest.gstin, billingInstruction: billing || undefined,
          internalRemark: internal || undefined, source: agentMode ? 'AGENT' : 'WEBSITE', offlinePayment: agentMode && paymentMethod === 'OFFLINE' ? true : undefined, onlinePayment: agentMode && paymentMethod === 'RAZORPAY' ? true : undefined,
        }),
      });
      if (agentMode && paymentMethod === 'OFFLINE') {
        const fileBody = new FormData();
        fileBody.append('file', offlineProof!);
        const stored = await apiRequest<{ id: string }>('/files/payment-proof', { method: 'POST', body: fileBody });
        await apiRequest(`/payments/${encodeURIComponent(created.reference)}/offline`, { method: 'POST', body: JSON.stringify({ amount: requiredPayment, mode: offlineMode, reference: offlineReference.trim() || undefined, proofFileId: stored.id }) });
      }
      const loaded = await apiRequest<ReservationSummary>(`/reservations/${encodeURIComponent(created.reference)}`);
      setReservation(loaded);
      if (agentMode && paymentMethod === 'RAZORPAY') {
        if (requiredPayment <= 0.005) throw new Error('There is no payment due at booking.');
        const order = await apiRequest<PaymentOrder>(`/payments/${encodeURIComponent(created.reference)}/order`, { method: 'POST', headers: { 'idempotency-key': `agent:${created.reference}:${crypto.randomUUID()}` }, body: JSON.stringify({ amount: requiredPayment }) });
        setPaymentOrder(order);
        setStep('payment');
      } else if (agentMode) {
        setWallet(await apiRequest<Wallet>('/wallet'));
        setStep('confirmation');
      } else if (Number(loaded.balanceAmount) <= 0 || loaded.paymentStatus === 'PAID') setStep('confirmation');
      else {
        const order = await apiRequest<PaymentOrder>(`/payments/${encodeURIComponent(created.reference)}/order`, { method: 'POST', headers: { 'idempotency-key': `web:${created.reference}:${crypto.randomUUID()}` } });
        setPaymentOrder(order);
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

  async function completeRazorpayPayment() {
    if (!reservation || !paymentOrder) return;
    setError(''); setBusy(true);
    try {
      const key = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
      if (!key) throw new Error('Razorpay public key is not configured');
      await loadRazorpayCheckout();
      const Razorpay = window.Razorpay;
      if (!Razorpay) throw new Error('Razorpay Checkout is unavailable');
      const checkout = new Razorpay({
        key,
        amount: paymentOrder.amount,
        currency: paymentOrder.currency,
        name: 'RainWood Hotels',
        description: `Reservation ${reservation.reference}`,
        order_id: paymentOrder.order_id || paymentOrder.providerOrderId,
        prefill: { name: reservation.guestName, email: guest.email, contact: guest.mobile },
        handler: (response: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }) => {
          void (async () => {
            try {
              setBusy(true);
              await apiRequest(`/payments/${encodeURIComponent(reservation.reference)}/verify`, { method: 'POST', body: JSON.stringify(response) });
              setReservation(await apiRequest<ReservationSummary>(`/reservations/${encodeURIComponent(reservation.reference)}`));
              setStep('confirmation');
            } catch (reason) {
              setError(reason instanceof Error ? reason.message : 'Could not verify payment');
            } finally {
              setBusy(false);
            }
          })();
        },
        modal: { ondismiss: () => { setBusy(false); setError('Payment checkout was cancelled. You can try again.'); } },
      }) as unknown as { open: () => void; on: (event: string, handler: (response: any) => void) => void };
      checkout.on('payment.failed', (response: any) => {
        setBusy(false);
        setError(String(response?.error?.description ?? 'Razorpay payment failed. Please try again.'));
      });
      checkout.open();
      setBusy(false);
    } catch (reason) {
      setBusy(false);
      setError(reason instanceof Error ? reason.message : 'Could not open Razorpay Checkout');
    }
  }

  useEffect(() => {
    if (!agentMode || step !== 'payment' || paymentMethod !== 'RAZORPAY' || !reservation || !paymentOrder) return;
    const paymentKey = `${reservation.reference}:${paymentOrder.order_id || paymentOrder.providerOrderId}`;
    if (autoOpenedPaymentRef.current === paymentKey) return;
    autoOpenedPaymentRef.current = paymentKey;
    void completeRazorpayPayment();
  }, [agentMode, paymentMethod, paymentOrder, reservation, step]);

  function updateGuest<K extends keyof GuestForm>(key: K, value: GuestForm[K]) {
    setGuest((current) => ({ ...current, [key]: value }));
  }

  const steps = agentMode ? [['search', 'Search'], ['room', 'Room'], ['guest', 'Guest'], ['payment', 'Payment'], ['confirmation', 'Confirmation']] : [['search', 'Search'], ['room', 'Room'], ['guest', 'Guest'], ['payment', 'Payment'], ['confirmation', 'Confirmation']];

  if (step === 'guest' && hold && selected && !agentMode) {
    return <div className="page bookingWorkspace publicBookingFlow">
      <div className="pageTitle public"><span>Secure direct reservation</span><h1>Book your stay</h1><p>{selectedHotel?.name ?? 'RainWood Hotels'}</p></div>
      <ol className="steps horizontal" aria-label="Booking progress">{steps.map(([value, label]) => <li className={step === value ? 'active' : ''} key={value}>{label}</li>)}</ol>
      <section className="bookingCheckoutGrid"><aside className="formCard bookingCart"><div className="rangeSectionHeader"><div><span className="eyebrow">Cart details</span><h2>{selected.roomType}</h2></div><span className={`status ${holdExpired ? 'error' : 'ok'}`}>{holdExpired ? 'Expired' : 'Held'}</span></div><p className="mutedText">{selected.ratePlan} · {selected.mealPlan}</p><div className="bookingSummary"><div><span>Stay</span><b>{checkIn} to {checkOut} ({nights} night{nights === 1 ? '' : 's'})</b></div><div><span>Rooms / guests</span><b>{rooms} room{rooms === 1 ? '' : 's'} · {adults} adults · {children} children</b></div><PublicPriceSummary selected={selected} total={holdTotal} /></div>{holdExpired ? <div className="holdExpiredNotice" role="alert"><strong>Your room hold has expired.</strong><p>Availability may have changed while you were entering guest details.</p><button type="button" className="btn" onClick={() => void recheckAvailability()}>Recheck availability</button></div> : <p className={`notice ${holdRemainingMs < 120000 ? 'warning' : ''}`}>Your room is held for {holdClock}.</p>}</aside><form className="formCard bookingGuestForm" onSubmit={submitGuest}><div className="rangeSectionHeader"><div><span className="eyebrow">Guest details</span><h2>Complete reservation</h2></div><span>Pay at confirmation</span></div><div className="three"><label>Salutation<select value={guest.salutation} onChange={(event) => updateGuest('salutation', event.target.value)}><option>Mr</option><option>Mrs</option><option>Ms</option><option>Dr</option></select></label><label>First name<input value={guest.firstName} onChange={(event) => updateGuest('firstName', event.target.value)} autoComplete="given-name" required /></label><label>Last name<input value={guest.lastName} onChange={(event) => updateGuest('lastName', event.target.value)} autoComplete="family-name" required /></label></div><div className="two"><label>Mobile number<div className="phoneInput"><input className="phoneCode" value={guest.countryCode} onChange={(event) => updateGuest('countryCode', event.target.value)} aria-label="Country code" required /><input value={guest.mobile} onChange={(event) => updateGuest('mobile', event.target.value)} autoComplete="tel" required /></div></label><label>Email address<input type="email" value={guest.email} onChange={(event) => updateGuest('email', event.target.value)} autoComplete="email" required /></label></div><label>Guest address<textarea rows={2} value={guest.address} onChange={(event) => updateGuest('address', event.target.value)} /></label><div className="two"><label>GST / tax number<input value={guest.gstin} onChange={(event) => updateGuest('gstin', event.target.value)} /></label><label>Bill to company<input value={guest.companyName} onChange={(event) => updateGuest('companyName', event.target.value)} /></label></div><label>Billing address<textarea rows={2} value={guest.billingAddress} onChange={(event) => updateGuest('billingAddress', event.target.value)} /></label><label className="checkLabel"><input type="checkbox" checked={guest.agree} onChange={(event) => updateGuest('agree', event.target.checked)} required /> I agree to the hotel booking and cancellation policies</label><button className="btn full" disabled={busy || holdExpired}>{holdExpired ? 'Hold expired' : busy ? 'Confirming...' : 'Review and continue to payment'}</button></form></section>
    </div>;
  }
  return <div className={`page bookingWorkspace${agentMode ? ' agentBookingFlow' : ' publicBookingFlow'}`}>
    <div className="pageTitle public"><span>{agentMode ? 'Partner reservation desk' : 'Secure direct reservation'}</span><h1>{agentMode ? 'Create agent booking' : 'Book your stay'}</h1><p>{selectedHotel?.name ?? (agentMode ? 'Search assigned rates, add guest details and confirm against your wallet.' : 'Live availability, transparent pricing and confirmation in one flow.')}</p></div>
    {agentMode && <div className="agentBookingWallet"><div><span>Available wallet balance</span><strong>{wallet ? money(walletBalance) : 'Loading...'}</strong></div><a className="smallBtn" href="/agent/wallet">Recharge wallet</a></div>}
    {step !== 'hotels' && <ol className="steps horizontal" aria-label="Booking progress">{steps.map(([value, label]) => <li className={step === value ? 'active' : ''} key={value}>{label}</li>)}</ol>}
    {error && <p className="error" role="alert">{error}</p>}
    {agentMode && step !== 'confirmation' && step !== 'search' && step !== 'hotels' && <AgentBookingRail checkIn={checkIn} checkOut={checkOut} nights={nights} adults={adults} children={children} childrenWithBed={childrenWithBed} childrenWithoutBed={childrenWithoutBed} rooms={rooms} onCheckIn={updateCheckIn} onCheckOut={updateCheckOut} onNights={updateNights} onAdults={setAdults} onChildren={setChildren} onChildrenWithBed={(value) => { setChildrenWithBed(value); setChildren(childrenWithoutBed + value); }} onChildrenWithoutBed={(value) => { setChildrenWithoutBed(value); setChildren(childrenWithBed + value); }} onRooms={setRooms} onBook={() => { if (step === 'room') { if (cartOption) void createHold(cartOption); else setError('Select a room tariff before booking.'); } else void searchBooking(); }} onShowTariff={() => { if (options.length) setStep('room'); else void searchBooking(); }} onChangeHotel={step === 'room' ? openHotelPicker : undefined} />}
    {agentMode && step === 'confirmation' && reservation && <AgentConfirmationRail hotelName={reservation.hotel.name} checkIn={reservation.checkIn.slice(0, 10)} checkOut={reservation.checkOut.slice(0, 10)} nights={nights} adults={adults} childrenWithBed={childrenWithBed} childrenWithoutBed={childrenWithoutBed} rooms={rooms} />}
    {step === 'hotels' && agentMode && <AgentHotelSelection hotels={hotels} loading={rateBookLoading} onSelect={selectHotel} />}
    {agentMode && hotelPickerOpen && <div className="agentHotelModalBackdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setHotelPickerOpen(false); }}><section className="agentHotelModal" role="dialog" aria-modal="true" aria-labelledby="agent-change-hotel-title"><div className="agentHotelModalHeader"><h2 id="agent-change-hotel-title">Change hotel</h2><button type="button" aria-label="Close change hotel" onClick={() => setHotelPickerOpen(false)}>×</button></div><AgentHotelSelection hotels={hotels} loading={rateBookLoading} onSelect={selectHotel} /></section></div>}
    {step === 'search' && agentMode && <div className="agentSearchLayout"><AgentBookingRail checkIn={checkIn} checkOut={checkOut} nights={nights} adults={adults} children={children} childrenWithBed={childrenWithBed} childrenWithoutBed={childrenWithoutBed} rooms={rooms} onCheckIn={updateCheckIn} onCheckOut={updateCheckOut} onNights={updateNights} onAdults={setAdults} onChildren={setChildren} onChildrenWithBed={(value) => { setChildrenWithBed(value); setChildren(childrenWithoutBed + value); }} onChildrenWithoutBed={(value) => { setChildrenWithoutBed(value); setChildren(childrenWithBed + value); }} onRooms={setRooms} onBook={() => void searchBooking()} onShowTariff={() => void searchBooking()} onChangeHotel={openHotelPicker} /><section className="agentHotelIntro"><span>Selected property</span><h2>{selectedHotel?.name ?? 'Choose your hotel'}</h2><p>{selectedHotel?.city ?? 'Select a property and stay dates from the booking rail.'}</p><p className="agentHotelIntroHint">Select dates and occupancy, then use Book or Show Tariff to check assigned availability.</p></section></div>}
    {step === 'search' && !agentMode && <div className="publicBookingSearchLayout"><AgentBookingRail publicMode hotelId={hotelId} hotels={hotels} onHotelChange={setHotelId} checkIn={checkIn} checkOut={checkOut} nights={nights} adults={adults} children={children} rooms={rooms} onCheckIn={(value) => { const nextValue = value < dateInDays(0) ? dateInDays(0) : value; setCheckIn(nextValue); if (checkOut <= nextValue) setCheckOut(nextDate(nextValue)); }} onCheckOut={(value) => setCheckOut(value < nextDate(checkIn) ? nextDate(checkIn) : value)} onNights={(value) => setCheckOut(dateAfterNights(checkIn, value))} onAdults={setAdults} onChildren={setChildren} onRooms={setRooms} onBook={() => void searchBooking()} onShowTariff={() => void searchBooking()} /><section className="agentHotelIntro publicBookingIntro"><span>Direct booking</span><h2>{selectedHotel?.name ?? 'Choose your hotel'}</h2><p>{selectedHotel?.city ?? 'Select a hotel and stay dates to continue.'}</p><p className="agentHotelIntroHint">Your room options, live availability and final price will appear here after you search.</p></section></div>}
    {step === 'room' && agentMode && (options.length === 0 ? <section className="agentRoomResultsEmpty"><p className="empty">No room plan is available for those dates. Try different dates or occupancy.</p></section> : <><AgentRoomResults hotels={hotels} options={options} checkIn={checkIn} checkOut={checkOut} nights={nights} busy={busy} cartOption={cartOption} expandedRoomTypes={expandedRoomTypes} onToggleRoom={toggleRoom} onAddToCart={toggleCartOption} />{cartOption && <div className="agentBookingCartBar"><div><span>Selected room</span><strong>{cartOption.roomType} · {cartOption.ratePlan}</strong></div><div><span>Total</span><strong>{money(cartOption.total)}</strong></div><button type="button" className="btn" onClick={() => void createHold(cartOption)} disabled={busy}>{busy ? 'Holding...' : 'Add to Cart'}</button></div>}</>)}
    {step === 'room' && <section className="bookingResults"><div className="sectionHead left"><span>{checkIn} to {checkOut} · {nights} night{nights === 1 ? '' : 's'}</span><h2>Choose a room and rate</h2><p>{agentMode ? 'Rates shown are limited to your active agent assignments.' : 'Select a room type and meal plan to continue your booking.'}</p></div>{options.length === 0 ? <p className="empty">No room plan is available for those dates. Try different dates or occupancy.</p> : <div className="bookingRoomGrid">{resultHotelIds.map((resultHotelId) => { const hotel = hotels.find((item) => item.id === resultHotelId); const hotelOptions = options.filter((option) => option.hotelId === resultHotelId); const roomChoices = Array.from(new Map(hotelOptions.map((option) => [option.roomTypeId, option])).values()); const selection = hotelSelections[resultHotelId] ?? { roomTypeId: roomChoices[0]?.roomTypeId ?? '', ratePlanId: roomChoices[0]?.ratePlanId ?? '' }; const rateChoices = Array.from(new Map(hotelOptions.filter((option) => option.roomTypeId === selection.roomTypeId).map((option) => [option.ratePlanId, option])).values()); const selectedOption = hotelOptions.find((option) => option.roomTypeId === selection.roomTypeId && option.ratePlanId === selection.ratePlanId) ?? rateChoices[0] ?? hotelOptions[0]; const setSelection = (next: { roomTypeId: string; ratePlanId: string }) => setHotelSelections((current) => ({ ...current, [resultHotelId]: next })); return <article className="bookingRoomCard" key={resultHotelId}><div className="bookingRoomImage"><AgentHotelImage hotel={hotel} alt={hotel?.images?.[0]?.altText ?? hotel?.name ?? 'RainWood Hotels'} /></div><div className="bookingRoomBody"><span className="bookingRoomCity">{hotel?.city}</span><h3>{hotel?.name}</h3><p className="bookingRoomHotel">{selectedOption.roomType}</p><div className="bookingRoomSelectors"><label>Room type<select value={selection.roomTypeId} onChange={(event) => { const nextRoomTypeId = event.target.value; const nextRate = hotelOptions.find((option) => option.roomTypeId === nextRoomTypeId); setSelection({ roomTypeId: nextRoomTypeId, ratePlanId: nextRate?.ratePlanId ?? '' }); }}>{roomChoices.map((option) => <option key={option.roomTypeId} value={option.roomTypeId}>{option.roomType}</option>)}</select></label><label>Rate / meal plan<select value={selection.ratePlanId} onChange={(event) => setSelection({ ...selection, ratePlanId: event.target.value })}>{rateChoices.map((option) => <option key={option.ratePlanId} value={option.ratePlanId}>{option.ratePlan} · {option.mealPlan}</option>)}</select></label></div><div className="bookingRoomMeta"><span>Available {selectedOption.availableRooms ?? ' - '}</span><strong>{selectedOption.mealPlan}</strong><span>{selectedOption.rooms} room{selectedOption.rooms === 1 ? '' : 's'}</span><span>{selectedOption.adults} adult{selectedOption.adults === 1 ? '' : 's'}</span></div><div className="bookingRoomRate"><div><small>Grand total</small><strong>{money(selectedOption.total)}</strong><span>Taxes: {money(selectedOption.taxTotal)}</span></div><button type="button" className="btn" onClick={() => void createHold(selectedOption)} disabled={busy}>{busy ? 'Holding...' : agentMode ? 'Add to cart' : 'Book this room'}</button></div></div></article>; })}</div>}</section>}
    {step === 'guest' && hold && !agentMode && <section className="bookingCheckoutGrid"><aside className="formCard bookingCart"><div className="rangeSectionHeader"><div><span className="eyebrow">Cart details</span><h2>{selected?.roomType}</h2></div><span className={`status ${holdExpired ? 'error' : 'ok'}`}>{holdExpired ? 'Expired' : 'Held'}</span></div><p className="mutedText">{selected?.ratePlan} · {selected?.mealPlan}</p><div className="bookingSummary"><div><span>Stay</span><b>{checkIn} to {checkOut} ({nights} night{nights === 1 ? '' : 's'})</b></div><div><span>Rooms / guests</span><b>{rooms} room{rooms === 1 ? '' : 's'} · {adults} adults · {children} children</b></div>{selected && <PublicPriceSummary selected={selected} total={holdTotal} />}</div>{holdExpired ? <div className="holdExpiredNotice" role="alert"><strong>Your room hold has expired.</strong><p>Availability may have changed while you were entering guest details.</p><button type="button" className="btn" onClick={() => void recheckAvailability()}>Recheck availability</button></div> : <p className={`notice ${holdRemainingMs < 120000 ? 'warning' : ''}`}>Your room is held for {holdClock}.</p>}</aside><form className="formCard bookingGuestForm" onSubmit={submitGuest}><div className="rangeSectionHeader"><div><span className="eyebrow">Guest details</span><h2>Complete reservation</h2></div><span>Pay at confirmation</span></div><div className="three"><label>Salutation<select value={guest.salutation} onChange={(event) => updateGuest('salutation', event.target.value)}><option>Mr</option><option>Mrs</option><option>Ms</option><option>Dr</option></select></label><label>First name<input value={guest.firstName} onChange={(event) => updateGuest('firstName', event.target.value)} autoComplete="given-name" required /></label><label>Last name<input value={guest.lastName} onChange={(event) => updateGuest('lastName', event.target.value)} autoComplete="family-name" required /></label></div><div className="two"><label>Mobile number<div className="phoneInput"><input className="phoneCode" value={guest.countryCode} onChange={(event) => updateGuest('countryCode', event.target.value)} aria-label="Country code" required /><input value={guest.mobile} onChange={(event) => updateGuest('mobile', event.target.value)} autoComplete="tel" required /></div></label><label>Email address<input type="email" value={guest.email} onChange={(event) => updateGuest('email', event.target.value)} autoComplete="email" required /></label></div><label>Guest address<textarea rows={2} value={guest.address} onChange={(event) => updateGuest('address', event.target.value)} /></label><div className="two"><label>GST / tax number<input value={guest.gstin} onChange={(event) => updateGuest('gstin', event.target.value)} /></label><label>Bill to company<input value={guest.companyName} onChange={(event) => updateGuest('companyName', event.target.value)} /></label></div><label>Billing address<textarea rows={2} value={guest.billingAddress} onChange={(event) => updateGuest('billingAddress', event.target.value)} /></label><label className="checkLabel"><input type="checkbox" checked={guest.agree} onChange={(event) => updateGuest('agree', event.target.checked)} required /> I agree to the hotel booking and cancellation policies</label><button className="btn full" disabled={busy || holdExpired}>{holdExpired ? 'Hold expired' : busy ? 'Confirming...' : 'Review and continue to payment'}</button></form></section>}
    {step === 'guest' && hold && selected && agentMode && <section className="agentAbadCheckout"><AgentCheckoutSummary selected={selected} checkIn={checkIn} checkOut={checkOut} nights={nights} rooms={rooms} adults={adults} children={children} childrenWithBed={childrenWithBed} childrenWithoutBed={childrenWithoutBed} holdTotal={holdTotal} requiredPayment={requiredPayment} terms={agentTerms} walletBalance={walletBalance} onBack={() => setStep('room')} /><AgentGuestForm guest={guest} updateGuest={updateGuest} submitGuest={submitGuest} busy={busy} holdExpired={holdExpired} holdTotal={holdTotal} requiredPayment={requiredPayment} credit={requiredPayment === 0} paymentMethod={paymentMethod} setPaymentMethod={setPaymentMethod} offlineMode={offlineMode} setOfflineMode={setOfflineMode} offlineReference={offlineReference} setOfflineReference={setOfflineReference} offlineProof={offlineProof} setOfflineProof={setOfflineProof} /></section>}
    {step === 'payment' && reservation && paymentOrder && <section className={`formCard paymentStep${agentMode ? ' agentPaymentStep' : ''}`} aria-labelledby="payment-step-title"><div className="paymentStepHeader"><span className="eyebrow">Secure checkout</span><h2 id="payment-step-title">Complete your reservation</h2><p>{agentMode && paymentOrder.provider === 'RAZORPAY' ? 'Razorpay checkout opens automatically. Your booking is confirmed after the payment is verified.' : <>Secure payment for reservation <b>{reservation.reference}</b>.</>}</p></div><div className="paymentStepSummary"><div><span>Reservation</span><strong>{reservation.reference}</strong></div><div><span>Booking total</span><strong>{money(Number(reservation.totalAmount))}</strong></div><div><span>Pay now</span><strong className="paymentStepAmount">{money(paymentOrder.amount / 100)}</strong></div><div><span>Balance after payment</span><strong>{money(Math.max(0, Number(reservation.balanceAmount) - paymentOrder.amount / 100))}</strong></div></div>{paymentOrder.provider === 'RAZORPAY' ? <div className="paymentStepAction"><div className="paymentStepStatus" role="status" aria-live="polite"><span className={`paymentStepStatusDot${busy ? ' is-active' : ''}`} aria-hidden="true" />{busy ? 'Opening secure Razorpay checkout…' : 'Checkout is ready'}</div><button className="btn paymentFallbackButton" onClick={() => void completeRazorpayPayment()} disabled={busy}>{busy ? 'Opening checkout…' : 'Open checkout again'}</button><p className="hint">If the checkout window was dismissed, use the button above to reopen it. Payment is verified securely on the server.</p></div> : <div className="paymentStepAction"><button className="btn full" onClick={() => void completeMockPayment()} disabled={busy}>{busy ? 'Processing payment...' : 'Complete payment'}</button><p className="hint">This demo records a successful test payment so you can review the confirmation flow.</p></div>}</section>}
    {step === 'confirmation' && reservation && <section className={`formCard confirmation${agentMode ? ' agentConfirmationContent' : ''}`}><span className={`status ${reservation.paymentStatus === 'PENDING' ? 'warn' : 'ok'}`}>{reservation.paymentStatus === 'PENDING' ? 'Pending approval' : 'Confirmed'}</span><h2>{reservation.paymentStatus === 'PENDING' ? 'Booking submitted' : 'Booking confirmed'}</h2><p>Thank you, {reservation.guestName}. Your reference is <b>{reservation.reference}</b>.</p><p>{reservation.hotel.name} - {reservation.checkIn} to {reservation.checkOut}</p><p>Payment status: <b>{reservation.paymentStatus}</b></p>{agentMode && <p className="notice">{agentPaymentConfirmation(reservation)}</p>}<div className="actions"><a className="btn" href={`${basePath}/booking/confirmation?reference=${encodeURIComponent(reservation.reference)}`}>View confirmation</a><button className="btn secondary" type="button" onClick={() => window.print()}>Print confirmation</button><a className="btn secondary" href={`${basePath}/booking`}>Book another stay</a><a className="btn secondary" href={`${basePath}/contact`}>Contact RainWood</a><a className="btn secondary" target="_blank" rel="noreferrer" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(reservation.hotel.name)}`}>Get directions</a>{agentMode && <a className="btn secondary" href={`${basePath}/agent/bookings`}>View my bookings</a>}</div></section>}
  </div>;
}
