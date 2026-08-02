import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { publicApi } from '../../../lib/api';
import type { Hotel } from '../../../lib/types';

export const dynamic = 'force-dynamic';

async function getHotel(slug: string) { return publicApi<Hotel>(`/hotels/${encodeURIComponent(slug)}`); }

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  try { const hotel = await getHotel(slug); return { title: hotel.seoTitle ?? hotel.name, description: hotel.seoDescription ?? hotel.description ?? `Rooms and direct booking at ${hotel.name}.`, alternates: { canonical: hotel.canonicalPath ?? `/hotels/${hotel.slug}` }, openGraph: { title: hotel.seoTitle ?? hotel.name, description: hotel.seoDescription ?? hotel.description ?? undefined, images: hotel.ogImageUrl ? [hotel.ogImageUrl] : hotel.images?.[0]?.url ? [hotel.images[0].url] : undefined, type: 'website' } }; } catch { return { title: 'Hotel not found', robots: { index: false, follow: false } }; }
}

export default async function HotelDetail({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  let hotel: Hotel;
  try { hotel = await getHotel(slug); } catch { notFound(); }
  const image = hotel!.images?.[0];
  const jsonLd = { '@context': 'https://schema.org', '@type': 'Hotel', name: hotel!.name, description: hotel!.description, url: `${process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'}/hotels/${hotel!.slug}`, image: hotel!.images?.map((item) => item.url), address: { '@type': 'PostalAddress', addressLocality: hotel!.city, addressCountry: 'IN' }, amenityFeature: hotel!.amenities?.map((item) => ({ '@type': 'LocationFeatureSpecification', name: item.amenity.name, value: true })) };
  return <main className="page"><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} /><div className="gallery"><div className="galleryHero"><Image src={image?.url ?? '/rainwood-placeholder.svg'} alt={image?.altText ?? `${hotel!.name} exterior`} fill sizes="(max-width: 900px) 100vw, 60vw" priority /></div>{(hotel!.images ?? []).slice(1, 3).map((item) => <div key={item.url}><Image src={item.url} alt={item.altText} fill sizes="(max-width: 900px) 50vw, 20vw" /></div>)}</div><div className="split"><section><small>Official property page · {hotel!.city}</small><h1>{hotel!.name}</h1><p>{hotel!.description}</p>{hotel!.amenities?.length ? <div className="tagList">{hotel!.amenities.map((item) => <span key={item.amenity.name}>{item.amenity.name}</span>)}</div> : null}<h2>Room plans</h2>{hotel!.rooms?.map((room) => <div className="room" key={room.id}><div><h3>{room.name}</h3><p>{room.description ?? `Up to ${room.maxAdults} adults and ${room.maxChildren} children.`}</p><small>{room.ratePlans?.map((plan) => plan.name).join(' · ')}</small></div><div><Link className="btn" href={`/booking?hotel=${hotel!.slug}`}>Check dates</Link></div></div>)}</section><aside className="summary"><h3>Book directly</h3><p>Live inventory and restrictions</p><p>Server-calculated taxes and totals</p><p>Secure payment and voucher</p><p>Reservation support</p><Link className="btn full" href={`/booking?hotel=${hotel!.slug}`}>Check availability</Link></aside></div></main>;
}
