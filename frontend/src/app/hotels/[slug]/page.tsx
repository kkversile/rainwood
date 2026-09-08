import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { apiAssetUrl, publicApi } from '../../../lib/api';
import type { Hotel } from '../../../lib/types';

export const dynamic = 'force-dynamic';

async function getHotel(slug: string) {
  return publicApi<Hotel>(`/hotels/${encodeURIComponent(slug)}`);
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  try {
    const hotel = await getHotel(slug);
    return {
      title: hotel.seoTitle ?? hotel.name,
      description: hotel.seoDescription ?? hotel.description ?? `Rooms and direct booking at ${hotel.name}.`,
      alternates: { canonical: hotel.canonicalPath ?? `/hotels/${hotel.slug}` },
      openGraph: { title: hotel.seoTitle ?? hotel.name, description: hotel.seoDescription ?? hotel.description ?? undefined, images: hotel.ogImageUrl ? [hotel.ogImageUrl] : undefined, type: 'website' },
    };
  } catch {
    return { title: 'Hotel not found', robots: { index: false, follow: false } };
  }
}

export default async function HotelDetail({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  let hotel: Hotel;
  try { hotel = await getHotel(slug); } catch { notFound(); }

  const amenityNames = hotel.amenities?.map((item) => item.amenity.name) ?? [];
  const rooms = hotel.rooms ?? [];
  const gallery = hotel.images?.length ? hotel.images : hotel.ogImageUrl ? [{ url: hotel.ogImageUrl, altText: `${hotel.name} hero image` }] : [{ url: '/rainwood-placeholder.svg', altText: `${hotel.name} image placeholder` }];
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Hotel',
    name: hotel.name,
    description: hotel.description,
    url: `${process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'}/hotels/${hotel.slug}`,
    image: gallery.map((item) => item.url),
    address: { '@type': 'PostalAddress', addressLocality: hotel.city, addressCountry: 'IN' },
    amenityFeature: amenityNames.map((name) => ({ '@type': 'LocationFeatureSpecification', name, value: true })),
  };

  return (
    <main className="page demoHotelDetail">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
      <div className="demoHotelContainer">
        <div className="demoHotelSectionHead">
          <div><div className="demoHotelKicker">Hotel Detail</div><h1>{hotel.name}</h1></div>
          <Link className="btn" href={`/booking?hotel=${hotel.slug}`}>Book This Hotel</Link>
        </div>

        <div className="demoHotelGallery">
          {gallery.map((item, index) => <div className={index === 0 ? 'demoHotelGalleryHero' : ''} key={`${item.url}-${index}`}><img src={apiAssetUrl(item.url)} alt={item.altText} /></div>)}
        </div>

        <div className="demoHotelSplit">
          <section className="panel demoHotelPanel">
            <h2>Property Snapshot</h2>
            <p>{hotel.description ?? `A comfortable ${hotel.name} stay with direct booking support.`}</p>
            <div className="demoHotelTags">
              {(amenityNames.length ? amenityNames : ['Free Wi-Fi', 'Restaurant', 'Hill View', 'Family Rooms', 'Parking']).map((name) => <span key={name}>{name}</span>)}
            </div>
            <div className="notice">Live availability, stop-sell, closed arrival/departure and minimum-stay rules are checked before payment.</div>
          </section>

          <section className="panel demoHotelPanel">
            <h2>Available Rooms &amp; Rate Plans</h2>
            <div className="demoHotelTableWrap">
              <table className="demoHotelTable"><thead><tr><th>Room Type</th><th>Rate Plan</th><th>Restriction</th><th>Rate</th><th /></tr></thead>
                <tbody>{rooms.flatMap((room) => (room.ratePlans?.length ? room.ratePlans : [{ id: `${room.id}-default`, name: 'Direct booking', mealPlan: 'EP' }]).map((plan) => (
                  <tr key={`${room.id}-${plan.id}`}><td>{room.name}</td><td>{plan.name}</td><td><span className="status ok">Open</span></td><td>Live rate</td><td><Link className="btn secondary" href={`/booking?hotel=${hotel.slug}`}>Select</Link></td></tr>
                )))}
                {!rooms.length && <tr><td colSpan={5} className="empty">No rooms are currently published.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
