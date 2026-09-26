import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
  // The repository has no owned square 192x192/512x512 raster brand assets yet.
  // Keep the existing owned SVG as a safe fallback and document the design handoff.
  return { name: 'RainWood Staff', short_name: 'RainWood Staff', start_url: `${basePath}/staff`, scope: `${basePath}/staff`, display: 'standalone', background_color: '#f1fbfb', theme_color: '#087f87', description: 'RainWood hotel operations staff app.', icons: [{ src: `${basePath}/rainwood-placeholder.svg`, sizes: 'any', type: 'image/svg+xml', purpose: 'any' }] };
}
