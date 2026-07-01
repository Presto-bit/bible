const CACHE = 'presto-bible-v1';
const SHELL = [
  '/',
  '/reader',
  '/discover',
  '/assistant',
  '/profile',
  '/plans',
  '/manifest.webmanifest',
  '/icon.svg',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then((cached) => cached || fetch(e.request).then((res) => {
      const copy = res.clone();
      if (res.ok && e.request.url.startsWith(self.location.origin)) {
        caches.open(CACHE).then((c) => c.put(e.request, copy));
      }
      return res;
    })),
  );
});
