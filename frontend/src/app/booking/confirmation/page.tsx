'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ReservationPaymentSchedule } from '../../../components/ReservationPaymentSchedule';
import { apiRequest } from '../../../lib/api';
import { agentPaymentConfirmation } from '../../../lib/booking-pricing';
import type { ReservationSummary } from '../../../lib/types';

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
function money(value: number | string) { return `INR ${Number(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }
function date(value: string) { return new Date(value).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }); }

export default function BookingConfirmationPage() {
  const searchParams = useSearchParams(); const reference = searchParams.get('reference') ?? ''; const [reservation, setReservation] = useState<ReservationSummary | null>(null); const [error, setError] = useState('');
  useEffect(() => { if (!reference) { setError('A booking reference is required to view the confirmation.'); return; } apiRequest<ReservationSummary>(`/reservations/${encodeURIComponent(reference)}`).then(setReservation).catch((reason) => setError(reason instanceof Error ? reason.message : 'Could not load this booking confirmation.')); }, [reference]);
  return <main className="page bookingConfirmationPage"><div className="pageTitle public"><span>RainWood Hotels</span><h1>Booking confirmation</h1><p>Your reservation details and payment status.</p></div>{error && <section className="formCard confirmation"><span className="status warn">Not available</span><h2>Confirmation not found</h2><p>{error}</p><a className="btn secondary" href={`${basePath}/booking`}>Return to booking</a></section>}{!error && !reservation && <p className="loading">Loading booking confirmation...</p>}{reservation && <section className="formCard confirmation bookingConfirmationCard"><span className="status ok">Confirmed</span><h2>Booking confirmed</h2><p>Thank you, {reservation.guestName}. Keep this reference for your records.</p><p className="notice">{agentPaymentConfirmation(reservation)}</p><div className="bookingConfirmationReference"><span>Booking reference</span><strong>{reservation.reference}</strong></div><div className="bookingConfirmationGrid"><div><span>Hotel</span><strong>{reservation.hotel.name}</strong><small>{reservation.hotel.city}</small></div><div><span>Stay</span><strong>{date(reservation.checkIn)} – {date(reservation.checkOut)}</strong><small>{reservation.lines.reduce((total, line) => total + line.rooms, 0)} room(s)</small></div><div><span>Payment status</span><strong>{reservation.paymentStatus}</strong><small>{reservation.status}</small></div><div><span>Total amount</span><strong>{money(reservation.totalAmount)}</strong><small>Advance: {money(reservation.advanceAmount)}</small></div></div><ReservationPaymentSchedule schedule={reservation.paymentSchedule} /><div className="bookingConfirmationLines"><h3>Booked rooms</h3>{reservation.lines.map((line, index) => <div key={`${line.roomType}-${index}`}><strong>{line.roomType}</strong><span>{line.ratePlan} · {line.rooms} room(s) · {line.adults} adult(s) · {line.children} child(ren)</span></div>)}</div><div className="actions"><a className="btn" href={`${basePath}/booking`}>Book another stay</a></div></section>}</main>;
}
