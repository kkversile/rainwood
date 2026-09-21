'use client';

import { useEffect, useState } from 'react';
import { apiAssetUrl } from '../lib/api';
import type { Hotel } from '../lib/types';

const fallbackHotelImages: Record<string, string> = {
  'rainwood-aurum-kodaikanal': 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=900&q=80',
  'rainwood-lakeshore-alleppey': 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=900&q=80',
  'rainwood-misty-hills-munnar': 'https://images.unsplash.com/photo-1500534623283-312aade485b7?auto=format&fit=crop&w=900&q=80',
};

export function HotelImage({ hotel, alt }: { hotel?: Hotel; alt: string }) {
  const source = apiAssetUrl(hotel?.images?.[0]?.url ?? hotel?.ogImageUrl);
  const fallback = (hotel?.slug && fallbackHotelImages[hotel.slug]) || 'https://images.unsplash.com/photo-1564501049412-61c2a3083791?auto=format&fit=crop&w=900&q=80';
  const [imageUrl, setImageUrl] = useState(source || fallback);

  useEffect(() => setImageUrl(source || fallback), [fallback, source]);

  return <img src={imageUrl} alt={alt} onError={() => setImageUrl((current) => current === fallback ? current : fallback)} />;
}
