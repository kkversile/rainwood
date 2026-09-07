import type { Metadata } from 'next';
import Link from 'next/link';
import { publicApi } from '../../lib/api';
import type { Hotel } from '../../lib/types';
import { HotelListing } from '../../components/HotelListing';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Hotels & Resorts', description: 'Explore RainWood hotels, room categories, amenities and direct booking rates.' };

export default async function Hotels() {
  let hotels: Hotel[] = [];
  let error = '';
  try { hotels = await publicApi<Hotel[]>('/hotels'); } catch (reason) { error = reason instanceof Error ? reason.message : 'Could not load hotels'; }

  return <main className="page demoHotelsPage"><div className="demoHotelsContainer">
    <div className="demoHotelsSectionHead"><div><div className="demoHotelsKicker">Hotel Listing</div><h1>Browse RainWood hotels and start a direct booking journey.</h1></div><p>Published properties, live availability and direct booking paths from the reservation platform.</p></div>
    {error ? <div className="dataUnavailable" role="alert"><p className="error">{error}</p><Link className="smallBtn" href="/hotels">Try again</Link></div> : !hotels.length ? <p className="empty">No published hotels are available right now.</p> : <HotelListing hotels={hotels} />}
  </div></main>;
}
