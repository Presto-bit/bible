// 发版后须 bump CACHE，否则旧 SW 会继续 cache-first 返回陈旧首页 HTML / API
const CACHE = 'presto-bible-v6';
const IDENTITY_CACHE = 'presto-identity-v1';
const IDENTITY_KEY = '/__presto_identity__';
const BASE_PATH = '';

const ILLUSTRATION_FILES = [
  'theme_盼望.svg', 'theme_平安.svg', 'theme_信靠.svg', 'theme_力量.svg',
  'theme_爱.svg', 'theme_喜乐.svg', 'theme_智慧.svg', 'theme_引导.svg',
  'theme_安慰.svg', 'theme_赦免.svg', 'theme_感恩.svg', 'theme_敬拜.svg',
  'theme_恩典.svg', 'theme_应许.svg', 'theme_勇气.svg', 'theme_谦卑.svg',
  'theme_祷告.svg', 'theme_忍耐.svg', 'theme_永生.svg', 'theme_顺服.svg',
];

const SHELL = [
  '/manifest.webmanifest',
  '/icon.svg',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
  '/illustrations/index.json',
  ...ILLUSTRATION_FILES.map((f) => `/illustrations/${f}`),
];

function isHtmlNavigation(request) {
  if (request.mode === 'navigate') return true;
  const accept = request.headers.get('accept') || '';
  return accept.includes('text/html');
}

/** 动态 API / 数据：必须走网络，禁止 SW 缓存（否则 PWA 每日经文等会停留在昨天）。 */
function isDynamicRequest(url) {
  const p = url.pathname;
  if (
    p.startsWith('/content/')
    || p.startsWith('/auth/')
    || p.startsWith('/ai/')
    || p.startsWith('/sync/')
    || p.startsWith('/social/')
    || p.startsWith('/bible/')
    || p.startsWith('/push/')
    || p.startsWith('/admin/')
  ) {
    return true;
  }
  if (p.startsWith('/_next/data/')) return true;
  return false;
}

function isStaticAsset(url) {
  const p = url.pathname;
  if (p.startsWith('/_next/static/')) return true;
  if (p.startsWith('/illustrations/')) return true;
  if (/\.(js|css|woff2?|png|svg|webp|ico|webmanifest)$/i.test(p)) return true;
  return SHELL.includes(p);
}

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE && k !== IDENTITY_CACHE).map((k) => caches.delete(k))),
    ).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;

  // 动态 API：仅网络，不读写 Cache Storage
  if (isDynamicRequest(url)) {
    e.respondWith(fetch(e.request));
    return;
  }

  // HTML 页面：网络优先，避免发版后仍显示旧首页
  if (isHtmlNavigation(e.request)) {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, copy));
          }
          return res;
        })
        .catch(() => caches.match(e.request)),
    );
    return;
  }

  // 已知静态资源：缓存优先
  if (isStaticAsset(url)) {
    e.respondWith(
      caches.match(e.request).then(
        (cached) =>
          cached
          || fetch(e.request).then((res) => {
            const copy = res.clone();
            if (res.ok) {
              caches.open(CACHE).then((c) => c.put(e.request, copy));
            }
            return res;
          }),
      ),
    );
    return;
  }

  // 其余 GET：网络优先，避免误缓存未知 JSON/API
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request)),
  );
});

self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'identity-save' && data.deviceId) {
    event.waitUntil(
      caches.open(IDENTITY_CACHE).then((c) =>
        c.put(
          IDENTITY_KEY,
          new Response(JSON.stringify({ deviceId: data.deviceId, userCode: data.userCode || null }), {
            headers: { 'Content-Type': 'application/json' },
          }),
        ),
      ),
    );
    return;
  }
  if (data.type === 'identity-load' && event.ports && event.ports[0]) {
    event.waitUntil(
      caches
        .open(IDENTITY_CACHE)
        .then((c) => c.match(IDENTITY_KEY))
        .then((r) => (r ? r.json() : { deviceId: null }))
        .then((payload) => {
          event.ports[0].postMessage(payload);
        })
        .catch(() => {
          event.ports[0].postMessage({ deviceId: null });
        }),
    );
  }
});

self.addEventListener('push', (event) => {
  let data = { title: '彼爱', body: '愿话语成为你脚前的灯', href: '/' };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    /* ignore */
  }
  event.waitUntil(
    self.registration.showNotification(data.title || '彼爱', {
      body: data.body || '',
      tag: 'presto-push',
      data: { href: data.href || '/' },
      icon: '/icon-192.png',
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const href = event.notification.data?.href || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const c of clients) {
        if ('focus' in c) {
          c.navigate(href);
          return c.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(href);
    }),
  );
});
