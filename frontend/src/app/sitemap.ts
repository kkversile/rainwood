import type { MetadataRoute } from 'next';
import { publicApi } from '../lib/api';
import type { Hotel } from '../lib/types';

export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
  let hotels: Hotel[] = [];
  try { hotels = await publicApi<Hotel[]>('/hotels'); } catch { /* A sitemap can safely omit unavailable unpublished data. */ }
  return ['', '/hotels', '/contact', '/policies', ...hotels.map((hotel) => `/hotels/${hotel.slug}`)].map((path) => ({ url: `${base}${path}`, lastModified: new Date(), changeFrequency: 'weekly' as const, priority: path === '' ? 1 : path.startsWith('/hotels/') ? 0.8 : 0.7 }));
}
