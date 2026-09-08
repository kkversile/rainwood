import Link from 'next/link';
import { apiAssetUrl, publicApi } from '../lib/api';
import type { Hotel } from '../lib/types';
import homepage from '../data/homepage.mock.json';

export const dynamic = 'force-dynamic';

/* const positioningCards = [
  ['01', 'Website Booking', 'Hotel search, room selection and a direct confirmation journey for RainWood guests.', ['Search', 'Voucher']],
  ['02', 'Reservation Management', 'Admin-created bookings for phone, email, WhatsApp, agent, company and OTA requests.', ['Manual entry', 'Source tracking']],
  ['03', 'Payment Workflow', 'Online payments plus advance, balance, payment proof and verification workflows.', ['Advance', 'Balance']],
  ['04', 'Reports', 'Hotel-wise, source-wise, payment-wise, arrival/departure, room-night and revenue reporting.', ['Excel/PDF', 'MVP reports']],
  ['05', 'Admin Dashboard', 'Booking status, guest details, payment status, vouchers, remarks and internal instructions.', ['Operations', 'Accounts']],
  ['06', 'AxisRooms Sync', 'Inventory, rates, restrictions and confirmed booking synchronization where applicable.', ['Mapping', 'Sync status']],
] as const;

const featuredHotels = [
  {
    name: 'RainWood Aurum', place: 'Munnar', description: 'Premium mountain stay with direct booking enabled.', image: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1200&q=80', tags: ['Munnar', 'MAP', 'AxisRooms mapped'],
  },
  {
    name: 'Spices Lap Resort', place: 'Thekkady', description: 'Resort room availability with restriction-aware display.', image: 'https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?auto=format&fit=crop&w=1200&q=80', tags: ['Thekkady', 'CP', 'Restriction aware'],
  },
  {
    name: 'Lakeshore Resort', place: 'Alleppey', description: 'Waterfront rooms with voucher and email confirmation.', image: 'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?auto=format&fit=crop&w=1200&q=80', tags: ['Alleppey', 'AP', 'Voucher ready'],
  },
] as const; */

export default async function Home() {
  let hotels: Hotel[] = [];
  let unavailable = false;
  try { hotels = await publicApi<Hotel[]>('/hotels'); } catch { unavailable = true; }
  const featuredDetailSlug = hotels[0]?.slug ?? 'rainwood-aurum-kodaikanal';

  return <main className="homePage">
    <section className="homeHero">
      <div className="homeHeroInner">
        <div className="homeHeroCopy">
          <span className="eyebrow">Booking + Reservation Management MVP</span>
          <h1>Direct booking, reservation operations, payment workflow and AxisRooms synchronization.</h1>
          <p>A polished RainWood booking experience for guests and a practical operations layer for reservations, payments, vouchers, reports and channel synchronization.</p>
          <div className="actions"><Link className="btn homeGold" href="/booking">Try Booking Flow</Link><Link className="btn homeGhost" href="/admin/reservations">View Reservation Flow</Link></div>
          <div className="homeStats"><div><strong>6</strong><span>week client plan</span></div><div><strong>4</strong><span>core workflows</span></div><div><strong>1</strong><span>reservation dashboard</span></div></div>
        </div>
        <div className="homeSearchBox">
          <h2>Search RainWood Stays</h2>
          <p>Live availability and direct rates for your next stay.</p>
          <form action="/booking">
            <label>Destination / hotel<select name="hotel" defaultValue=""><option value="">Select a hotel</option>{hotels.map((hotel) => <option key={hotel.id} value={hotel.slug}>{hotel.name}</option>)}</select></label>
            <div className="two"><label>Check-in<input type="date" name="checkIn" required /></label><label>Check-out<input type="date" name="checkOut" required /></label></div>
            <div className="two"><label>Rooms<select name="rooms" defaultValue="1"><option value="1">1 room</option><option value="2">2 rooms</option></select></label><label>Guests<select name="guests" defaultValue="2"><option value="2">2 adults</option><option value="3">2 adults, 1 child</option><option value="4">4 adults</option></select></label></div>
            <button className="btn full" disabled={!hotels.length}>Search rooms</button>
            {unavailable && <p className="error">Hotel availability is temporarily unavailable. Please try again shortly.</p>}
          </form>
        </div>
      </div>
    </section>

    <section className="section homePositioning"><div className="sectionHead homeSectionHead"><div><span>MVP Positioning</span><h2>Not just a booking button. A booking engine with lightweight reservation management.</h2></div><p>Website bookings and internal reservation operations meet in one clear workflow: manual booking entry, payment verification, vouchers, reports and AxisRooms synchronization.</p></div><div className="homeFeatureGrid">{homepage.positioningCards.map((card) => <article className="homeFeatureCard" key={card.title}><div className="homeNumber">{card.number}</div><h3>{card.title}</h3><p>{card.text}</p><div className="tagList">{card.tags.map((tag) => <span key={tag}>{tag}</span>)}</div></article>)}</div></section>

    <section className="section homeFeatured"><div className="sectionHead homeSectionHead"><div><span>Featured Hotels</span><h2>RainWood stay discovery with booking-ready hotel cards.</h2></div><Link className="btn secondary" href="/hotels">View all hotels</Link></div><div className="hotelGrid">{hotels.map((hotel) => { const detailSlug = hotel.slug || featuredDetailSlug; const image = apiAssetUrl(hotel.images?.[0]?.url ?? hotel.ogImageUrl) || '/rainwood-placeholder.svg'; return <article className="hotelCard" key={hotel.id}><div className="homeHotelImage"><img src={image} alt={hotel.images?.[0]?.altText ?? `${hotel.name}, ${hotel.city}`} /></div><div><span className="homePlace">{hotel.city}</span><h3>{hotel.name}</h3><p>{hotel.description ?? 'A thoughtful RainWood stay with direct reservation support.'}</p><div className="tagList"><span>{hotel.rooms?.length ?? 0} room categories</span><span>Open</span></div><div className="hotelBottom"><Link className="btn" href={`/hotels/${detailSlug}`}>View hotel</Link><Link className="textLink" href={`/booking?hotel=${detailSlug}`}>Book direct →</Link></div></div></article>; })}</div></section>

    <section className="homeTrust"><div className="section homeTrustInner"><div><span className="eyebrow">Built for the whole journey</span><h2>From search to voucher, with your operations team in control.</h2></div><div className="homeTrustItems"><div><b>Live inventory</b><p>Date-wise availability, rates and restrictions.</p></div><div><b>Transparent totals</b><p>Server-calculated taxes, advances and balances.</p></div><div><b>Operational visibility</b><p>Reservations, reports and sync status in one place.</p></div></div></div></section>
  </main>;
}
