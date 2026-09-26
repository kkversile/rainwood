const CACHE_NAME = 'rainwood-staff-static-v2';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  const isStaticAsset = url.origin === self.location.origin && (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.endsWith('.css') ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.svg') ||
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.ico')
  );

  // Never intercept API requests: authenticated guest, reservation, folio, and
  // financial writes must stay network-only with no background replay.
  if (request.method !== 'GET' || url.pathname.includes('/api/') || !isStaticAsset) return;

  event.respondWith(
    fetch(request, { cache: 'no-store' }).then((response) => {
      if (response.ok) caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()));
      return response;
    }).catch(() => caches.match(request)),
  );
});
