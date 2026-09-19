'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AgentWorkspace } from '../../../../components/AgentData';
import { apiRequest } from '../../../../lib/api';

type BookingDetail = {
  reference: string;
  status: string;
  paymentStatus: string;
  guestName: string;
  checkIn: string;
  checkOut: string;
  totalAmount: number | string;
  advanceAmount: number | string;
  balanceAmount: number | string;
  hotel: { name: string; city: string };
  lines: { roomType: string; ratePlan: string; rooms: number; adults: number; children: number }[];
};

export default function AgentBookingDetailPage() {
  const params = useParams<{ reference: string }>();
  const reference = decodeURIComponent(params.reference);
  const [booking, setBooking] = useState<BookingDetail | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { apiRequest<BookingDetail>(`/reservations/${encodeURIComponent(reference)}`).then(setBooking).catch((reason) => setError(reason instanceof Error ? reason.message : 'Could not load booking')); }, [reference]);
  return <AgentWorkspace title="Booking Details">{() => error ? <p className="error" role="alert">{error}</p> : !booking ? <p className="loading">Loading booking...</p> : <section className="panel"><div className="agentReportToolbar"><div><span className="agentReportKicker">Booking details</span><h2>{booking.reference}</h2></div><Link className="smallBtn" href="/agent/bookings">Back to tracker</Link></div><div className="metrics agentReportMetrics"><article><span>Hotel</span><strong>{booking.hotel.name}</strong></article><article><span>Stay</span><strong>{booking.checkIn.slice(0, 10)} - {booking.checkOut.slice(0, 10)}</strong></article><article><span>Status</span><strong>{booking.status}</strong></article><article><span>Balance</span><strong>INR {Number(booking.balanceAmount).toFixed(2)}</strong></article></div><div className="agentDetailGrid"><div><h3>Guest</h3><p>{booking.guestName}</p><h3>Payment</h3><p>{booking.paymentStatus} · Advance INR {Number(booking.advanceAmount).toFixed(2)}</p></div><div><h3>Rooms</h3>{booking.lines.map((line, index) => <p key={`${line.roomType}-${index}`}><b>{line.roomType}</b> · {line.ratePlan} · {line.rooms} room(s) · {line.adults} adult(s), {line.children} child(ren)</p>)}</div></div></section>}</AgentWorkspace>;
}
