// PrestoAI 读经 PWA Service Worker
// App Shell 预缓存 + 运行时 stale-while-revalidate（静态资源）。
const CACHE = 'presto-bible-v1';
const SHELL = [
  '/2sc',
  '/2sc/reader',
  '/2sc/discover',
  '/2sc/assistant',
  '/2sc/profile',
  '/2sc/plans',
  '/2sc/manifest.webmanifest',
  '/2sc/icon.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
    ),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // 后端 API：网络优先，失败不缓存（数据实时）。
  if (url.pathname.startsWith('/bible') || url.pathname.startsWith('/content')) {
    return;
  }

  // 同源静态/页面：stale-while-revalidate。
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const cached = await cache.match(req);
        const network = fetch(req)
          .then((res) => {
            if (res && res.status === 200) cache.put(req, res.clone());
            return res;
          })
          .catch(() => cached);
        return cached || network;
      }),
    );
  }
});
