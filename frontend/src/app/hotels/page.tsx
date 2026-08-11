import type { Metadata } from 'next';
import Link from 'next/link';
import { publicApi } from '../../lib/api';
import type { Hotel } from '../../lib/types';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Hotels & Resorts', description: 'Explore RainWood hotels, room categories, amenities and direct booking rates.' };

export default async function Hotels() {
  let hotels: Hotel[] = [];
  let error = '';
  try { hotels = await publicApi<Hotel[]>('/hotels'); } catch (reason) { error = reason instanceof Error ? reason.message : 'Could not load hotels'; }

  return <main className="page demoHotelsPage"><div className="demoHotelsContainer">
    <div className="demoHotelsSectionHead"><div><div className="demoHotelsKicker">Hotel Listing</div><h1>Browse RainWood hotels and start a direct booking journey.</h1></div><p>Published properties, live availability and direct booking paths from the reservation platform.</p></div>
    <form className="demoHotelsSearch"><div><label>Destination</label><select defaultValue="all"><option value="all">All Destinations</option>{Array.from(new Set(hotels.map((hotel) => hotel.city))).map((city) => <option key={city}>{city}</option>)}</select></div><div><label>Meal Plan</label><select defaultValue="any"><option value="any">Any Rate Plan</option><option>EP</option><option>CP</option><option>MAP</option><option>AP</option></select></div><div><label>Check-in</label><input type="date" defaultValue="2026-08-15" /></div><div><label>Guests</label><select defaultValue="2"><option value="2">2 Adults</option><option value="3">2 Adults, 1 Child</option><option value="4">4 Adults</option></select></div></form>
    {error ? <p className="error" role="alert">{error}</p> : !hotels.length ? <p className="empty">No published hotels are available right now.</p> : <div className="demoHotelsCards">{hotels.map((hotel, index) => {
      const image = hotel.images?.[0]?.url ?? hotel.ogImageUrl ?? '/rainwood-placeholder.svg';
      const mealPlans = Array.from(new Set(hotel.rooms?.flatMap((room) => room.ratePlans?.map((plan) => plan.mealPlan) ?? []) ?? []));
      return <article className="demoHotelsCard" key={hotel.id}><div className="demoHotelsCardImage"><img src={image} alt={hotel.images?.[0]?.altText ?? `${hotel.name} property`} /></div><div className="demoHotelsCardBody"><h2>{hotel.name}</h2><p>{hotel.description ?? 'A thoughtful RainWood stay with direct reservation support.'}</p><div className="demoHotelsTags"><span className="goldTag">{mealPlans[0] ?? 'Direct'}</span><span>{hotel.rooms?.length ?? 0} room categories</span><span>Open</span></div><Link className="btn" href={`/hotels/${hotel.slug}`}>View Rooms</Link></div></article>;
    })}</div>}
  </div></main>;
}
