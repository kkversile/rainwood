import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { publicApi } from '../../lib/api';
import type { Hotel } from '../../lib/types';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Hotels & Resorts', description: 'Explore RainWood hotels, room categories, amenities and direct booking rates.' };

export default async function Hotels() {
  let hotels: Hotel[] = [];
  let error = '';
  try { hotels = await publicApi<Hotel[]>('/hotels'); } catch (reason) { error = reason instanceof Error ? reason.message : 'Could not load hotels'; }
  return <main className="page"><div className="pageTitle public"><span>Our properties</span><h1>Choose your RainWood stay</h1><p>Published hotel content and live booking paths from the reservation platform.</p></div>{error ? <p className="error" role="alert">{error}</p> : !hotels.length ? <p className="empty">No published hotels are available right now.</p> : <div className="hotelGrid">{hotels.map((hotel) => <article className="hotelCard" key={hotel.id}><div className="hotelImage"><Image src={hotel.images?.[0]?.url ?? '/rainwood-placeholder.svg'} alt={hotel.images?.[0]?.altText ?? `${hotel.name} property`} fill sizes="(max-width: 620px) 100vw, 33vw" /></div><div><small>{hotel.city}</small><h2>{hotel.name}</h2><p>{hotel.description ?? 'A thoughtful RainWood stay with direct reservation support.'}</p><div className="hotelBottom"><b>{hotel.rooms?.length ?? 0} room categories</b><Link className="btn" href={`/hotels/${hotel.slug}`}>View rooms</Link></div></div></article>)}</div>}</main>;
}
