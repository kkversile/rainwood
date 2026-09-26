const CACHE_NAME = 'rainwood-staff-shell-v1';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).pathname.includes('/api/')) return;
  event.respondWith(fetch(request).catch(() => caches.match(request)));
});
