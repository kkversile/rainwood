import Link from 'next/link';
import { publicApi } from '../lib/api';
import type { Hotel } from '../lib/types';

export const dynamic = 'force-dynamic';

export default async function Home() {
  let hotels: Hotel[] = [];
  let unavailable = false;
  try { hotels = await publicApi<Hotel[]>('/hotels'); } catch { unavailable = true; }
  return <main><section className="hero"><div className="heroInner"><span className="eyebrow">Official direct booking</span><h1>Thoughtful stays, booked directly.</h1><p>Explore RainWood properties, compare room plans, check live availability, pay securely and receive a confirmation voucher.</p><div className="actions"><Link className="btn" href="/hotels">Explore hotels</Link><Link className="btn secondary" href="/booking">Check availability</Link></div></div><div className="searchBox"><h2>Find your stay</h2><form action="/booking"><label>Hotel<select name="hotel" required defaultValue=""><option value="">Select a hotel</option>{hotels.map((hotel) => <option key={hotel.id} value={hotel.slug}>{hotel.name}</option>)}</select></label><div className="two"><label>Check-in<input type="date" name="checkIn" required /></label><label>Check-out<input type="date" name="checkOut" required /></label></div><div className="two"><label>Adults<input type="number" name="adults" min="1" defaultValue="2" /></label><label>Rooms<input type="number" name="rooms" min="1" defaultValue="1" /></label></div><button className="btn full" disabled={!hotels.length}>Search rooms</button>{unavailable && <p className="error">Hotel availability is temporarily unavailable. Please try again shortly.</p>}</form></div></section><section className="section"><div className="sectionHead"><span>Why book direct</span><h2>A complete reservation experience</h2></div><div className="grid">{[['Live availability', 'Date-wise inventory, rates and restrictions.'], ['Secure payments', 'Gateway and verified offline payment workflows.'], ['Instant vouchers', 'A branded voucher generated after confirmed payment.'], ['Flexible operations', 'Direct, agent, company and website reservations.'], ['Clear reporting', 'Operational reports with server-side totals.'], ['Channel control', 'AxisRooms mapping, retries and reconciliation.']].map(([title, text]) => <article className="card" key={title}><h3>{title}</h3><p>{text}</p></article>)}</div></section></main>;
}
