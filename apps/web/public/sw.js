// 发版后须 bump CACHE，否则旧 SW 会继续 cache-first 返回陈旧首页 HTML / API
const CACHE = 'presto-bible-v12';
const IDENTITY_CACHE = 'presto-identity-v1';
const IDENTITY_KEY = '/__presto_identity__';

function getBasePath() {
  const path = self.location.pathname || '';
  if (path.endsWith('/sw.js')) return path.slice(0, -'/sw.js'.length);
  return '';
}

const BASE_PATH = getBasePath();

function bp(path) {
  if (!path.startsWith('/')) path = `/${path}`;
  return `${BASE_PATH}${path}`;
}

const ILLUSTRATION_FILES = [
  'theme_盼望.svg', 'theme_平安.svg', 'theme_信靠.svg', 'theme_力量.svg',
  'theme_爱.svg', 'theme_喜乐.svg', 'theme_智慧.svg', 'theme_引导.svg',
  'theme_安慰.svg', 'theme_赦免.svg', 'theme_感恩.svg', 'theme_敬拜.svg',
  'theme_恩典.svg', 'theme_应许.svg', 'theme_勇气.svg', 'theme_谦卑.svg',
  'theme_祷告.svg', 'theme_忍耐.svg', 'theme_永生.svg', 'theme_顺服.svg',
];

const SHELL = [
  bp('/offline.html'),
  bp('/manifest.webmanifest'),
  bp('/icon.svg'),
  bp('/icon-192.png'),
  bp('/icon-512.png'),
  bp('/icon-maskable-512.png'),
  bp('/apple-touch-icon.png'),
  bp('/apple-touch-icon-167.png'),
  bp('/splash-iphone16.png'),
  bp('/splash-iphone16plus.png'),
  bp('/illustrations/index.json'),
  bp('/offline/books.json'),
  bp('/offline/manifest.json'),
  bp('/sql-wasm/sql-wasm.js'),
  bp('/sql-wasm/sql-wasm.wasm'),
  bp('/sql-wasm/sql-wasm-browser.js'),
  bp('/sql-wasm/sql-wasm-browser.wasm'),
  ...ILLUSTRATION_FILES.map((f) => bp(`/illustrations/${f}`)),
];

const APP_SHELL_PATHS = [
  '/',
  '/reader',
  '/search',
  '/assistant',
  '/profile',
  '/discover',
].map(bp);

/** Tab 页 RSC 数据：离线时需回退缓存，否则点底栏 Tab 会报错 */
const SHELL_DATA_SEGMENTS = [
  '/reader',
  '/assistant',
  '/discover',
  '/profile',
  '/search',
  '/challenge',
  '/notes',
  '/plans',
];

function isHtmlNavigation(request) {
  if (request.mode === 'navigate') return true;
  const accept = request.headers.get('accept') || '';
  return accept.includes('text/html');
}

function relPath(pathname) {
  if (BASE_PATH && pathname.startsWith(BASE_PATH)) {
    return pathname.slice(BASE_PATH.length) || '/';
  }
  return pathname;
}

/** 动态 API / 数据：必须走网络，禁止 SW 缓存（否则 PWA 每日经文等会停留在昨天）。 */
function isDynamicRequest(url) {
  const p = relPath(url.pathname);
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
  return false;
}

function isShellDataRequest(url) {
  if (!url.pathname.includes('/_next/data/')) return false;
  if (SHELL_DATA_SEGMENTS.some((seg) => url.pathname.includes(seg))) return true;
  const tail = url.pathname.split('/_next/data/')[1] || '';
  // 首页 RSC：/_next/data/{buildId}.json
  return !tail.includes('/') && tail.endsWith('.json');
}

function isStaticAsset(url) {
  const p = url.pathname;
  if (p.includes('/_next/static/')) return true;
  if (p.startsWith(bp('/illustrations/'))) return true;
  if (p.startsWith(bp('/offline/'))) return true;
  if (p.startsWith(bp('/sql-wasm/'))) return true;
  if (/\.(js|css|woff2?|png|svg|webp|ico|webmanifest|json|wasm)$/i.test(p)) return true;
  return SHELL.includes(p);
}

async function offlineNavigationFallback(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  const pathname = new URL(request.url).pathname;
  const rel = relPath(pathname);

  for (const path of APP_SHELL_PATHS) {
    const shellRel = relPath(path);
    if (rel === shellRel || rel.startsWith(`${shellRel}/`)) {
      const hit = await caches.match(path);
      if (hit) return hit;
    }
  }

  if (rel === '/' || rel === '') {
    return caches.match(bp('/'));
  }

  return null;
}

function offlineTextResponse() {
  return new Response('Offline', {
    status: 503,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}

async function asResponse(maybe) {
  if (maybe instanceof Response) return maybe;
  const shell = await caches.match(bp('/offline.html'));
  return shell || offlineTextResponse();
}

async function networkFirstCache(request) {
  try {
    const res = await fetch(request);
    if (res.ok) {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(request, copy));
    }
    return res;
  } catch {
    const hit = await caches.match(request);
    if (hit) return hit;
    throw new Error('offline');
  }
}

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then(async (c) => {
      await c.addAll(SHELL);
      await Promise.allSettled(
        APP_SHELL_PATHS.map((path) =>
          fetch(path, { credentials: 'same-origin' }).then((res) => {
            if (res.ok) return c.put(path, res);
          }),
        ),
      );
    }).then(() => self.skipWaiting()),
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

  if (isShellDataRequest(url)) {
    e.respondWith(networkFirstCache(e.request));
    return;
  }

  // 动态 API：仅网络，不读写 Cache Storage
  if (isDynamicRequest(url)) {
    e.respondWith(fetch(e.request));
    return;
  }

  // HTML 页面：网络优先；离线时回退到已缓存壳页，避免 Safari 原生错误页
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
        .catch(async () => asResponse(await offlineNavigationFallback(e.request))),
    );
    return;
  }

  // 已知静态资源：缓存优先
  if (isStaticAsset(url)) {
    e.respondWith(
      caches.match(e.request).then((cached) => {
        if (cached) return cached;
        return fetch(e.request)
          .then((res) => {
            const copy = res.clone();
            if (res.ok) {
              caches.open(CACHE).then((c) => c.put(e.request, copy));
            }
            return res;
          })
          .catch(() => caches.match(e.request))
          .then((res) => asResponse(res));
      }),
    );
    return;
  }

  // 其余 GET：网络优先，离线回退缓存
  e.respondWith(
    fetch(e.request)
      .catch(() => caches.match(e.request))
      .then((res) => asResponse(res)),
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
      icon: bp('/icon-192.png'),
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
